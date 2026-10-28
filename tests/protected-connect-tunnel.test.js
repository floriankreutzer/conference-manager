import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { connect, createServer as createTcpServer } from 'node:net';
import { once } from 'node:events';
import test from 'node:test';
import { connectQualifiedTunnel } from './e2e-protected/support/qualified-connect-tunnel.mjs';

test('an actual idle CONNECT relay closes both peers instead of leaving a reusable black hole', { timeout: 35000 }, async () => {
  const sockets = new Set();
  const track = socket => {
    sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket));
  };
  const target = createTcpServer(track);
  const proxy = createHttpServer((request, response) => { response.writeHead(405); response.end(); });
  proxy.on('connection', track);
  let client;
  try {
    target.listen(0, '127.0.0.1'); await once(target, 'listening');
    const edgePort = target.address().port;
    proxy.on('connect', (request, socket, head) => {
      assert.equal(request.url, 'app-int.example.test:443');
      connectQualifiedTunnel({ socket, head, edgePort, sockets });
    });
    proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
    client = connect({ host: '127.0.0.1', port: proxy.address().port });
    client.on('error', () => {}); await once(client, 'connect');
    const headers = new Promise((resolve, reject) => {
      let value = '';
      const finish = error => {
        clearTimeout(timer); client.removeListener('data', read);
        if (error) reject(error); else resolve(value);
      };
      const read = bytes => {
        value += bytes.toString();
        if (value.length > 256) finish(new Error('CONNECT_RESPONSE_INVALID'));
        else if (value.endsWith('\r\n\r\n')) finish();
      };
      const timer = setTimeout(() => finish(new Error('CONNECT_RESPONSE_UNAVAILABLE')), 5000);
      client.on('data', read);
    });
    client.write('CONNECT app-int.example.test:443 HTTP/1.1\r\nHost: app-int.example.test:443\r\n\r\n');
    assert.equal(await headers, 'HTTP/1.1 200 Connection Established\r\n\r\n');
    const started = performance.now();
    const closed = await new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 30000);
      client.once('close', () => { clearTimeout(timer); resolve(true); });
    });
    assert.equal(closed, true, 'The existing20s upstream idle expiry must also close the browser peer.');
    assert.ok(performance.now() - started >= 19000, 'Exercise actual idle expiry rather than an immediate transport failure.');
  } finally {
    client?.destroy(); for (const socket of sockets) socket.destroy();
    await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => target.close(resolve))]);
  }
});
