import { execFileSync } from 'node:child_process';
import { readFile, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';

const HOST = '127.0.0.1';
const PORT = 4173;
const ROOT = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const CERTIFICATE_DIRECTORY = await mkdtemp(join(tmpdir(), 'conference-manager-e2e-'));
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

execFileSync('openssl', [
  'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
  '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
  '-keyout', PRIVATE_KEY_PATH, '-out', CERTIFICATE_PATH,
], { stdio: 'ignore' });

async function responseFile(requestUrl) {
  const url = new URL(requestUrl, `https://${HOST}:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
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
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  const path = await responseFile(request.url || '/');
  if (!path) {
    response.writeHead(404);
    response.end();
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
    response.writeHead(404);
    response.end();
  }
});

async function stop() {
  server.close(async () => {
    await rm(CERTIFICATE_DIRECTORY, { recursive: true, force: true });
    process.exit(0);
  });
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
server.listen(PORT, HOST);
