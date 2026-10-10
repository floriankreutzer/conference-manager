import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { createTlsEgressProxy, inspectClientHello, validateOrigin } from '../support/hosted-transport/tls-egress-proxy.mjs';

const HOST = 'customer.cm-transport.test';
const ORIGIN = `https://${HOST}`;
function uint16(value) { const data = Buffer.alloc(2); data.writeUInt16BE(value); return data; }
function record(data) { return Buffer.concat([Buffer.from([22, 3, 1]), uint16(data.length), data]); }
function hello(host = HOST, { duplicate = false, noSni = false } = {}) {
  const name = Buffer.from(host);
  const sni = Buffer.concat([uint16(name.length + 3), Buffer.from([0]), uint16(name.length), name]);
  const extension = Buffer.concat([uint16(0), uint16(sni.length), sni]);
  const extensions = noSni ? Buffer.alloc(0) : duplicate ? Buffer.concat([extension, extension]) : extension;
  const body = Buffer.concat([Buffer.from([3, 3]), Buffer.alloc(32), Buffer.from([0]), uint16(2),
    Buffer.from([0x13, 1, 1, 0]), uint16(extensions.length), extensions]);
  const prefix = Buffer.alloc(4); prefix[0] = 1; prefix.writeUIntBE(body.length, 1, 3);
  return Buffer.concat([prefix, body]);
}

test('ClientHello accepts TCP and TLS-record fragmentation, never a prefix', () => {
  const full = record(hello());
  for (let size = 0; size < full.length; size += 1) assert.equal(inspectClientHello(full.subarray(0, size), HOST), false);
  assert.equal(inspectClientHello(full, HOST), true);
  for (let split = 1; split < hello().length; split += 1) {
    const fragments = Buffer.concat([record(hello().subarray(0, split)), record(hello().subarray(split))]);
    assert.equal(inspectClientHello(fragments, HOST), true);
  }
});

test('ClientHello rejects plaintext, different/missing/duplicate SNI and malformed lengths', () => {
  const malformed = record(hello()); malformed.writeUInt16BE(16_385, 3);
  for (const input of [Buffer.from('GET / HTTP/1.1\r\n'), record(hello('foreign.cm-transport.test')),
    record(hello(HOST, { duplicate: true })), record(hello(HOST, { noSni: true })), malformed,
    Buffer.alloc(65_537), Buffer.from([22, 3, 1, 0, 0])]) {
    assert.throws(() => inspectClientHello(input, HOST), { message: 'CM_ACCEPTANCE_TLS_REJECTED' });
  }
});

test('Origin syntax rejects scheme, port, credentials, trailing slash and IP', () => {
  assert.equal(validateOrigin(ORIGIN).hostname, HOST);
  for (const origin of [`http://${HOST}`, `${ORIGIN}:444`, `${ORIGIN}/`, 'https://127.0.0.1', `https://u:p@${HOST}`]) {
    assert.throws(() => validateOrigin(origin));
  }
});

async function tunnel(proxy, authority = `${HOST}:443`) {
  const address = new URL(proxy.server);
  const socket = net.connect({ host: address.hostname, port: Number(address.port) });
  socket.on('error', () => {});
  await once(socket, 'connect');
  socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
  return socket;
}

test('Proxy rejects unauthorized destination before connecting, and normal HTTP proxying', async () => {
  let calls = 0;
  const proxy = await createTlsEgressProxy({ origin: ORIGIN, connectSocket() { calls += 1; throw new Error('unexpected'); } });
  try {
    for (const authority of ['foreign.cm-transport.test:443', `${HOST}:444`, '127.0.0.1:443']) {
      const socket = await tunnel(proxy, authority); await once(socket, 'close');
    }
    const address = new URL(proxy.server);
    const socket = net.connect(Number(address.port), address.hostname); socket.on('error', () => {});
    await once(socket, 'connect'); socket.write(`GET http://${HOST}:443/ HTTP/1.1\r\nHost: ${HOST}:443\r\n\r\n`);
    socket.resume(); await once(socket, 'close');
    assert.equal(calls, 0); assert.equal(proxy.evidence().upstreamConnections, 0);
  } finally { await proxy.close(); }
});

test('Proxy rejects plaintext and mismatched TLS inside an allowed CONNECT, without upstream bytes', async () => {
  let calls = 0;
  const proxy = await createTlsEgressProxy({ origin: ORIGIN, connectSocket() { calls += 1; throw new Error('unexpected'); } });
  try {
    for (const payload of [Buffer.from('GET / HTTP/1.1\r\n'), record(hello('foreign.cm-transport.test'))]) {
      const socket = await tunnel(proxy); await once(socket, 'data'); socket.write(payload); await once(socket, 'close');
    }
    assert.equal(calls, 0);
  } finally { await proxy.close(); }
});

test('Proxy closes stalled handshakes and bounds memory before upstream connection', async () => {
  let calls = 0;
  const proxy = await createTlsEgressProxy({ origin: ORIGIN, handshakeTimeout: 100, idleTimeout: 1_000,
    connectSocket() { calls += 1; throw new Error('unexpected'); } });
  try {
    const socket = await tunnel(proxy); await once(socket, 'data'); socket.write(Buffer.from([22, 3, 1]));
    await once(socket, 'close'); assert.equal(calls, 0);
  } finally { await proxy.close(); }
});

test('Proxy forwards the original complete TLS bytes only after exact SNI validation', async () => {
  const received = [];
  const upstream = net.createServer((socket) => { socket.on('data', (data) => received.push(data)); socket.on('error', () => {}); });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const proxy = await createTlsEgressProxy({ origin: ORIGIN,
    connectSocket: () => net.connect(upstream.address().port, '127.0.0.1') });
  try {
    const socket = await tunnel(proxy); await once(socket, 'data');
    const bytes = record(hello()); socket.write(bytes.subarray(0, 9)); socket.write(bytes.subarray(9));
    for (let count = 0; count < 100 && !received.length; count += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(Buffer.concat(received), bytes);
    assert.equal(proxy.evidence().upstreamConnections, 1); socket.destroy();
  } finally { await proxy.close(); await new Promise((resolve) => upstream.close(resolve)); }
});
