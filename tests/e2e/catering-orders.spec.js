import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://catering-orders.test';
const original = JSON.parse(await readFile(new URL('../fixtures/catering-order.json', import.meta.url), 'utf8'));
const sourceRequest = JSON.parse(await readFile(new URL('../fixtures/catering-order-request.json', import.meta.url), 'utf8'));

async function install(page, { enabled = true, conflict = false, forbidden = false, delayQuote = false, language = 'de' } = {}) {
  let prepared = false;
  let current = structuredClone(original);
  const writes = [];
  let releaseQuote;
  await page.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname.startsWith('/api/v1/tenant/catering/orders')) {
      if (request.method() === 'GET') {
        if (url.pathname.endsWith(current.order.orderId)) return json(current);
        return json({ schemaVersion: 1, orders: prepared ? [{ orderId: current.order.orderId,
          integrationId: current.order.integrationId, orderVersion: 1, stateRevision: current.state.revision,
          status: current.state.status }] : [], nextAfterOrderId: null });
      }
      const input = request.postDataJSON(); writes.push({ path: url.pathname, input });
      if (url.pathname.endsWith('/quote')) {
        if (delayQuote) await new Promise((resolve) => { releaseQuote = resolve; });
        if (forbidden) return json({ code: 'FORBIDDEN' }, 403);
        if (conflict) return json({ code: 'CATERING_ORDER_REVISION_CONFLICT' }, 409);
        current.quote = { revision: (current.quote?.revision ?? 0) + 1, cost: input.cost, expiresAt: input.expiresAt, expired: false };
        current.decision = null; current.state.revision++; current.state.status = 'pending_manager_review';
        return json(current);
      }
      if (url.pathname.endsWith('/decision')) {
        current.decision = { sequence: (current.decision?.sequence ?? 0) + 1, decision: input.decision,
          quoteRevision: current.quote.revision, cost: current.quote.cost };
        current.state.revision++; current.state.status = input.decision === 'approved' ? 'released' : 'rejected';
        return json(current);
      }
      prepared = true;
      return json({ schemaVersion: 1, requestId: input.requestId, requestVersion: input.expectedRequestVersion,
        assignmentRevision: input.expectedAssignmentRevision, replayed: false, orders: [{ orderId: current.order.orderId,
          integrationId: current.order.integrationId, orderVersion: 1, stateRevision: 1, status: 'pending_quote' }] });
    }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="de"><head>
      <meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/tokens.css">
      <link rel="stylesheet" href="/assets/styles.css"><link rel="stylesheet" href="/assets/app-layout.css">
      <link rel="stylesheet" href="/assets/manager-layout.css"></head><body><h1 id="viewTitle"></h1><main id="app"></main>
      <script type="module">
      import { createManagerWorkspaceApplication } from '/src/manager/workspace-application.js';
      import { createCateringOrderApi } from '/src/platform/catering-order-api.js';
      import { featureFlags } from '/src/platform/feature-flags.js';
      import { setLanguage } from '/src/core/i18n.js';
      setLanguage(${JSON.stringify(language)});
      const api = createCateringOrderApi({ apiClient: { async request(path, options = {}) {
        const response = await fetch('/api/' + path, { method: options.method || 'GET',
          headers: { 'content-type': 'application/json' }, body: options.body ? JSON.stringify(options.body) : undefined });
        const value = await response.json();
        if (!response.ok) throw Object.assign(new Error('Synthetic API error'), { code: 'HTTP_' + response.status, serverCode: value.code });
        return value;
      } } });
      const unavailable = async () => { throw new Error('Unexpected operation'); };
      const persistence = Object.fromEntries(['proposeBookingChange','decideBookingChange','transitionRequest',
        'loadRequestHistory','loadRequestReport'].map(key => [key, unavailable]));
      persistence.loadBookingChange = async () => null;
      persistence.loadRequestRoomContext = async () => null;
      persistence.listRequests = async () => [${JSON.stringify(sourceRequest)}];
      persistence.loadCatalog = async () => ({ sites: [{ id: 'site-a', name: 'Synthetic Site', timeZone: 'Europe/Berlin' }],
        rooms: [{ id: 'room-a', siteId: 'site-a', name: 'Synthetic Room', capacity: 500 }], services: [], equipment: [],
        cateringItems: [], cateringPackages: [] });
      const application = createManagerWorkspaceApplication({ appRoot: document.getElementById('app'), persistence,
        setPageHeading: title => { document.getElementById('viewTitle').textContent = title; },
        locations: {}, catalogue: {}, cateringOrders: { ...api, featureFlags: featureFlags.forServerCateringOrders(${enabled}) },
        cateringAssignments: { loadAssignments: async () => ({ revision: 3, stale: false, assignedCatalogueRevision: 4 }) },
        onAuthorityFailure: () => { document.documentElement.dataset.sessionLocked = 'true'; } });
      await application.renderManager(); window.ordersReady = true;
      </script></body></html>` });
    const file = path.resolve(ROOT, `.${url.pathname}`);
    if (!file.startsWith(`${ROOT}${path.sep}`) || !/\.(js|css)$/.test(file)) return route.abort();
    try { return route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript', body: await readFile(file) }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto(ORIGIN); await page.waitForFunction(() => window.ordersReady === true);
  return { writes, releaseQuote: () => releaseQuote?.() };
}

async function prepareAndOpen(page) {
  await page.getByRole('tab', { name: 'Catering-Bestellungen', exact: true }).click();
  await page.getByLabel('Bestätigte Konferenz', { exact: false }).selectOption('request-a');
  await page.getByRole('button', { name: 'Catering vorbereiten' }).click();
  const open = page.getByRole('button', { name: /Bestellung .* öffnen/ });
  await expect(open).toHaveCount(1); await open.click();
  await expect(page.getByRole('heading', { name: 'Lieferantenangebot erfassen' })).toBeVisible();
}
async function fillQuote(page, amount) {
  await page.getByLabel('Gesamtbetrag', { exact: false }).fill(amount);
  await page.getByLabel('Gültig bis', { exact: false }).fill('2030-01-01T12:00');
  await page.getByRole('button', { name: 'Angebot zur Prüfung speichern' }).focus();
  await page.keyboard.press('Enter');
}

test('Manager prepares, records and approves exact supplier cost; replacement quote needs renewed approval', async ({ page }) => {
  const fixture = await install(page); await prepareAndOpen(page);
  await expect(page.getByText('Die Lieferantenkosten sind noch unbekannt.')).toBeVisible();
  await fillQuote(page, '12.50');
  const approve = page.getByRole('button', { name: /Kosten von .* freigeben/ });
  await expect(approve).toHaveCount(1); await approve.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('article').getByText('Kosten freigegeben; noch nicht versandt', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bestelldetails' }).getByText('Kosten freigegeben; noch nicht versandt', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aktuellen Stand laden und Entwurf verwerfen' })).toBeFocused();
  await fillQuote(page, '13.50');
  await expect(page.getByRole('article').getByText('Kostenfreigabe erforderlich', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bestelldetails' }).getByText('Kostenfreigabe erforderlich', { exact: true })).toBeVisible();
  expect(fixture.writes.map((entry) => entry.input.expectedQuoteRevision)).toEqual([undefined,0,1,1]);
  expect(fixture.writes[0].input).toMatchObject({ expectedRequestVersion: 2, expectedAssignmentRevision: 3 });
  expect(fixture.writes[2].input).toMatchObject({ decision: 'approved', expectedStateRevision: 2 });
  expect(Object.keys(fixture.writes[2].input)).not.toContain('cost');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('conflicting quote preserves input, prevents reapply and requires explicit current-state reload', async ({ page }) => {
  const fixture = await install(page, { conflict: true }); await prepareAndOpen(page); await fillQuote(page, '12.50');
  await expect(page.getByRole('status')).toContainText('Der Stand wurde geändert');
  await expect(page.getByLabel('Gesamtbetrag', { exact: false })).toHaveValue('12.50');
  await expect(page.getByRole('button', { name: 'Angebot zur Prüfung speichern' })).toBeDisabled();
  expect(fixture.writes).toHaveLength(2);
  await page.getByRole('button', { name: 'Aktuellen Stand laden und Entwurf verwerfen' }).click();
  await expect(page.getByLabel('Gesamtbetrag', { exact: false })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Angebot zur Prüfung speichern' })).toBeEnabled();
  expect(fixture.writes).toHaveLength(2);
});

test('order navigation remains absent with the scoped rollout off', async ({ page }) => {
  await install(page, { enabled: false });
  await expect(page.getByRole('tab', { name: 'Catering-Bestellungen', exact: true })).toHaveCount(0);
});

test('English order form uses existing responsive controls and keyboard tab navigation', async ({ page }) => {
  await install(page, { language: 'en' });
  await page.locator('#managerTab-BOOKINGS').focus(); await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Catering orders', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Catering orders', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('authority loss clears order forms and a late write cannot repaint a detached tab', async ({ page }) => {
  const forbidden = await install(page, { forbidden: true });
  await prepareAndOpen(page); await fillQuote(page, '12.50');
  await expect(page.getByLabel('Gesamtbetrag', { exact: false })).toHaveCount(0);
  expect(forbidden.writes).toHaveLength(2);
  await install(page, { delayQuote: true }).then(async (delayed) => {
    await prepareAndOpen(page); await fillQuote(page, '12.50');
    await expect.poll(() => delayed.writes.length).toBe(2);
    await page.locator('#managerTab-BOOKINGS').click();
    delayed.releaseQuote();
    await expect(page.locator('#managerTab-BOOKINGS')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Gesamtbetrag', { exact: false })).toHaveCount(0);
    expect(delayed.writes).toHaveLength(2);
  });
});

test('browser currency formatting preserves aggregate cents in German and English', async ({ page }) => {
  await install(page);
  const text = await page.evaluate(async () => {
    const { cateringMoneyText } = await import('/src/manager/catering-quote-draft.js');
    return ['de-DE','en-GB'].map(locale => cateringMoneyText({ amountMinor: 9007199254740989, currency: 'EUR' }, locale));
  });
  expect(text).toEqual(['90.071.992.547.409,89\u00a0€','€90,071,992,547,409.89']);
});
