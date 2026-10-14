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
