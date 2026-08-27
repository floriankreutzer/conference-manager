import { t } from '../core/i18n.js';
import { announce, button, el } from '../core/ui.js';

const MAX_BYTES = 65_536;
const METHODS = ['loadBulkTemplate', 'exportBulk', 'validateBulk', 'applyBulk'];

export function supportsBulkTransfer(adapter) {
  return METHODS.every((method) => typeof adapter?.[method] === 'function');
}

function downloadJson(value, filename) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { attrs: { href: url, download: filename } });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function createBulkTransferPanel({ adapter, types, rerender } = {}) {
  if (!supportsBulkTransfer(adapter) || !Array.isArray(types) || types.length < 1
    || typeof rerender !== 'function') throw new TypeError('TENANT_BULK_PANEL_INVALID');
  const type = el('select');
  types.forEach((value) => type.appendChild(el('option', { value, text: t(`tenantBulk.type.${value}`) })));
  const file = el('input', { type: 'file', attrs: { accept: 'application/json,.json' } });
  const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
  const errors = el('ul');
  const apply = button(t('tenantBulk.apply'), { className: 'primary' });
  apply.disabled = true;
  let validated = null;

  const selectedDocument = async () => {
    const selected = file.files?.[0];
    if (!selected || selected.size > MAX_BYTES) throw new TypeError('TENANT_BULK_FILE_INVALID');
    const value = JSON.parse(await selected.text());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('TENANT_BULK_FILE_INVALID');
    return value;
  };

  const template = button(t('tenantBulk.template'), { className: 'secondary' });
  template.addEventListener('click', async () => {
    const value = await adapter.loadBulkTemplate(type.value);
    downloadJson(value, `${type.value}-template.json`);
  });
  const exportButton = button(t('tenantBulk.export'), { className: 'secondary' });
  exportButton.addEventListener('click', async () => {
    const value = await adapter.exportBulk(type.value);
    downloadJson(value.document, `${type.value}-revision-${value.revision}.json`);
  });
  const validate = button(t('tenantBulk.validate'), { className: 'secondary' });
  validate.addEventListener('click', async () => {
    apply.disabled = true;
    errors.replaceChildren();
    try {
      const documentValue = await selectedDocument();
      const result = await adapter.validateBulk(type.value, documentValue);
      validated = result.receipt ? { document: documentValue, receiptId: result.receipt.id } : null;
      result.errors.forEach((entry) => errors.appendChild(el('li', {
        text: t('tenantBulk.error', { row: entry.row === null ? '-' : entry.row + 1, code: entry.code }),
      })));
      apply.disabled = !result.valid || !result.changed || !validated;
      status.textContent = result.valid
        ? t(result.changed ? 'tenantBulk.validChanged' : 'tenantBulk.validUnchanged')
        : t('tenantBulk.invalid');
      announce(status.textContent, { assertive: !result.valid });
    } catch {
      validated = null;
      status.textContent = t('tenantBulk.fileInvalid');
      announce(status.textContent, { assertive: true });
    }
  });
  apply.addEventListener('click', async () => {
    if (!validated) return;
    apply.disabled = true;
    try {
      await adapter.applyBulk(type.value, validated.document, validated.receiptId);
      announce(t('tenantBulk.applied'));
      rerender();
    } catch {
      status.textContent = t('tenantBulk.applyFailed');
      announce(status.textContent, { assertive: true });
    }
  });
  type.addEventListener('change', () => { validated = null; apply.disabled = true; });
  file.addEventListener('change', () => { validated = null; apply.disabled = true; });

  return el('section', { className: 'card', dataset: { tenantBulkTransfer: 'true' } }, [
    el('h3', { text: t('tenantBulk.title') }),
    el('p', { text: t('tenantBulk.description') }),
    el('div', { className: 'form-grid' }, [
      el('label', {}, [el('span', { text: t('tenantBulk.type') }), type]),
      el('label', {}, [el('span', { text: t('tenantBulk.file') }), file]),
    ]),
    el('div', { className: 'button-row' }, [template, exportButton, validate, apply]),
    status,
    errors,
  ]);
}
