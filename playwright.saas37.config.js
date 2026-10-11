import { defineConfig } from '@playwright/test';
import shared from './playwright.shared-demo.config.js';
import { scenarioOrigins } from './tests/support/demo-origins.js';
import { acceptanceGateEnabled } from './tests/support/origin-context.mjs';

export function createSaas37Config(env = process.env) {
  const origins = scenarioOrigins(env);
  const gated = acceptanceGateEnabled(env);
  if (gated && !origins.hosted) throw new TypeError('SAAS37_SCENARIO_ORIGINS_INVALID');
  return defineConfig({
    ...shared,
    webServer: origins.hosted ? undefined : shared.webServer,
    testDir: './tests/e2e-saas37',
    // Six real rate windows consume 366s per browser before UI/network work.
    // WebKit run 37077163740 passed both cycles/resets at 900s; its final
    // restoration still needs about 20s plus bounded cleanup/runner margin.
    // Include both complete UI journeys, six windows and bounded teardown.
    timeout: origins.hosted ? 1_080_000 : 1_020_000,
    globalTimeout: origins.hosted ? 2_280_000 : 2_160_000,
    maxFailures: 1,
    expect: { timeout: 10_000 },
    use: {
      ...shared.use, ignoreHTTPSErrors: !origins.hosted, actionTimeout: 15_000, navigationTimeout: 30_000,
      ...(gated ? { screenshot: 'off', video: 'off', trace: 'off' } : {}),
    },
    reporter: [['list'], ['html', { outputFolder: 'playwright-report-saas37', open: 'never' }]],
  });
}

export default createSaas37Config();
