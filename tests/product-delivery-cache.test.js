import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createProductDeliveryCache } from '../src/platform-admin/product-delivery-cache.js';

const DAY = 86_400_000;
function resource(name = 'product-delivery-known-fixture.json') {
  return { status: 'ready', data: { storedReport: JSON.parse(readFileSync(new URL(`./support/${name}`, import.meta.url), 'utf8')),
    runtimeProduct: null, liveMetrics: null, operatorSources: null } };
}
function withDailyFeed(value, { age, freshness }) {
  const evaluated = Date.parse(value.data.storedReport.evaluatedAt);
  value.data.liveMetrics = {
    observedAt: new Date(evaluated - age).toISOString(), evaluatedAt: value.data.storedReport.evaluatedAt,
    freshness, sourceState: 'available',
  };
  return value;
}
function harness() {
  let wall = 0; let monotonic = 0; let sequence = 0;
  const timers = new Map(); const expired = [];
  const cache = createProductDeliveryCache({ onExpire: (value) => expired.push(value),
    wallNow: () => wall, monotonicNow: () => monotonic,
    setTimer(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearTimer(id) { timers.delete(id); },
  });
  return { cache, timers, expired, advance(ms) { wall += ms; monotonic += ms; },
    wallJump(ms) { wall += ms; }, latest() { return [...timers.values()].at(-1); } };
}

test('Product cache invalidates fresh observations and unknown UTC windows at their source boundary', () => {
  const h = harness(); const known = resource();
  assert.equal(h.cache.retain(known), true); assert.equal(h.latest().delay, DAY);
  h.advance(DAY - 1); assert.equal(h.cache.isReusable(known), true);
  h.advance(1); assert.equal(h.cache.isReusable(known), false); h.cache.check();
  assert.deepEqual(h.expired, [known]); assert.equal(h.timers.size, 0);
  const unknown = resource('product-delivery-fixture.json');
  assert.equal(h.cache.retain(unknown), true); assert.equal(h.latest().delay, DAY / 2);
  h.advance(DAY / 2); h.cache.check(); assert.deepEqual(h.expired, [known, unknown]);
});

test('stale retention uses bounded timers, catches suspended-tab clock changes and accounts for request flight', () => {
  const h = harness(); const stale = resource();
  stale.data.storedReport.evaluatedAt = new Date(Date.parse(stale.data.storedReport.observedAt) + DAY).toISOString();
  stale.data.storedReport.freshness = 'stale'; assert.equal(h.cache.retain(stale), true);
  assert.equal(h.latest().delay, DAY);
  h.advance(DAY); h.cache.check(); assert.equal(h.expired.length, 0); assert.equal(h.latest().delay, DAY);
  h.wallJump(28 * DAY); h.cache.check(); assert.deepEqual(h.expired, [stale]);
  const almostStale = resource();
  almostStale.data.storedReport.evaluatedAt = new Date(Date.parse(almostStale.data.storedReport.observedAt) + DAY - 1000).toISOString();
  const requestClock = h.cache.capture(); h.advance(2000);
  assert.equal(h.cache.retain(almostStale, requestClock), false); assert.equal(h.timers.size, 0);
});

test('replacement and disposal cancel obsolete callbacks; wall-clock rollback does not extend the entry', () => {
  const h = harness(); const old = resource(); const current = resource();
  h.cache.retain(old); const obsolete = h.latest().callback;
  h.cache.retain(current); obsolete(); assert.equal(h.cache.isReusable(current), true);
  h.advance(DAY - 1); h.wallJump(-DAY); assert.equal(h.cache.isReusable(current), true);
  h.advance(1); h.cache.check(); assert.deepEqual(h.expired, [current]);
  h.cache.retain(resource()); const disposed = h.latest().callback;
  h.cache.forget(); disposed(); assert.equal(h.expired.length, 1); assert.equal(h.timers.size, 0);
  assert.equal(h.cache.isReusable(undefined), false);
});

test('an observation expiring during retention cannot be published as reusable', () => {
  let elapsed = 0; const expired = [];
  const cache = createProductDeliveryCache({ onExpire: (value) => expired.push(value),
    wallNow: () => 0, monotonicNow: () => elapsed++, setTimer: () => 1, clearTimer() {},
  });
  const ending = resource();
  ending.data.storedReport.evaluatedAt = new Date(Date.parse(ending.data.storedReport.observedAt) + DAY - 2).toISOString();
  assert.equal(cache.retain(ending), false);
  assert.equal(cache.isReusable(ending), false);
  assert.deepEqual(expired, [ending]);
});

test('daily freshness bounds the Product cache independently from an older stale Product report', () => {
  const h = harness(); const value = resource();
  value.data.storedReport.observedAt = new Date(Date.parse(value.data.storedReport.evaluatedAt) - 2 * DAY).toISOString();
  value.data.storedReport.freshness = 'stale';
  withDailyFeed(value, { age: DAY - 1000, freshness: 'fresh' });
  assert.equal(h.cache.retain(value), true);
  assert.equal(h.latest().delay, 1000);
  h.advance(999); assert.equal(h.cache.isReusable(value), true);
  h.advance(1); h.cache.check();
  assert.equal(h.cache.isReusable(value), false);
  assert.deepEqual(h.expired, [value]);
  assert.equal(h.timers.size, 0);
});

test('an already stale daily feed retains a positive bounded lifetime without immediate reload callbacks', () => {
  const h = harness(); const value = resource();
  value.data.storedReport.evaluatedAt = new Date(Date.parse(value.data.storedReport.observedAt) + DAY).toISOString();
  value.data.storedReport.freshness = 'stale';
  withDailyFeed(value, { age: DAY, freshness: 'stale' });
  value.data.liveMetrics.sourceState = 'last_good';
  assert.equal(h.cache.retain(value), true);
  for (let index = 0; index < 5; index += 1) h.cache.check();
  assert.equal(h.cache.isReusable(value), true);
  assert.deepEqual(h.expired, []);
  assert.equal(h.timers.size, 1);
  assert.equal(h.latest().delay, DAY);
});

test('stale daily retention expires before the independent unknown Product UTC window', () => {
  const h = harness(); const value = withDailyFeed(resource('product-delivery-fixture.json'), {
    age: 30 * DAY - 1000, freshness: 'stale',
  });
  assert.equal(h.cache.retain(value), true);
  assert.equal(h.latest().delay, 1000);
  h.advance(1000); h.cache.check(); h.cache.check();
  assert.deepEqual(h.expired, [value]);
  assert.equal(h.timers.size, 0);
  const expired = withDailyFeed(resource('product-delivery-fixture.json'), { age: 30 * DAY, freshness: 'stale' });
  assert.throws(() => h.cache.retain(expired), /PLATFORM_PRODUCT_CACHE_INVALID/);
  assert.equal(h.cache.isReusable(expired), false);
  assert.equal(h.timers.size, 0);
});

test('request flight cannot keep a daily feed past its own boundary or arm an expired reload timer', () => {
  const h = harness(); const value = resource();
  value.data.storedReport.observedAt = new Date(Date.parse(value.data.storedReport.evaluatedAt) - 2 * DAY).toISOString();
  value.data.storedReport.freshness = 'stale';
  withDailyFeed(value, { age: DAY - 1000, freshness: 'fresh' });
  const started = h.cache.capture(); h.advance(1000);
  assert.equal(h.cache.retain(value, started), false);
  h.cache.check();
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.expired, []);
});

test('a newer runtime observation cannot extend the stored delivery freshness boundary', () => {
  const h = harness(); const value = resource();
  value.data.runtimeProduct = JSON.parse(readFileSync(new URL('./support/product-runtime-fixture.json', import.meta.url), 'utf8'));
  value.data.storedReport.evaluatedAt = new Date(Date.parse(value.data.storedReport.observedAt) + DAY - 1000).toISOString();
  const original = structuredClone(value);
  assert.equal(h.cache.retain(value), true); assert.equal(h.latest().delay, 1000);
  h.advance(1000); h.cache.check();
  assert.deepEqual(h.expired, [value]); assert.equal(h.cache.isReusable(value), false);
  assert.deepEqual(value, original);
});

test('runtime freshness independently expires even while the stored report still has a full day', () => {
  const h = harness(); const value = resource();
  value.data.runtimeProduct = JSON.parse(readFileSync(new URL('./support/product-runtime-fixture.json', import.meta.url), 'utf8'));
  value.data.runtimeProduct.evaluatedAt = new Date(Date.parse(value.data.runtimeProduct.observedAt) + DAY - 1000).toISOString();
  assert.equal(h.cache.retain(value), true); assert.equal(h.latest().delay, 1000);
  h.advance(1000); h.cache.check(); assert.deepEqual(h.expired, [value]);
  assert.equal(h.timers.size, 0);
});

test('a runtime-only model has a bounded cache and does not require invented delivery data', () => {
  const h = harness(); const value = resource();
  value.data.storedReport = null;
  value.data.runtimeProduct = JSON.parse(readFileSync(new URL('./support/product-runtime-fixture.json', import.meta.url), 'utf8'));
  assert.equal(h.cache.retain(value), true); assert.equal(h.latest().delay, DAY);
  h.advance(DAY); h.cache.check(); assert.deepEqual(h.expired, [value]);
  assert.equal(value.data.storedReport, null);
});
