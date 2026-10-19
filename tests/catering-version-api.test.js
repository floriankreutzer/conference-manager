import assert from 'node:assert/strict';
import test from 'node:test';
import { createCateringVersionApi } from '../src/platform/catering-version-api.js';

const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cost = { amountMinor: 1200, currency: 'EUR' };
const proposal = (version = 2) => ({ orderId: id(1), orderVersion: version, priorOrderVersion: version - 1,
  basisOrderVersion: 1, operation: 'exception', requestId: 'request-a', requestEvidenceVersion: 1,
  requestEvidenceStatus: 'Confirmed', sourceRequestVersion: 1, assignmentRevision: 1, configurationRevision: 1,
  justification: 'Synthetic cost review', proposedAt: '2026-10-19T16:00:00.000Z' });
const page = (head = 1, after = 1) => ({ schemaVersion: 1, orderId: id(1), requestId: 'request-a',
  orderState: { orderVersion: head, revision: 6, status: head === 1 ? 'confirmed' : 'rejected' },
  currentRequest: { version: 1, status: 'Confirmed' }, currentAssignmentRevision: 1,
  basis: { orderVersion: 1, status: 'confirmed', requestVersion: 1, assignmentRevision: 1, providerCost: cost },
  allowedOperations: ['cancel','exception'],
  proposals: Array.from({ length: Math.min(20, Math.max(0, head - after)) }, (_, index) => proposal(after + index + 1)),
  nextAfterOrderVersion: head - after > 20 ? after + 20 : null });
const command = () => ({ orderId: id(1), commandId: id(9), expectedOrderVersion: 1, expectedStateRevision: 6,
  expectedRequestVersion: 1, expectedAssignmentRevision: 1, operation: 'exception', justification: 'Synthetic cost review' });
const ack = () => ({ schemaVersion: 1, replayed: false, proposal: proposal(),
  orderState: { orderVersion: 2, revision: 1, status: 'pending_quote' } });
const api = (value) => createCateringVersionApi({ apiClient: { request: async () => value } });

test('version pages retain exact commercial basis and consecutive bounded history without leaking authority', async () => {
  let sent; const value = page(24);
  const client = createCateringVersionApi({ apiClient: { request: async (path, options) => { sent = { path, options }; return value; } } });
  const loaded = await client.loadVersionProposals({ orderId: id(1) });
  assert.equal(sent.path, `v1/tenant/catering/orders/${id(1)}/versions?afterOrderVersion=1`);
  assert.equal(loaded.proposals.length, 20); assert.equal(loaded.nextAfterOrderVersion, 21);
  assert.equal(Object.isFrozen(loaded.basis.providerCost), true);
  value.basis.providerCost = { ...cost, amountMinor: 0 }; assert.equal(loaded.basis.providerCost.amountMinor, 1200);
  assert.equal((await api(page(24, 21)).loadVersionProposals({ orderId: id(1), afterOrderVersion: 21 })).proposals.length, 3);
  for (const mutate of [
    (v) => { v.orderId = id(2); }, (v) => { v.tenantId = id(3); }, (v) => { v.basis.sessionId = id(4); },
    (v) => { v.basis.orderVersion = 25; }, (v) => { v.currentRequest.status = 'Draft'; },
    (v) => { v.proposals[0].commandId = id(9); }, (v) => { v.proposals[0].requestId = 'foreign'; },
    (v) => { v.proposals.reverse(); }, (v) => { v.proposals.pop(); }, (v) => { v.nextAfterOrderVersion = 20; },
    (v) => { v.allowedOperations = ['exception','exception']; }, (v) => { v.allowedOperations = ['initial']; },
    (v) => { v.orderState.status = 'partially_confirmed'; }, (v) => { v.basis.status = 'cancelled'; },
    (v) => { v.allowedOperations = ['change']; }, (v) => { v.proposals[0].sourceRequestVersion = 2; },
    (v) => { v.proposals[0].justification = '  '; }, (v) => { v.proposals[0].proposedAt = 'invalid'; },
  ]) {
    const corrupt = page(24); mutate(corrupt);
    await assert.rejects(api(corrupt).loadVersionProposals({ orderId: id(1) }), /INVALID/);
  }
  const unconfirmed = { ...page(), basis: null, allowedOperations: [] };
  assert.equal((await api(unconfirmed).loadVersionProposals({ orderId: id(1) })).basis, null);
  let reads = 0; const unsafe = page();
  Object.defineProperty(unsafe.basis, 'providerCost', { enumerable: true, get() { reads++; return cost; } });
  await assert.rejects(api(unsafe).loadVersionProposals({ orderId: id(1) }), /INVALID/); assert.equal(reads, 0);
});

test('version commands send one nonbinding CAS proposal and require its exact minimized acknowledgement', async () => {
  let sent; const saved = ack();
  const client = createCateringVersionApi({ apiClient: { request: async (path, options) => { sent = { path, options }; return saved; } } });
  const loaded = await client.proposeVersion({ ...command(), tenantId: id(20), supplierCost: 0 });
  assert.equal(loaded.proposal.orderVersion, 2);
  assert.equal(sent.path, `v1/tenant/catering/orders/${id(1)}/versions`);
  const { orderId: _order, ...body } = command();
  assert.deepEqual(sent.options, { method: 'POST', body: { schemaVersion: 1, ...body } });
  for (const mutate of [
    (v) => { v.proposal.operation = 'cancel'; }, (v) => { v.proposal.orderId = id(5); },
    (v) => { v.proposal.priorOrderVersion = 2; v.proposal.orderVersion = 3; },
    (v) => { v.proposal.requestEvidenceVersion = 2; }, (v) => { v.proposal.assignmentRevision = 2; },
    (v) => { v.proposal.justification = 'Changed'; }, (v) => { v.proposal.tenantId = id(20); },
    (v) => { v.orderState.revision = 2; }, (v) => { v.orderState.status = 'released'; }, (v) => { v.replayed = 'true'; },
  ]) {
    const corrupt = ack(); mutate(corrupt); await assert.rejects(api(corrupt).proposeVersion(command()), /INVALID/);
  }
  assert.equal((await api({ ...ack(), replayed: true, orderState: { orderVersion: 2, revision: 9, status: 'confirmed' } })
    .proposeVersion(command())).replayed, true);
});

test('invalid proposal inputs stop before transport and authority/conflicts/unavailable writes never retry', async () => {
  let calls = 0;
  const client = createCateringVersionApi({ apiClient: { request: async () => { calls++; return ack(); } } });
  for (const extra of [{ orderId: '../escape' }, { commandId: 'x' }, { expectedOrderVersion: 0 }, { expectedStateRevision: 1.1 },
    { expectedRequestVersion: 0 }, { expectedAssignmentRevision: 0 }, { operation: 'initial' }, { justification: 'a\nb' },
    { justification: 'x'.repeat(1001) }, { justification: ' leading' }, { justification: '' }]) {
    await assert.rejects(client.proposeVersion({ ...command(), ...extra }), /INVALID/);
  }
  assert.equal(calls, 0);
  for (const code of ['HTTP_401','HTTP_403','HTTP_409','HTTP_503']) {
    const failing = createCateringVersionApi({ apiClient: { request: async () => { calls++; throw Object.assign(new Error(code), { code }); } } });
    const before = calls; await assert.rejects(failing.proposeVersion(command()), (error) => error.code === code);
    assert.equal(calls, before + 1);
  }
});
