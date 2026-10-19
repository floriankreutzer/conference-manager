import assert from 'node:assert/strict';
import test from 'node:test';
import { createCateringManualApi } from '../src/platform/catering-manual-api.js';

const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const instant = '2026-10-19T13:00:00.000Z';
const scope = () => ({ orderId: id(1), orderVersion: 1, positionIds: [id(2),id(3)] });
const receipt = (outcomes = ['confirmed','pending']) => ({ orderId: id(1), orderVersion: 1,
  positions: outcomes.map((outcome, index) => ({ positionId: id(index + 2), outcome })) });
const fact = (sequence = 1, extra = {}) => ({ orderId: id(1), orderVersion: 1, sequence,
  kind: sequence === 1 ? 'transmitted' : 'receipt', channel: 'telephone', reference: 'Synthetic #1', occurredAt: instant,
  recordedAt: instant, quoteRevision: 1, decisionSequence: 1, operation: 'initial',
  status: sequence === 1 ? 'transmitted' : 'partially_confirmed', receipt: sequence === 1 ? null : receipt(), ...extra });
const page = (events = [fact()], manualSequence = 1, nextAfterSequence = null) => ({ schemaVersion: 1, orderId: id(1), orderVersion: 1,
  orderState: { orderVersion: 1, revision: manualSequence + 4, status: manualSequence === 1 ? 'transmitted' : 'partially_confirmed' },
  manualSequence, events, nextAfterSequence, effective: null });
const command = () => ({ orderId: id(1), expectedOrderVersion: 1, expectedStateRevision: 4, expectedQuoteRevision: 1,
  expectedDecisionSequence: 1, positionIds: [id(2),id(3)], commandId: id(4),
  kind: 'transmitted', channel: 'telephone', reference: 'Synthetic #1', occurredAt: instant, receipt: null });
const api = (value) => createCateringManualApi({ apiClient: { request: async () => value } });

test('manual history binds exact scope and complete20/21 keysets with immutable minimized facts', async () => {
  let sent;
  const full = page(Array.from({ length: 20 }, (_, index) => fact(index + 1)), 21, 20);
  const client = createCateringManualApi({ apiClient: { request: async (path, options) => { sent = { path, options }; return full; } } });
  const loaded = await client.loadManualFacts(scope());
  assert.equal(sent.path, `v1/tenant/catering/orders/${id(1)}/manual-delivery?orderVersion=1&afterSequence=0`);
  assert.equal(loaded.events.length, 20); assert.equal(Object.isFrozen(loaded.events[1].receipt.positions[0]), true);
  assert.equal((await api(page([fact(21)], 21)).loadManualFacts({ ...scope(), afterSequence: 20 })).nextAfterSequence, null);
  for (const corrupt of [{ ...full, events: full.events.slice(1) }, { ...full, events: [...full.events].reverse() },
    { ...full, nextAfterSequence: 19 }, { ...full, events: [...full.events, fact(21)] },
    { ...page(), orderId: id(9) }, { ...page(), orderVersion: 2 }, { ...page(), effective: { orderVersion: 1, status: 'transmitted' } }]) {
    await assert.rejects(api(corrupt).loadManualFacts(scope()), /INVALID/);
  }
});

test('manual receipt projections require complete sealed identities and explicit outcomes without costs or substitutions', async () => {
  for (const change of [{ receipt: receipt(['confirmed','confirmed']), status: 'confirmed' },
    { receipt: receipt(['rejected','rejected']), status: 'rejected' },
    { receipt: receipt(['substitution_proposed','pending']), status: 'transmitted' }]) {
    assert.equal((await api(page([fact(),fact(2, change)], 2)).loadManualFacts(scope())).events[1].status, change.status);
  }
  for (const extra of [{ receipt: { ...receipt(), cost: 1200 } }, { receipt: { ...receipt(), positions: receipt().positions.slice(1) } },
    { receipt: { ...receipt(), positions: receipt().positions.map((position) => ({ ...position, positionId: id(99) })) } },
    { status: 'confirmed' }, { reference: 'https://synthetic.invalid' }, { channel: 'automatic' },
    { recordedAt: '2026-10-18T13:00:00.000Z' }, { actorUserId: id(9) }, { credential: 'private' }]) {
    await assert.rejects(api(page([fact(),fact(2, extra)], 2)).loadManualFacts(scope()), /INVALID/);
  }
  let reads = 0; const value = fact();
  Object.defineProperty(value, 'reference', { enumerable: true, get() { reads++; return 'private'; } });
  await assert.rejects(api(page([value])).loadManualFacts(scope()), /INVALID/); assert.equal(reads, 0);
});

test('manual writes send only exact factual command and reject changed or incomplete acknowledgements', async () => {
  const saved = { schemaVersion: 1, replayed: false, fact: fact(), orderState: page().orderState }; let sent;
  const client = createCateringManualApi({ apiClient: { request: async (path, options) => { sent = { path, options }; return saved; } } });
  assert.equal((await client.recordManualFact(command())).replayed, false);
  assert.equal(sent.options.method, 'POST'); assert.equal(sent.path, `v1/tenant/catering/orders/${id(1)}/manual-delivery`);
  assert.deepEqual(Object.keys(sent.options.body).sort(), ['schemaVersion','commandId','expectedOrderVersion','expectedStateRevision',
    'kind','channel','reference','occurredAt','receipt'].sort());
  for (const corrupt of [{ ...saved, replayed: 'false' }, { ...saved, fact: fact(1, { quoteRevision: 2 }) },
    { ...saved, fact: fact(1, { reference: 'different' }) }, { ...saved, orderState: { ...saved.orderState, revision: 6 } },
    { ...saved, orderState: { ...saved.orderState, status: 'confirmed' } }]) {
    await assert.rejects(api(corrupt).recordManualFact(command()), /INVALID/);
  }
  assert.equal((await api({ ...saved, replayed: true, orderState: { orderVersion: 1, revision: 8, status: 'confirmed' } })
    .recordManualFact(command())).replayed, true);
});

test('malformed manual commands cannot invoke transport and mutation uncertainty is never retried', async () => {
  let calls = 0;
  const client = createCateringManualApi({ apiClient: { request: async () => { calls++; throw new Error('Unexpected I/O'); } } });
  for (const extra of [{ expectedOrderVersion: 0 }, { expectedStateRevision: Number.MAX_SAFE_INTEGER }, { commandId: 'foreign' },
    { reference: '<script>' }, { receipt: receipt() }, { kind: 'receipt', receipt: { ...receipt(), price: 0 } }, { positionIds: [] }]) {
    await assert.rejects(client.recordManualFact({ ...command(), ...extra }), /INVALID/);
  }
  assert.equal(calls, 0);
  for (const code of ['HTTP_401','HTTP_403','HTTP_409','NETWORK_ERROR']) {
    let attempts = 0;
    const uncertain = createCateringManualApi({ apiClient: { async request() {
      attempts++; throw Object.assign(new Error(code), { code });
    } } });
    await assert.rejects(uncertain.recordManualFact(command()), { code }); assert.equal(attempts, 1);
  }
});
