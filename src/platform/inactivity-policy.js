import { RUNTIME_MODE } from '../core/security-policy.js';

export const PRODUCTION_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
export const DEMO_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

function boundedTimeout(value) {
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 24 * 60 * 60 * 1000) {
    throw new TypeError('INACTIVITY_TIMEOUT_INVALID');
  }
  return value;
}

export function inactivityTimeoutForRuntime(runtimeMode) {
  if (runtimeMode === RUNTIME_MODE.DEMO) return DEMO_INACTIVITY_TIMEOUT_MS;
  if (runtimeMode === RUNTIME_MODE.PRODUCTION) return PRODUCTION_INACTIVITY_TIMEOUT_MS;
  throw new TypeError('INACTIVITY_RUNTIME_MODE_INVALID');
}

export function createInactivityPolicyController({
  timeoutMs,
  clock = () => Date.now(),
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (timerId) => globalThis.clearTimeout(timerId),
  onLock,
} = {}) {
  const timeout = boundedTimeout(timeoutMs);
  if (typeof clock !== 'function' || typeof setTimer !== 'function' || typeof clearTimer !== 'function' || typeof onLock !== 'function') {
    throw new TypeError('INACTIVITY_CONTROLLER_DEPENDENCY_INVALID');
  }
  let lastActivityAt = clock();
  let timerId = null;
  let locked = false;
  let stopped = false;

  function cancelTimer() {
    if (timerId !== null) clearTimer(timerId);
    timerId = null;
  }

  function lock(reason) {
    if (locked || stopped) return false;
    locked = true;
    cancelTimer();
    onLock(reason);
    return true;
  }

  function evaluate() {
    if (locked || stopped) return false;
    const elapsed = Math.max(0, clock() - lastActivityAt);
    if (elapsed >= timeout) return lock('timeout');
    cancelTimer();
    timerId = setTimer(evaluate, Math.max(1, timeout - elapsed));
    return false;
  }

  function activity() {
    if (locked || stopped) return false;
    lastActivityAt = clock();
    evaluate();
    return true;
  }

  function externalLock() {
    return lock('external');
  }

  evaluate();
  return Object.freeze({
    activity,
    evaluate,
    externalLock,
    isLocked() { return locked; },
    lastActivityAt() { return lastActivityAt; },
    stop() {
      stopped = true;
      cancelTimer();
    },
  });
}
