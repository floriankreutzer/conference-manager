import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeLiveMetrics, loadOptionalLiveMetrics } from '../src/platform-admin/demo/live-metrics-api.js';
import { createProviderUsageApi } from '../src/platform-admin/demo/provider-usage-api.js';
import { createProviderUsageFreshness } from '../src/platform-admin/provider-usage-freshness.js';
import { createProductDeliveryApi } from '../src/platform-admin/demo/product-delivery-api.js';

const fixture = () => JSON.parse(readFileSync(new URL('./support/daily-live-metrics-fixture.json', import.meta.url), 'utf8'));

test('daily live client uses only the bounded fixed GET and retains actual stock versus unknown outcomes', async () => {
  const calls = [];
  const api = createProductDeliveryApi({ apiClient: { async request(path, options) {
    calls.push(path); assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    if (path === 'demo/operations-sources') throw new Error('PLATFORM_NOT_FOUND');
    assert.equal(typeof options.signal.addEventListener, 'function'); return fixture();
  } } });
  const report = await api.load();
  assert.deepEqual(calls, ['demo/live-metrics', 'demo/operations-sources']);
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
    (x) => { x.measurements[1].periodStart = '2020-01-01T00:00:00.000Z'; },
    (x) => { x.productDelivery.evaluatedAt = '2026-10-15T13:00:00.000Z'; },
    (x) => { x.sourceState = 'live_unverified'; },
    (x) => { x.freshness = 'stale'; },
  ]) {
    const input = fixture(); mutate(input); assert.throws(() => normalizeLiveMetrics(input));
  }
});

test('valid daily-only providers need no legacy Neon endpoint and retain a bounded freshness clock', async () => {
  const calls = [];
  const api = createProviderUsageApi({ apiClient: { async request(path) {
    calls.push(path); assert.equal(path, 'demo/live-metrics'); return fixture();
  } } });
  const report = await api.load();
  assert.deepEqual(calls, ['demo/live-metrics']);
  assert.equal(report.neon, undefined);
  assert.equal(report.liveMetrics.providerUsage, null);
  assert.equal(report.liveMetrics.measurements[1].value, 0.5);
  let elapsed = 0; const expired = [];
  const clock = createProviderUsageFreshness({ onExpire: (value) => expired.push(value),
    wallNow: () => elapsed, monotonicNow: () => elapsed, setTimer: () => 1, clearTimer() {} });
  const resource = { status: 'ready', data: report };
  assert.equal(clock.retain(resource), true);
  elapsed = 86_400_000 - 1; assert.equal(clock.isReusable(resource), true);
  elapsed += 1; clock.check();
  assert.equal(clock.isReusable(resource), false); assert.deepEqual(expired, [resource]);
});
