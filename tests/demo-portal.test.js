import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PORTAL = readFileSync('demo-portal/index.html', 'utf8');
const WORKFLOW = readFileSync('.github/workflows/pages.yml', 'utf8');

const CUSTOMER_DEMO = 'https://conference-manager-demo.onrender.com';
const PLATFORM_DEMO = 'https://conference-manager-ops-demo.onrender.com';

test('Demo portal links directly to the two canonical origin-separated Render services', () => {
  assert.equal(PORTAL.split(`href="${CUSTOMER_DEMO}"`).length - 1, 1);
  assert.equal(PORTAL.split(`href="${PLATFORM_DEMO}"`).length - 1, 1);
  assert.notEqual(new URL(CUSTOMER_DEMO).origin, new URL(PLATFORM_DEMO).origin);
  assert.match(PORTAL, /Demo only/);
  assert.match(PORTAL, /Keine Produktionsumgebung/);
  assert.match(PORTAL, /cold start/i);
  assert.match(PORTAL, /Kaltstart/i);
});

test('Demo portal remains static navigation without browser or application authority', () => {
  assert.doesNotMatch(PORTAL, /<script\b/i);
  assert.doesNotMatch(PORTAL, /<iframe\b/i);
  assert.doesNotMatch(PORTAL, /<form\b/i);
  assert.doesNotMatch(PORTAL, /localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(|XMLHttpRequest/i);
  assert.doesNotMatch(PORTAL, /href=["'][^"']*\/api\//i);
  assert.doesNotMatch(PORTAL, /<input\b|<button\b|<select\b|<textarea\b/i);
  assert.match(PORTAL, /<main id="main">/);
  assert.match(PORTAL, /class="skip-link"/);
  assert.match(PORTAL, /lang="de"/);
  assert.match(PORTAL, /stores no application credentials, sessions, CSRF tokens, Tenant IDs, roles or permissions/i);
});

test('Demo portal meta policy fails closed for resources, forms and base URL changes', () => {
  const policy = PORTAL.match(
    /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/i,
  )?.[1];

  assert.ok(policy, 'Expected a Content-Security-Policy meta element');
  for (const directive of [
    "default-src 'none'",
    "style-src 'self'",
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ]) assert.match(policy, new RegExp(`(?:^|; )${directive.replaceAll("'", "\\'")}(?:;|$)`));

  // CSP does not honor frame-ancestors in a meta-delivered policy. The hosting-provider
  // response-header limitation is documented instead of claiming clickjacking protection.
  assert.doesNotMatch(policy, /frame-ancestors/i);
});

test('Pages workflow deploys only the dedicated static portal with pinned actions and minimal deployment permissions', () => {
  assert.match(WORKFLOW, /path: demo-portal/);
  assert.doesNotMatch(WORKFLOW, /path: (?:\.|docs|src|dist)\s*$/m);
  for (const action of [
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b',
    'actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b',
    'actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e',
  ]) assert.match(WORKFLOW, new RegExp(action.replaceAll('/', '\\/')));
  assert.match(WORKFLOW, /permissions:\n  contents: read/);
  assert.match(WORKFLOW, /permissions:\n      pages: write\n      id-token: write/);
  assert.doesNotMatch(WORKFLOW, /secrets\.|pull_request_target|repository_dispatch|workflow_run/);
});
