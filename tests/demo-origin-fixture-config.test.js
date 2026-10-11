import assert from 'node:assert/strict';
import test from 'node:test';
import { scenarioOrigins } from './support/demo-origins.js';
import { acceptanceGateEnabled } from './support/origin-context.mjs';
import { createHostedDemoConfig } from '../playwright.hosted-demo.config.js';
import { createSaas37Config } from '../playwright.saas37.config.js';

const HOSTED = Object.freeze({
  SHARED_DEMO_CUSTOMER_ORIGIN: 'https://conference-manager-demo.onrender.com',
  SHARED_DEMO_PLATFORM_ORIGIN: 'https://conference-manager-ops-demo.onrender.com',
});
const GATED = Object.freeze({ ...HOSTED, CM_DEMO_ACCEPTANCE_MODE: 'gate' });

test('cookie domain expectations resolve to exact local or approved hosted hostnames', () => {
  for (const [env, expected] of [
    [{}, ['customer.demo.test', 'platform.demo.test']],
    [HOSTED, ['conference-manager-demo.onrender.com', 'conference-manager-ops-demo.onrender.com']],
  ]) {
    const origins = scenarioOrigins(env);
    assert.deepEqual([new URL(origins.customer).hostname, new URL(origins.platform).hostname], expected);
    assert.ok(Object.isFrozen(origins));
  }
  for (const invalid of [
    'https://*.onrender.com', 'https://conference-manager-demo.onrender.com.evil.invalid',
    'https://conference-manager-demo.onrender.com/', 'http://conference-manager-demo.onrender.com',
    'https://user@conference-manager-demo.onrender.com', 'https://conference-manager-demo.onrender.com:4443',
  ]) assert.throws(() => scenarioOrigins({ ...HOSTED, SHARED_DEMO_CUSTOMER_ORIGIN: invalid }),
    /SAAS37_SCENARIO_ORIGINS_INVALID/);
});

test('gate mode is explicit and rejects unknown values before browser work', () => {
  assert.equal(acceptanceGateEnabled({}), false);
  assert.equal(acceptanceGateEnabled(GATED), true);
  for (const value of ['', 'true', 'Gate', 'open', ' gate ']) {
    for (const configure of [acceptanceGateEnabled, createHostedDemoConfig, createSaas37Config]) {
      assert.throws(() => configure({ ...HOSTED, CM_DEMO_ACCEPTANCE_MODE: value }),
        /CM_ACCEPTANCE_CONFIGURATION_REJECTED/);
    }
  }
});

test('ungated hosted proxy defaults remain unchanged even with hosted origin variables', () => {
  for (const env of [{}, HOSTED]) {
    const config = createHostedDemoConfig(env);
    assert.deepEqual(config.use, {
      headless: true, ignoreHTTPSErrors: true, trace: 'retain-on-failure', screenshot: 'only-on-failure',
    });
    assert.deepEqual(config.webServer, {
      command: 'node scripts/serve-hosted-demo-e2e.mjs',
      url: 'https://customer.demo.test:4443/__hosted-demo-ready',
      ignoreHTTPSErrors: true, reuseExistingServer: false, timeout: 30_000, env,
    });
  }
});

test('gate configs preserve all suite budgets and browser projects while disabling automatic captures', () => {
  for (const configure of [createHostedDemoConfig, createSaas37Config]) {
    const ordinary = configure(HOSTED);
    const gated = configure(GATED);
    assert.equal(gated.webServer, undefined);
    assert.equal(gated.use.ignoreHTTPSErrors, false);
    for (const key of ['trace', 'screenshot', 'video']) assert.equal(gated.use[key], 'off');
    for (const key of ['testDir', 'fullyParallel', 'workers', 'timeout', 'globalTimeout',
      'maxFailures', 'retries', 'expect', 'projects', 'reporter']) assert.deepEqual(gated[key], ordinary[key]);
    for (const key of ['headless', 'actionTimeout', 'navigationTimeout']) {
      assert.equal(gated.use[key], ordinary.use[key]);
    }
    assert.throws(() => configure({ CM_DEMO_ACCEPTANCE_MODE: 'gate' }), /SAAS37_SCENARIO_ORIGINS_INVALID/);
    assert.throws(() => configure({ ...GATED, SHARED_DEMO_PLATFORM_ORIGIN: undefined }),
      /SAAS37_SCENARIO_ORIGINS_INVALID/);
  }
});
