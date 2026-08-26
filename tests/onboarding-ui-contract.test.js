import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createMicrosoft365OnboardingRuntime } from '../src/platform/microsoft365-onboarding-runtime.js';

const WIZARD_SOURCE = new URL('../src/tenant-admin/onboarding-wizard.js', import.meta.url);
const RUNTIME_SOURCE = new URL('../src/platform/microsoft365-onboarding-runtime.js', import.meta.url);
const APP_LAYOUT = new URL('../assets/app-layout.css', import.meta.url);

test('Tenant onboarding owns its responsive presentation in the application layout stylesheet', async () => {
  const layout = await readFile(APP_LAYOUT, 'utf8');
  for (const selector of [
    '.tenant-onboarding',
    '.onboarding-progress',
    '.onboarding-step-card',
    '.onboarding-check-list',
    '.onboarding-room-option',
  ]) {
    assert.match(layout, new RegExp(selector.replace('.', '\\.')));
  }
  assert.match(layout, /grid-template-columns:\s*repeat\(7,/);
  assert.match(layout, /@media \(max-width: 760px\)[\s\S]*\.onboarding-progress/);
  assert.equal(existsSync(new URL('../assets/onboarding.css', import.meta.url)), false);
});

test('Tenant onboarding disconnect and stale-result guards are part of the runtime contract', async () => {
  const [wizard, runtime] = await Promise.all([
    readFile(WIZARD_SOURCE, 'utf8'),
    readFile(RUNTIME_SOURCE, 'utf8'),
  ]);
  assert.match(runtime, /disconnect:\s*\(\) => connectionApi\.disconnect\(\)/);
  assert.match(wizard, /runtime\.disconnect\(\)/);
  assert.match(wizard, /root\.isConnected/);
  assert.equal((wizard.match(/if \(!isActive\(\)\) return;/g) || []).length >= 8, true);
  assert.match(wizard, /onboarding-room-\$\{roomIndex \+ 1\}/);
  assert.match(wizard, /onboarding-room-capacity-\$\{roomIndex \+ 1\}/);
  assert.doesNotMatch(wizard, /room\.id\.replace/);
  assert.match(wizard, /focusCurrentStep/);
  assert.match(wizard, /querySelector\('h3'\)[\s\S]*\.focus\(\)/);
  assert.match(wizard, /permissionExplanation\(\)/);
  assert.match(wizard, /onboardingErrorKey\(error, operation\)/);
  assert.match(wizard, /siteSelect\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(wizard, /list\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(wizard, /invalidControl\?\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(wizard, /aria-describedby/);
});

test('production onboarding runtime delegates disconnect to the server-authoritative connection port', async () => {
  let disconnectCalls = 0;
  const disconnected = Object.freeze({ state: 'disconnected', permissions: Object.freeze({}) });
  const runtime = createMicrosoft365OnboardingRuntime({
    onboardingApi: {
      getReadiness: async () => ({}),
      verifyFreeBusy: async () => ({}),
    },
    connectionApi: {
      getStatus: async () => disconnected,
      disconnect: async () => {
        disconnectCalls += 1;
        return disconnected;
      },
    },
    persistence: { loadCatalog: async () => ({ sites: [] }) },
  });

  assert.equal(await runtime.disconnect(), disconnected);
  assert.equal(disconnectCalls, 1);
});
