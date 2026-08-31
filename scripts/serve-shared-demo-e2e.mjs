import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const LOOPBACK = '127.0.0.1';

function environmentHost(key, fallback) {
  const value = process.env[key] || fallback;
  if (!HOST_PATTERN.test(value)) throw new TypeError(`${key}_INVALID`);
  return value;
}

function environmentPort(key, fallback) {
  const value = process.env[key] || String(fallback);
  if (!/^\d{1,5}$/.test(value)) throw new TypeError(`${key}_INVALID`);
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError(`${key}_INVALID`);
  }
  return port;
}

const CUSTOMER_HOST = environmentHost('SHARED_DEMO_CUSTOMER_HOST', 'customer.demo.test');
const PLATFORM_HOST = environmentHost('SHARED_DEMO_PLATFORM_HOST', 'platform.demo.test');
if (CUSTOMER_HOST === PLATFORM_HOST) throw new TypeError('SHARED_DEMO_HOSTS_MUST_DIFFER');
const EDGE_PORT = environmentPort('SHARED_DEMO_EDGE_PORT', 4443);
const CUSTOMER_API_PORT = environmentPort('SHARED_DEMO_CUSTOMER_API_PORT', 3000);
const PLATFORM_API_PORT = environmentPort('SHARED_DEMO_PLATFORM_API_PORT', 3100);
const ROOT = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const CERTIFICATE_DIRECTORY = await mkdtemp(join(tmpdir(), 'conference-manager-shared-demo-e2e-'));
const CERTIFICATE_PATH = join(CERTIFICATE_DIRECTORY, 'certificate.pem');
const PRIVATE_KEY_PATH = join(CERTIFICATE_DIRECTORY, 'private-key.pem');
const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
});
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

execFileSync('openssl', [
  'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
  '-subj', `/CN=${CUSTOMER_HOST}`,
  '-addext', `subjectAltName=DNS:${CUSTOMER_HOST},DNS:${PLATFORM_HOST}`,
  '-keyout', PRIVATE_KEY_PATH,
  '-out', CERTIFICATE_PATH,
], { stdio: 'ignore' });

function requestHost(request) {
  const value = String(request.headers.host || '').toLowerCase();
  return value.endsWith(`:${EDGE_PORT}`) ? value.slice(0, -(String(EDGE_PORT).length + 1)) : value;
}

function upstreamHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !HOP_BY_HOP_HEADERS.has(name)));
}

function proxyRequest(request, response, port) {
  const upstream = http.request({
    hostname: LOOPBACK,
    port,
    method: request.method,
    path: request.url,
    headers: upstreamHeaders(request.headers),
  }, (upstreamResponse) => {
    const headers = upstreamHeaders(upstreamResponse.headers);
    response.writeHead(upstreamResponse.statusCode || 502, headers);
    upstreamResponse.pipe(response);
  });
  upstream.on('error', () => {
    if (response.headersSent) response.destroy();
    else response.writeHead(502).end();
  });
  request.pipe(upstream);
}

async function staticPath(requestUrl, host) {
  const url = new URL(requestUrl, `https://${host}:${EDGE_PORT}`);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (host === PLATFORM_HOST && pathname === '/') pathname = '/platform-admin-demo/index.html';
  const requested = resolve(ROOT, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
  if (requested !== ROOT && !requested.startsWith(`${ROOT}${sep}`)) return null;
  try {
    const canonical = await realpath(requested);
    if (canonical !== ROOT && !canonical.startsWith(`${ROOT}${sep}`)) return null;
    return canonical;
  } catch {
    return null;
  }
}

const server = createServer({
  cert: await readFile(CERTIFICATE_PATH),
  key: await readFile(PRIVATE_KEY_PATH),
}, async (request, response) => {
  const host = requestHost(request);
  if (host !== CUSTOMER_HOST && host !== PLATFORM_HOST) {
    response.writeHead(421).end();
    return;
  }
  if (request.url === '/__shared-demo-ready' && request.method === 'GET') {
    response.writeHead(204, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  if (request.url?.startsWith('/api/')) {
    proxyRequest(request, response, host === CUSTOMER_HOST ? CUSTOMER_API_PORT : PLATFORM_API_PORT);
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const path = await staticPath(request.url || '/', host);
  if (!path) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(path);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': CONTENT_TYPES[extname(path)] || 'application/octet-stream',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404).end();
  }
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    await rm(CERTIFICATE_DIRECTORY, { recursive: true, force: true });
    process.exit(0);
  });
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
server.listen(EDGE_PORT, LOOPBACK);
