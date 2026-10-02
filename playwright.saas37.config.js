import { defineConfig } from '@playwright/test';
import shared from './playwright.shared-demo.config.js';
import { scenarioOrigins } from './tests/e2e-saas37/scenario-support.js';

export function createSaas37Config(env = process.env) {
  const origins = scenarioOrigins(env);
  return defineConfig({
    ...shared,
    webServer: origins.hosted ? undefined : shared.webServer,
    testDir: './tests/e2e-saas37',
    // Six real rate windows consume 366s per browser before UI/network work.
    // WebKit run 37075649131 reached cycle-two booking at the former 600s cap.
    // Include both complete UI journeys, six windows and bounded teardown.
    timeout: origins.hosted ? 960_000 : 900_000,
    globalTimeout: origins.hosted ? 2_040_000 : 1_920_000,
    maxFailures: 1,
    expect: { timeout: 10_000 },
    use: { ...shared.use, ignoreHTTPSErrors: !origins.hosted, actionTimeout: 15_000, navigationTimeout: 30_000 },
    reporter: [['list'], ['html', { outputFolder: 'playwright-report-saas37', open: 'never' }]],
  });
}

export default createSaas37Config();
