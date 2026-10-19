import { formatDateTime, formatNumber, t } from '../../core/i18n.js';
import { button, clear, el, openDialog } from '../../core/ui.js';
import { createPlatformPasskeyBrowser } from './passkey-browser.js';
import { createPlatformPasskeyLogin } from './passkey-login.js';
import { createPlatformPasskeyLoginView } from './passkey-login-view.js';

const BASE = 'auth/passkey/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new TypeError('PLATFORM_PASSKEY_MANAGEMENT_RESPONSE_INVALID');
}
function requestId(value) { if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError('PLATFORM_PASSKEY_MANAGEMENT_RESPONSE_INVALID'); }
function instant(value) {
  return typeof value === 'string' && value.length <= 32 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function identifier(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 1366 || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    return btoa(atob(value.replaceAll('-', '+').replaceAll('_', '/'))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') === value;
  } catch { return false; }
}
function keysResponse(value) {
  exact(value, ['items','requestId']); requestId(value.requestId);
  if (!Array.isArray(value.items) || value.items.length > 5 || new Set(value.items.map(item => item?.id)).size !== value.items.length) {
    throw new TypeError('PLATFORM_PASSKEY_MANAGEMENT_RESPONSE_INVALID');
  }
  return value.items.map(item => {
    exact(item, ['id','createdAt','lastUsedAt','backupEligible','backedUp']);
    if (!identifier(item.id) || !instant(item.createdAt) || (item.lastUsedAt !== null && !instant(item.lastUsedAt))
      || typeof item.backupEligible !== 'boolean' || typeof item.backedUp !== 'boolean' || (item.backedUp && !item.backupEligible)) {
      throw new TypeError('PLATFORM_PASSKEY_MANAGEMENT_RESPONSE_INVALID');
    }
    return Object.freeze({ ...item });
  });
}
function challenge(value) {
  exact(value, ['status','state','options','requestId']); requestId(value.requestId);
  if (value.status !== 'passkey_required' || typeof value.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.state)
    || !value.options || typeof value.options !== 'object' || Array.isArray(value.options)) {
    throw new TypeError('PLATFORM_PASSKEY_MANAGEMENT_RESPONSE_INVALID');
  }
  return value;
}

// Own-key UI only. The API independently binds every read, addition and revocation
// to the current operator and an exact signature; this component assigns no roles.
export function createPlatformPasskeyManagement({ apiClient, refreshSession,
  onReauthenticate = () => globalThis.location.reload(), browser } = {}) {
  if (typeof apiClient?.request !== 'function' || typeof refreshSession !== 'function' || typeof onReauthenticate !== 'function') {
    throw new TypeError('PLATFORM_PASSKEY_MANAGEMENT_PORTS_REQUIRED');
  }
  let current = null;
  function open() {
    if (current) return;
    const abort = new AbortController(); const content = el('div'); const close = button(t('common.close'));
    let keys = []; let loaded = false; let busy = false; let error = null; let closed = false; let registration = null; let registrationView = null;
    const dialog = openDialog({ title: t('platformAdmin.passkey.manage.title'), description: t('platformAdmin.passkey.manage.description'),
      content, actions: [close], labelledById: 'platformPasskeyManageTitle' });
    current = dialog;
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      closed = true; abort.abort(); registration?.stop(); keys = []; clear(content); current = null;
    }, { once: true });
    function render() {
      if (closed || registrationView) return;
      const focused = document.activeElement; const hadFocus = content.contains(focused); clear(content);
      if (error) content.append(el('p', { attrs: { role: 'alert' }, text: t(error) }));
      if (busy) content.append(el('p', { attrs: { role: 'status' }, text: t('platformAdmin.passkey.busy') }));
      const list = el('ol', { className: 'platform-admin-record-list' });
      keys.forEach((key, index) => {
        const remove = button(t('platformAdmin.passkey.manage.remove'), { disabled: busy || keys.length < 2,
          attrs: { 'aria-label': t('platformAdmin.passkey.manage.removeNamed', { number: formatNumber(index + 1) }) } });
        remove.addEventListener('click', () => { void revoke(key); });
        list.append(el('li', { className: 'card' }, [
          el('h3', { text: t('platformAdmin.passkey.manage.key', { number: formatNumber(index + 1) }) }),
          el('p', { text: t('platformAdmin.passkey.manage.created', { time: formatDateTime(key.createdAt) }) }),
          el('p', { text: key.lastUsedAt === null ? t('platformAdmin.passkey.manage.unused')
            : t('platformAdmin.passkey.manage.used', { time: formatDateTime(key.lastUsedAt) }) }),
          el('p', { text: t(key.backupEligible ? 'platformAdmin.passkey.manage.syncEligible' : 'platformAdmin.passkey.manage.syncIneligible') }),
          remove,
        ]));
      });
      content.append(list);
      const add = button(t('platformAdmin.passkey.manage.add'), { className: 'primary', disabled: busy || !loaded || keys.length >= 5 });
      add.addEventListener('click', () => { void addition(); }); content.append(add);
      if (!busy) {
        const reload = button(t('platformAdmin.passkey.resume')); reload.addEventListener('click', () => { void load(); });
        content.append(reload);
      }
      if (hadFocus && focused?.isConnected === false) content.querySelector('button:not(:disabled)')?.focus();
    }
    async function run(work) {
      if (busy || closed) return;
      busy = true; error = null; render();
      try { await work(); }
      catch (failure) {
        error = failure?.code === 'PLATFORM_PASSKEY_BROWSER_CANCELLED' ? 'platformAdmin.passkey.error.cancelled'
          : 'platformAdmin.passkey.error.failed';
      } finally { busy = false; render(); }
    }
    function resumeRegistration() {
      if (closed) return;
      registration = createPlatformPasskeyLogin({ browser, onChange: state => {
        registrationView?.update(state);
        if (state.phase === 'credential_enrolled' && !state.busy && !closed) onReauthenticate();
      } });
      registrationView = createPlatformPasskeyLoginView({ controller: registration });
      clear(content); content.append(registrationView.element); registrationView.update(); void registration.load();
    }
    async function load() {
      return run(async () => {
        loaded = false; keys = [];
        try {
          const pending = await apiClient.request(`${BASE}enrollment/pending`, { signal: abort.signal });
          if (!['registration_required','possession_required'].includes(pending?.status)) throw new TypeError('PLATFORM_PASSKEY_PENDING_INVALID');
          resumeRegistration(); return;
        } catch (failure) { if (failure?.code !== 'HTTP_401') throw failure; }
        keys = keysResponse(await apiClient.request(`${BASE}manage/keys`, { signal: abort.signal }));
        loaded = true;
      });
    }
    async function proof(path, body = {}) {
      const pending = challenge(await apiClient.request(`${BASE}manage/${path}/start`,
        { method: 'POST', body, signal: abort.signal }));
      browser ??= createPlatformPasskeyBrowser();
      const response = await browser.authenticate(pending.options, { signal: abort.signal });
      if (closed || abort.signal.aborted) throw new Error('PLATFORM_PASSKEY_MANAGEMENT_CANCELLED');
      return apiClient.request(`${BASE}manage/${path}/complete`,
        { method: 'POST', body: { ...body, state: pending.state, response }, signal: abort.signal });
    }
    async function addition() {
      return run(async () => {
        const result = await proof('addition');
        exact(result, ['status','state','options','requestId']); requestId(result.requestId);
        if (result.status !== 'registration_required' || typeof result.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.state)
          || !result.options || typeof result.options !== 'object' || Array.isArray(result.options) || await refreshSession() !== true) {
          throw new Error('PLATFORM_PASSKEY_MANAGEMENT_REFRESH_REQUIRED');
        }
        resumeRegistration();
      });
    }
    async function revoke(key) {
      return run(async () => {
        const result = await proof('revocation', { credentialId: key.id });
        exact(result, ['status','requestId']); requestId(result.requestId);
        if (result.status !== 'reauthentication_required') throw new TypeError('PLATFORM_PASSKEY_MANAGEMENT_RESPONSE_INVALID');
        onReauthenticate();
      });
    }
    render(); void load();
  }
  return Object.freeze({
    renderControl() {
      const control = button(t('platformAdmin.passkey.manage.open'), { className: 'platform-admin-reset' });
      control.addEventListener('click', open); return control;
    },
    stop() { current?.close(); },
  });
}
