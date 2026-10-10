import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import shared from '../playwright.hosted-demo.config.js';
import saas37 from '../playwright.saas37.config.js';

const target = process.env.CM_ACCEPTANCE_RUNNER_TARGET;
const bases = { shared, 'shared-chromium': shared, 'shared-webkit': shared, saas37,
  'saas37-chromium': saas37, 'saas37-webkit': saas37 };
const base = Object.hasOwn(bases, target) ? bases[target] : undefined;
if (!base || !process.env.CM_ACCEPTANCE_ARTIFACT_ROOT) throw new Error('CM_ACCEPTANCE_RUNNER_ARGUMENT_REJECTED');
const repository = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(process.env.CM_ACCEPTANCE_ARTIFACT_ROOT, 'test-results');
export default defineConfig({ ...base,
  testDir: path.resolve(repository, base.testDir), outputDir: output,
  globalSetup: fileURLToPath(new URL('../tests/support/hosted-transport/validate-runner-config.mjs', import.meta.url)),
  reporter: [[fileURLToPath(new URL('../tests/support/hosted-transport/safe-reporter.mjs', import.meta.url))]],
  projects: base.projects.map((project) => ({ ...project, outputDir: output })),
});
