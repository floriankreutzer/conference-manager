import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSaas37Config } from '../playwright.saas37.config.js';

function loadConfig(origins = {}) {
  const config = createSaas37Config(origins);
  return {
    webServer: Boolean(config.webServer), ignoreHTTPSErrors: config.use.ignoreHTTPSErrors,
    workers: config.workers, retries: config.retries, projects: config.projects.map(({ name }) => name),
  };
}

test('isolated SaaS 3.7 retains its fixed local TLS edge and serial browser matrix', () => {
  assert.deepEqual(loadConfig(), {
    webServer: true, ignoreHTTPSErrors: true, workers: 1, retries: 0,
    projects: ['chromium-shared-demo', 'webkit-shared-demo'],
  });
});

test('hosted SaaS 3.7 uses real HTTPS directly with certificate validation', () => {
  const config = loadConfig({
    SHARED_DEMO_CUSTOMER_ORIGIN: 'https://conference-manager-demo.onrender.com',
    SHARED_DEMO_PLATFORM_ORIGIN: 'https://conference-manager-ops-demo.onrender.com',
  });
  assert.equal(config.webServer, false);
  assert.equal(config.ignoreHTTPSErrors, false);
  assert.equal(config.workers, 1);
  assert.equal(config.retries, 0);
});

test('hosted scenario configuration rejects unknown or incomplete origin tuples before requests', () => {
  for (const origins of [
    { SHARED_DEMO_CUSTOMER_ORIGIN: 'https://example.invalid' },
    { SHARED_DEMO_CUSTOMER_ORIGIN: 'https://conference-manager-demo.onrender.com' },
    { SHARED_DEMO_CUSTOMER_ORIGIN: 'http://conference-manager-demo.onrender.com',
      SHARED_DEMO_PLATFORM_ORIGIN: 'https://conference-manager-ops-demo.onrender.com' },
  ]) assert.throws(() => loadConfig(origins), /SAAS37_SCENARIO_ORIGINS_INVALID/);
});

test('hosted full scenarios remain inside a reserved independent cleanup budget', () => {
  const workflow = readFileSync('.github/workflows/hosted-demo-acceptance.yml', 'utf8');
  assert.match(workflow, /id: full_scenarios\n\s+if: steps\.hosted_journey\.outcome == 'success'\n\s+continue-on-error: true\n\s+run: npm run test:e2e:saas37/);
  assert.match(workflow, /name: Upload full hosted scenario evidence and browser report/);
  assert.match(workflow, /name: hosted-saas37-scenario-evidence/);
  const reserve = Number(workflow.match(/HOSTED_DESTRUCTIVE_RESERVE_SECONDS: '(\d+)'/)?.[1]);
  const hosted = createSaas37Config({
    SHARED_DEMO_CUSTOMER_ORIGIN: 'https://conference-manager-demo.onrender.com',
    SHARED_DEMO_PLATFORM_ORIGIN: 'https://conference-manager-ops-demo.onrender.com',
  });
  // Actual cross-role cap + full suite + six cleanup requests + identity/audit margin.
  assert.ok(reserve >= 720 + hosted.globalTimeout / 1000 + 2 * (2 * 20 + 75) + 200);
});

test('measured hosted scenario budget does not relax isolated action or assertion limits', () => {
  const local = createSaas37Config({});
  const hosted = createSaas37Config({
    SHARED_DEMO_CUSTOMER_ORIGIN: 'https://conference-manager-demo.onrender.com',
    SHARED_DEMO_PLATFORM_ORIGIN: 'https://conference-manager-ops-demo.onrender.com',
  });
  assert.equal(local.timeout, 900_000);
  assert.equal(local.globalTimeout, 1_920_000);
  assert.equal(hosted.timeout, 960_000);
  assert.equal(hosted.globalTimeout, 2_040_000);
  for (const config of [local, hosted]) {
    assert.ok(config.globalTimeout >= config.projects.length * config.timeout + 120_000);
  }
  const scenario = readFileSync('tests/e2e-saas37/three-customer-scenarios.spec.js', 'utf8');
  assert.doesNotMatch(scenario, /test\.setTimeout\(/, 'The scenario must inherit the single configured budget');
  for (const key of ['actionTimeout', 'navigationTimeout']) assert.equal(hosted.use[key], local.use[key]);
  assert.deepEqual(hosted.expect, local.expect);
  assert.equal(hosted.retries, 0);
});
