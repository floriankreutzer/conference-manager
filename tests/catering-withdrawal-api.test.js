import assert from 'node:assert/strict';
import test from 'node:test';
import { createCateringWithdrawalApi } from '../src/platform/catering-withdrawal-api.js';

const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const state = (status = 'released', revision = 3) => ({ orderVersion: 1, revision, status });
const fact = () => ({ orderId: id(1), orderVersion: 1, previousStatus: 'released',
  justification: 'Synthetic local stop', attestNotTransmitted: true, recordedAt: '2026-10-19T18:00:00.000Z' });
const page = () => ({ schemaVersion: 1, orderId: id(1), orderState: state(), eligible: true, effective: null, withdrawal: null });
const command = () => ({ orderId: id(1), commandId: id(2), expectedOrderVersion: 1, expectedStateRevision: 3,
  justification: 'Synthetic local stop', attestNotTransmitted: true });
const ack = () => ({ schemaVersion: 1, replayed: false, withdrawal: fact(), orderState: state('withdrawn',4) });
const api = (value) => createCateringWithdrawalApi({ apiClient: { request: async () => value } });

test('withdrawal reads retain minimized evidence and historical effective supplier commitments with strict version selection', async () => {
  let sent; const client = createCateringWithdrawalApi({ apiClient: { request: async (path, options) => {
    sent = { path, options }; return page();
  } } });
  assert.equal((await client.loadWithdrawal({ orderId: id(1), orderVersion: 1 })).eligible, true);
  assert.equal(sent.path, `v1/tenant/catering/orders/${id(1)}/withdrawal?orderVersion=1`);
  const history = { ...page(), eligible: false, orderState: state('withdrawn',4), withdrawal: fact(),
    effective: { orderVersion: 2, status: 'confirmed' } };
  assert.equal(Object.isFrozen((await api(history).loadWithdrawal({ orderId: id(1) })).withdrawal), true);
  for (const extra of [{ tenantId: id(9) }, { orderId: id(9) }, { eligible: 'true' },
    { withdrawal: fact() }, { orderState: state('confirmed') }, { effective: { orderVersion: 1, status: 'confirmed' } },
    { effective: { orderVersion: 1, status: 'cancelled' } }, { orderState: state('invented') }]) {
    await assert.rejects(api({ ...page(), ...extra }).loadWithdrawal({ orderId: id(1) }), /INVALID/);
  }
  await assert.rejects(api(history).loadWithdrawal({ orderId: id(1), orderVersion: 2 }), /INVALID/);
});

test('withdrawal writes send the exact attested CAS command once and require immutable matching evidence', async () => {
  let sent; const client = createCateringWithdrawalApi({ apiClient: { request: async (path, options) => {
    sent = { path, options }; return ack();
  } } });
  const saved = await client.withdrawOrder({ ...command(), tenantId: id(9), cost: 0 });
  const { orderId: _id, ...body } = command();
  assert.deepEqual(sent, { path: `v1/tenant/catering/orders/${id(1)}/withdrawal`, options: { method: 'POST', body: { schemaVersion: 1, ...body } } });
  assert.equal(saved.withdrawal.attestNotTransmitted, true); assert.equal(Object.isFrozen(saved), true);
  for (const extra of [{ orderId: id(9) }, { orderVersion: 2 }, { previousStatus: 'confirmed' }, { attestNotTransmitted: false },
    { justification: 'Changed' }, { actorUserId: id(3) }, { recordedAt: 'invalid' }]) {
    await assert.rejects(api({ ...ack(), withdrawal: { ...fact(), ...extra } }).withdrawOrder(command()), /INVALID/);
  }
  await assert.rejects(api({ ...ack(), orderState: state('withdrawn',5) }).withdrawOrder(command()), /INVALID/);
  assert.equal((await api({ ...ack(), replayed: true }).withdrawOrder(command())).replayed, true);
});

test('missing attestation, malformed input and transport failures cannot trigger an automatic withdrawal retry', async () => {
  let calls = 0; const client = createCateringWithdrawalApi({ apiClient: { request: async () => { calls++; return ack(); } } });
  for (const extra of [{ attestNotTransmitted: false }, { attestNotTransmitted: undefined }, { justification: '' },
    { justification: 'a\nb' }, { justification: 'x'.repeat(1001) }, { expectedOrderVersion: 0 },
    { expectedStateRevision: Number.MAX_SAFE_INTEGER - 1 }, { commandId: '../escape' }]) {
    await assert.rejects(client.withdrawOrder({ ...command(), ...extra }), /INVALID/);
  }
  assert.equal(calls, 0);
  for (const code of ['HTTP_401','HTTP_403','HTTP_409','HTTP_503']) {
    const failing = createCateringWithdrawalApi({ apiClient: { request: async () => {
      calls++; throw Object.assign(new Error(code), { code });
    } } });
    const before = calls; await assert.rejects(failing.withdrawOrder(command()), (error) => error.code === code);
    assert.equal(calls, before + 1);
  }
});
