import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { createTlsEgressProxy } from '../support/hosted-transport/tls-egress-proxy.mjs';

export const ORIGIN = 'https://customer.cm-transport.test';
export const OTHER_ORIGIN = 'https://platform.cm-transport.test';
export const HEADER = 'x-cm-demo-acceptance';

export async function localFixture({ badCertificate = false } = {}) {
  const directory = process.env.CM_TRANSPORT_TEST_DIRECTORY;
  if (!directory) throw new Error('CM_LOCAL_TLS_FIXTURE_REQUIRED');
  const token = process.env.CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN;
  if (!/^[a-f0-9]{64}$/.test(token || '')) throw new Error('CM_LOCAL_CANARY_REQUIRED');
  const stem = badCertificate ? 'untrusted' : 'server';
  const sockets = new Set();
  const events = [];
  const foreignEvents = [];
  const foreign = http.createServer((request, response) => {
    foreignEvents.push({ authorized: request.headers[HEADER] === token }); response.end('forbidden destination');
  });
  foreign.listen(0, '127.0.0.1'); await once(foreign, 'listening');
  const server = https.createServer({ key: await readFile(path.join(directory, `${stem}.key`)),
    cert: await readFile(path.join(directory, `${stem}.crt`)) }, async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const authorized = request.headers[HEADER] === token;
    events.push({ path: request.url, method: request.method, authorized });
    if (request.url === '/unknown-put') { request.socket.destroy(); return; }
    const redirects = { '/same': `${ORIGIN}/api`, '/other': `${OTHER_ORIGIN}/api`,
      '/scheme': 'http://customer.cm-transport.test:443/api', '/port': 'https://customer.cm-transport.test:444/api' };
    if (redirects[request.url]) { response.writeHead(302, { Location: redirects[request.url] }); response.end(); return; }
    if (request.url === '/failure') { response.writeHead(503, { 'Content-Type': 'text/plain' }); response.end(token); return; }
    if (request.url === '/timeout') return;
    if (request.url === '/cache.js') { response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'public,max-age=3600' }); response.end('window.transportLoaded=true;'); return; }
    if (request.url === '/worker.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript', 'Service-Worker-Allowed': '/' });
      response.end('self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));self.addEventListener("message",event=>{fetch(event.data.url).then(()=>event.ports[0].postMessage(false),()=>event.ports[0].postMessage(true));});'); return;
    }
    if (request.url === '/private-media') {
      const headers = { 'Content-Type': 'text/plain', ETag: '"fixture-v1"', Vary: 'Cookie',
        'Cache-Control': 'private, no-cache, max-age=0, must-revalidate' };
      response.writeHead(request.headers['if-none-match'] === '"fixture-v1"' ? 304 : 200, headers);
      response.end(request.headers['if-none-match'] === '"fixture-v1"' ? undefined : 'private fixture'); return;
    }
    if (request.url === '/echo') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(`<p>${token}</p>`); return; }
    if (request.url === '/' || request.url === '/page-two') {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      response.end('<!doctype html><title>Local transport</title><script src="/cache.js"></script><p>Fixture ready</p>'); return;
    }
    response.writeHead(authorized ? 200 : 503, { 'Content-Type': 'application/json',
      'Set-Cookie': '__Host-cm-fixture=present; Path=/; Secure; HttpOnly; SameSite=Strict' });
    response.end(JSON.stringify({ authorized, method: request.method, data: Buffer.concat(chunks).toString(),
      cookiePresent: request.headers.cookie?.includes('__Host-cm-fixture=present') || false }));
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {}); });
  server.on('tlsClientError', () => {});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const connectSocket = () => net.connect({ host: '127.0.0.1', port: server.address().port });
  const proxy = await createTlsEgressProxy({ origin: ORIGIN, connectSocket });
  return { origin: ORIGIN, token, events, foreignEvents, foreignUrl: `http://127.0.0.1:${foreign.address().port}`,
    proxy, connectSocket,
    async close() { await proxy.close(); for (const socket of sockets) socket.destroy();
      foreign.closeAllConnections();
      await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => foreign.close(resolve))]); } };
}
