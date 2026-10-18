import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createProductDeliveryApi } from '../src/platform-admin/demo/product-delivery-api.js';
import { normalizeRuntimeProductReport } from '../src/platform-admin/product-runtime-contract.js';
import { PLATFORM_ADMIN_MESSAGES } from '../src/core/i18n-platform-admin-messages.js';

const fixture = (name = 'product-runtime-fixture.json') =>
  JSON.parse(readFileSync(new URL(`./support/${name}`, import.meta.url), 'utf8'));
const unavailable = (code = 'HTTP_503') => Object.assign(new Error('Source unavailable'), { code });

function client(sources, calls = []) {
  return { async request(path, options) {
    calls.push(path);
    assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    const response = sources[path];
    if (response instanceof Error) throw response;
    if (response === undefined) throw unavailable('HTTP_404');
    return response;
  } };
}

test('runtime Product retains numeric subsets and honest nulls without inventing delivery or feedback', () => {
  const input = fixture(); const report = normalizeRuntimeProductReport(input);
  assert.equal(report.product.find((row) => row.id === 'request_submitted').value, 2);
  assert.equal(report.product.find((row) => row.id === 'request_abandoned').value, null);
  assert.equal(report.productCoverage.find((row) => row.id === 'request_submitted').state, 'partial');
  assert.equal(report.delivery, undefined); assert.equal(report.feedback, undefined);
  assert.equal(report.periodEnd, report.observedAt);
  input.product[3].value = 99;
  assert.equal(report.product[3].value, 2);
  for (const lang of ['de', 'en']) {
    for (const row of report.productCoverage) {
      assert.ok(PLATFORM_ADMIN_MESSAGES[lang][`platformAdmin.insights.product.coverage.${row.state}`]);
      assert.ok(PLATFORM_ADMIN_MESSAGES[lang][`platformAdmin.insights.product.coverageReason.${row.reason}`]);
    }
    for (const row of report.product.filter((item) => item.value === null)) {
      assert.ok(PLATFORM_ADMIN_MESSAGES[lang][`platformAdmin.productDelivery.reason.${row.reason}`]);
    }
  }
});

test('runtime contract rejects forged coverage, unknown identities, fabricated zeros and rejuvenated clocks', () => {
  for (const mutate of [
    (value) => { value.productCoverage[0].state = 'complete'; },
    (value) => { value.productCoverage[0].sourcePeriodStart = null; },
    (value) => { value.productCoverage[4].sourcePeriodEnd = value.periodEnd; },
    (value) => { value.productCoverage[0].reason = 'unverified'; },
    (value) => { value.product[4].value = 0; value.product[4].reason = 'available'; },
    (value) => { value.product[0].value = 1.5; },
    (value) => { value.product[0].customer = 'private'; },
    (value) => { value.feedback = {}; },
    (value) => { value.delivery = []; },
    (value) => { value.periodEnd = '2026-10-18T00:00:00.000Z'; },
    (value) => { value.evaluatedAt = '2026-10-18T12:59:59.000Z'; },
    (value) => { value.observedAt = '2026-10-18T13:00:01.000Z'; },
    (value) => { value.provenance.sourceEpoch = ['b'.repeat(64)]; },
    (value) => { value.provenance.sourceDigest = ['a'.repeat(64)]; },
    (value) => { value.provenance.eventCount = 1; },
  ]) {
    const input = fixture(); mutate(input); assert.throws(() => normalizeRuntimeProductReport(input));
  }
  const lastGood = fixture();
  lastGood.evaluatedAt = '2026-10-19T13:00:00.000Z';
  lastGood.sourceState = 'last_good'; lastGood.freshness = 'stale';
  assert.equal(normalizeRuntimeProductReport(lastGood).observedAt, '2026-10-18T13:00:00.000Z');
  lastGood.freshness = 'fresh'; assert.throws(() => normalizeRuntimeProductReport(lastGood));
  lastGood.freshness = 'stale'; lastGood.evaluatedAt = '2026-11-17T13:00:00.000Z';
  assert.throws(() => normalizeRuntimeProductReport(lastGood));
});

test('runtime read, stored daily delivery and separate sources preserve every original observation clock', async () => {
  const daily = fixture('daily-live-metrics-fixture.json');
  const runtime = fixture(); const operations = fixture('operations-sources-fixture.json');
  const originals = structuredClone({ daily, runtime, operations }); const calls = [];
  const report = await createProductDeliveryApi({ apiClient: client({
    'demo/live-metrics': daily, 'demo/product-delivery': runtime, 'demo/operations-sources': operations,
  }, calls) }).load();
  assert.deepEqual(calls, ['demo/live-metrics', 'demo/product-delivery', 'demo/operations-sources']);
  assert.deepEqual(report.runtimeProduct, runtime);
  assert.deepEqual(report.storedReport, daily.productDelivery);
  assert.deepEqual(report.operatorSources, operations);
  assert.deepEqual({ daily, runtime, operations }, originals);
  assert.equal(report.retrieval.source, 'daily'); assert.equal(report.retrieval.runtimeReason, null);
  assert.notEqual(report.runtimeProduct.observedAt, report.storedReport.observedAt);
});

test('independent unavailable sources retain explicit fallback reasons and never fabricate a daily report', async () => {
  const daily = fixture('daily-live-metrics-fixture.json');
  const stored = fixture('product-delivery-known-fixture.json');
  const runtime = fixture();
  for (const [sources, expected] of [
    [{ 'demo/live-metrics': daily, 'demo/product-delivery': unavailable() },
      { source: 'daily', dailyReason: null, runtimeReason: 'unavailable', runtime: false, stored: true }],
    [{ 'demo/live-metrics': unavailable('HTTP_504'), 'demo/product-delivery': stored },
      { source: 'legacy_fallback', dailyReason: 'timeout', runtimeReason: 'legacy_only', runtime: false, stored: true }],
    [{ 'demo/live-metrics': unavailable(), 'demo/product-delivery': runtime },
      { source: 'runtime', dailyReason: 'unavailable', runtimeReason: null, runtime: true, stored: false }],
  ]) {
    const report = await createProductDeliveryApi({ apiClient: client(sources) }).load();
    assert.equal(report.retrieval.source, expected.source);
    assert.equal(report.retrieval.dailyReason, expected.dailyReason);
    assert.equal(report.retrieval.runtimeReason, expected.runtimeReason);
    assert.equal(Boolean(report.runtimeProduct), expected.runtime);
    assert.equal(Boolean(report.storedReport), expected.stored);
    assert.equal(report.retrieval.operationsReason, 'not_found');
    if (expected.source !== 'daily') assert.equal(report.liveMetrics, null);
  }
  await assert.rejects(createProductDeliveryApi({ apiClient: client({}) }).load(),
    /PLATFORM_PRODUCT_DELIVERY_SOURCE_UNAVAILABLE/);
});

test('runtime and final operator authority or schema failures cannot publish an already read daily report', async () => {
  const daily = fixture('daily-live-metrics-fixture.json');
  const failures = [unavailable('HTTP_401'), unavailable('HTTP_403'), new TypeError('Invalid client contract'),
    Object.assign(new Error('Authority is not a timeout'), { code: 'HTTP_401', name: 'TimeoutError' })];
  for (const failure of failures) {
    for (const path of ['demo/product-delivery', 'demo/operations-sources']) {
      const sources = { 'demo/live-metrics': daily, 'demo/product-delivery': fixture(), [path]: failure };
      await assert.rejects(createProductDeliveryApi({ apiClient: client(sources) }).load(), (error) => error === failure);
    }
  }
  for (const path of ['demo/product-delivery', 'demo/operations-sources']) {
    const sources = { 'demo/live-metrics': daily, 'demo/product-delivery': fixture(),
      [path]: { privateContent: 'must-not-render' } };
    await assert.rejects(createProductDeliveryApi({ apiClient: client(sources) }).load());
  }
});
