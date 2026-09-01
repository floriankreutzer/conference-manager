import assert from 'node:assert/strict';
import test from 'node:test';
import { RUNTIME_MODE } from '../src/core/security-policy.js';
import {
  DEMO_INACTIVITY_TIMEOUT_MS,
  PRODUCTION_INACTIVITY_TIMEOUT_MS,
  createInactivityPolicyController,
  inactivityTimeoutForRuntime,
} from '../src/platform/inactivity-lock.js';

function timerHarness() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    clock: () => now,
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    advance(milliseconds) {
      now += milliseconds;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort((left, right) => left[1].at - right[1].at);
      due.forEach(([id, timer]) => {
        if (!timers.has(id)) return;
        timers.delete(id);
        timer.callback();
      });
    },
    pending() { return timers.size; },
  };
}

test('inactivity timeout policy is explicit and Demo remains deterministic-friendly', () => {
  assert.equal(PRODUCTION_INACTIVITY_TIMEOUT_MS, 15 * 60 * 1000);
  assert.equal(DEMO_INACTIVITY_TIMEOUT_MS, 5 * 60 * 1000);
  assert.equal(inactivityTimeoutForRuntime(RUNTIME_MODE.PRODUCTION), PRODUCTION_INACTIVITY_TIMEOUT_MS);
  assert.equal(inactivityTimeoutForRuntime(RUNTIME_MODE.DEMO), DEMO_INACTIVITY_TIMEOUT_MS);
  assert.throws(() => inactivityTimeoutForRuntime('platform'), /INACTIVITY_RUNTIME_MODE_INVALID/);
});

test('activity resets the in-memory deadline and timeout locks exactly once', () => {
  const timers = timerHarness();
  const reasons = [];
  const controller = createInactivityPolicyController({
    timeoutMs: 5_000,
    clock: timers.clock,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onLock: (reason) => reasons.push(reason),
  });

  assert.equal(timers.pending(), 1);
  timers.advance(4_000);
  assert.equal(controller.isLocked(), false);
  assert.equal(controller.activity(), true);
  timers.advance(4_999);
  assert.equal(controller.isLocked(), false);
  timers.advance(1);
  assert.equal(controller.isLocked(), true);
  assert.deepEqual(reasons, ['timeout']);
  timers.advance(10_000);
  assert.deepEqual(reasons, ['timeout']);
  assert.equal(controller.activity(), false);
});

test('elapsed evaluation covers BFCache or background-tab time without extending authority', () => {
  const timers = timerHarness();
  const reasons = [];
  const controller = createInactivityPolicyController({
    timeoutMs: 3_000,
    clock: timers.clock,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onLock: (reason) => reasons.push(reason),
  });

  timers.advance(3_500);
  controller.evaluate();
  assert.equal(controller.isLocked(), true);
  assert.deepEqual(reasons, ['timeout']);
});

test('external tab lock is one-way and cannot be undone by later browser activity', () => {
  const timers = timerHarness();
  const reasons = [];
  const controller = createInactivityPolicyController({
    timeoutMs: 10_000,
    clock: timers.clock,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onLock: (reason) => reasons.push(reason),
  });

  assert.equal(controller.externalLock(), true);
  assert.equal(controller.externalLock(), false);
  assert.equal(controller.activity(), false);
  assert.equal(controller.isLocked(), true);
  assert.deepEqual(reasons, ['external']);
  assert.equal(timers.pending(), 0);
});

test('stopping the controller cancels pending timers and future lock decisions', () => {
  const timers = timerHarness();
  const reasons = [];
  const controller = createInactivityPolicyController({
    timeoutMs: 2_000,
    clock: timers.clock,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onLock: (reason) => reasons.push(reason),
  });
  controller.stop();
  assert.equal(timers.pending(), 0);
  timers.advance(10_000);
  assert.equal(controller.evaluate(), false);
  assert.deepEqual(reasons, []);
});
