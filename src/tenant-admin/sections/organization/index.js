import { formatDateTime, t } from '../../../core/i18n.js';
import { announce, button, clear, el, field, showToast, validationSummary } from '../../../core/ui.js';
import { MANAGED_BRAND_REFERENCE } from '../../../shared/tenant-branding.js';
import { TENANT_ADMIN_SECTION_PERMISSION, defineTenantAdminSection } from '../../section-contract.js';
import { renderSectionConflict, renderSectionError, renderSectionLoading } from '../../section-presentation.js';
import { tenantSettingsConflictRevision } from '../../settings-revision.js';

const TITLE = 'tenantAdmin.organization.title';
const LOCALES = ['de-DE', 'en-GB'];
const CURRENCIES = ['CHF', 'EUR', 'GBP', 'USD'];

function validAdapter(adapter) {
  return adapter !== null
    && typeof adapter?.loadOrganization === 'function'
    && typeof adapter?.saveOrganization === 'function'
    && typeof adapter?.listOrganizationHistory === 'function';
}

function input(value = '', options = {}) {
  return el('input', { type: options.type || 'text', value: value ?? '', attrs: options.attrs });
}

function select(values, selected, labelKey) {
  const control = el('select');
  values.forEach((value) => control.appendChild(el('option', {
    value, text: t(`${labelKey}.${value}`), attrs: value === selected ? { selected: 'selected' } : {},
  })));
  control.value = selected;
  return control;
}

function logoPresetSelect(selectedReference) {
  const control = el('select');
  control.append(
    el('option', { value: '', text: t('common.none') }),
    el('option', { value: MANAGED_BRAND_REFERENCE, text: t('app.title') }),
  );
  control.value = selectedReference === MANAGED_BRAND_REFERENCE ? selectedReference : '';
  return control;
}

function formValue(controls) {
  const optional = (value) => value.trim() || null;
  const countryCode = optional(controls.countryCode.value)?.toUpperCase() || null;
  if (countryCode !== null && !/^[A-Z]{2}$/.test(countryCode)) throw new TypeError('COUNTRY_CODE_INVALID');
  return {
    displayName: controls.displayName.value.trim(),
    businessMetadata: {
      legalName: optional(controls.legalName.value),
      registrationNumber: optional(controls.registrationNumber.value),
      countryCode,
    },
    presentation: { defaultLocale: controls.defaultLocale.value, defaultCurrency: controls.defaultCurrency.value },
    branding: { logoAssetRef: optional(controls.logoAssetRef.value), accentToken: 'default' },
  };
}

export function createOrganizationSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('ORGANIZATION_SECTION_ADAPTER_INVALID');
  let draft = null;
  let focusAfterSave = false;

  async function render({ root, isCurrent, rerender }) {
    renderSectionLoading(root, TITLE);
    let snapshot;
    let history;
    try {
      [snapshot, history] = await Promise.all([adapter.loadOrganization(), adapter.listOrganizationHistory({ limit: 10 })]);
    } catch {
      if (isCurrent()) {
        renderSectionError(root, TITLE);
        const retry = button(t('tenantSettings.action.retry'), { className: 'primary' });
        retry.addEventListener('click', rerender);
        root.querySelector('section')?.appendChild(retry);
      }
      return;
    }
    if (!isCurrent()) return;
    const organization = snapshot.organization;
    const controls = {
      displayName: input(organization.displayName, { attrs: { required: 'required', maxlength: '160', autocomplete: 'organization' } }),
      legalName: input(organization.businessMetadata.legalName, { attrs: { maxlength: '160', autocomplete: 'organization' } }),
      registrationNumber: input(organization.businessMetadata.registrationNumber, { attrs: { maxlength: '80' } }),
      countryCode: input(organization.businessMetadata.countryCode, { attrs: { maxlength: '2', pattern: '[A-Za-z]{2}', autocomplete: 'country' } }),
      defaultLocale: select(LOCALES, organization.presentation.defaultLocale, 'tenantSettings.locale'),
      defaultCurrency: select(CURRENCIES, organization.presentation.defaultCurrency, 'tenantSettings.currency'),
      logoAssetRef: logoPresetSelect(organization.branding.logoAssetRef),
    };
    const form = el('form', { dataset: { tenantSettingsForm: 'organization' } });
    form.append(el('div', { className: 'form-grid' }, [
      field({ id: 'tenant-organization-display-name', label: t('tenantSettings.organization.displayName'), control: controls.displayName, required: true }),
      field({ id: 'tenant-organization-legal-name', label: t('tenantSettings.organization.legalName'), control: controls.legalName, optional: true }),
      field({ id: 'tenant-organization-registration-number', label: t('tenantSettings.organization.registrationNumber'), control: controls.registrationNumber, optional: true }),
      field({ id: 'tenant-organization-country-code', label: t('tenantSettings.organization.countryCode'), control: controls.countryCode, optional: true, hint: t('tenantSettings.organization.countryCodeHint') }),
      field({ id: 'tenant-organization-locale', label: t('tenantSettings.organization.defaultLocale'), control: controls.defaultLocale, required: true }),
      field({ id: 'tenant-organization-currency', label: t('tenantSettings.organization.defaultCurrency'), control: controls.defaultCurrency, required: true }),
      field({ id: 'tenant-organization-logo', label: t('tenantSettings.organization.logoAssetRef'), control: controls.logoAssetRef, optional: true, hint: t('tenantSettings.organization.managedAssetsOnly') }),
    ]));
    const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    const save = button(t('tenantSettings.action.save'), { className: 'primary', attrs: { type: 'submit' } });
    let mutationPending = false;
    form.append(el('div', { className: 'button-row' }, [save]), status);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (mutationPending) return;
      if (!form.reportValidity()) return;
      try { draft = formValue(controls); }
      catch {
        validationSummary(form, t('tenantSettings.validation.checkFields'));
        controls.countryCode.focus();
        return;
      }
      save.disabled = true;
      mutationPending = true;
      status.textContent = t('tenantSettings.status.saving');
      try {
        await adapter.saveOrganization({ expectedRevision: snapshot.revision, organization: draft });
        focusAfterSave = true;
        showToast(t('tenantSettings.status.saved'));
        announce(t('tenantSettings.status.saved'));
        rerender();
      } catch (error) {
        const currentRevision = tenantSettingsConflictRevision(error);
        if (currentRevision !== null) {
          renderSectionConflict(root, TITLE, {
            currentRevision,
            onReload: rerender,
            onReapply: async () => {
              const current = await adapter.loadOrganization();
              await adapter.saveOrganization({ expectedRevision: current.revision, organization: draft });
              focusAfterSave = true;
              rerender();
            },
          });
          root.querySelector('h2')?.focus();
          return;
        }
        save.disabled = false;
        mutationPending = false;
        status.textContent = t('tenantSettings.status.saveFailed');
        announce(status.textContent, { assertive: true });
        save.focus();
      }
    });

    const historyList = el('ol');
    history.revisions.forEach((entry) => historyList.appendChild(el('li', {
      text: t('tenantSettings.history.entry', { revision: entry.revision, date: formatDateTime(entry.effectiveAt) }),
    })));
    clear(root);
    root.append(
      el('section', { className: 'card' }, [
        el('h2', { text: t(TITLE), attrs: { tabindex: '-1' } }),
        el('p', { text: t('tenantAdmin.organization.description') }),
        el('p', { className: 'muted', text: t('tenantAdmin.section.revision', { revision: snapshot.revision }) }),
        form,
      ]),
      el('section', { className: 'card' }, [el('h3', { text: t('tenantSettings.history.title') }), historyList]),
    );
    if (focusAfterSave) {
      focusAfterSave = false;
      requestAnimationFrame(() => root.querySelector('h2')?.focus());
    }
  }

  return defineTenantAdminSection({
    id: 'organization', titleKey: TITLE, descriptionKey: 'tenantAdmin.organization.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.CONFIGURE, available: validAdapter(adapter), render,
  });
}
