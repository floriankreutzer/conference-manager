import { defineConfig } from '@playwright/test';
import shared from './playwright.shared-demo.config.js';
import { scenarioOrigins } from './tests/e2e-saas37/scenario-support.js';

export function createSaas37Config(env = process.env) {
  const origins = scenarioOrigins(env);
  return defineConfig({
    ...shared,
    webServer: origins.hosted ? undefined : shared.webServer,
    testDir: './tests/e2e-saas37',
    // Four real rate windows consume 244s per browser before UI/network work.
    // The serial suite cap also covers both complete browser budgets and teardown.
    timeout: origins.hosted ? 780_000 : 600_000,
    globalTimeout: origins.hosted ? 1_740_000 : 1_320_000,
    maxFailures: 1,
    expect: { timeout: 10_000 },
    use: { ...shared.use, ignoreHTTPSErrors: !origins.hosted, actionTimeout: 15_000, navigationTimeout: 30_000 },
    reporter: [['list'], ['html', { outputFolder: 'playwright-report-saas37', open: 'never' }]],
  });
}

export default createSaas37Config();
