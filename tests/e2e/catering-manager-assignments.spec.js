import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://catering-manager.test';
const id = (n) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function install(page, { conflict = false, enabled = true } = {}) {
  const writes = [];
  let revision = 0;
  let assignments = [];
  const connections = Array.from({ length: 21 }, (_, n) => ({ integrationId: id(n + 1), providerId: 'manual_catering' }));
  await page.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/api/v1/tenant/catering/catalogue-connections') {
      const after = url.searchParams.get('afterIntegrationId');
      const entries = connections.filter((entry) => !after || entry.integrationId > after).slice(0, 20);
      return json({ schemaVersion: 1, connections: entries, nextAfterIntegrationId: entries.length === 20 ? entries.at(-1).integrationId : null });
    }
    if (url.pathname === '/api/v1/tenant/catering/catalogue-assignments') {
      if (request.method() === 'PUT') {
        writes.push(request.postDataJSON());
        if (conflict) { revision = 1; return json({ code: 'CATERING_ASSIGNMENT_REVISION_CONFLICT' }, 409); }
        revision++;
        assignments = request.postDataJSON().assignments;
      }
      return json({ schemaVersion: 1, revision, currentCatalogueRevision: 2,
        assignedCatalogueRevision: revision ? 2 : null, assignments, stale: revision === 0 });
    }
    if (url.pathname === '/') {
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="de"><head>
        <meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/tokens.css">
        <link rel="stylesheet" href="/assets/styles.css"></head><body><h1 id="viewTitle" tabindex="-1"></h1>
        <main id="app"></main><div id="toast"></div><script type="module">
        import { createManagerBusinessSettingsApplication } from '/src/manager/business-settings-application.js';
        import { createCateringCatalogueAssignmentApi } from '/src/platform/catering-catalogue-assignment-api.js';
        import { featureFlags } from '/src/platform/feature-flags.js';
        import { setLanguage } from '/src/core/i18n.js';
        window.setAssignmentLanguage = setLanguage;
        const api = createCateringCatalogueAssignmentApi({ apiClient: { async request(path, options = {}) {
          const response = await fetch('/api/' + path, { method: options.method || 'GET',
            headers: { 'content-type': 'application/json' }, body: options.body ? JSON.stringify(options.body) : undefined });
          const value = await response.json();
          if (!response.ok) throw Object.assign(new Error('Synthetic API error'), { code: 'HTTP_' + response.status, serverCode: value.code });
          return value;
        } } });
        const item = (id, name) => ({ id, name, active: true });
        const snapshot = { revision: 2, catalogue: { services: [], equipment: [], roomPrices: [],
          cateringItems: [item('coffee', 'Kaffee'), item('fruit', 'Obst')],
          cateringPackages: [{ ...item('break', 'Konferenzpause mit gemeinsamem Lieferanten'), itemIds: ['coffee'], variants: [] }] } };
        const application = createManagerBusinessSettingsApplication({ appRoot: document.getElementById('app'),
          setPageHeading: title => { document.getElementById('viewTitle').textContent = title; },
          catalogue: { loadCatalogue: async () => snapshot, saveCatalogue: async () => snapshot, listCatalogueHistory: async () => ({ revisions: [] }) },
          locations: { loadLocations: async () => ({ revision: 1, configuration: { sites: [], rooms: [] } }),
            saveLocations: async () => {}, listLocationsHistory: async () => ({ revisions: [] }) },
          cateringAssignments: { ...api, featureFlags: featureFlags.forServerCateringCatalogue(${enabled}) },
          onAuthorityFailure: () => { document.documentElement.dataset.sessionLocked = 'true'; } });
        await application.renderManagerSettings(); window.ready = true;
        </script></body></html>` });
    }
    const file = path.resolve(ROOT, `.${url.pathname}`);
    if (!file.startsWith(`${ROOT}${path.sep}`) || !/\.(js|css)$/.test(file)) { await route.abort(); return; }
    try { await route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript', body: await readFile(file) }); }
    catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.ready === true);
  return { writes };
}

test('Manager assigns package components together, preserves choices across bounded pages and saves both revisions', async ({ page }) => {
  const fixture = await install(page);
  await page.getByRole('button', { name: 'Catering-Lieferanten', exact: true }).click();
  const selects = page.getByLabel('Catering-Verbindung', { exact: false });
  await expect(selects).toHaveCount(2);
  await expect(selects.first().locator('option')).toHaveCount(21);
  await selects.first().selectOption(id(1));
  await page.getByRole('button', { name: 'Weitere Verbindungen anzeigen' }).click();
  await expect(selects.first().locator('option')).toHaveCount(3);
  await expect(selects.first()).toHaveValue(id(1));
  await selects.nth(1).selectOption(id(21));
  await page.getByRole('button', { name: 'Speichern', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Version 1 gespeichert');
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({ expectedRevision: 0, catalogueRevision: 2 });
  const byId = new Map(fixture.writes[0].assignments.map((entry) => [entry.entryId, entry.integrationId]));
  expect(byId.get('coffee')).toBe(byId.get('break'));
  expect(byId.size).toBe(3);
  await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('conflict preserves choices, prevents reapply and requires explicit reload', async ({ page }) => {
  const fixture = await install(page, { conflict: true });
  await page.getByRole('button', { name: 'Catering-Lieferanten', exact: true }).click();
  const selects = page.getByLabel('Catering-Verbindung', { exact: false });
  for (const select of await selects.all()) await select.selectOption(id(1));
  const save = page.getByRole('button', { name: 'Speichern', exact: true });
  await save.click();
  await expect(page.getByRole('status')).toContainText('zwischenzeitlich geändert');
  await expect(save).toBeDisabled();
  await expect(selects.first()).toHaveValue(id(1));
  expect(fixture.writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Aktuellen Stand laden und Auswahl verwerfen' }).click();
  await expect(selects.first()).toHaveValue('');
  await expect(save).toBeEnabled();
  expect(fixture.writes).toHaveLength(1);
});

test('default-off presentation does not add supplier assignment navigation', async ({ page }) => {
  await install(page, { enabled: false });
  await expect(page.getByRole('button', { name: 'Catering-Lieferanten', exact: true })).toHaveCount(0);
});

test('English supplier form reflows in landscape and retains native keyboard selection', async ({ page }) => {
  await install(page);
  await page.evaluate(() => window.setAssignmentLanguage('en'));
  await page.getByRole('button', { name: 'Catering-Lieferanten', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Assign catering suppliers', exact: true })).toBeVisible();
  const selects = page.getByLabel('Catering connection', { exact: false });
  await expect(selects).toHaveCount(2);
  await selects.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(selects.first()).toHaveValue(id(1));
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole('button', { name: 'Load current state and discard selection' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
