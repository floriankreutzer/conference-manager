import { readFile } from 'node:fs/promises';

export const cateringOrderOriginal = JSON.parse(await readFile(new URL('../../fixtures/catering-order.json', import.meta.url), 'utf8'));
const sourceRequest = JSON.parse(await readFile(new URL('../../fixtures/catering-order-request.json', import.meta.url), 'utf8'));
const jobId = 'e0000000-0000-4000-8000-000000009001';
const instant = '2026-10-19T13:00:00.000Z';

export async function installCateringDeliveryFixture(page, {
  language = 'de', enabled = true, failure = null, rejected = false, readFailure = false, documentText = null,
} = {}) {
  const current = structuredClone(cateringOrderOriginal);
  if (documentText !== null) { current.order.title = documentText; current.order.positions[0].name = documentText; }
  current.quote = { revision: 1, cost: { amountMinor: 1250, currency: 'EUR' }, expiresAt: '2030-01-01T12:00:00.000Z', expired: false };
  current.decision = { sequence: 1, decision: 'approved', quoteRevision: 1, cost: current.quote.cost };
  current.state = { revision: rejected ? 6 : 3, status: rejected ? 'rejected' : 'released', updatedAt: instant };
  const writes = []; let jobs = []; let waitForRead = null; let deferReads = false;
  let orderReads = 0; let orderReadFailure = null; let deferOrderReads = false;
  const waitingOrderReads = new Set();
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
    if (url.pathname.endsWith(current.order.orderId)) {
      orderReads++;
      if (deferOrderReads) await new Promise((resolve) => { waitingOrderReads.add(resolve); });
      if (orderReadFailure) return json({ code: 'SYNTHETIC_ORDER_READ_FAILURE' }, orderReadFailure);
      return json(current);
    }
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
    holdReads() { deferReads = true; }, releaseRead() { deferReads = false; waitForRead?.(); },
    orderReads: () => orderReads, failOrderReads(status) { orderReadFailure = status; },
    holdOrderReads() { deferOrderReads = true; }, releaseOrderReads() {
      deferOrderReads = false; for (const resolve of waitingOrderReads) resolve(); waitingOrderReads.clear();
    } };
}
