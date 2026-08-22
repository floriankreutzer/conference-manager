import { language } from '../core/i18n.js';
import { KEYS, readString, writeString } from '../core/storage.js';
import { showToast } from '../core/ui.js';

const DEMO_SECURITY_BUILD = '2026.08.22.43';
const ROLE_ALLOWLIST = new Set(['employee', 'manager']);
const LANGUAGE_ALLOWLIST = new Set(['de', 'en']);

const copy = {
  de: {
    title: 'Demo-Modus',
    text: 'Kein SSO · keine serverseitige Berechtigung · Daten nur in diesem Browser',
    reset: 'Demo-Daten löschen',
    resetConfirm: 'Alle lokal gespeicherten Conference-Manager-Demodaten in diesem Browser löschen?',
    resetDone: 'Lokale Demodaten wurden gelöscht.',
    storageWarning: 'Lokale Demodaten waren ungültig oder zu groß und wurden sicher ignoriert.',
  },
  en: {
    title: 'Demo mode',
    text: 'No SSO · no server-side authorization · data only in this browser',
    reset: 'Clear demo data',
    resetConfirm: 'Delete all locally stored Conference Manager demo data in this browser?',
    resetDone: 'Local demo data has been cleared.',
    storageWarning: 'Local demo data was invalid or too large and was safely ignored.',
  },
};

function messages() {
  return copy[language() === 'en' ? 'en' : 'de'];
}

function normalizeDemoState() {
  const role = readString(KEYS.role, 'employee');
  if (!ROLE_ALLOWLIST.has(role)) writeString(KEYS.role, 'employee');
  const currentLanguage = readString(KEYS.language, 'de');
  if (!LANGUAGE_ALLOWLIST.has(currentLanguage)) writeString(KEYS.language, 'de');
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
  if (document.querySelector('[data-demo-security]')) return;
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

function applyInputBounds(root = document) {
  root.querySelectorAll('input, textarea').forEach((control) => {
    if (control instanceof HTMLTextAreaElement && !control.maxLength) control.maxLength = 2000;
    if (!(control instanceof HTMLInputElement)) return;

    const type = String(control.type || 'text').toLowerCase();
    if (['text', 'search', 'email', 'tel', 'url'].includes(type) && control.maxLength < 0) control.maxLength = type === 'url' ? 2048 : 160;
    if (control.id === 'title') control.maxLength = 120;
    if (/first|last/i.test(control.id)) control.maxLength = Math.min(control.maxLength > 0 ? control.maxLength : 80, 80);
    if (/allocation-cost-center/i.test(control.id)) control.maxLength = 64;
    if (['internalParticipants', 'externalParticipants', 'cateringParticipants'].includes(control.id)) {
      control.min = '0';
      control.max = '500';
      control.step = '1';
      control.inputMode = 'numeric';
    }
  });
}

normalizeDemoState();

window.addEventListener('conference:storage-warning', () => showToast(messages().storageWarning));
document.addEventListener('focusin', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) applyInputBounds(event.target.parentElement || document);
});
document.addEventListener('click', () => requestAnimationFrame(() => applyInputBounds(document)));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    renderDemoNotice();
    applyInputBounds(document);
    document.documentElement.dataset.demoSecurityBuild = DEMO_SECURITY_BUILD;
  }, { once: true });
} else {
  renderDemoNotice();
  applyInputBounds(document);
  document.documentElement.dataset.demoSecurityBuild = DEMO_SECURITY_BUILD;
}
