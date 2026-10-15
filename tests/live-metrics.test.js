import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeLiveMetrics, loadOptionalLiveMetrics } from '../src/platform-admin/demo/live-metrics-api.js';
import { createProductDeliveryApi } from '../src/platform-admin/demo/product-delivery-api.js';

const fixture = () => JSON.parse(readFileSync(new URL('./support/daily-live-metrics-fixture.json', import.meta.url), 'utf8'));

test('daily live client uses only the bounded fixed GET and retains actual stock versus unknown outcomes', async () => {
  const calls = [];
  const api = createProductDeliveryApi({ apiClient: { async request(path, options) {
    calls.push(path); assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    assert.equal(typeof options.signal.addEventListener, 'function'); return fixture();
  } } });
  const report = await api.load();
  assert.deepEqual(calls, ['demo/live-metrics']);
  assert.equal(report.liveMetrics.measurements.find((x) => x.id === 'requests').value, 23);
  assert.ok(report.product.every((x) => x.value === null));
  assert.equal(report.liveMetrics.measurements.find((x) => x.id === 'tenants').value, null);
  assert.ok(Object.isFrozen(report.liveMetrics.measurements));
});

test('unavailable endpoint permits legacy compatibility but malformed success never silently downgrades', async () => {
  assert.equal(await loadOptionalLiveMetrics({ request: async () => { throw new Error('404'); } }), null);
  let calls = 0;
  await assert.rejects(loadOptionalLiveMetrics({ async request() {
    calls += 1; return { ...fixture(), secret: 'must-not-pass' };
  } }));
  assert.equal(calls, 1);
});

test('closed daily wire rejects leaked identities, fabricated zero, samples, periods and conflicting clocks', () => {
  for (const mutate of [
    (x) => { x.ownerEmail = 'private'; },
    (x) => { x.measurements[0].value = 0; },
    (x) => { x.measurements[0].tenantId = 'private'; },
    (x) => { x.measurements[1].sampleAt = '2026-10-16T00:00:00.000Z'; },
    (x) => { x.measurements[1].periodEnd = '2026-10-14T00:00:00.000Z'; },
    (x) => { x.productDelivery.evaluatedAt = '2026-10-15T13:00:00.000Z'; },
    (x) => { x.sourceState = 'live_unverified'; },
    (x) => { x.freshness = 'stale'; },
  ]) {
    const input = fixture(); mutate(input); assert.throws(() => normalizeLiveMetrics(input));
  }
});
