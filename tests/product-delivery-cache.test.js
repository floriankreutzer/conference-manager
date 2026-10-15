import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createProductDeliveryCache } from '../src/platform-admin/product-delivery-cache.js';

const DAY = 86_400_000;
function resource(name = 'product-delivery-known-fixture.json') {
  return { status: 'ready', data: JSON.parse(readFileSync(new URL(`./support/${name}`, import.meta.url), 'utf8')) };
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
  stale.data.evaluatedAt = new Date(Date.parse(stale.data.observedAt) + DAY).toISOString();
  stale.data.freshness = 'stale'; assert.equal(h.cache.retain(stale), true);
  assert.equal(h.latest().delay, DAY);
  h.advance(DAY); h.cache.check(); assert.equal(h.expired.length, 0); assert.equal(h.latest().delay, DAY);
  h.wallJump(28 * DAY); h.cache.check(); assert.deepEqual(h.expired, [stale]);
  const almostStale = resource();
  almostStale.data.evaluatedAt = new Date(Date.parse(almostStale.data.observedAt) + DAY - 1000).toISOString();
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
  ending.data.evaluatedAt = new Date(Date.parse(ending.data.observedAt) + DAY - 2).toISOString();
  assert.equal(cache.retain(ending), false);
  assert.equal(cache.isReusable(ending), false);
  assert.deepEqual(expired, [ending]);
});
