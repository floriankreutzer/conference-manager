import { language } from '../core/i18n.js';
import { securityMessages } from '../core/security-i18n.js';
import {
  RUNTIME_MODE,
  SUPPORTED_LANGUAGE,
  USER_ROLE,
  normalizeDemoRole,
  normalizeLanguage,
  runtimeModeFromDocument,
} from '../core/security-policy.js';
import { KEYS, readString, writeString } from '../core/storage.js';
import { showToast } from '../core/ui.js';

const DEMO_SECURITY_BUILD = '2026.08.23.51';
const PARTICIPANT_FIELDS = new Set(['internalParticipants', 'externalParticipants', 'cateringParticipants']);
const runtimeMode = runtimeModeFromDocument(document);

function messages() {
  return securityMessages(language());
}

function normalizeDemoState() {
  const currentLanguage = readString(KEYS.language, SUPPORTED_LANGUAGE.DE);
  const safeLanguage = normalizeLanguage(currentLanguage);
  if (safeLanguage !== currentLanguage) writeString(KEYS.language, safeLanguage);

  const currentRole = readString(KEYS.role, USER_ROLE.EMPLOYEE);
  const safeRole = runtimeMode === RUNTIME_MODE.DEMO
    ? normalizeDemoRole(currentRole)
    : USER_ROLE.EMPLOYEE;
  if (safeRole !== currentRole) writeString(KEYS.role, safeRole);
}

function clearConferenceStorage(storage) {
  try {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith('conference_')) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {}
}

function resetDemoData() {
  const msg = messages();
  if (!window.confirm(msg.resetConfirm)) return;
  const preferredLanguage = language();
  clearConferenceStorage(localStorage);
  clearConferenceStorage(sessionStorage);
  try { localStorage.setItem(KEYS.language, preferredLanguage); } catch {}
  showToast(msg.resetDone);
  window.setTimeout(() => window.location.reload(), 120);
}

function renderDemoNotice() {
  if (runtimeMode !== RUNTIME_MODE.DEMO || document.querySelector('[data-demo-security]')) return;
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const msg = messages();

  const panel = document.createElement('section');
  panel.className = 'demo-security-notice';
  panel.dataset.demoSecurity = DEMO_SECURITY_BUILD;
  panel.setAttribute('aria-label', msg.title);

  const title = document.createElement('strong');
  title.textContent = msg.title;
  const text = document.createElement('small');
  text.textContent = msg.text;
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'demo-security-reset';
  reset.textContent = msg.reset;
  reset.addEventListener('click', resetDemoData);

  panel.append(title, text, reset);
  sidebar.appendChild(panel);
}

function applyInputBound(control) {
  if (control instanceof HTMLTextAreaElement) {
    if (!control.hasAttribute('maxlength')) control.maxLength = 2000;
    return;
  }
  if (!(control instanceof HTMLInputElement)) return;

  const type = String(control.type || 'text').toLowerCase();
  if (['text', 'search', 'email', 'tel', 'url'].includes(type) && !control.hasAttribute('maxlength')) {
    control.maxLength = type === 'url' ? 2048 : 160;
  }
  if (control.id === 'title') control.maxLength = 120;
  if (/first|last/i.test(control.id)) control.maxLength = 80;
  if (/allocation-cost-center/i.test(control.id)) control.maxLength = 64;
  if (PARTICIPANT_FIELDS.has(control.id)) {
    control.min = '0';
    control.max = '500';
    control.step = '1';
    control.inputMode = 'numeric';
  }
}

function applyInputBounds(root = document) {
  root.querySelectorAll('input, textarea').forEach(applyInputBound);
}

function applyBoundsAfterInteractiveRender() {
  applyInputBounds(document);
}

function initializeSecurityControls() {
  renderDemoNotice();
  applyInputBounds(document);
  document.documentElement.dataset.demoSecurityBuild = DEMO_SECURITY_BUILD;
  document.documentElement.dataset.runtimeMode = runtimeMode;
}

normalizeDemoState();

window.addEventListener('conference:storage-warning', () => showToast(messages().storageWarning));
document.addEventListener('focusin', (event) => applyInputBound(event.target));
document.addEventListener('click', applyBoundsAfterInteractiveRender);
document.addEventListener('change', applyBoundsAfterInteractiveRender);
document.addEventListener('input', (event) => {
  const control = event.target;
  if (!(control instanceof HTMLInputElement) || !PARTICIPANT_FIELDS.has(control.id)) return;
  const numeric = Number(control.value);
  if (Number.isFinite(numeric) && numeric > 500) control.value = '500';
}, true);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSecurityControls, { once: true });
} else {
  initializeSecurityControls();
}
