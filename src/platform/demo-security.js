import { language } from '../core/i18n.js';
import { securityMessages } from '../core/security-i18n.js?v=20260824-61';
import {
  RUNTIME_MODE,
  SUPPORTED_LANGUAGE,
  USER_ROLE,
  normalizeDemoRole,
  normalizeLanguage,
  runtimeModeFromDocument,
} from '../core/security-policy.js';
import { KEYS, RepositoryWriteError, readString, writeString } from '../core/storage.js';
import { announce, applyInputConstraints, isParticipantInput, showToast } from '../core/ui.js';

const DEMO_SECURITY_BUILD = '2026.08.24.61';
const DEMO_ROLE_SWITCH_BUILD = '2026.08.24.62';
const runtimeMode = runtimeModeFromDocument(document);

function messages() {
  return securityMessages(language());
}

function normalizeDemoState() {
  if (runtimeMode !== RUNTIME_MODE.DEMO) return;

  const currentLanguage = readString(KEYS.language, SUPPORTED_LANGUAGE.DE);
  const safeLanguage = normalizeLanguage(currentLanguage);
  if (safeLanguage !== currentLanguage) writeString(KEYS.language, safeLanguage);

  const currentRole = readString(KEYS.role, USER_ROLE.EMPLOYEE);
  const safeRole = normalizeDemoRole(currentRole);
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

function createRoleControl(msg) {
  const wrapper = document.createElement('label');
  wrapper.className = 'demo-security-role';
  wrapper.htmlFor = 'demoRoleSwitch';

  const label = document.createElement('span');
  label.className = 'demo-security-role-label';
  label.textContent = msg.roleLabel;

  const select = document.createElement('select');
  select.id = 'demoRoleSwitch';
  select.className = 'demo-security-role-select';
  select.setAttribute('aria-describedby', 'demoRoleHint');

  const employee = document.createElement('option');
  employee.value = USER_ROLE.EMPLOYEE;
  employee.textContent = msg.roleEmployee;
  const manager = document.createElement('option');
  manager.value = USER_ROLE.MANAGER;
  manager.textContent = msg.roleManager;
  const tenantAdmin = document.createElement('option');
  tenantAdmin.value = USER_ROLE.TENANT_ADMIN;
  tenantAdmin.textContent = msg.roleTenantAdmin;
  select.append(employee, manager, tenantAdmin);
  select.value = normalizeDemoRole(readString(KEYS.role, USER_ROLE.EMPLOYEE));

  const hint = document.createElement('small');
  hint.id = 'demoRoleHint';
  hint.textContent = msg.roleHint;

  select.addEventListener('change', () => {
    const nextRole = normalizeDemoRole(select.value);
    if (!writeString(KEYS.role, nextRole)) {
      select.value = normalizeDemoRole(readString(KEYS.role, USER_ROLE.EMPLOYEE));
      showToast(msg.storageWarning);
      announce(msg.storageWarning, { assertive: true });
      return;
    }
    window.location.reload();
  });

  wrapper.append(label, select, hint);
  return wrapper;
}

function renderDemoNotice() {
  if (runtimeMode !== RUNTIME_MODE.DEMO || document.querySelector('[data-demo-security]')) return;
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const msg = messages();

  const panel = document.createElement('section');
  panel.className = 'demo-security-notice';
  panel.dataset.demoSecurity = DEMO_SECURITY_BUILD;
  panel.dataset.demoRoleSwitch = DEMO_ROLE_SWITCH_BUILD;
  panel.setAttribute('aria-label', msg.title);

  const title = document.createElement('strong');
  title.textContent = msg.title;
  const text = document.createElement('small');
  text.textContent = msg.text;
  const roleControl = createRoleControl(msg);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'demo-security-reset';
  reset.textContent = msg.reset;
  reset.addEventListener('click', resetDemoData);

  panel.append(title, text, roleControl, reset);
  sidebar.appendChild(panel);
}

function applyInputBounds(root = document) {
  root.querySelectorAll('input, textarea').forEach(applyInputConstraints);
}

function initializeSecurityControls() {
  renderDemoNotice();
  applyInputBounds(document);
  document.documentElement.dataset.demoSecurityBuild = DEMO_SECURITY_BUILD;
  document.documentElement.dataset.demoRoleSwitchBuild = DEMO_ROLE_SWITCH_BUILD;
  document.documentElement.dataset.runtimeMode = runtimeMode;
}

function reportStorageWarning() {
  const message = messages().storageWarning;
  showToast(message);
  announce(message, { assertive: true });
}

normalizeDemoState();

window.addEventListener('conference:storage-warning', reportStorageWarning);
window.addEventListener('error', (event) => {
  if (event.error instanceof RepositoryWriteError) event.preventDefault();
});
document.addEventListener('focusin', (event) => applyInputConstraints(event.target));
document.addEventListener('input', (event) => {
  const control = event.target;
  if (!isParticipantInput(control)) return;
  const numeric = Number(control.value);
  if (Number.isFinite(numeric) && numeric > 500) control.value = '500';
}, true);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSecurityControls, { once: true });
} else {
  initializeSecurityControls();
}
