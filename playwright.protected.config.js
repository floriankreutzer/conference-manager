import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-protected',testMatch: '*.spec.js',fullyParallel: false,workers: 1,retries: 0,
  timeout: 240000,expect: { timeout: 15000 },reporter: [['list']],
  // This separate acceptance crosses real auth/cookie boundaries. Retain only
  // the explicitly bounded nonsecret evidence, never traces/cookies/hidden forms.
  use: { headless: true,ignoreHTTPSErrors: false,trace: 'off',screenshot: 'off',video: 'off' },
  projects: [{ name: 'chromium-protected',use: { browserName: 'chromium',viewport: { width: 1280,height: 900 } } },
    { name: 'webkit-protected',use: { browserName: 'webkit',viewport: { width: 390,height: 844 } } }],
});
