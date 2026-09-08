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
  const staticRules = read('.zap/static-launchpad.tsv');
  const customerRules = read('.zap/customer-demo.tsv');
  const platformRules = read('.zap/platform-demo.tsv');
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
  assert.match(dast, /push:[\s\S]*branches:[\s\S]*- main[\s\S]*\.zap\/\*\*/);
  assert.match(dast, /Wait for public surface readiness/);
  assert.match(dast, /persist-credentials: false/);
  assert.match(dast, /--connect-timeout 10/);
  assert.match(dast, /--max-time 10/);
  assert.doesNotMatch(dast, /--location|(?:^|\s)-I(?:\s|$)/m);
  assert.match(dast, /https:\/\/conference-manager-demo\.onrender\.com\/api\/v1\/health\/ready/);
  assert.match(dast, /https:\/\/conference-manager-ops-demo\.onrender\.com\/api\/v1\/platform\/health\/ready/);
  assert.match(dast, /status.*== '200'/);
  assert.doesNotMatch(dast, /rules_file_name:/);
  assert.match(dast, /fail_action:\s*true/);
  assert.match(dast, /cmd_options: '-a -c \$\{\{ matrix\.rules \}\}'/);

  const policyRows = (rules) => rules
    .trim()
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const columns = line.split('\t');
      assert.equal(columns.length, 3);
      return columns;
    });

  const policies = [
    ['floriankreutzer[.]github[.]io', policyRows(staticRules)],
    ['conference-manager-demo[.]onrender[.]com', policyRows(customerRules)],
    ['conference-manager-ops-demo[.]onrender[.]com', policyRows(platformRules)],
  ];
  for (const [host, rows] of policies) {
    assert.deepEqual(rows.filter(([, action]) => action === 'INFO').map(([id]) => id), ['90005']);
    for (const [id, action, value] of rows) {
      assert.notEqual(id, '*');
      assert.notEqual(action, 'IGNORE');
      if (action === 'OUTOFSCOPE') {
        assert.match(value, /^\^https:\/\//);
        assert.match(value, /\$$/);
        assert.ok(value.includes(host));
        assert.doesNotMatch(value, /\.\*/);
        assert.doesNotThrow(() => new RegExp(value));
      } else {
        assert.equal(action, 'INFO');
        assert.equal(id, '90005');
      }
    }
  }

  assert.deepEqual(policyRows(customerRules).map(([id]) => id), ['10015', '10049', '10055', '90005']);
  assert.deepEqual(policyRows(platformRules).map(([id]) => id), ['10015', '10049', '10055', '90005']);
  assert.deepEqual(policyRows(staticRules).map(([id]) => id), [
    '10015', '10020', '10021', '10035', '10049', '10050', '10055',
    '10063', '10094', '10098', '90004', '90005',
  ]);
  assert.doesNotMatch(`${staticRules}\n${customerRules}\n${platformRules}`, /^(?:10003|10010|10011|10017|10019|10038|10054|10062|10105|10202)\t/m);
});
