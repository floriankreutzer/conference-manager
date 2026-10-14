import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeProductDelivery } from '../src/platform-admin/product-delivery-contracts.js';
import { createProductDeliveryApi } from '../src/platform-admin/demo/product-delivery-api.js';

function fixture() {
  return JSON.parse(readFileSync(new URL('./support/product-delivery-fixture.json', import.meta.url), 'utf8'));
}

test('private Product/Delivery client uses only fixed bounded GET and preserves actual unknowns', async () => {
  let observed;
  const api = createProductDeliveryApi({ apiClient: { async request(path, options) {
    observed = { path, options }; return fixture();
  } } });
  const report = await api.load();
  assert.equal(observed.path, 'demo/product-delivery');
  assert.equal(observed.options.method, 'GET');
  assert.equal(observed.options.body, undefined);
  assert.equal(typeof observed.options.signal.addEventListener, 'function');
  assert.equal(report.freshness, 'unknown');
  assert.ok(report.product.every((metric) => metric.value === null));
  assert.equal(report.feedback.total, null);
  assert.equal(report.delivery.length, 3);
});

test('wire schema rejects roles, customer content, arbitrary labels, malformed windows and fake zero states', () => {
  const mutations = [
    (value) => { value.environment = 'production'; },
    (value) => { const duration = value.product.find((item) => item.id === 'manager_decision_time');
      duration.value = 1; duration.reason = 'available'; },
    (value) => { value.product[0].reason = 'empty_denominator'; },
    (value) => { value.delivery[0].buckets[0].metrics[1].reason = 'missing_start_clock'; },
    (value) => { value.ownerEmail = 'private@example.invalid'; },
    (value) => { value.accessMode = 'demo_role'; },
    (value) => { value.freshness = 'fresh'; },
    (value) => { value.periodEnd = value.periodStart; },
    (value) => { value.product[0].value = 0; },
    (value) => { value.product[0].id = '<script>'; },
    (value) => { value.feedback.customerFreeText = 'must-not-render'; },
    (value) => { value.feedback.categories[0].id = '<script>'; },
    (value) => { value.delivery[0].buckets[0].metrics[0].value = Infinity; },
    (value) => { value.delivery[0].buckets[0].metrics[0].unit = 'arbitrary'; },
    (value) => { value.provenance.sourceDigest = 'account-token'; },
  ];
  for (const mutate of mutations) { const value = fixture(); mutate(value); assert.throws(() => normalizeProductDelivery(value)); }
});


test('known wire data rejects unsupported cohorts, impossible precision and observation-day drift', () => {
  const original = JSON.parse(readFileSync(new URL('./support/product-delivery-known-fixture.json', import.meta.url), 'utf8'));
  for (const mutate of [
    (value) => { value.product.find((item) => item.id === 'manager_decisions').value = 2;
      value.provenance.eventCount = 5; },
    (value) => { value.delivery[1].buckets[3].metrics[0].value = 0.1; },
    (value) => { value.delivery[1].buckets[3].metrics[4].value = 1e-12; },
    (value) => { value.observedAt = '2026-10-16T00:00:00.000Z'; value.evaluatedAt = value.observedAt; },
  ]) {
    const value = JSON.parse(JSON.stringify(original)); mutate(value);
    assert.throws(() => normalizeProductDelivery(value));
  }
});


test('wire retention rejects an expired aggregate and an obsolete uncollected window', () => {
  const known = JSON.parse(readFileSync(new URL('./support/product-delivery-known-fixture.json', import.meta.url), 'utf8'));
  const expiry = Date.parse(known.observedAt) + 30 * 86_400_000;
  known.freshness = 'stale'; known.evaluatedAt = new Date(expiry - 1).toISOString();
  assert.equal(normalizeProductDelivery(known).freshness, 'stale');
  known.evaluatedAt = new Date(expiry).toISOString();
  assert.throws(() => normalizeProductDelivery(known));
  const unknown = fixture();
  unknown.evaluatedAt = new Date(Date.parse(unknown.periodEnd) + 86_400_000).toISOString();
  assert.throws(() => normalizeProductDelivery(unknown));
});
