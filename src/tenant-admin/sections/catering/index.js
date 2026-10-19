import { formatNumber, t } from '../../../core/i18n.js';
import { announce, button, clear, el, field } from '../../../core/ui.js';
import { CATERING_CAPABILITIES, CATERING_INITIAL_MODES } from '../../../shared/catering-configuration.js';
import { defineTenantAdminSection, TENANT_ADMIN_SECTION_PERMISSION } from '../../section-contract.js';
import { renderSectionError, renderSectionLoading } from '../../section-presentation.js';

const TITLE = 'tenantAdmin.catering.title';
function validAdapter(adapter) {
  return adapter?.featureFlags?.isEnabled('catering.configuration') === true
    && ['listConnections', 'createConnection', 'saveConfiguration'].every((name) => typeof adapter?.[name] === 'function');
}
function select(values, selected, label) {
  const control = el('select');
  for (const value of values) control.appendChild(el('option', { value, text: label(value) }));
  control.value = selected;
  return control;
}
function providerName(providerId) { return t(`tenantAdmin.catering.provider.${providerId}`); }

export function createCateringSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('CATERING_SECTION_ADAPTER_INVALID');
  let afterIntegrationId = null;
  let focusAfterMutation = false;

  async function render({ root, isCurrent, rerender }) {
    renderSectionLoading(root, TITLE);
    let page;
    try { page = await adapter.listConnections({ afterIntegrationId }); }
    catch {
      if (!isCurrent()) return;
      renderSectionError(root, TITLE);
      const retry = button(t('tenantSettings.action.retry'));
      retry.addEventListener('click', rerender);
      root.querySelector('section')?.appendChild(retry);
      return;
    }
    if (!isCurrent()) return;
    clear(root);
    const intro = el('section', { className: 'card' }, [
      el('h2', { text: t(TITLE), attrs: { tabindex: '-1' } }),
      el('p', { text: t('tenantAdmin.catering.description') }),
      el('p', { className: 'field-hint', text: t('tenantAdmin.catering.deliveryUnverified') }),
      el('p', { className: 'field-hint', text: t('tenantAdmin.catering.changeApproval') }),
    ]);
    root.appendChild(intro);

    function configurationForm(provider, snapshot = null) {
      const reference = snapshot?.integrationId || 'new';
      const initial = snapshot?.configuration || { initialOrderMode: 'manager_review', capabilities: provider.capabilities };
      const form = el('form', { dataset: { cateringForm: reference } });
      const fields = el('fieldset');
      fields.appendChild(el('legend', { text: snapshot
        ? t('tenantAdmin.catering.editConfiguration') : t('tenantAdmin.catering.newConfiguration') }));
      const grid = el('div', { className: 'form-grid' });
      const mode = select(CATERING_INITIAL_MODES, initial.initialOrderMode,
        (value) => t(`tenantAdmin.catering.initial.${value}`));
      grid.appendChild(field({ id: `catering-${reference}-initial`, label: t('tenantAdmin.catering.initialMode'), control: mode }));
      const capabilities = {};
      for (const capability of CATERING_CAPABILITIES) {
        const supported = provider.capabilities[capability];
        const values = supported === 'unsupported' ? ['unsupported'] : [supported, 'unsupported'];
        const control = select(values, initial.capabilities[capability], (value) => t(`tenantAdmin.catering.mode.${value}`));
        capabilities[capability] = control;
        grid.appendChild(field({ id: `catering-${reference}-${capability.replace('.', '-')}`,
          label: t(`tenantAdmin.catering.capability.${capability.slice(9)}`), control }));
      }
      const save = button(t(snapshot ? 'tenantSettings.action.save' : 'tenantAdmin.catering.create'),
        { className: 'primary', attrs: { type: 'submit' } });
      fields.append(grid, el('div', { className: 'button-row' }, [save]));
      const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
      const feedback = el('div');
      form.append(fields, status, feedback);
      let pending = false;
      let lastCommand = null;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (pending || !isCurrent() || !form.reportValidity()) return;
        const configuration = { initialOrderMode: mode.value,
          capabilities: Object.fromEntries(CATERING_CAPABILITIES.map((key) => [key, capabilities[key].value])) };
        const signature = JSON.stringify(configuration);
        if (!snapshot && lastCommand?.signature !== signature) {
          lastCommand = { signature, commandId: globalThis.crypto.randomUUID() };
        }
        pending = true;
        fields.disabled = true;
        form.setAttribute('aria-busy', 'true');
        clear(feedback);
        status.textContent = t('tenantSettings.status.saving');
        try {
          if (snapshot) {
            await adapter.saveConfiguration({ integrationId: snapshot.integrationId,
              expectedRevision: snapshot.revision, configuration });
          } else {
            await adapter.createConnection({ commandId: lastCommand.commandId, providerId: provider.providerId, configuration });
            afterIntegrationId = null;
          }
          if (!isCurrent()) return;
          focusAfterMutation = true;
          announce(t('tenantSettings.status.saved'));
          rerender();
        } catch (error) {
          if (!isCurrent()) return;
          fields.disabled = false;
          pending = false;
          form.setAttribute('aria-busy', 'false');
          status.textContent = '';
          const key = error?.code === 'HTTP_409' ? 'tenantAdmin.catering.conflict' : 'tenantSettings.status.saveFailed';
          feedback.appendChild(el('p', { text: t(key), attrs: { role: 'alert' } }));
          if (error?.code === 'HTTP_409') {
            const reload = button(t('tenantAdmin.section.conflictReload'));
            reload.addEventListener('click', () => { focusAfterMutation = true; rerender(); });
            feedback.appendChild(reload);
          }
          announce(t(key), { assertive: true });
          save.focus();
        }
      });
      return form;
    }

    if (page.providers.length > 0) {
      const createPanel = el('section', { className: 'card' }, [el('h3', { text: t('tenantAdmin.catering.newConnection') })]);
      const picker = select(page.providers.map((provider) => provider.providerId), page.providers[0].providerId, providerName);
      const formRoot = el('div');
      const renderCreateForm = () => {
        clear(formRoot);
        formRoot.appendChild(configurationForm(page.providers.find((provider) => provider.providerId === picker.value)));
      };
      picker.addEventListener('change', renderCreateForm);
      createPanel.append(field({ id: 'catering-provider', label: t('tenantAdmin.catering.provider'), control: picker }), formRoot);
      renderCreateForm();
      root.appendChild(createPanel);
    }
    const connections = el('section', { className: 'tenant-admin-domain-summary' }, [
      el('h3', { text: t('tenantAdmin.catering.connections') }),
    ]);
    if (page.connections.length === 0) connections.appendChild(el('p', { text: t('tenantAdmin.section.empty') }));
    for (const snapshot of page.connections) {
      const provider = page.providers.find((entry) => entry.providerId === snapshot.providerId);
      connections.appendChild(el('article', { className: 'card' }, [
        el('h4', { text: t('tenantAdmin.catering.connection',
          { provider: providerName(snapshot.providerId), reference: snapshot.integrationId.slice(-8) }) }),
        el('p', { className: 'muted', text: t('tenantAdmin.section.revision', { revision: formatNumber(snapshot.revision) }) }),
        configurationForm(provider, snapshot),
      ]));
    }
    root.appendChild(connections);
    const actions = el('div', { className: 'button-row' });
    if (afterIntegrationId !== null) {
      const first = button(t('tenantAdmin.catering.firstPage'));
      first.addEventListener('click', () => { afterIntegrationId = null; focusAfterMutation = true; rerender(); });
      actions.appendChild(first);
    }
    if (page.nextAfterIntegrationId !== null) {
      const next = button(t('tenantAdmin.catering.nextPage'));
      next.addEventListener('click', () => { afterIntegrationId = page.nextAfterIntegrationId; focusAfterMutation = true; rerender(); });
      actions.appendChild(next);
    }
    root.appendChild(actions);
    if (focusAfterMutation) requestAnimationFrame(() => {
      if (!isCurrent()) return;
      focusAfterMutation = false;
      if (!root.contains(document.activeElement)) root.querySelector('h2')?.focus();
    });
  }
  return defineTenantAdminSection({ id: 'catering', titleKey: TITLE, descriptionKey: 'tenantAdmin.catering.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.INTEGRATIONS_MANAGE, available: validAdapter(adapter), render });
}
