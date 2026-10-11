import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: './canary-suite', workers: 1, retries: 0, timeout: 10_000,
  outputDir: path.join(process.env.CM_ACCEPTANCE_ARTIFACT_ROOT, 'test-results'),
  globalSetup: fileURLToPath(new URL('../support/hosted-transport/validate-runner-config.mjs', import.meta.url)),
  reporter: [[fileURLToPath(new URL('../support/hosted-transport/safe-reporter.mjs', import.meta.url))]],
  use: { trace: 'off', screenshot: 'off', video: 'off', ignoreHTTPSErrors: false },
  projects: [{ name: 'chromium-shared-demo' }],
});
