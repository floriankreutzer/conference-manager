import { t } from '../core/i18n.js';
import { button, clear, clearTransientFeedback, el } from '../core/ui.js';
import {
  createInactivityPolicyController,
  inactivityTimeoutForRuntime,
} from './inactivity-policy.js';
import { PRODUCTION_AUTH_STATUS } from './production-session.js';

const CHANNEL_NAME = 'conference-manager-customer-session-lock-v1';
const ACTIVITY_EVENTS = Object.freeze(['pointerdown', 'keydown', 'touchstart']);

function createBroadcastChannel(factory) {
  if (typeof factory === 'function') return factory(CHANNEL_NAME);
  if (typeof globalThis.BroadcastChannel !== 'function') return null;
  return new globalThis.BroadcastChannel(CHANNEL_NAME);
}

function closeOpenDialogs(documentRoot, retainedDialog = null) {
  documentRoot.querySelectorAll('dialog[open]').forEach((dialog) => {
    if (dialog === retainedDialog) return;
    try {
      dialog.close?.();
    } finally {
      if (dialog.isConnected) dialog.remove();
    }
  });
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
  mutationObserverFactory = null,
  invalidateApplicationRenders = null,
} = {}) {
  if (!context?.isAuthenticated?.()) return null;
  const authentication = context.authenticationRuntime?.();
  if (!authentication || typeof authentication.bootstrap !== 'function') {
    throw new TypeError('INACTIVITY_AUTHENTICATION_RUNTIME_REQUIRED');
  }
  if (
    invalidateApplicationRenders !== null
    && typeof invalidateApplicationRenders !== 'function'
  ) throw new TypeError('INACTIVITY_RENDER_INVALIDATOR_INVALID');
  const appRoot = documentRoot.getElementById('app');
  const navigationRoot = documentRoot.getElementById('primaryNavigation');
  const titleRoot = documentRoot.getElementById('viewTitle');
  const subtitleRoot = documentRoot.getElementById('viewSubtitle');
  if (!appRoot || !navigationRoot || !titleRoot || !subtitleRoot || !documentRoot.body) {
    throw new TypeError('INACTIVITY_LOCK_SURFACE_REQUIRED');
  }
  const channel = createBroadcastChannel(broadcastChannelFactory);
  let unlockPending = false;
  let lockDialog = null;
  let lockObserver = null;
  let locked = false;

  function lockedText(root, value) {
    if (root.textContent !== value) root.textContent = value;
  }

  function enforceLockedSurface() {
    if (!locked) return;
    if (documentRoot.documentElement.dataset.sessionLocked !== 'true') {
      documentRoot.documentElement.dataset.sessionLocked = 'true';
    }
    clearTransientFeedback(documentRoot, windowRoot);
    documentRoot.querySelector('[data-demo-security]')?.remove();
    closeOpenDialogs(documentRoot, lockDialog);
    if (navigationRoot.childNodes.length) clear(navigationRoot);
    if (appRoot.childNodes.length) clear(appRoot);
    lockedText(titleRoot, t('inactivityLock.title'));
    lockedText(subtitleRoot, t('inactivityLock.subtitle'));
    if (lockDialog && !lockDialog.isConnected) {
      lockDialog.removeAttribute('open');
      documentRoot.body.appendChild(lockDialog);
    }
    if (lockDialog && !lockDialog.open) lockDialog.showModal();
  }

  function observeLockedSurface() {
    if (lockObserver) return;
    const callback = () => enforceLockedSurface();
    if (typeof mutationObserverFactory === 'function') {
      lockObserver = mutationObserverFactory(callback);
    } else {
      const Observer = windowRoot.MutationObserver || globalThis.MutationObserver;
      lockObserver = typeof Observer === 'function' ? new Observer(callback) : null;
    }
    lockObserver?.observe?.(documentRoot.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open', 'data-session-locked'],
    });
  }

  function renderLocked() {
    locked = true;
    documentRoot.documentElement.dataset.sessionLocked = 'true';
    clearTransientFeedback(documentRoot, windowRoot);
    invalidateApplicationRenders?.();
    documentRoot.querySelector('[data-demo-security]')?.remove();
    closeOpenDialogs(documentRoot);
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
    lockDialog = el('dialog', {
      className: 'modal-dialog inactivity-lock-dialog',
      dataset: { inactivityLock: 'true' },
      attrs: { 'aria-labelledby': 'inactivityLockHeading' },
    }, [
      el('header', { className: 'modal-header' }, [
        el('h2', { id: 'inactivityLockHeading', text: t('inactivityLock.title') }),
        el('p', { text: t('inactivityLock.description') }),
      ]),
      el('section', { className: 'modal-body' }, [status]),
      el('footer', { className: 'modal-actions' }, [unlock]),
    ]);
    lockDialog.addEventListener('cancel', (event) => event.preventDefault());
    documentRoot.body.appendChild(lockDialog);
    lockDialog.showModal();
    observeLockedSurface();
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
      lockObserver?.disconnect?.();
      lockObserver = null;
      locked = false;
      lockDialog?.remove();
      lockDialog = null;
    },
  });
}
