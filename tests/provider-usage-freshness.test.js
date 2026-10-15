import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createProviderUsageFreshness } from '../src/platform-admin/provider-usage-freshness.js';

const DAY = 86_400_000;
function resource() {
  return { status: 'ready', data: JSON.parse(readFileSync(new URL('./support/provider-usage-fixture.json', import.meta.url), 'utf8')) };
}
function harness() {
  let wall = 0; let monotonic = 0; let sequence = 0;
  const timers = new Map(); const expired = [];
  const clock = createProviderUsageFreshness({ onExpire: (value) => expired.push(value),
    wallNow: () => wall, monotonicNow: () => monotonic,
    setTimer(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearTimer(id) { timers.delete(id); },
  });
  return { clock, timers, expired, advance(ms) { wall += ms; monotonic += ms; },
    latest() { return [...timers.values()].at(-1); } };
}

test('Provider freshness expires strictly after 24 hours or at the accounting-window end', () => {
  const h = harness(); const fresh = resource();
  assert.equal(h.clock.retain(fresh), true); assert.equal(h.latest().delay, DAY / 2 + 1);
  h.advance(DAY / 2); assert.equal(h.clock.isReusable(fresh), true);
  h.advance(1); assert.equal(h.clock.isReusable(fresh), false); h.clock.check();
  assert.deepEqual(h.expired, [fresh]);
  const ending = resource(); ending.data.periodEnd = new Date(Date.parse(ending.data.evaluatedAt) + 100).toISOString();
  assert.equal(h.clock.retain(ending), true); assert.equal(h.latest().delay, 100);
  h.advance(100); h.clock.check(); assert.deepEqual(h.expired, [fresh, ending]);
  const stale = resource(); stale.data.freshness = 'stale';
  assert.equal(h.clock.retain(stale), false); assert.equal(h.clock.isReusable(stale), false);
  assert.equal(h.timers.size, 0);
});

test('Provider request flight cannot extend freshness and replacement/disposal cancel old callbacks', () => {
  const h = harness(); const delayed = resource(); const started = h.clock.capture();
  h.advance(DAY / 2 + 2); assert.equal(h.clock.retain(delayed, started), false);
  const old = resource(); h.clock.retain(old); const obsolete = h.latest().callback;
  const current = resource(); h.clock.retain(current); obsolete();
  assert.equal(h.clock.isReusable(current), true);
  const disposed = h.latest().callback; h.clock.forget(); disposed();
  assert.equal(h.expired.length, 0); assert.equal(h.timers.size, 0);
});
