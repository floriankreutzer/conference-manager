import { t } from '../core/i18n.js';
import { RUNTIME_MODE } from '../core/security-policy.js';
import { button, clear, el } from '../core/ui.js';
import { PRODUCTION_AUTH_STATUS } from './production-session.js';

export const PRODUCTION_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
export const DEMO_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const CHANNEL_NAME = 'conference-manager-customer-session-lock-v1';
const ACTIVITY_EVENTS = Object.freeze(['pointerdown', 'keydown', 'touchstart']);

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

function createBroadcastChannel(factory) {
  if (typeof factory === 'function') return factory(CHANNEL_NAME);
  if (typeof globalThis.BroadcastChannel !== 'function') return null;
  return new globalThis.BroadcastChannel(CHANNEL_NAME);
}

export function installCustomerInactivityLock({
  context,
  documentRoot = document,
  windowRoot = globalThis,
  timeoutMs = inactivityTimeoutForRuntime(context?.runtimeMode?.()),
  clock = () => Date.now(),
  setTimer,
  clearTimer,
  reload = () => globalThis.location.reload(),
  broadcastChannelFactory = null,
} = {}) {
  if (!context?.isAuthenticated?.()) return null;
  const authentication = context.authenticationRuntime?.();
  if (!authentication || typeof authentication.bootstrap !== 'function') {
    throw new TypeError('INACTIVITY_AUTHENTICATION_RUNTIME_REQUIRED');
  }
  const appRoot = documentRoot.getElementById('app');
  const navigationRoot = documentRoot.getElementById('primaryNavigation');
  const titleRoot = documentRoot.getElementById('viewTitle');
  const subtitleRoot = documentRoot.getElementById('viewSubtitle');
  if (!appRoot || !navigationRoot || !titleRoot || !subtitleRoot) {
    throw new TypeError('INACTIVITY_LOCK_SURFACE_REQUIRED');
  }
  const channel = createBroadcastChannel(broadcastChannelFactory);
  let unlockPending = false;

  function renderLocked() {
    documentRoot.documentElement.dataset.sessionLocked = 'true';
    documentRoot.querySelector('[data-demo-security]')?.remove();
    clear(navigationRoot);
    clear(appRoot);
    titleRoot.textContent = t('inactivityLock.title');
    subtitleRoot.textContent = t('inactivityLock.subtitle');
    const status = el('p', {
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
    const unlock = button(t('inactivityLock.unlock'), { className: 'primary' });
    unlock.addEventListener('click', async () => {
      if (unlockPending) return;
      unlockPending = true;
      unlock.disabled = true;
      status.textContent = t('inactivityLock.checking');
      try {
        const result = await authentication.bootstrap();
        if (
          result?.status === PRODUCTION_AUTH_STATUS.AUTHENTICATED
          || result?.status === PRODUCTION_AUTH_STATUS.UNAUTHENTICATED
        ) {
          reload();
          return;
        }
      } catch {
        // Remain locked. Availability failures must not restore stale UI authority.
      }
      unlockPending = false;
      unlock.disabled = false;
      status.textContent = t('inactivityLock.unavailable');
      unlock.focus();
    });
    appRoot.appendChild(el('section', {
      className: 'card',
      attrs: { role: 'region', 'aria-labelledby': 'inactivityLockHeading' },
    }, [
      el('h2', { id: 'inactivityLockHeading', text: t('inactivityLock.title') }),
      el('p', { text: t('inactivityLock.description') }),
      el('div', { className: 'button-row' }, [unlock]),
      status,
    ]));
    windowRoot.requestAnimationFrame?.(() => unlock.focus());
  }

  const controller = createInactivityPolicyController({
    timeoutMs,
    clock,
    setTimer,
    clearTimer,
    onLock(reason) {
      renderLocked();
      if (reason !== 'external') channel?.postMessage?.({ type: 'lock' });
    },
  });

  const activity = () => controller.activity();
  ACTIVITY_EVENTS.forEach((eventName) => windowRoot.addEventListener?.(eventName, activity, { passive: true }));
  const visibility = () => {
    if (documentRoot.visibilityState === 'visible') controller.evaluate();
  };
  const pageshow = () => controller.evaluate();
  documentRoot.addEventListener?.('visibilitychange', visibility);
  windowRoot.addEventListener?.('pageshow', pageshow);
  if (channel) channel.onmessage = (event) => {
    if (event?.data?.type === 'lock') controller.externalLock();
  };

  return Object.freeze({
    controller,
    lock() { controller.externalLock(); },
    stop() {
      ACTIVITY_EVENTS.forEach((eventName) => windowRoot.removeEventListener?.(eventName, activity));
      documentRoot.removeEventListener?.('visibilitychange', visibility);
      windowRoot.removeEventListener?.('pageshow', pageshow);
      channel?.close?.();
      controller.stop();
    },
  });
}
