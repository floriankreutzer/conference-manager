import assert from 'node:assert/strict';
import test from 'node:test';
import { createCateringDeliveryApi } from '../src/platform/catering-delivery-api.js';
import { discoverCateringDelivery } from '../src/platform/catering-delivery-runtime.js';
import { featureFlags } from '../src/platform/feature-flags.js';

const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const instant = '2026-10-19T13:00:00.000Z';
const job = (n = 1) => ({ jobId: id(n), integrationId: id(100), orderId: id(200), orderVersion: 1, operation: 'initial',
  revision: 1, status: 'queued', dispatchAttempts: 0, automaticReconciliationAttempts: 0, quoteRevision: 1, decisionSequence: 1,
  createdAt: instant, updatedAt: instant, availableAt: instant });
const empty = () => ({ schemaVersion: 1, jobs: [], nextAfterJobId: null });
const apiFor = (value) => createCateringDeliveryApi({ apiClient: { request: async () => value } });

test('delivery pages enforce scope, exact minimized fields, bounded ordered keysets and immutable data', async () => {
  const full = { schemaVersion: 1, jobs: Array.from({ length: 20 }, (_, n) => job(n + 1)), nextAfterJobId: id(20) };
  let request;
  const api = createCateringDeliveryApi({ apiClient: { request: async (path, options) => { request = { path, options }; return full; } } });
  const loaded = await api.listJobs({ orderId: id(200) });
  assert.equal(request.path, `v1/tenant/catering/delivery-jobs?orderId=${id(200)}`);
  assert.equal(loaded.jobs.length, 20); assert.equal(Object.isFrozen(loaded.jobs[0]), true);
  for (const corrupt of [{ ...full, jobs: [...full.jobs].reverse() }, { ...full, nextAfterJobId: id(19) },
    { ...full, jobs: [...full.jobs, job(21)] }, { ...full, jobs: [job()] },
    { ...empty(), jobs: [{ ...job(), orderId: id(201) }] }, { ...empty(), tenantId: id(9) }]) {
    await assert.rejects(apiFor(corrupt).listJobs({ orderId: id(200) }), /INVALID/);
  }
  await assert.rejects(apiFor(full).listJobs({ afterJobId: id(1) }), /INVALID/);
  for (const key of ['tenantId','originStateRevision','leaseId','receipt','credential','cost']) {
    await assert.rejects(apiFor({ schemaVersion: 1, job: { ...job(), [key]: 'private' } }).loadJob(id(1)), /INVALID/);
  }
  assert.notEqual(loaded.jobs, full.jobs);
});

test('delivery status and counts reject impossible or unknown source data without getter evaluation', async () => {
  for (const mutate of [
    (v) => { v.status = 'unknown'; }, (v) => { v.dispatchAttempts = 4; }, (v) => { v.automaticReconciliationAttempts = 11; },
    (v) => { v.status = 'dispatching'; }, (v) => { v.availableAt = null; },
    (v) => { v.updatedAt = '2026-10-18T13:00:00.000Z'; }, (v) => { v.operation = 'publish'; },
    (v) => { v.jobId = id(2); },
  ]) {
    const corrupt = job(); mutate(corrupt);
    await assert.rejects(apiFor({ schemaVersion: 1, job: corrupt }).loadJob(id(1)), /INVALID/);
  }
  let reads = 0; const getter = job();
  Object.defineProperty(getter, 'status', { enumerable: true, get() { reads++; return 'queued'; } });
  await assert.rejects(apiFor({ schemaVersion: 1, job: getter }).loadJob(id(1)), /INVALID/); assert.equal(reads, 0);
  const succeeded = { ...job(), status: 'succeeded', dispatchAttempts: 1, availableAt: null };
  assert.equal((await apiFor({ schemaVersion: 1, job: succeeded }).loadJob(id(1))).job.status, 'succeeded');
});

test('enqueue sends only displayed source CAS and checks fresh or replayed acknowledgements', async () => {
  const command = { orderId: id(200), expectedOrderVersion: 1, expectedStateRevision: 3, expectedQuoteRevision: 1 };
  let sent;
  const result = { schemaVersion: 1, replayed: false, job: job() };
  const api = createCateringDeliveryApi({ apiClient: { request: async (path, options) => { sent = { path, options }; return result; } } });
  assert.equal((await api.enqueue(command)).replayed, false);
  assert.deepEqual(sent, { path: 'v1/tenant/catering/delivery-jobs', options: { method: 'POST', body: { schemaVersion: 1, ...command } } });
  for (const corrupt of [{ ...result, replayed: 'true' }, { ...result, job: { ...job(), orderVersion: 2 } },
    { ...result, job: { ...job(), quoteRevision: 2 } }, { ...result, job: { ...job(), revision: 2 } },
    { ...result, job: { ...job(), dispatchAttempts: 1 } }]) await assert.rejects(apiFor(corrupt).enqueue(command), /INVALID/);
  assert.equal((await apiFor({ ...result, replayed: true,
    job: { ...job(), revision: 8, status: 'succeeded', dispatchAttempts: 1, availableAt: null } }).enqueue(command)).replayed, true);
});

test('delivery mutation uncertainty is never automatically retried and preserves authority/conflict errors', async () => {
  for (const code of ['HTTP_401','HTTP_403','HTTP_409','NETWORK_ERROR']) {
    let calls = 0;
    const api = createCateringDeliveryApi({ apiClient: { async request() { calls++; throw Object.assign(new Error(code), { code }); } } });
    await assert.rejects(api.enqueue({ orderId: id(200), expectedOrderVersion: 1, expectedStateRevision: 3,
      expectedQuoteRevision: 1 }), { code }); assert.equal(calls, 1);
  }
});

test('delivery discovery requires optional orders, non-Demo Manager authority and independent default-off rollout', async () => {
  const context = { isDemoRuntime: () => false, isManager: () => true };
  const orders = { featureFlags: featureFlags.forServerCateringOrders(true) };
  let calls = 0;
  const authentication = { apiClient: { request: async () => { calls++; return empty(); } } };
  for (const input of [{ context, authentication }, { context: { ...context, isDemoRuntime: () => true }, authentication, orders },
    { context: { ...context, isManager: () => false }, authentication, orders }]) {
    assert.equal(await discoverCateringDelivery(input), null);
  }
  assert.equal(calls, 0);
  const available = await discoverCateringDelivery({ context, authentication, orders });
  assert.equal(available.featureFlags.isEnabled('catering.delivery'), true);
  assert.equal(available.featureFlags.isEnabled('catering.orders'), false);
  assert.equal(featureFlags.isEnabled('catering.delivery'), false);
  for (const code of ['HTTP_401','HTTP_403']) {
    await assert.rejects(discoverCateringDelivery({ context, orders, authentication: { apiClient: { async request() {
      throw Object.assign(new Error(code), { code });
    } } } }), { code });
  }
  let signal; let finish;
  assert.equal(await discoverCateringDelivery({ context, orders, timeoutMs: 5, authentication: { apiClient: {
    request: async (_path, options) => { signal = options.signal; return new Promise((resolve) => { finish = resolve; }); },
  } } }), null);
  assert.equal(signal.aborted, true); finish(empty()); await Promise.resolve();
  assert.equal(featureFlags.isEnabled('catering.delivery'), false);
});
