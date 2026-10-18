import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeOperationsSources, loadOptionalOperationsSources } from '../src/platform-admin/demo/operations-sources-api.js';
import { createProductDeliveryCache } from '../src/platform-admin/product-delivery-cache.js';
import { createProductDeliveryApi } from '../src/platform-admin/demo/product-delivery-api.js';

const fixture = () => JSON.parse(readFileSync(new URL('./support/operations-sources-fixture.json', import.meta.url), 'utf8'));

test('protected operator wire accepts real compiler aggregates and retains empty feedback as unknown', async () => {
  const source = fixture();
  const normal = normalizeOperationsSources(source);
  assert.equal(normal.sources[0].snapshot.delivery[1].buckets[3].metrics[1].value, 1);
  assert.equal(normal.sources[1].snapshot.feedback.total, null);
  assert.equal(normal.sources[1].observedAt, '2026-10-15T12:00:00.000Z');
  const calls = [];
  const loaded = await loadOptionalOperationsSources({ async request(path, options) {
    calls.push(path); assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    assert.ok(options.signal instanceof AbortSignal); return source;
  } });
  assert.deepEqual(calls, ['demo/operations-sources']);
  assert.equal(loaded.sources.length, 2);
  for (const code of ['HTTP_404', 'HTTP_503']) {
    assert.equal(await loadOptionalOperationsSources({ async request() {
      throw Object.assign(new Error('optional source unavailable'), { code });
    } }), null);
  }
  await assert.rejects(loadOptionalOperationsSources({ async request() { return { secret: 'must-not-pass' }; } }));
  for (const code of ['HTTP_401', 'HTTP_403', 'INVALID_JSON_RESPONSE', 'UNEXPECTED_CONTENT_TYPE']) {
    const failure = Object.assign(new Error('authority failure'), { code });
    await assert.rejects(loadOptionalOperationsSources({ async request() { throw failure; } }), (error) => error === failure);
    const daily = JSON.parse(readFileSync(new URL('./support/daily-live-metrics-fixture.json', import.meta.url), 'utf8'));
    const api = createProductDeliveryApi({ apiClient: { async request(path) {
      if (path === 'demo/live-metrics') return daily;
      throw failure;
    } } });
    await assert.rejects(api.load(), (error) => error === failure);
  }
});

test('operator wire rejects leakage, unknown dimensions, forged freshness, future/expired clocks and fake completeness', () => {
  for (const mutate of [
    (value) => { value.operatorId = 'private'; },
    (value) => { value.sources[0].source = { secret: 'private' }; },
    (value) => { value.sources.reverse(); },
    (value) => { value.sources[0].recordedAt = '2026-10-16T00:00:00.000Z'; },
    (value) => { value.sources[0].digest = 'secret'; },
    (value) => { value.sources[0].freshness = 'stale'; },
    (value) => { value.sources[0].sourceState = 'live'; },
    (value) => { value.sources[1].snapshot.feedback.total = 0; },
    (value) => { value.sources[1].snapshot.feedback.freeText = 'private'; },
    (value) => { value.evaluatedAt = '2026-11-15T00:00:00.000Z'; },
    (value) => { value.sources[1].snapshot = value.sources[0].snapshot; },
  ]) {
    const source = fixture(); mutate(source); assert.throws(() => normalizeOperationsSources(source));
  }
  const unknown = fixture();
  unknown.sources = ['manual', 'feedback'].map((kind) => ({ kind, observedAt: null, recordedAt: null,
    digest: null, sourceState: 'unavailable', snapshot: null, freshness: 'unknown' }));
  assert.equal(normalizeOperationsSources(unknown).sources[0].snapshot, null);
});

test('presentation cache expires at the earliest independent operator-source freshness boundary', () => {
  const report = JSON.parse(readFileSync(new URL('./support/product-delivery-known-fixture.json', import.meta.url), 'utf8'));
  report.operatorSources = fixture();
  report.operatorSources.evaluatedAt = '2026-10-16T11:59:59.000Z';
  // A newer automatic report cannot rejuvenate yesterday's confirmed source.
  report.observedAt = '2026-10-16T11:00:00.000Z';
  report.evaluatedAt = '2026-10-16T11:59:59.000Z';
  report.freshness = 'fresh';
  let elapsed = 0; let expired = 0;
  const cache = createProductDeliveryCache({ wallNow: () => elapsed, monotonicNow: () => elapsed,
    setTimer: () => 1, clearTimer() {}, onExpire() { expired += 1; } });
  const resource = { status: 'ready', data: { storedReport: report, runtimeProduct: null,
    operatorSources: report.operatorSources, liveMetrics: null } };
  assert.equal(cache.retain(resource), true);
  elapsed = 1000; cache.check();
  assert.equal(expired, 1); assert.equal(cache.isReusable(resource), false);
});
