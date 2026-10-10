import http from 'node:http';
import net from 'node:net';

const MAX_HELLO = 65_536;
const MAX_RECORD = 16_384;
const HANDSHAKE_TIMEOUT = 5_000;
const SOCKET_IDLE_TIMEOUT = 120_000;

function invalid() { throw new Error('CM_ACCEPTANCE_TLS_REJECTED'); }

export function validateOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.port
    || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/.test(url.hostname)) invalid();
  return url;
}

// Parses only the complete, bounded ClientHello. It never terminates TLS or
// changes certificate validation. Trusted browser/Node TLS stacks own TLS.
export function inspectClientHello(bytes, expectedHostname) {
  if (bytes.length > MAX_HELLO) invalid();
  let position = 0;
  const fragments = [];
  let length = 0;
  while (position < bytes.length) {
    if (bytes.length - position < 5) return false;
    if (bytes[position] !== 22 || bytes[position + 1] !== 3
      || bytes[position + 2] < 1 || bytes[position + 2] > 3) invalid();
    const recordLength = bytes.readUInt16BE(position + 3);
    if (recordLength < 1 || recordLength > MAX_RECORD) invalid();
    if (bytes.length - position - 5 < recordLength) return false;
    fragments.push(bytes.subarray(position + 5, position + 5 + recordLength));
    length += recordLength;
    const hello = Buffer.concat(fragments, length);
    if (hello.length >= 4) {
      const declared = hello.readUIntBE(1, 3);
      if (hello[0] !== 1 || declared < 40 || declared + 4 > MAX_HELLO) invalid();
      if (hello.length >= declared + 4) {
        validateHelloBody(hello.subarray(4, declared + 4), expectedHostname);
        return true;
      }
    }
    position += 5 + recordLength;
  }
  return false;
}

function validateHelloBody(body, expectedHostname) {
  if (body[0] !== 3 || body[1] < 1 || body[1] > 3) invalid();
  let offset = 34;
  function consume(size) {
    if (!Number.isInteger(size) || size < 0 || offset + size > body.length) invalid();
    const value = body.subarray(offset, offset + size); offset += size; return value;
  }
  const sessionLength = consume(1)[0];
  if (sessionLength > 32) invalid();
  consume(sessionLength);
  const cipherLength = consume(2).readUInt16BE();
  if (cipherLength < 2 || cipherLength % 2) invalid();
  consume(cipherLength);
  const compressionLength = consume(1)[0];
  if (compressionLength < 1) invalid();
  consume(compressionLength);
  const extensionsLength = consume(2).readUInt16BE();
  if (offset + extensionsLength !== body.length) invalid();
  const extensions = new Set();
  let sniFound = false;
  while (offset < body.length) {
    const type = consume(2).readUInt16BE();
    const extension = consume(consume(2).readUInt16BE());
    if (extensions.has(type)) invalid();
    extensions.add(type);
    if (type !== 0) continue;
    if (extension.length < 6 || extension.readUInt16BE(0) !== extension.length - 2
      || extension[2] !== 0 || extension.readUInt16BE(3) !== extension.length - 5) invalid();
    const hostname = extension.subarray(5);
    if (hostname.length > 253 || !hostname.equals(Buffer.from(expectedHostname, 'ascii'))) invalid();
    sniFound = true;
  }
  if (!sniFound) invalid();
}

export async function createTlsEgressProxy({ origin, connectSocket = net.connect, expiresAt,
  handshakeTimeout = HANDSHAKE_TIMEOUT, idleTimeout = SOCKET_IDLE_TIMEOUT }) {
  const target = validateOrigin(origin);
  if (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt - Date.now() > 5_400_000)) invalid();
  if (!Number.isInteger(handshakeTimeout) || handshakeTimeout < 50 || handshakeTimeout > HANDSHAKE_TIMEOUT
    || !Number.isInteger(idleTimeout) || idleTimeout < handshakeTimeout || idleTimeout > SOCKET_IDLE_TIMEOUT) invalid();
  const authority = `${target.hostname}:443`;
  const sockets = new Set();
  const counters = { rejected: 0, tlsAccepted: 0, upstreamConnections: 0 };
  const server = http.createServer({ maxHeaderSize: 8192 }, (_request, response) => {
    counters.rejected += 1;
    response.writeHead(403, { Connection: 'close', 'Content-Length': '0' }); response.end();
  });
  server.maxHeadersCount = 16;
  server.headersTimeout = handshakeTimeout;
  server.requestTimeout = handshakeTimeout;
  server.on('clientError', (_error, socket) => { counters.rejected += 1; socket.destroy(); });
  server.on('connection', (socket) => {
    if (sockets.size >= 64) { counters.rejected += 1; socket.destroy(); return; }
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(handshakeTimeout, () => socket.destroy());
  });
  server.on('connect', (request, client, head) => {
    let upstream;
    let pending = Buffer.alloc(0);
    let settled = false;
    const reject = () => {
      if (!settled) counters.rejected += 1;
      settled = true; clearTimeout(timer); client.destroy(); upstream?.destroy();
    };
    const timer = setTimeout(reject, handshakeTimeout); timer.unref();
    if (request.url !== authority || request.headers.host !== authority
      || request.headers['transfer-encoding'] || request.headers['content-length']) { reject(); return; }
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    const collect = (chunk) => {
      if (settled) return;
      if (pending.length + chunk.length > MAX_HELLO) { reject(); return; }
      pending = Buffer.concat([pending, chunk]);
      try {
        if (!inspectClientHello(pending, target.hostname)) return;
      } catch { reject(); return; }
      settled = true;
      counters.tlsAccepted += 1;
      client.pause(); client.off('data', collect);
      // Only a validated ClientHello can reach this call. The dependency is a
      // local-test seam; production binds the built-in socket connector.
      try { upstream = connectSocket({ host: target.hostname, port: 443 }); }
      catch { reject(); return; }
      sockets.add(upstream);
      upstream.on('error', () => { clearTimeout(timer); client.destroy(); upstream.destroy(); });
      upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
      upstream.setTimeout(idleTimeout, () => upstream.destroy());
      upstream.once('connect', () => {
        clearTimeout(timer); counters.upstreamConnections += 1;
        client.setTimeout(idleTimeout, () => client.destroy());
        upstream.write(pending); pending = Buffer.alloc(0);
        client.pipe(upstream); upstream.pipe(client); client.resume();
      });
      client.on('close', () => upstream.destroy());
    };
    client.on('data', collect);
    client.once('close', () => { clearTimeout(timer); upstream?.destroy(); });
    if (head.length) collect(head);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  let closed;
  let expiryTimer;
  function close() {
    if (closed) return closed;
    clearTimeout(expiryTimer);
    for (const socket of sockets) socket.destroy();
    closed = new Promise((resolve) => server.close(resolve));
    return closed;
  }
  if (expiresAt !== undefined) { expiryTimer = setTimeout(() => { void close(); }, Math.max(0, expiresAt - Date.now())); expiryTimer.unref(); }
  return Object.freeze({
    server: `http://127.0.0.1:${server.address().port}`,
    evidence: () => ({ ...counters }),
    close,
  });
}
