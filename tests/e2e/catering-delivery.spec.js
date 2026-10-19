import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const original = JSON.parse(await readFile(new URL('../fixtures/catering-order.json', import.meta.url), 'utf8'));
const sourceRequest = JSON.parse(await readFile(new URL('../fixtures/catering-order-request.json', import.meta.url), 'utf8'));
const jobId = 'e0000000-0000-4000-8000-000000009001';
const instant = '2026-10-19T13:00:00.000Z';

async function install(page, { language = 'de', enabled = true, failure = null, rejected = false, readFailure = false } = {}) {
  const current = structuredClone(original);
  current.quote = { revision: 1, cost: { amountMinor: 1250, currency: 'EUR' }, expiresAt: '2030-01-01T12:00:00.000Z', expired: false };
  current.decision = { sequence: 1, decision: 'approved', quoteRevision: 1, cost: current.quote.cost };
  current.state = { revision: rejected ? 6 : 3, status: rejected ? 'rejected' : 'released', updatedAt: instant };
  const writes = []; let jobs = []; let waitForRead = null; let deferReads = false;
  const makeJob = (status = 'queued') => ({ jobId, integrationId: current.order.integrationId, orderId: current.order.orderId,
    orderVersion: 1, operation: 'initial', revision: 1, status, dispatchAttempts: status === 'succeeded' ? 1 : 0,
    automaticReconciliationAttempts: 0, quoteRevision: 1, decisionSequence: 1,
    createdAt: instant, updatedAt: instant, availableAt: status === 'queued' ? instant : null });
  if (rejected) jobs = [makeJob('succeeded')];
  await page.route('**/api/v1/tenant/catering/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname.includes('/delivery-jobs')) {
      if (request.method() === 'GET') {
        if (deferReads) await new Promise((resolve) => { waitForRead = resolve; });
        if (readFailure) return json({ code: 'SYNTHETIC_UNAVAILABLE' }, 503);
        return json({ schemaVersion: 1, jobs, nextAfterJobId: null });
      }
      writes.push(request.postDataJSON());
      if (failure) return json({ code: 'CATERING_DELIVERY_REVISION_CONFLICT' }, failure);
      jobs = [makeJob()]; current.state = { revision: 4, status: 'queued', updatedAt: instant };
      return json({ schemaVersion: 1, replayed: false, job: jobs[0] });
    }
    if (request.method() !== 'GET') throw new Error('Unexpected order write');
    if (url.pathname.endsWith(current.order.orderId)) return json(current);
    return json({ schemaVersion: 1, orders: [{ orderId: current.order.orderId, integrationId: current.order.integrationId,
      orderVersion: 1, stateRevision: current.state.revision, status: current.state.status }], nextAfterOrderId: null });
  });
  await page.goto('/');
  await page.evaluate(async ({ order, request, language: lang, enabled: rollout }) => {
    const { createManagerWorkspaceApplication } = await import('/src/manager/workspace-application.js');
    const { createCateringOrderApi } = await import('/src/platform/catering-order-api.js');
    const { createCateringDeliveryApi } = await import('/src/platform/catering-delivery-api.js');
    const { featureFlags } = await import('/src/platform/feature-flags.js');
    const { setLanguage } = await import('/src/core/i18n.js');
    setLanguage(lang);
    const apiClient = { async request(path, options = {}) {
      const response = await fetch('/api/' + path, { method: options.method || 'GET',
        headers: { 'content-type': 'application/json' }, body: options.body ? JSON.stringify(options.body) : undefined });
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error('Synthetic error'), { code: 'HTTP_' + response.status, serverCode: result.code });
      return result;
    } };
    const unavailable = async () => { throw new Error('Unexpected operation'); };
    const persistence = Object.fromEntries(['proposeBookingChange','decideBookingChange','transitionRequest',
      'loadRequestHistory','loadRequestReport'].map((key) => [key, unavailable]));
    persistence.loadBookingChange = async () => null; persistence.loadRequestRoomContext = async () => null;
    persistence.listRequests = async () => [request];
    persistence.loadCatalog = async () => ({ sites: [{ id: 'site-a', name: 'Synthetic Site', timeZone: 'Europe/Berlin' }],
      rooms: [{ id: 'room-a', siteId: 'site-a', name: order.order.room.name, capacity: 500 }],
      services: [], equipment: [], cateringItems: [], cateringPackages: [] });
    const app = document.getElementById('app');
    const workspace = createManagerWorkspaceApplication({ appRoot: app, setPageHeading() {}, persistence, locations: {}, catalogue: {},
      cateringOrders: { ...createCateringOrderApi({ apiClient }), featureFlags: featureFlags.forServerCateringOrders(true) },
      cateringDelivery: { ...createCateringDeliveryApi({ apiClient }), featureFlags: featureFlags.forServerCateringDelivery(rollout) },
      onAuthorityFailure: () => { document.documentElement.dataset.sessionLocked = 'true'; },
    });
    await workspace.renderManager();
  }, { order: current, request: sourceRequest, language, enabled });
  await page.getByRole('tab', { name: language === 'de' ? 'Catering-Bestellungen' : 'Catering orders', exact: true }).click();
  await page.getByRole('button', { name: language === 'de' ? /Bestellung .* öffnen/ : /Open order / }).click();
  return { current, writes, defer() { jobs = [makeJob('deferred')]; },
    holdReads() { deferReads = true; }, releaseRead() { deferReads = false; waitForRead?.(); } };
}

for (const language of ['de','en']) {
  test(`Manager explicitly queues approved source and reads manual deferral without claiming transmission in ${language}`, async ({ page }, testInfo) => {
    const fixture = await install(page, { language });
    const region = page.getByRole('region', { name: language === 'de' ? 'Lieferbearbeitung' : 'Delivery processing' });
    const enqueue = region.getByRole('button', { name: language === 'de'
      ? 'Freigegebene Version zur Bearbeitung einreihen' : 'Queue approved version for processing' });
    await expect(enqueue).toBeEnabled(); await enqueue.focus(); await page.keyboard.press('Enter');
    await expect(region.getByRole('heading', { name: language === 'de' ? 'Zur Bearbeitung eingereiht' : 'Queued for processing' })).toBeVisible();
    expect(fixture.writes).toEqual([{ schemaVersion: 1, orderId: original.order.orderId,
      expectedOrderVersion: 1, expectedStateRevision: 3, expectedQuoteRevision: 1 }]);
    await expect(page.getByRole('button', { name: language === 'de'
      ? 'Aktuellen Stand laden und Entwurf verwerfen' : 'Load current state and discard draft' })).toBeFocused();
    fixture.defer();
    const reload = region.getByRole('button', { name: language === 'de' ? 'Stand aktualisieren' : 'Refresh state' });
    await reload.focus(); await page.keyboard.press('Enter');
    await expect(region.getByRole('heading', { name: language === 'de' ? 'Manuelle Nachverfolgung erforderlich' : 'Manual follow-up required' }))
      .toBeVisible();
    await expect(region.getByText(language === 'de'
      ? 'Eine manuelle Nachverfolgung ist erforderlich. Dieser Eintrag bestätigt keinen manuellen Versand.'
      : 'Manual follow-up is required. This entry does not confirm manual transmission.')).toBeVisible();
    await expect(reload).toBeFocused();
    await expect(region.getByRole('button', { name: language === 'de' ? 'Weitere Einträge' : 'More entries' })).toBeDisabled();
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (viewport.width === 390) await region.screenshot({ path: testInfo.outputPath('delivery-phone.png') });
    }
    expect(fixture.writes).toHaveLength(1);
  });
}

test('enqueue conflict blocks all writes until explicit authoritative order reload', async ({ page }) => {
  const fixture = await install(page, { failure: 409 });
  const enqueue = page.getByRole('button', { name: 'Freigegebene Version zur Bearbeitung einreihen' });
  await expect(enqueue).toBeEnabled(); await enqueue.click();
  await expect(enqueue).toBeDisabled();
  await expect(page.getByText('Der Stand wurde geändert. Laden Sie ihn neu und prüfen Sie das Angebot erneut.')).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Aktuellen Stand laden und Entwurf verwerfen' }).click();
  await expect(enqueue).toBeEnabled(); expect(fixture.writes).toHaveLength(1);
});

test('failed job reads cannot enable enqueue and rollout-off leaves order review available', async ({ page }) => {
  await install(page, { readFailure: true });
  await expect(page.getByText('Der Bearbeitungsstand konnte nicht geladen werden. Laden Sie ihn erneut, bevor Sie die Version einreihen.'))
    .toBeVisible();
  await expect(page.getByRole('button', { name: 'Freigegebene Version zur Bearbeitung einreihen' })).toBeDisabled();
  await install(page, { enabled: false });
  await expect(page.getByRole('region', { name: 'Lieferbearbeitung' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Lieferantenangebot erfassen' })).toBeVisible();
});

test('provider rejection keeps approved historical quote without presenting renewed initial-order approval', async ({ page }) => {
  await install(page, { rejected: true });
  await expect(page.getByRole('region', { name: 'Bestelldetails' }).getByText('Abgelehnt', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rückmeldung verarbeitet; Lieferstatus oben prüfen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lieferantenangebot erfassen' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Kosten von .* freigeben/ })).toHaveCount(0);
});

test('late processing reads cannot repaint a detached Manager tab', async ({ page }) => {
  const fixture = await install(page);
  const reload = page.getByRole('button', { name: 'Stand aktualisieren' });
  await expect(reload).toBeEnabled(); fixture.holdReads(); await reload.click();
  await page.locator('#managerTab-BOOKINGS').click(); fixture.releaseRead();
  await expect(page.locator('#managerTab-BOOKINGS')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Lieferbearbeitung' })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
});
