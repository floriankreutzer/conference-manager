import { defineConfig } from '@playwright/test';
import shared from './playwright.shared-demo.config.js';

export default defineConfig({
  ...shared,
  testDir: './tests/e2e-saas37',
  timeout: 420_000,
  globalTimeout: 900_000,
  maxFailures: 1,
  expect: { timeout: 10_000 },
  use: { ...shared.use, actionTimeout: 15_000, navigationTimeout: 30_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-saas37', open: 'never' }]],
});
