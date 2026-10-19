import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TENANT_ADMIN_SETTINGS_MESSAGES } from '../../src/core/i18n-tenant-admin-settings-messages.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://catering-health.test';
const id = 'f0000000-0000-4000-8000-000000000001';
const time = '2026-10-19T12:00:00.000Z';
const health = (extra = {}) => ({ schemaVersion: 1, integrationId: id, providerId: 'manual_catering', configurationRevision: 1,
  observedAt: time, state: 'manual_action', dispatchEnabled: true, availability: { connection: true, tenantBusiness: true },
  coverage: { limit: 1000, complete: true }, counts: { queued: 0, processing: 0, awaiting_confirmation: 0,
    manual_action: 1, reconciliation: 0, conflict: 0, settled: 0, failed: 0, superseded: 0, paused: 0 },
  expiredLeaseCount: 0, oldestOpenAt: time, ...extra });
async function install(page, language = 'de') {
  let current = health(); let status = 200; let release; let hold = false;
  let releaseWrite; let holdWrite = false;
  const reads = []; const writes = [];
  await page.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const json = (value, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname.endsWith('/health')) {
      reads.push({ path: url.pathname, method: request.method(), body: request.postData() });
      const captured = structuredClone(current); const code = status;
      if (hold) { hold = false; await new Promise((resolve) => { release = resolve; }); }
      return json(captured, code);
    }
    const capabilities = Object.fromEntries(['catalogue','availability','order','update','cancel','status'].map((key) => [`catering.${key}`, 'manual']));
    const configuration = { initialOrderMode: 'manager_review', capabilities };
    if (url.pathname === '/api/v1/integrations/catering') return json({ schemaVersion: 1,
      providers: [{ providerId: 'manual_catering', capabilities }], connections: [
        { schemaVersion: 1, integrationId: id, providerId: 'manual_catering', revision: 1, configuration },
      ], nextAfterIntegrationId: null });
    if (url.pathname.endsWith('/configuration')) {
      writes.push(request.postDataJSON());
      if (holdWrite) { holdWrite = false; await new Promise((resolve) => { releaseWrite = resolve; }); }
      return json({ code: 'SYNTHETIC_CONFIGURATION_CONFLICT' }, 409);
    }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${language}"><head>
      <meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/tokens.css">
      <link rel="stylesheet" href="/assets/styles.css"><link rel="stylesheet" href="/assets/app-layout.css">
      <link rel="stylesheet" href="/assets/tenant-admin-settings.css"></head><body><h1>Conference Manager</h1><main id="app"></main>
      <script type="module">
      import { createCateringSection } from '/src/tenant-admin/sections/catering/index.js';
      import { createCateringConfigurationApi } from '/src/platform/catering-configuration-api.js';
      import { createCateringOperationalHealthApi } from '/src/platform/catering-operational-health-api.js';
      import { featureFlags } from '/src/platform/feature-flags.js';
      import { setLanguage } from '/src/core/i18n.js'; setLanguage(${JSON.stringify(language)});
      const apiClient = { async request(path, options = {}) {
        const response = await fetch('/api/' + path, { method: options.method || 'GET', signal: options.signal,
          headers: { 'content-type': 'application/json' }, body: options.body ? JSON.stringify(options.body) : undefined });
        const value = await response.json();
        if (!response.ok) throw Object.assign(new Error('Synthetic API error'), { code: 'HTTP_' + response.status });
        return value;
      } };
      const section = createCateringSection({ adapter: { ...createCateringConfigurationApi({ apiClient }),
        ...createCateringOperationalHealthApi({ apiClient }), featureFlags: featureFlags.forServerCateringConfiguration(true) } });
      let generation = 0; const root = document.getElementById('app');
      async function render() { const selected = ++generation; await section.render({ root, isCurrent: () => selected === generation, rerender: render }); }
      window.detachHealth = () => { generation++; root.replaceChildren(); }; window.rerenderHealth = render;
      await render(); window.ready = true;
      </script></body></html>` });
    const file = path.resolve(ROOT, `.${url.pathname}`);
    if (!file.startsWith(`${ROOT}${path.sep}`) || !/\.(js|css)$/.test(file)) return route.abort();
    return route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript', body: await readFile(file) });
  });
  await page.goto(ORIGIN); await page.waitForFunction(() => window.ready);
  return { reads, writes, set(value, code = 200) { current = value; status = code; },
    hold() { hold = true; }, release() { release?.(); }, holdWrite() { holdWrite = true; }, releaseWrite() { releaseWrite?.(); } };
}
for (const language of ['de','en']) {
  test(`Tenant Admin observes manual transmission, confirmation and uncertain work without issuing commands in ${language}`, async ({ page }, testInfo) => {
    const fixture = await install(page, language); const messages = TENANT_ADMIN_SETTINGS_MESSAGES[language];
    const t = (key) => messages[`tenantAdmin.catering.health.${key}`];
    const panel = page.locator('[data-catering-health]'); const refresh = panel.getByRole('button', { name: t('refresh'), exact: true });
    expect(fixture.reads).toHaveLength(0);
    await refresh.focus(); await page.keyboard.press('Enter');
    await expect(panel.getByText(t('state.manual_action'), { exact: true })).toBeVisible(); await expect(refresh).toBeFocused();
    await expect(panel.getByText(t('count.manual_action'), { exact: true })).toBeVisible();
    fixture.set(health({ state: 'working', counts: { ...health().counts, manual_action: 0, awaiting_confirmation: 1 } }));
    await refresh.click(); await expect(panel.getByText(t('count.awaiting_confirmation'), { exact: true })).toBeVisible();
    await expect(panel.getByText(t('count.manual_action'), { exact: true })).toHaveCount(0);
    fixture.set(health({ state: 'idle', oldestOpenAt: null, counts: { ...health().counts, manual_action: 0, settled: 1 } }));
    await refresh.click(); await expect(panel.getByText(t('state.idle'), { exact: true })).toBeVisible();
    fixture.set(health({ state: 'attention', counts: { ...health().counts, manual_action: 0, reconciliation: 1 } }));
    await refresh.click(); await expect(panel.getByText(t('state.attention'), { exact: true })).toBeVisible();
    await expect(panel.getByText(t('count.reconciliation'), { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('catering-health-phone.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 844, height: 390 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    fixture.set(health({ state: 'disabled', dispatchEnabled: false })); await refresh.click();
    await expect(panel.getByText(t('state.disabled'), { exact: true })).toBeVisible();
    expect(fixture.reads).toHaveLength(5); expect(fixture.writes).toHaveLength(0);
    expect(fixture.reads.every((entry) => entry.method === 'GET' && entry.body === null)).toBe(true);
  });
}
test('incomplete coverage, changed configuration and authority failure never retain a previous successful health state', async ({ page }) => {
  const fixture = await install(page, 'en'); const panel = page.locator('[data-catering-health]');
  const refresh = panel.getByRole('button', { name: 'Reload Catering operation status', exact: true });
  fixture.set(health({ state: 'incomplete', coverage: { limit: 1000, complete: false }, oldestOpenAt: null,
    counts: { ...health().counts, manual_action: 0, settled: 1000 } }));
  await refresh.click(); await expect(panel.getByText('This bounded summary cannot describe the entire workload.', { exact: true })).toBeVisible();
  await expect(panel.getByText(/Incomplete summary: at most/)).toBeVisible();
  fixture.set(health({ configurationRevision: 2 })); await refresh.click();
  await expect(panel.getByRole('alert')).toContainText('The configuration changed.');
  await expect(panel.getByText(/Incomplete summary: at most/)).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Load current configuration', exact: true })).toBeVisible();
  fixture.set({ code: 'SYNTHETIC_SESSION_REVOKED' }, 401); await refresh.click();
  await expect(panel.getByRole('alert')).toContainText('could not be loaded safely');
  await expect(panel.getByRole('button', { name: 'Load current configuration', exact: true })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
});
test('configuration writes invalidate an earlier health read and detached responses cannot repaint or take focus', async ({ page }) => {
  const fixture = await install(page, 'en'); const panel = page.locator('[data-catering-health]');
  const refresh = panel.getByRole('button', { name: 'Reload Catering operation status', exact: true });
  fixture.hold(); await refresh.click(); await expect(refresh).toBeDisabled();
  await expect.poll(() => fixture.reads.length).toBe(1);
  fixture.holdWrite(); const form = page.locator(`[data-catering-form="${id}"]`);
  await form.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await expect(form.getByRole('combobox').first()).toBeDisabled();
  await expect.poll(() => fixture.writes.length).toBe(1); fixture.release();
  await expect(panel.getByText('Manual transmission or resolution is pending.', { exact: true })).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await expect(form.getByRole('combobox').first()).toBeDisabled(); await expect(refresh).toBeDisabled();
  fixture.releaseWrite(); await expect(form.getByRole('alert')).toContainText('The saved state changed');
  await expect(refresh).toBeEnabled(); fixture.hold(); await refresh.click();
  await expect.poll(() => fixture.reads.length).toBe(2);
  await page.evaluate(() => window.detachHealth()); fixture.release();
  await expect(page.locator('[data-catering-health]')).toHaveCount(0);
  await expect(page.getByText('Operation status loaded.', { exact: true })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
});
