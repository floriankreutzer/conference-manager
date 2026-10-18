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
    if (['demo/product-delivery', 'demo/operations-sources'].includes(path)) throw Object.assign(new Error('PLATFORM_NOT_FOUND'), { code: 'HTTP_404' });
    assert.equal(typeof options.signal.addEventListener, 'function'); return fixture();
  } } });
  const report = await api.load();
  assert.deepEqual(calls, ['demo/live-metrics', 'demo/product-delivery', 'demo/operations-sources']);
  assert.equal(report.liveMetrics.measurements.find((x) => x.id === 'requests').value, 23);
  assert.ok(report.storedReport.product.every((x) => x.value === null));
  assert.equal(report.liveMetrics.measurements.find((x) => x.id === 'tenants').value, null);
  assert.ok(Object.isFrozen(report.liveMetrics.measurements));
});

test('unavailable endpoint permits legacy compatibility but malformed success never silently downgrades', async () => {
  for (const code of ['HTTP_404', 'HTTP_408', 'HTTP_429', 'HTTP_500', 'HTTP_502', 'HTTP_503', 'HTTP_504']) {
    assert.equal(await loadOptionalLiveMetrics({ async request() {
      throw Object.assign(new Error('Optional feed unavailable'), { code });
    } }), null);
  }
  for (const name of ['AbortError', 'TimeoutError']) {
    assert.equal(await loadOptionalLiveMetrics({ async request() { throw new DOMException('Request stopped', name); } }), null);
  }
  let calls = 0;
  await assert.rejects(loadOptionalLiveMetrics({ async request() {
    calls += 1; return { ...fixture(), secret: 'must-not-pass' };
  } }));
  assert.equal(calls, 1);
});

test('authority, response-security and programming failures never become an optional missing daily feed', async () => {
  const failures = ['HTTP_400', 'HTTP_401', 'HTTP_403', 'HTTP_405', 'HTTP_409',
    'INVALID_JSON_RESPONSE', 'UNEXPECTED_CONTENT_TYPE', 'RESPONSE_TOO_LARGE', 'API_PATH_ESCAPE']
    .map((code) => Object.assign(new Error('Closed request failure'), { code }));
  failures.push(new TypeError('Invalid client contract'), new Error('404'),
    Object.assign(new Error('Authorization cannot be a timeout'), { code: 'HTTP_401', name: 'TimeoutError' }));
  for (const failure of failures) {
    await assert.rejects(loadOptionalLiveMetrics({ async request() { throw failure; } }), (error) => error === failure);
    for (const createApi of [createProviderUsageApi, createProductDeliveryApi]) {
      const calls = [];
      const api = createApi({ apiClient: { async request(path) { calls.push(path); throw failure; } } });
      await assert.rejects(api.load(), (error) => error === failure);
      assert.deepEqual(calls, ['demo/live-metrics']);
    }
  }
});

test('genuinely missing daily feed still loads each validated legacy projection', async () => {
  for (const [createApi, endpoint, filename] of [
    [createProviderUsageApi, 'demo/provider-usage', 'provider-usage-fixture.json'],
    [createProductDeliveryApi, 'demo/product-delivery', 'product-delivery-fixture.json'],
  ]) {
    const calls = [];
    const api = createApi({ apiClient: { async request(path) {
      calls.push(path);
      if (path === endpoint) return JSON.parse(readFileSync(new URL(`./support/${filename}`, import.meta.url), 'utf8'));
      throw Object.assign(new Error('Optional endpoint missing'), { code: 'HTTP_404' });
    } } });
    const report = await api.load();
    assert.equal(report.liveMetrics, null);
    assert.deepEqual(calls, endpoint === 'demo/provider-usage'
      ? ['demo/live-metrics', endpoint] : ['demo/live-metrics', endpoint, 'demo/operations-sources']);
  }
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
  const original = structuredClone(report);
  assert.equal(clock.retain(resource), true);
  elapsed = 23 * 3_600_000 - 1; assert.equal(clock.isReusable(resource), true);
  elapsed += 1; clock.check();
  assert.equal(clock.isReusable(resource), false); assert.deepEqual(expired, [resource]);
  elapsed = 86_400_000; clock.check();
  assert.equal(clock.isReusable(resource), false); assert.deepEqual(expired, [resource, resource]);
  elapsed += 86_400_000; clock.check();
  assert.equal(expired.length, 2); assert.deepEqual(report, original);
});
