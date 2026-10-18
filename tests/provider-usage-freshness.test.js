import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createProviderUsageFreshness } from '../src/platform-admin/provider-usage-freshness.js';
import { normalizeLiveMetrics } from '../src/platform-admin/demo/live-metrics-api.js';

const DAY = 86_400_000;
function resource() {
  return { status: 'ready', data: JSON.parse(readFileSync(new URL('./support/provider-usage-fixture.json', import.meta.url), 'utf8')) };
}
function dailyResource() {
  const liveMetrics = JSON.parse(readFileSync(new URL('./support/daily-live-metrics-fixture.json', import.meta.url), 'utf8'));
  return { status: 'ready', data: { liveMetrics } };
}
function harness({ onExpire = () => {} } = {}) {
  let wall = 0; let monotonic = 0; let sequence = 0;
  const timers = new Map(); const expired = [];
  const clock = createProviderUsageFreshness({ onExpire(value) { expired.push(value); onExpire(value); },
    wallNow: () => wall, monotonicNow: () => monotonic,
    setTimer(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearTimer(id) { timers.delete(id); },
  });
  return { clock, timers, expired, advance(ms) { wall += ms; monotonic += ms; },
    setWall(value) { wall = value; },
    fire() { const [id, timer] = [...timers].at(-1); timers.delete(id); timer.callback(); },
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

test('already stale Neon still observes the later Render sample and daily boundaries', () => {
  const h = harness(); const saved = dailyResource();
  saved.data = { ...resource().data, liveMetrics: saved.data.liveMetrics,
    observedAt: '2026-10-14T00:00:00.000Z', freshness: 'stale' };
  const original = structuredClone(saved.data);
  assert.equal(h.clock.retain(saved), false); assert.equal(h.clock.isReusable(saved), false);
  assert.equal(h.timers.size, 1); assert.equal(h.latest().delay, 23 * DAY / 24);
  h.advance(23 * DAY / 24); h.fire();
  assert.deepEqual(h.expired, [saved]); assert.equal(h.clock.isReusable(saved), false);
  assert.equal(h.timers.size, 1); assert.equal(h.latest().delay, DAY / 24);
  h.advance(DAY / 24); h.fire();
  assert.deepEqual(h.expired, [saved, saved]); assert.equal(h.timers.size, 0);
  h.clock.check(); h.advance(DAY); h.clock.check();
  assert.equal(h.expired.length, 2); assert.deepEqual(saved.data, original);
});

test('an already old Render sample does not cancel another fresh row or the daily envelope', () => {
  const h = harness(); const saved = dailyResource();
  const rows = saved.data.liveMetrics.measurements;
  const render = rows.find((row) => row.id === 'render_customer_bandwidth');
  render.sampleAt = render.periodStart;
  Object.assign(rows.find((row) => row.id === 'render_operations_bandwidth'), render,
    { id: 'render_operations_bandwidth', sampleAt: '2026-10-15T10:00:00.000Z' });
  assert.equal(h.clock.retain(saved), false); assert.equal(h.clock.isReusable(saved), false);
  assert.equal(h.latest().delay, 22 * DAY / 24);
  h.advance(22 * DAY / 24); h.fire();
  assert.deepEqual(h.expired, [saved]); assert.equal(h.latest().delay, 2 * DAY / 24);
  h.advance(2 * DAY / 24); h.fire();
  assert.deepEqual(h.expired, [saved, saved]); assert.equal(h.timers.size, 0);
});

for (const withLegacy of [true, false]) {
  test(withLegacy ? 'a newer displayed legacy Neon source is not aged by its hidden daily duplicate'
    : 'without legacy Neon the displayed daily observation bounds freshness at its own 100ms deadline', () => {
    const h = harness(); const live = dailyResource().data.liveMetrics;
    live.providerUsage = withLegacy ? resource().data : null;
    Object.assign(live.measurements.find((row) => row.id === 'neon_transfer'), {
      value: 5, observedAt: '2026-10-14T12:00:00.100Z', periodStart: '2026-10-01T00:00:00.000Z',
      periodEnd: '2026-11-01T00:00:00.000Z',
    });
    const validated = normalizeLiveMetrics(live);
    const saved = { status: 'ready', data: { ...validated.providerUsage, liveMetrics: validated } };
    const original = structuredClone(saved.data);
    assert.equal(h.clock.retain(saved), true); assert.equal(h.latest().delay, withLegacy ? DAY / 2 + 1 : 100);
    h.advance(100); h.clock.check();
    assert.equal(h.clock.isReusable(saved), withLegacy);
    assert.deepEqual(h.expired, withLegacy ? [] : [saved]);
    if (withLegacy) {
      assert.equal(h.latest().delay, DAY / 2 + 1 - 100);
      h.advance(DAY / 2 + 1 - 100); h.fire();
      assert.equal(h.clock.isReusable(saved), false); assert.deepEqual(h.expired, [saved]);
    }
    assert.deepEqual(saved.data, original); h.clock.forget();
  });
}

test('known source observations, hourly samples and provider resets each bound fresh Provider state', () => {
  for (const change of [
    (rows) => { rows.find((row) => row.id === 'resend_monthly_sent').observedAt = '2026-10-14T12:00:00.100Z'; },
    (rows) => { rows.find((row) => row.id === 'render_customer_bandwidth').sampleAt = '2026-10-14T12:00:00.100Z'; },
    (rows) => { rows.find((row) => row.id === 'resend_monthly_sent').periodEnd = '2026-10-15T12:00:00.100Z'; },
  ]) {
    const h = harness(); const saved = dailyResource(); change(saved.data.liveMetrics.measurements);
    assert.equal(h.clock.retain(saved), true); assert.equal(h.latest().delay, 100);
    h.advance(99); assert.equal(h.clock.isReusable(saved), true);
    h.advance(1); assert.equal(h.clock.isReusable(saved), false); h.clock.check();
    assert.deepEqual(h.expired, [saved]); assert.equal(h.timers.size, 1);
    assert.ok(h.latest().delay > 0); h.clock.forget();
  }
});

test('request flight skips expired source boundaries without renewing the remaining daily lifetime', () => {
  const h = harness(); const saved = dailyResource(); const started = h.clock.capture();
  h.advance(23 * DAY / 24 + 1);
  assert.equal(h.clock.retain(saved, started), false); assert.equal(h.clock.isReusable(saved), false);
  assert.equal(h.expired.length, 0); assert.equal(h.latest().delay, DAY / 24 - 1);
  h.advance(DAY / 24 - 1); h.fire();
  assert.deepEqual(h.expired, [saved]); assert.equal(h.timers.size, 0);
});

test('expiry callbacks can replace or dispose the Provider resource without rearming obsolete boundaries', () => {
  for (const replace of [false, true]) {
    const replacement = resource();
    const h = harness({ onExpire() {
      if (replace) h.clock.retain(replacement);
      else h.clock.forget();
    } });
    const saved = dailyResource(); h.clock.retain(saved); const obsolete = h.latest().callback;
    h.advance(23 * DAY / 24); h.fire(); obsolete();
    assert.deepEqual(h.expired, [saved]); assert.equal(h.clock.isReusable(saved), false);
    assert.equal(h.timers.size, replace ? 1 : 0);
    if (replace) {
      assert.equal(h.clock.isReusable(replacement), true);
      assert.equal(h.latest().delay, DAY / 2 + 1);
    }
  }
});

test('observed stale state never becomes reusable on wall-clock rollback and later boundaries still wake', () => {
  const h = harness(); const saved = dailyResource(); h.clock.retain(saved);
  h.advance(23 * DAY / 24); h.fire(); h.setWall(0); h.clock.check();
  assert.equal(h.clock.isReusable(saved), false); assert.equal(h.latest().delay, DAY / 24);
  h.advance(DAY / 24); h.fire();
  assert.deepEqual(h.expired, [saved, saved]); assert.equal(h.timers.size, 0);
});

test('fully aged or invalid Provider observations never create an immediate reload timer', () => {
  const h = harness(); const saved = dailyResource(); const started = h.clock.capture();
  h.advance(DAY); assert.equal(h.clock.retain(saved, started), false);
  assert.equal(h.timers.size, 0); h.clock.check(); assert.equal(h.expired.length, 0);
  const invalid = dailyResource(); invalid.data.liveMetrics.observedAt = 'invalid';
  assert.throws(() => h.clock.retain(invalid), TypeError);
  assert.equal(h.clock.isReusable(invalid), false); assert.equal(h.timers.size, 0);
  assert.throws(() => createProviderUsageFreshness(), TypeError);
});
