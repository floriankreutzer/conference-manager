import { defineConfig } from '@playwright/test';
import original from './playwright.config.js';

// H changes capture orchestration only. The original two test definitions and
// their product sources are unchanged; their existing routes provide fixtures.
export default defineConfig({
  ...original,
  testMatch: 'production-application.spec.js',
  // Playwright matches the project/file/title path, not the leaf title alone.
  grep: /^(?:chromium-desktop|webkit-mobile) production-application\.spec\.js CO-317: EMP-14 EMP-15 bounded public content keeps every field in multipage A4 and print CSS in (?:de|en)$/u,
  forbidOnly: true,
  reporter: [['list']],
  use: { ...original.use, ignoreHTTPSErrors: false, trace: 'off', screenshot: 'off' },
  webServer: undefined,
});
