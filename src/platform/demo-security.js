import { language } from '../core/i18n.js';
import { securityMessages } from '../core/security-i18n.js';
import { announce } from '../core/ui.js';
import { RUNTIME_MODE } from '../core/security-policy.js';

const DEMO_SECURITY_BUILD = '2026.09.01.78';
const PERSONAS = Object.freeze(['employee', 'conference_manager', 'tenant_admin', 'dual_role']);

function messages() {
  return securityMessages(language());
}

function personaOption(documentRoot, value, message) {
  const option = documentRoot.createElement('option');
  option.value = value;
  option.textContent = message;
  return option;
}

export function renderDemoSecurityControl({
  context,
  documentRoot = document,
  reload = () => globalThis.location.reload(),
} = {}) {
  if (
    context?.runtimeMode?.() !== RUNTIME_MODE.DEMO
    || documentRoot.querySelector('[data-demo-security]')
  ) return null;
  const sidebar = documentRoot.getElementById('sidebar');
  if (!sidebar) return null;
  const msg = messages();
  const panel = documentRoot.createElement('section');
  panel.className = 'demo-security-notice';
  panel.dataset.demoSecurity = DEMO_SECURITY_BUILD;
  panel.setAttribute('aria-label', msg.title);

  const title = documentRoot.createElement('strong');
  title.textContent = msg.title;
  const text = documentRoot.createElement('small');
  text.textContent = msg.text;

  const tenantLabel = documentRoot.createElement('label');
  tenantLabel.className = 'demo-security-role';
  tenantLabel.htmlFor = 'demoTenantSwitch';
  const tenantLabelText = documentRoot.createElement('span');
  tenantLabelText.className = 'demo-security-role-label';
  tenantLabelText.textContent = msg.tenantLabel;
  const tenantSelect = documentRoot.createElement('select');
  tenantSelect.id = 'demoTenantSwitch';
  tenantSelect.className = 'demo-security-role-select';
  context.demoTenants().forEach((tenant) => {
    const option = documentRoot.createElement('option');
    option.value = tenant.id;
    option.textContent = tenant.displayName;
    tenantSelect.appendChild(option);
  });
  tenantSelect.value = context.tenantId();
  tenantLabel.append(tenantLabelText, tenantSelect);

  const personaLabel = documentRoot.createElement('label');
  personaLabel.className = 'demo-security-role';
  personaLabel.htmlFor = 'demoPersonaSwitch';
  const personaLabelText = documentRoot.createElement('span');
  personaLabelText.className = 'demo-security-role-label';
  personaLabelText.textContent = msg.roleLabel;
  const personaSelect = documentRoot.createElement('select');
  personaSelect.id = 'demoPersonaSwitch';
  personaSelect.className = 'demo-security-role-select';
  personaSelect.setAttribute('aria-describedby', 'demoContextHint');
  personaSelect.append(
    personaOption(documentRoot, PERSONAS[0], msg.roleEmployee),
    personaOption(documentRoot, PERSONAS[1], msg.roleManager),
    personaOption(documentRoot, PERSONAS[2], msg.roleTenantAdmin),
    personaOption(documentRoot, PERSONAS[3], msg.roleDual),
  );
  personaSelect.value = context.demoPersona() || PERSONAS[0];
  const hint = documentRoot.createElement('small');
  hint.id = 'demoContextHint';
  hint.textContent = msg.roleHint;
  personaLabel.append(personaLabelText, personaSelect);

  const apply = documentRoot.createElement('button');
  apply.type = 'button';
  apply.className = 'demo-security-action';
  apply.textContent = msg.applyContext;
  const status = documentRoot.createElement('small');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  const selectable = context.canSwitchRole() && context.demoTenants().length >= 1;
  tenantSelect.disabled = !selectable;
  personaSelect.disabled = !selectable;
  apply.disabled = !selectable;
  if (!selectable) status.textContent = msg.unavailable;

  apply.addEventListener('click', async () => {
    apply.disabled = true;
    tenantSelect.disabled = true;
    personaSelect.disabled = true;
    status.textContent = msg.applyingContext;
    try {
      await context.switchDemoContext({
        tenantId: tenantSelect.value,
        persona: personaSelect.value,
      });
      status.textContent = msg.contextApplied;
      reload();
    } catch {
      status.textContent = msg.contextError;
      announce(msg.contextError, { assertive: true });
      const retryable = context.canSwitchRole();
      apply.disabled = !retryable;
      tenantSelect.disabled = !retryable;
      personaSelect.disabled = !retryable;
    }
  });

  panel.append(title, text, tenantLabel, personaLabel, hint, apply, status);
  sidebar.appendChild(panel);
  documentRoot.documentElement.dataset.demoSecurityBuild = DEMO_SECURITY_BUILD;
  return panel;
}
