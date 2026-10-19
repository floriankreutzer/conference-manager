import assert from 'node:assert/strict';
import test from 'node:test';
import { createCateringOperationalHealthApi } from '../src/platform/catering-operational-health-api.js';

const id = 'f0000000-0000-4000-8000-000000000001';
const instant = '2026-10-19T12:00:00.000Z';
const snapshot = () => ({ schemaVersion: 1, integrationId: id, providerId: 'manual_catering', configurationRevision: 2,
  observedAt: instant, state: 'idle', dispatchEnabled: true, availability: { connection: true, tenantBusiness: true },
  coverage: { limit: 1000, complete: true }, counts: { queued: 0, processing: 0, awaiting_confirmation: 0,
    manual_action: 0, reconciliation: 0, conflict: 0, settled: 1, failed: 0, superseded: 0, paused: 0 },
  expiredLeaseCount: 0, oldestOpenAt: null });
const selection = () => ({ integrationId: id, expectedRevision: 2 });
const api = (value) => createCateringOperationalHealthApi({ apiClient: { request: async () => value } });

test('health wire reads one selected connection without commands, Tenant claims or provider probes', async () => {
  const calls = []; const controller = new AbortController();
  const client = createCateringOperationalHealthApi({ apiClient: { async request(...args) { calls.push(args); return snapshot(); } } });
  const value = await client.loadOperationalHealth({ ...selection(), signal: controller.signal });
  assert.deepEqual(calls, [[`v1/integrations/catering/${id}/health`, { signal: controller.signal }]]);
  assert.equal(Object.isFrozen(value.counts), true); assert.equal(value.counts.settled, 1);
  assert.doesNotMatch(JSON.stringify(value), /tenantId|jobId|orderId|credential|healthy/);
});

test('bounded health rejects misleading idle/coverage, private evidence, malformed counts and getter execution', async () => {
  for (const change of [ { schemaVersion: 2 }, { integrationId: 'f0000000-0000-4000-8000-000000000002' },
    { providerId: 'unqualified' }, { credentialReference: 'private' }, { observedAt: '2026-02-30T12:00:00.000Z' },
    { state: 'healthy' }, { coverage: { limit: 1001, complete: true } }, { coverage: { limit: 1000, complete: false } },
    { counts: { ...snapshot().counts, settled: 1001 } }, { counts: { ...snapshot().counts, queued: 1 } },
    { expiredLeaseCount: 1 }, { availability: { connection: true, tenantBusiness: 'true' } },
    { oldestOpenAt: instant }, { dispatchEnabled: false } ]) {
    await assert.rejects(api({ ...snapshot(), ...change }).loadOperationalHealth(selection()), /INVALID/);
  }
  let reads = 0; const getter = snapshot();
  Object.defineProperty(getter, 'counts', { enumerable: true, get() { reads++; return {}; } });
  await assert.rejects(api(getter).loadOperationalHealth(selection()), /INVALID/); assert.equal(reads, 0);
  const incomplete = { ...snapshot(), state: 'incomplete', coverage: { limit: 1000, complete: false },
    counts: { ...snapshot().counts, settled: 1000 } };
  assert.equal((await api(incomplete).loadOperationalHealth(selection())).state, 'incomplete');
  const manual = { ...snapshot(), state: 'manual_action', oldestOpenAt: instant,
    counts: { ...snapshot().counts, manual_action: 1 } };
  assert.equal((await api(manual).loadOperationalHealth(selection())).counts.manual_action, 1);
  const disabled = { ...manual, state: 'disabled', dispatchEnabled: false };
  assert.equal((await api(disabled).loadOperationalHealth(selection())).state, 'disabled');
});

test('health revision mismatch requires matching configuration and authority failures are retained without retries', async () => {
  await assert.rejects(api({ ...snapshot(), configurationRevision: 3 }).loadOperationalHealth(selection()), /CONFIGURATION_CHANGED/);
  let calls = 0;
  const client = createCateringOperationalHealthApi({ apiClient: { async request() {
    calls++; throw Object.assign(new Error('HTTP_401'), { code: 'HTTP_401' });
  } } });
  await assert.rejects(client.loadOperationalHealth({ ...selection(), integrationId: '../foreign' }), /INVALID/);
  await assert.rejects(client.loadOperationalHealth({ ...selection(), expectedRevision: 0 }), /INVALID/);
  assert.equal(calls, 0); await assert.rejects(client.loadOperationalHealth(selection()), /HTTP_401/); assert.equal(calls, 1);
});
