import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Demo automatic image and QR paths cannot use a cross-origin network source', () => {
  const index = read('index.html');
  const parityData = read('src/shared/parity-data.js');
  const welcomePrint = read('src/employee/welcome-print.js');
  const routeCode = read('assets/demo/route-openstreetmap.svg');
  const runtimeSources = `${index}\n${parityData}\n${welcomePrint}`;

  const csp = index.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp, 'The Customer Demo artifact must declare a CSP.');
  const imageDirective = csp.match(/(?:^|;)\s*img-src\s+([^;]+)/)?.[1].trim().split(/\s+/);
  assert.deepEqual(imageDirective, ["'self'", 'data:']);
  assert.match(csp, /(?:^|;)\s*connect-src 'self'(?:;|$)/);

  assert.doesNotMatch(runtimeSources, /images\.unsplash\.com/i);
  assert.doesNotMatch(runtimeSources, /api\.qrserver\.com/i);
  assert.match(parityData, /data:image\/svg\+xml;charset=UTF-8,/);
  assert.match(welcomePrint, /assets\/demo\/route-openstreetmap\.svg/);
  assert.match(routeCode, /<svg[^>]+viewBox="0 0 33 33"/);
});

test('GitHub Pages remains static while DAST covers every public Demo surface independently', () => {
  const demoSecurity = read('docs/DEMO-SECURITY.md');
  const productionSecurity = read('docs/PRODUCTION-SECURITY.md');
  const portal = read('demo-portal/index.html');
  const dast = read('.github/workflows/dast.yml');
  for (const document of [demoSecurity, productionSecurity]) {
    assert.match(document, /GitHub Pages/i);
    assert.match(document, /static (?:GitHub Pages )?(?:Demo )?launchpad/i);
    assert.match(document, /Render/i);
  }
  assert.doesNotMatch(portal, /<script\b|<iframe\b|localStorage|sessionStorage|fetch\(/i);
  assert.match(portal, /https:\/\/conference-manager-demo\.onrender\.com/);
  assert.match(portal, /https:\/\/conference-manager-ops-demo\.onrender\.com/);
  assert.match(dast, /surface: static-launchpad/);
  assert.match(dast, /surface: customer-demo/);
  assert.match(dast, /surface: platform-demo/);
  assert.match(dast, /https:\/\/floriankreutzer\.github\.io\/conference-manager\//);
  assert.match(dast, /https:\/\/conference-manager-demo\.onrender\.com\//);
  assert.match(dast, /https:\/\/conference-manager-ops-demo\.onrender\.com\//);
  assert.match(dast, /fail_action:\s*true/);
});
