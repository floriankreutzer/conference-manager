import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createCateringOrderApi } from '../src/platform/catering-order-api.js';
import { discoverCateringOrders } from '../src/platform/catering-order-runtime.js';
import { featureFlags } from '../src/platform/feature-flags.js';

const source = JSON.parse(await readFile(new URL('./fixtures/catering-order.json', import.meta.url), 'utf8'));
const fixture = () => structuredClone(source);
const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const apiFor = (value) => createCateringOrderApi({ apiClient: { request: async () => value } });
const reference = (n = 1) => ({ orderId: id(n), integrationId: id(n + 100), orderVersion: 1,
  stateRevision: 1, status: 'pending_quote' });
const page = () => ({ schemaVersion: 1, orders: [], nextAfterOrderId: null });
const quote = () => ({ revision: 1, cost: { amountMinor: 1200, currency: 'EUR' },
  expiresAt: '2026-10-20T09:00:00.000Z', expired: false });
function quoted() {
  return { ...fixture(), quote: quote(), state: { ...source.state, revision: 2, status: 'pending_manager_review' } };
}
function decided(decision = 'approved') {
  return { ...quoted(), decision: { sequence: 1, decision, quoteRevision: 1, cost: quote().cost },
    state: { ...source.state, revision: 3, status: decision === 'approved' ? 'released' : 'rejected' } };
}

test('order detail accepts only the exact historical commercial projection and copies it immutably', async () => {
  const value = fixture();
  const loaded = await apiFor(value).loadOrder(source.order.orderId);
  assert.deepEqual(loaded, value);
  assert.equal(loaded.order.positions[0].packageDetails.includedItems.length, 2);
  assert.equal(Object.isFrozen(loaded.order.positions[0].packageDetails.includedItems[0]), true);
  value.order.title = 'changed'; assert.notEqual(loaded.order.title, value.order.title);
  for (const change of [
    (v) => { v.tenantId = id(3); }, (v) => { v.order.tenantId = id(3); },
    (v) => { v.order.orderId = id(3); }, (v) => { v.order.providerCost = quote().cost; },
    (v) => { v.order.positions[0].quantity++; }, (v) => { v.order.conferencePrice.amountMinor++; },
    (v) => { v.order.positions.push(v.order.positions[0]); }, (v) => { v.providerId = 'unqualified'; },
    (v) => { v.order.positions[0].packageDetails.includedSelections[0].itemId = 'foreign'; },
    (v) => { v.state.status = 'released'; }, (v) => { v.quote = quote(); },
  ]) {
    const corrupt = fixture(); change(corrupt);
    await assert.rejects(apiFor(corrupt).loadOrder(source.order.orderId), /INVALID/);
  }
  let reads = 0;
  const getter = fixture(); Object.defineProperty(getter.order, 'title', { enumerable: true, get() { reads++; return 'unsafe'; } });
  await assert.rejects(apiFor(getter).loadOrder(source.order.orderId), /INVALID/); assert.equal(reads, 0);
});

test('closed order pages retain exact scope cursors, bounded count and strict ordering', async () => {
  const full = { schemaVersion: 1, orders: Array.from({ length: 20 }, (_, n) => reference(n + 1)), nextAfterOrderId: id(20) };
  let request;
  const api = createCateringOrderApi({ apiClient: { request: async (path, options) => { request = { path, options }; return full; } } });
  assert.equal((await api.listOrders({ requestId: 'request-a' })).orders.length, 20);
  assert.equal(request.path, 'v1/tenant/catering/orders?requestId=request-a');
  for (const corrupt of [{ ...full, orders: [...full.orders].reverse() }, { ...full, nextAfterOrderId: id(19) },
    { ...full, orders: [...full.orders, reference(21)] }, { ...full, orders: [{ ...reference(), credentials: 'unsafe' }] },
    { ...full, orders: [reference()] }, { ...full, tenantId: id(1) }]) {
    await assert.rejects(apiFor(corrupt).listOrders(), /INVALID/);
  }
  await assert.rejects(apiFor(full).listOrders({ afterOrderId: id(1) }), /INVALID/);
});

test('full package membership and the 101-position commercial boundary survive the browser wire', async () => {
  const value = fixture();
  const packagePosition = value.order.positions[0];
  const component = packagePosition.packageDetails.includedItems[0];
  packagePosition.packageDetails.includedItems = Array.from({ length: 300 }, (_, n) => ({
    ...component, id: `included-${n}`, name: `included-${n}`,
  }));
  value.order.positions.push(...Array.from({ length: 100 }, (_, n) => ({ positionId: id(n + 1000), kind: 'item',
    entryId: `extra-${n}`, name: `extra-${n}`, description: null, quantity: 1,
    unitPrice: { amountMinor: 100, currency: 'EUR' }, conferenceLineTotalMinor: 100, packageDetails: null })));
  value.order.conferencePrice.amountMinor += 10000;
  const accepted = await apiFor(value).loadOrder(value.order.orderId);
  assert.equal(accepted.order.positions.length, 101);
  assert.equal(accepted.order.positions[0].packageDetails.includedItems.length, 300);
  value.order.positions.push({ ...value.order.positions[1], positionId: id(5000), entryId: 'too-many' });
  await assert.rejects(apiFor(value).loadOrder(value.order.orderId), /INVALID/);
});

test('prepare sends only source CAS and one command, requiring exact nonduplicate acknowledgement', async () => {
  let sent;
  const response = { schemaVersion: 1, requestId: 'request-a', requestVersion: 2, assignmentRevision: 3,
    replayed: false, orders: [reference()] };
  const api = createCateringOrderApi({ apiClient: { request: async (path, options) => { sent = { path, options }; return response; } } });
  const input = { requestId: 'request-a', commandId: id(80), expectedRequestVersion: 2, expectedAssignmentRevision: 3 };
  assert.deepEqual(await api.prepareOrders(input), response);
  assert.deepEqual(sent, { path: 'v1/tenant/catering/orders', options: { method: 'POST', body: { schemaVersion: 1, ...input } } });
  for (const corrupt of [{ ...response, assignmentRevision: 4 }, { ...response, requestId: 'foreign' },
    { ...response, orders: [] }, { ...response, orders: [reference(), reference()] },
    { ...response, orders: [{ ...reference(), stateRevision: 2 }] }]) {
    await assert.rejects(apiFor(corrupt).prepareOrders(input), /INVALID/);
  }
});

test('quote and decision require exact revision and cost acknowledgement without retrying uncertainty', async () => {
  const input = { orderId: source.order.orderId, expectedStateRevision: 1, expectedQuoteRevision: 0,
    cost: quote().cost, expiresAt: quote().expiresAt };
  assert.equal((await apiFor(quoted()).recordQuote(input)).state.status, 'pending_manager_review');
  for (const decision of ['approved','rejected']) {
    assert.equal((await apiFor(decided(decision)).decideQuote({ orderId: input.orderId, expectedStateRevision: 2,
      expectedQuoteRevision: 1, decision })).decision.decision, decision);
  }
  const corrupt = quoted(); corrupt.quote.cost.amountMinor++;
  await assert.rejects(apiFor(corrupt).recordQuote(input), /INVALID/);
  const stale = decided(); stale.decision.quoteRevision = 2;
  await assert.rejects(apiFor(stale).loadOrder(input.orderId), /INVALID/);
  for (const code of ['HTTP_401','HTTP_403','HTTP_409','NETWORK_ERROR']) {
    let calls = 0;
    const api = createCateringOrderApi({ apiClient: { request: async () => {
      calls++; throw Object.assign(new Error(code), { code, serverCode: 'CATERING_ORDER_REVISION_CONFLICT', currentRevision: 3 });
    } } });
    await assert.rejects(api.recordQuote(input), (error) => error.code === code && error.currentRevision === 3);
    assert.equal(calls, 1);
  }
});

test('optional order discovery stays scoped, default-off, abortable and preserves authority failures', async () => {
  const context = { isDemoRuntime: () => false, isManager: () => true };
  let calls = 0;
  const authentication = { apiClient: { request: async () => { calls++; return page(); } } };
  for (const scope of [{ ...context, isDemoRuntime: () => true }, { ...context, isManager: () => false }]) {
    assert.equal(await discoverCateringOrders({ context: scope, authentication }), null);
  }
  assert.equal(calls, 0);
  const enabled = await discoverCateringOrders({ context, authentication });
  assert.equal(enabled.featureFlags.isEnabled('catering.orders'), true);
  assert.equal(enabled.featureFlags.isEnabled('catering.configuration'), false);
  assert.equal(featureFlags.isEnabled('catering.orders'), false);
  for (const code of ['HTTP_401','HTTP_403']) {
    await assert.rejects(discoverCateringOrders({ context, authentication: { apiClient: { request: async () => {
      throw Object.assign(new Error(code), { code });
    } } } }), { code });
  }
  let signal; let finish;
  assert.equal(await discoverCateringOrders({ context, timeoutMs: 5, authentication: { apiClient: {
    request: async (_path, options) => { signal = options.signal; return new Promise((resolve) => { finish = resolve; }); },
  } } }), null);
  assert.equal(signal.aborted, true); finish(page()); await Promise.resolve();
  assert.equal(featureFlags.isEnabled('catering.orders'), false);
});

test('supplier rejection retains the earlier approved cost decision as historical evidence', async () => {
  const value = decided(); value.state.status = 'rejected'; value.state.revision = 6;
  assert.equal((await apiFor(value).loadOrder(value.order.orderId)).decision.decision, 'approved');
  value.decision = null;
  await assert.rejects(apiFor(value).loadOrder(value.order.orderId), /INVALID/);
});
