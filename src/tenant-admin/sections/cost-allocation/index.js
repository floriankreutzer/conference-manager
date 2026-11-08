import { formatDateTime, t } from '../../../core/i18n.js';
import { announce, button, clear, el, field, showToast, validationSummary } from '../../../core/ui.js';
import { TENANT_ADMIN_SECTION_PERMISSION, defineTenantAdminSection } from '../../section-contract.js';
import { renderSectionConflict, renderSectionError, renderSectionLoading } from '../../section-presentation.js';
import { tenantSettingsConflictRevision } from '../../settings-revision.js';
import { createBulkTransferPanel, supportsBulkTransfer } from '../../../shared/tenant-bulk-transfer-panel.js';

const TITLE = 'tenantAdmin.costAllocation.title';
const COST_CENTER_CODE = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;

function validAdapter(adapter) {
  return adapter !== null && ['loadCostAllocation', 'saveCostAllocation', 'listCostAllocationHistory', 'loadCostAllocationRevision']
    .every((method) => typeof adapter?.[method] === 'function');
}

const textInput = (value, attrs = {}) => el('input', { type: 'text', value: value ?? '', attrs });
const nextId = (existing) => {
  let index = existing.size + 1;
  while (existing.has(`cost-center-${index}`)) index += 1;
  return `cost-center-${index}`;
};

function costCenterEditor(costCenter, index) {
  const controls = {
    code: textInput(costCenter.code, { required: 'required', maxlength: '64', pattern: '[A-Z0-9][A-Z0-9._-]{0,63}' }),
    name: textInput(costCenter.name, { required: 'required', maxlength: '160' }),
    group: textInput(costCenter.group, { maxlength: '160' }),
    active: el('input', { type: 'checkbox', checked: costCenter.active }),
  };
  const prefix = `tenant-cost-center-${index}`;
  const node = el('fieldset', { className: 'card', dataset: { costCenterId: costCenter.id } }, [
    el('legend', { text: costCenter.name }),
    el('p', { className: 'muted', text: t('tenantSettings.costAllocation.internalId', { id: costCenter.id }) }),
    el('div', { className: 'form-grid' }, [
      field({ id: `${prefix}-code`, label: t('tenantSettings.costAllocation.code'), control: controls.code, required: true }),
      field({ id: `${prefix}-name`, label: t('tenantSettings.costAllocation.name'), control: controls.name, required: true }),
      field({ id: `${prefix}-group`, label: t('tenantSettings.costAllocation.group'), control: controls.group, optional: true }),
      field({ id: `${prefix}-active`, label: t('tenantSettings.common.active'), control: controls.active }),
    ]),
  ]);
  return { node, controls, costCenter };
}

function invalidCenter(control, key, values = {}) {
  throw new TypeError('COST_CENTER_INVALID', { cause: { control, key, values } });
}

function readCenters(editors) {
  const codes = new Set();
  const values = editors.map(({ costCenter, controls }) => {
    const code = controls.code.value.trim().toUpperCase();
    if (!COST_CENTER_CODE.test(code)) invalidCenter(controls.code, 'tenantSettings.costAllocation.invalidCode');
    if (codes.has(code)) invalidCenter(controls.code, 'tenantSettings.costAllocation.duplicateCode', { code });
    codes.add(code);
    if (!controls.name.value.trim()) invalidCenter(controls.name, 'tenantSettings.costAllocation.nameRequired');
    return {
      id: costCenter.id, code, name: controls.name.value.trim(), group: controls.group.value.trim() || null,
      active: controls.active.checked,
    };
  });
  return values;
}

export function createCostAllocationSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('COST_ALLOCATION_SECTION_ADAPTER_INVALID');
  let focusAfterSave = false;

  async function render({ root, isCurrent, rerender }) {
    renderSectionLoading(root, TITLE);
    let snapshot;
    let history;
    try { [snapshot, history] = await Promise.all([adapter.loadCostAllocation(), adapter.listCostAllocationHistory({ limit: 20 })]); }
    catch {
      if (isCurrent()) {
        renderSectionError(root, TITLE);
        const retry = button(t('tenantSettings.action.retry'), { className: 'primary' });
        retry.addEventListener('click', rerender);
        root.querySelector('section')?.appendChild(retry);
      }
      return;
    }
    if (!isCurrent()) return;
    const form = el('form', { dataset: { tenantSettingsForm: 'cost-allocation' } });
    const allocationRequired = el('input', { type: 'checkbox', checked: snapshot.configuration.allocationRequired });
    form.append(
      field({ id: 'tenant-allocation-required', label: t('tenantSettings.costAllocation.required'), control: allocationRequired, hint: t('tenantSettings.costAllocation.exactHundred') }),
      el('p', { className: 'muted', text: t('tenantSettings.costAllocation.percentageModel') }),
    );
    const editors = snapshot.configuration.costCenters.map(costCenterEditor);
    const surface = el('div', {}, editors.map((entry) => entry.node));
    const add = button(t('tenantSettings.costAllocation.addCostCenter'));
    add.addEventListener('click', () => {
      const count = editors.length + 1;
      const id = nextId(new Set(editors.map((entry) => entry.costCenter.id)));
      const editor = costCenterEditor({ id, code: `CENTER_${count}`, name: t('tenantSettings.costAllocation.newCostCenter'), group: null, active: true }, count - 1);
      editors.push(editor);
      surface.appendChild(editor.node);
      editor.controls.name.focus();
    });
    form.append(el('h3', { text: t('tenantSettings.costAllocation.costCenters') }), surface, el('div', { className: 'button-row' }, [add]));
    const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    const save = button(t('tenantSettings.action.save'), { className: 'primary', attrs: { type: 'submit' } });
    let mutationPending = false;
    form.append(el('div', { className: 'button-row' }, [save]), status);
    const clearErrors = () => {
      form.querySelectorAll('[aria-invalid="true"]').forEach((control) => {
        control.removeAttribute('aria-invalid');
        const descriptions = (control.getAttribute('aria-describedby') || '').split(' ')
          .filter(id => id && id !== 'tenant-cost-allocation-error');
        if (descriptions.length) control.setAttribute('aria-describedby', descriptions.join(' '));
        else control.removeAttribute('aria-describedby');
      });
      form.querySelector('.validation-summary')?.remove();
    };
    form.addEventListener('input', clearErrors);
    form.addEventListener('change', clearErrors);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (mutationPending) return;
      clearErrors();
      if (!form.reportValidity()) return;
      let submittedDraft;
      try {
        const costCenters = readCenters(editors);
        if (allocationRequired.checked && !costCenters.some((entry) => entry.active)) {
          invalidCenter(editors[0]?.controls.active || add, 'tenantSettings.costAllocation.activeRequired');
        }
        submittedDraft = { allocationRequired: allocationRequired.checked, costCenters };
      }
      catch (error) {
        const { control, key, values } = error.cause || {};
        if (!control || !key) throw error;
        const message = t(key, values);
        const summary = validationSummary(form, message);
        summary.id = 'tenant-cost-allocation-error';
        if (!control.id) control.id = 'tenant-cost-allocation-add';
        const link = el('a', { attrs: { href: `#${control.id}` }, text: message });
        link.addEventListener('click', (click) => { click.preventDefault(); control.focus(); });
        summary.querySelector('p').replaceChildren(link);
        control.setAttribute('aria-invalid', 'true');
        const descriptions = new Set((control.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
        descriptions.add(summary.id);
        control.setAttribute('aria-describedby', [...descriptions].join(' '));
        control.focus();
        return;
      }
      save.disabled = true;
      mutationPending = true;
      status.textContent = t('tenantSettings.status.saving');
      try {
        await adapter.saveCostAllocation({ expectedRevision: snapshot.revision, configuration: submittedDraft });
        if (!isCurrent()) return;
        focusAfterSave = true;
        showToast(t('tenantSettings.status.saved'));
        announce(t('tenantSettings.status.saved'));
        rerender();
      } catch (error) {
        if (!isCurrent()) return;
        const currentRevision = tenantSettingsConflictRevision(error);
        if (currentRevision !== null) {
          renderSectionConflict(root, TITLE, {
            currentRevision, onReload: rerender,
            onReapply: async () => {
              const current = await adapter.loadCostAllocation();
              if (!isCurrent()) return;
              await adapter.saveCostAllocation({ expectedRevision: current.revision, configuration: submittedDraft });
              if (!isCurrent()) return;
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
    history.forEach((entry) => historyList.appendChild(el('li', { text: t('tenantSettings.history.entry', { revision: entry.revision, date: formatDateTime(entry.changedAt) }) })));
    clear(root);
    root.append(
      el('section', { className: 'card' }, [
        el('h2', { text: t(TITLE), attrs: { tabindex: '-1' } }), el('p', { text: t('tenantAdmin.costAllocation.description') }),
        el('p', { className: 'muted', text: t('tenantAdmin.section.revision', { revision: snapshot.revision }) }), form,
      ]),
      el('section', { className: 'card' }, [el('h3', { text: t('tenantSettings.history.title') }), historyList]),
    );
    if (supportsBulkTransfer(adapter)) root.appendChild(createBulkTransferPanel({
      adapter, types: ['cost-centers'], rerender, isCurrent,
    }));
    if (focusAfterSave) {
      requestAnimationFrame(() => {
        if (!focusAfterSave || !isCurrent()) return;
        const heading = root.querySelector('h2');
        if (!heading?.isConnected) return;
        heading.focus();
        focusAfterSave = false;
      });
    }
  }

  return defineTenantAdminSection({
    id: 'cost-allocation', titleKey: TITLE, descriptionKey: 'tenantAdmin.costAllocation.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.CONFIGURE, available: validAdapter(adapter), render,
  });
}
