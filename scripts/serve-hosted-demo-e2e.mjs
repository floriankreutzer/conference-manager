import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer, request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOOPBACK = '127.0.0.1';
const EDGE_PORT = 4443;
const UPSTREAM_TIMEOUT_MS = 75_000;
const CUSTOMER_HOST = 'customer.demo.test';
const PLATFORM_HOST = 'platform.demo.test';
const CUSTOMER_UPSTREAM = new URL('https://conference-manager-demo.onrender.com');
const PLATFORM_UPSTREAM = new URL('https://conference-manager-ops-demo.onrender.com');
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

function requireExactOrigin(key, expected) {
  const value = process.env[key] || expected.origin;
  if (value !== expected.origin) throw new TypeError(`${key}_INVALID`);
  return expected;
}

const CUSTOMER_TARGET = requireExactOrigin('SHARED_DEMO_CUSTOMER_ORIGIN', CUSTOMER_UPSTREAM);
const PLATFORM_TARGET = requireExactOrigin('SHARED_DEMO_PLATFORM_ORIGIN', PLATFORM_UPSTREAM);
const CERTIFICATE_DIRECTORY = await mkdtemp(join(tmpdir(), 'conference-manager-hosted-demo-e2e-'));
const CERTIFICATE_PATH = join(CERTIFICATE_DIRECTORY, 'certificate.pem');
const PRIVATE_KEY_PATH = join(CERTIFICATE_DIRECTORY, 'private-key.pem');

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

function localOrigin(host) {
  return `https://${host}:${EDGE_PORT}`;
}

function safeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !HOP_BY_HOP_HEADERS.has(name.toLowerCase())),
  );
}

function requestHeaders(headers, host, target) {
  const result = safeHeaders(headers);
  result.host = target.host;
  const sourceOrigin = localOrigin(host);
  if (result.origin === sourceOrigin) result.origin = target.origin;
  if (typeof result.referer === 'string' && result.referer.startsWith(`${sourceOrigin}/`)) {
    result.referer = `${target.origin}${result.referer.slice(sourceOrigin.length)}`;
  }
  return result;
}

function rewriteLocation(value, host, target) {
  if (typeof value !== 'string') return value;
  try {
    const location = new URL(value, target.origin);
    if (location.origin !== target.origin) return value;
    return `${localOrigin(host)}${location.pathname}${location.search}${location.hash}`;
  } catch {
    return value;
  }
}

function responseHeaders(headers, host, target) {
  const result = safeHeaders(headers);
  if (result.location) result.location = rewriteLocation(result.location, host, target);
  if (Array.isArray(result['set-cookie'])) {
    result['set-cookie'] = result['set-cookie'].map((cookie) => cookie.replace(
      new RegExp(`;\\s*Domain=${target.hostname.replaceAll('.', '\\.')}(?=;|$)`, 'i'),
      `; Domain=${host}`,
    ));
  }
  return result;
}

function proxyRequest(request, response, host, target) {
  const upstream = httpsRequest({
    protocol: 'https:',
    hostname: target.hostname,
    port: 443,
    method: request.method,
    path: request.url,
    headers: requestHeaders(request.headers, host, target),
    servername: target.hostname,
  }, (upstreamResponse) => {
    response.writeHead(
      upstreamResponse.statusCode || 502,
      responseHeaders(upstreamResponse.headers, host, target),
    );
    upstreamResponse.pipe(response);
  });
  upstream.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    upstream.destroy(new Error('HOSTED_DEMO_UPSTREAM_TIMEOUT'));
  });
  upstream.on('error', () => {
    if (response.headersSent) response.destroy();
    else response.writeHead(502, { 'Cache-Control': 'no-store' }).end();
  });
  request.pipe(upstream);
}

const server = createServer({
  cert: await readFile(CERTIFICATE_PATH),
  key: await readFile(PRIVATE_KEY_PATH),
}, (request, response) => {
  const host = requestHost(request);
  if (host !== CUSTOMER_HOST && host !== PLATFORM_HOST) {
    response.writeHead(421).end();
    return;
  }
  if (request.url === '/__hosted-demo-ready' && request.method === 'GET') {
    response.writeHead(204, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  const target = host === CUSTOMER_HOST ? CUSTOMER_TARGET : PLATFORM_TARGET;
  proxyRequest(request, response, host, target);
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
