import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'https://127.0.0.1:4173',
    headless: true,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'webkit-mobile',
      use: {
        ...devices['iPhone 15'],
      },
    },
  ],
  webServer: {
    command: 'node scripts/serve-e2e.mjs',
    url: 'https://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
