import { defineConfig, devices } from '@playwright/test';
import { acceptanceGateEnabled } from './tests/support/origin-context.mjs';
import { scenarioOrigins } from './tests/support/demo-origins.js';

const EDGE_PORT = 4443;
const CUSTOMER_HOST = 'customer.demo.test';

export function createHostedDemoConfig(env = process.env) {
  const gated = acceptanceGateEnabled(env);
  if (gated && !scenarioOrigins(env).hosted) throw new TypeError('SAAS37_SCENARIO_ORIGINS_INVALID');
  return defineConfig({
    testDir: './tests/e2e-shared',
    fullyParallel: false,
    workers: 1,
    // Four serial CSV/cross-role cases retain 300 seconds each, plus two minutes
    // for setup/teardown. The CSV addition exceeded the former 12-minute suite cap.
    timeout: 300_000,
    globalTimeout: 1_320_000,
    maxFailures: 1,
    retries: 0,
    expect: { timeout: 15_000 },
    reporter: [['list'], ['html', { outputFolder: 'playwright-report-hosted-demo', open: 'never' }]],
    use: {
      headless: true,
      ignoreHTTPSErrors: !gated,
      trace: gated ? 'off' : 'retain-on-failure',
      screenshot: gated ? 'off' : 'only-on-failure',
      ...(gated ? { video: 'off' } : {}),
    },
    projects: [
      {
        name: 'chromium-hosted-demo',
        use: { ...devices['Desktop Chrome'] },
      },
      {
        name: 'webkit-hosted-demo',
        use: { ...devices['Desktop Safari'] },
      },
    ],
    webServer: gated ? undefined : {
      command: 'node scripts/serve-hosted-demo-e2e.mjs',
      url: `https://${CUSTOMER_HOST}:${EDGE_PORT}/__hosted-demo-ready`,
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 30_000,
      env,
    },
  });
}

export default createHostedDemoConfig();
