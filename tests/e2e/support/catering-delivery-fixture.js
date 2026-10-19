import { readFile } from 'node:fs/promises';

export const cateringOrderOriginal = JSON.parse(await readFile(new URL('../../fixtures/catering-order.json', import.meta.url), 'utf8'));
const sourceRequest = JSON.parse(await readFile(new URL('../../fixtures/catering-order-request.json', import.meta.url), 'utf8'));
const jobId = 'e0000000-0000-4000-8000-000000009001';
const instant = '2026-10-19T13:00:00.000Z';

export async function installCateringDeliveryFixture(page, {
  language = 'de', enabled = true, failure = null, rejected = false, readFailure = false, documentText = null, manualFailure = null, manualReadFailure = null, extraPosition = false,
} = {}) {
  const current = structuredClone(cateringOrderOriginal);
  if (documentText !== null) { current.order.title = documentText; current.order.positions[0].name = documentText; }
  if (extraPosition) {
    const line = current.order.positions[0];
    current.order.positions.push({ ...structuredClone(line), positionId: 'e0000000-0000-4000-8000-000000000102',
      kind: 'item', entryId: 'manual-extra', name: 'Synthetic extra item', quantity: 1,
      conferenceLineTotalMinor: line.unitPrice.amountMinor, packageDetails: null });
    current.order.conferencePrice.amountMinor = current.order.positions.reduce((sum, position) => sum + position.conferenceLineTotalMinor, 0);
  }
  current.quote = { revision: 1, cost: { amountMinor: 1250, currency: 'EUR' }, expiresAt: '2030-01-01T12:00:00.000Z', expired: false };
  current.decision = { sequence: 1, decision: 'approved', quoteRevision: 1, cost: current.quote.cost };
  current.state = { revision: rejected ? 6 : 3, status: rejected ? 'rejected' : 'released', updatedAt: instant };
  const writes = []; const manualWrites = []; const manualFacts = []; let manualFailureStatus = manualFailure;
  let manualReadFailureStatus = manualReadFailure; let deferManualReads = false; const waitingManualReads = new Set();
  let jobs = []; let waitForRead = null; let deferReads = false;
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
    if (url.pathname.endsWith('/manual-delivery')) {
      if (request.method() === 'GET') {
        if (deferManualReads) await new Promise((resolve) => { waitingManualReads.add(resolve); });
        if (manualReadFailureStatus) return json({ code: 'SYNTHETIC_MANUAL_UNAVAILABLE' }, manualReadFailureStatus);
        const after = Number(url.searchParams.get('afterSequence') || 0);
        const events = manualFacts.filter((fact) => fact.sequence > after).slice(0, 20);
        return json({ schemaVersion: 1, orderId: current.order.orderId, orderVersion: current.order.orderVersion,
          orderState: { orderVersion: current.order.orderVersion, revision: current.state.revision, status: current.state.status },
          manualSequence: manualFacts.length, events,
          nextAfterSequence: manualFacts.length > after + events.length ? events.at(-1).sequence : null,
          effective: current.state.status === 'confirmed' ? { orderVersion: 1, status: 'confirmed' } : null });
      }
      const command = request.postDataJSON(); manualWrites.push(command);
      if (manualFailureStatus) return json({ code: 'CATERING_MANUAL_REVISION_CONFLICT' }, manualFailureStatus);
      const outcomes = command.receipt?.positions.map((position) => position.outcome) || [];
      const resultStatus = outcomes.length && outcomes.every((outcome) => outcome === 'confirmed') ? 'confirmed'
        : outcomes.includes('confirmed') ? 'partially_confirmed'
          : outcomes.length && outcomes.every((outcome) => outcome === 'rejected') ? 'rejected' : 'transmitted';
      const fact = { orderId: current.order.orderId, orderVersion: current.order.orderVersion, sequence: manualFacts.length + 1,
        kind: command.kind, channel: command.channel, reference: command.reference, occurredAt: command.occurredAt,
        recordedAt: new Date().toISOString(), quoteRevision: 1, decisionSequence: 1, operation: 'initial',
        status: resultStatus, receipt: command.receipt };
      manualFacts.push(fact); current.state = { revision: current.state.revision + 1, status: resultStatus, updatedAt: fact.recordedAt };
      return json({ schemaVersion: 1, replayed: false, fact,
        orderState: { orderVersion: current.order.orderVersion, revision: current.state.revision, status: resultStatus } });
    }
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
  return { current, writes, manualWrites, manualFacts,
    failManualReads(status) { manualReadFailureStatus = status; }, failManualWrites(status) { manualFailureStatus = status; },
    holdManualReads() { deferManualReads = true; }, releaseManualReads() {
      deferManualReads = false; for (const resolve of waitingManualReads) resolve(); waitingManualReads.clear();
    },
    defer() { jobs = [makeJob('deferred')]; },
    holdReads() { deferReads = true; }, releaseRead() { deferReads = false; waitForRead?.(); },
    orderReads: () => orderReads, failOrderReads(status) { orderReadFailure = status; },
    holdOrderReads() { deferOrderReads = true; }, releaseOrderReads() {
      deferOrderReads = false; for (const resolve of waitingOrderReads) resolve(); waitingOrderReads.clear();
    } };
}
