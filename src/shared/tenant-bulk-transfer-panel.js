import { t } from '../core/i18n.js';
import { announce, button, el } from '../core/ui.js';

const MAX_BYTES = 65_536;
const METHODS = ['loadBulkTemplate', 'exportBulk', 'validateBulk', 'applyBulk'];

export function supportsBulkTransfer(adapter) {
  return METHODS.every((method) => typeof adapter?.[method] === 'function');
}

const CSV_HEADERS = Object.freeze({
  rooms: Object.freeze(['id', 'name', 'description', 'capacity', 'active', 'floor', 'equipment',
    'accessibility', 'serviceIds', 'cateringPackageIds', 'guestPublicValues']),
  services: Object.freeze(['id', 'name', 'description', 'price', 'active', 'order', 'siteIds', 'roomIds']),
  equipment: Object.freeze(['id', 'name', 'description', 'price', 'active', 'order', 'siteIds', 'roomIds']),
  'catering-items': Object.freeze(['id', 'name', 'description', 'price', 'active', 'order', 'siteIds', 'roomIds']),
  'catering-packages': Object.freeze(['id', 'name', 'description', 'price', 'active', 'order',
    'siteIds', 'roomIds', 'itemIds', 'variants']),
});

function csvCell(value) {
  let text = value === null || value === undefined ? '' :
    typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(documentValue, filename) {
  const configured = CSV_HEADERS[documentValue?.type];
  if (!configured || !Array.isArray(documentValue?.rows)) throw new TypeError('TENANT_BULK_FILE_INVALID');
  const extra = new Set(documentValue.rows.flatMap((row) => Object.keys(row || {})));
  const headers = [...configured, ...[...extra].filter((key) => !configured.includes(key)).sort()];
  const lines = [headers.map(csvCell).join(',')];
  for (const row of documentValue.rows) {
    lines.push(headers.map((key) => csvCell(row[key])).join(','));
  }
  const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  let link = null;
  try {
    link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
  } finally {
    link?.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted && char === '"' && line[index + 1] === '"') { value += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { cells.push(value); value = ''; continue; }
    value += char;
  }
  if (quoted) throw new TypeError('TENANT_BULK_FILE_INVALID');
  cells.push(value);
  return cells;
}

function csvValue(raw) {
  const value = raw.startsWith("'") && /^[=+\-@]/.test(raw.slice(1)) ? raw.slice(1) : raw;
  if (value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('[') || value.startsWith('{')) return JSON.parse(value);
  return value;
}

function parseCsv(text, type) {
  if (typeof text !== 'string' || text.includes('\0')) throw new TypeError('TENANT_BULK_FILE_INVALID');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 1 || lines.length > 1_025) throw new TypeError('TENANT_BULK_FILE_INVALID');
  const headers = parseCsvLine(lines[0]);
  if (!headers.length || new Set(headers).size !== headers.length || headers.some((key) => !key)) {
    throw new TypeError('TENANT_BULK_FILE_INVALID');
  }
  const allowed = CSV_HEADERS[type];
  if (!allowed || headers.some((key) => !allowed.includes(key))) throw new TypeError('TENANT_BULK_FILE_INVALID');
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    if (cells.length !== headers.length) throw new TypeError('TENANT_BULK_FILE_INVALID');
    return Object.fromEntries(headers.map((key, index) => [key, csvValue(cells[index])]));
  });
  return { schemaVersion: 1, type, rows };
}

export function createBulkTransferPanel({ adapter, types, rerender, isCurrent } = {}) {
  if (!supportsBulkTransfer(adapter) || !Array.isArray(types) || types.length < 1
    || typeof rerender !== 'function' || typeof isCurrent !== 'function') {
    throw new TypeError('TENANT_BULK_PANEL_INVALID');
  }
  let panel = null;
  const lifecycleCurrent = () => isCurrent()
    && panel?.isConnected !== false
    && document.documentElement?.dataset?.sessionLocked !== 'true';
  const type = el('select');
  types.forEach((value) => type.appendChild(el('option', { value, text: t(`tenantBulk.type.${value}`) })));
  const file = el('input', { type: 'file', attrs: { accept: 'text/csv,.csv' } });
  const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
  const errors = el('ul');
  const apply = button(t('tenantBulk.apply'), { className: 'primary' });
  apply.disabled = true;
  let validated = null;

  const selectedDocument = async (selected) => {
    if (!selected || selected.size > MAX_BYTES) throw new TypeError('TENANT_BULK_FILE_INVALID');
    return parseCsv(await selected.text(), type.value);
  };

  const template = button(t('tenantBulk.template'), { className: 'secondary' });
  let templatePending = false;
  template.addEventListener('click', async () => {
    if (templatePending || !lifecycleCurrent()) return;
    templatePending = true;
    template.disabled = true;
    const selectedType = type.value;
    try {
      const value = await adapter.loadBulkTemplate(selectedType);
      if (!lifecycleCurrent()) return;
      downloadCsv(value, `${selectedType}-template.csv`);
    } catch {
      if (!lifecycleCurrent()) return;
      status.textContent = t('tenantBulk.downloadFailed');
      announce(status.textContent, { assertive: true });
    } finally {
      templatePending = false;
      if (lifecycleCurrent()) template.disabled = false;
    }
  });
  const exportButton = button(t('tenantBulk.export'), { className: 'secondary' });
  let exportPending = false;
  exportButton.addEventListener('click', async () => {
    if (exportPending || !lifecycleCurrent()) return;
    exportPending = true;
    exportButton.disabled = true;
    const selectedType = type.value;
    try {
      const value = await adapter.exportBulk(selectedType);
      if (!lifecycleCurrent()) return;
      downloadCsv(value.document, `${selectedType}-revision-${value.revision}.csv`);
    } catch {
      if (!lifecycleCurrent()) return;
      status.textContent = t('tenantBulk.downloadFailed');
      announce(status.textContent, { assertive: true });
    } finally {
      exportPending = false;
      if (lifecycleCurrent()) exportButton.disabled = false;
    }
  });
  const validate = button(t('tenantBulk.validate'), { className: 'secondary' });
  let validationGeneration = 0;
  let applyPending = false;

  const invalidateValidation = () => {
    validationGeneration += 1;
    validated = null;
    apply.disabled = true;
    errors.replaceChildren();
    status.textContent = '';
  };

  validate.addEventListener('click', async () => {
    if (applyPending || !lifecycleCurrent()) return;
    const selectedType = type.value;
    const selectedFile = file.files?.[0];
    const currentGeneration = validationGeneration + 1;
    validationGeneration = currentGeneration;
    validated = null;
    apply.disabled = true;
    errors.replaceChildren();
    try {
      const documentValue = await selectedDocument(selectedFile);
      const result = await adapter.validateBulk(selectedType, documentValue);
      if (
        validationGeneration !== currentGeneration
        || type.value !== selectedType
        || file.files?.[0] !== selectedFile
        || !lifecycleCurrent()
      ) return;
      validated = result.receipt ? {
        type: selectedType,
        file: selectedFile,
        document: documentValue,
        receiptId: result.receipt.id,
      } : null;
      result.errors.forEach((entry) => errors.appendChild(el('li', {
        text: t('tenantBulk.error', { row: entry.row === null ? '-' : entry.row + 1, code: entry.code }),
      })));
      apply.disabled = !result.valid || !result.changed || !validated;
      status.textContent = result.valid
        ? t(result.changed ? 'tenantBulk.validChanged' : 'tenantBulk.validUnchanged')
        : t('tenantBulk.invalid');
      announce(status.textContent, { assertive: !result.valid });
    } catch {
      if (
        validationGeneration !== currentGeneration
        || type.value !== selectedType
        || file.files?.[0] !== selectedFile
        || !lifecycleCurrent()
      ) return;
      validated = null;
      status.textContent = t('tenantBulk.fileInvalid');
      announce(status.textContent, { assertive: true });
    }
  });
  apply.addEventListener('click', async () => {
    const candidate = validated;
    if (
      applyPending
      || !candidate
      || candidate.type !== type.value
      || candidate.file !== file.files?.[0]
      || !lifecycleCurrent()
    ) return;
    applyPending = true;
    apply.disabled = true;
    validate.disabled = true;
    try {
      await adapter.applyBulk(candidate.type, candidate.document, candidate.receiptId);
      if (validated === candidate) validated = null;
      if (!lifecycleCurrent()) return;
      announce(t('tenantBulk.applied'));
      rerender();
    } catch {
      if (!lifecycleCurrent()) return;
      status.textContent = t('tenantBulk.applyFailed');
      announce(status.textContent, { assertive: true });
    } finally {
      applyPending = false;
      if (!lifecycleCurrent()) return;
      validate.disabled = false;
      apply.disabled = !(
        validated === candidate
        && candidate.type === type.value
        && candidate.file === file.files?.[0]
      );
    }
  });
  type.addEventListener('change', invalidateValidation);
  file.addEventListener('change', invalidateValidation);

  panel = el('section', { className: 'card', dataset: { tenantBulkTransfer: 'true' } }, [
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
  return panel;
}
