import { readFile } from 'node:fs/promises';
import { createProtectedCustomerHtml } from '../../../scripts/protected-customer-html.mjs';

const html=createProtectedCustomerHtml({
  source: await readFile(new URL('../../../index.html',import.meta.url),'utf8'),
  customerOrigin: 'https://127.0.0.1:4173',platformOrigin: 'https://127.0.0.1:4174',
});

// Isolated loopback browser fixture only. This returns a real document303 and
// grants no cookie, session, identity or production authentication authority.
// Playwright does not intercept a continued request's redirect destination, so
// its fixed local landing page serves the actual protected artifact bytes.
export async function handleAuthenticationNavigationFixture(request,response) {
  const microsoftCallback='/api/v1/platform/auth/microsoft/operation/callback';
  if (request.url?.startsWith(microsoftCallback+'?')) {
    const url=new URL(request.url,'https://127.0.0.1:4173');
    if (request.method!=='GET' || request.headers.host!=='127.0.0.1:4173'
      || [...url.searchParams.keys()].sort().join(',')!=='code,state'
      || url.searchParams.get('state')!==Buffer.alloc(32,1).toString('base64url')
      || !['synthetic-provider-code','synthetic-code'].includes(url.searchParams.get('code'))) {
      response.writeHead(400);response.end();return true;
    }
    response.writeHead(303,{ Location: '/api/v1/platform/auth/microsoft/operation/complete',
      'Cross-Origin-Opener-Policy': 'same-origin','Cache-Control': 'no-store','Referrer-Policy': 'no-referrer' });
    response.end();return true;
  }
  // The browser follows a fulfilled redirect without routing its destination
  // through Playwright again. Serve this fixed, neutral loopback document on the
  // actual TLS server; it grants no identity, proof or operation authority.
  if (request.url==='/api/v1/platform/auth/microsoft/operation/complete' && request.method==='GET'
    && request.headers.host==='127.0.0.1:4173') {
    response.writeHead(200,{ 'Content-Type': 'text/html; charset=utf-8','Cache-Control': 'no-store',
      'Cross-Origin-Opener-Policy': 'same-origin','Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" });
    response.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Return to application</title>'
      +'<main>Return to the application.</main></html>');return true;
  }
  if (request.url==='/__cm-customer-handoff-result' && request.method==='GET') {
    response.writeHead(200,{ 'Content-Type': 'text/html; charset=utf-8','Cache-Control': 'no-store' });
    response.end(html);return true;
  }
  if (request.url!=='/api/v1/auth/delegation/complete') return false;
  if (request.method!=='POST' || request.headers.host!=='127.0.0.1:4173'
    || request.headers.origin!=='https://127.0.0.1:4173'
    || request.headers['content-type']!=='application/x-www-form-urlencoded') {
    response.writeHead(400);response.end();return true;
  }
  let bytes=0;const chunks=[];
  for await (const chunk of request) {
    bytes+=chunk.length;if (bytes>1024) { response.writeHead(413);response.end();return true; }chunks.push(chunk);
  }
  if (Buffer.concat(chunks).toString('utf8')!==`csrfToken=${'c'.repeat(64)}`) {
    response.writeHead(400);response.end();return true;
  }
  response.writeHead(303,{ Location: '/__cm-customer-handoff-result','Cache-Control': 'no-store','Referrer-Policy': 'no-referrer' });
  response.end();return true;
}
