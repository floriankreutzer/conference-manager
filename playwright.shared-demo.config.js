import { defineConfig, devices } from '@playwright/test';

const EDGE_PORT = 4443;
const CUSTOMER_HOST = 'customer.demo.test';
const PLATFORM_HOST = 'platform.demo.test';

export default defineConfig({
  testDir: './tests/e2e-shared',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-shared-demo', open: 'never' }]],
  use: {
    headless: true,
    ignoreHTTPSErrors: true,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-shared-demo',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit-shared-demo',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'node scripts/serve-shared-demo-e2e.mjs',
    url: `https://${CUSTOMER_HOST}:${EDGE_PORT}/__shared-demo-ready`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      SHARED_DEMO_CUSTOMER_HOST: CUSTOMER_HOST,
      SHARED_DEMO_PLATFORM_HOST: PLATFORM_HOST,
      SHARED_DEMO_EDGE_PORT: String(EDGE_PORT),
    },
  },
});
