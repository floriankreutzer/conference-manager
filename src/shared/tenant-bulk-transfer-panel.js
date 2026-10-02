import { t } from '../core/i18n.js';
import { announce, button, el } from '../core/ui.js';

const MAX_BYTES = 65_536;
const METHODS = ['loadBulkTemplate', 'exportBulk', 'validateBulk', 'applyBulk'];
const DANGEROUS_CELL = /^[=+\-@]/;
const JSON_CELL_PREFIX = 'json:';

export function supportsBulkTransfer(adapter) {
  return METHODS.every((method) => typeof adapter?.[method] === 'function');
}

function csvEscape(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (DANGEROUS_CELL.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return `${JSON_CELL_PREFIX}${JSON.stringify(value)}`;
  return value;
}

function headersFor(document) {
  const keys = new Set(['id']);
  for (const row of document.rows || []) Object.keys(row).forEach((key) => keys.add(key));
  return ['id', ...[...keys].filter((key) => key !== 'id').sort()];
}

export function tenantBulkDocumentToCsv(document) {
  if (!document || document.schemaVersion !== 1 || typeof document.type !== 'string'
    || !Array.isArray(document.rows)) throw new TypeError('TENANT_BULK_DOCUMENT_INVALID');
  const headers = headersFor(document);
  const lines = [
    `# conference-manager-bulk-v1,type=${document.type}`,
    headers.map(csvEscape).join(','),
    ...document.rows.map((row) => headers.map((header) => csvEscape(cellValue(row[header]))).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

function parseCsvRows(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') {
      row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new TypeError('TENANT_BULK_CSV_INVALID');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

function decodeCell(value) {
  if (value.startsWith(JSON_CELL_PREFIX)) return JSON.parse(value.slice(JSON_CELL_PREFIX.length));
  if (value.startsWith("'") && DANGEROUS_CELL.test(value.slice(1))) return value.slice(1);
  if (value === '') return null;
  if (/^-?\d+$/.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export function tenantBulkCsvToDocument(text, expectedType) {
  if (typeof text !== 'string' || text.length < 1 || text.length > MAX_BYTES) {
    throw new TypeError('TENANT_BULK_CSV_INVALID');
  }
  const rows = parseCsvRows(text);
  const meta = rows.shift()?.[0] || '';
  const match = meta.match(/^# conference-manager-bulk-v1,type=([a-z-]+)$/);
  if (!match || match[1] !== expectedType) throw new TypeError('TENANT_BULK_CSV_INVALID');
  const headers = rows.shift();
  if (!headers?.length || headers[0] !== 'id' || new Set(headers).size !== headers.length
    || headers.some((header) => !/^[A-Za-z][A-Za-z0-9]*$/.test(header))) {
    throw new TypeError('TENANT_BULK_CSV_INVALID');
  }
  const dataRows = rows.filter((entry) => entry.some((cell) => cell !== ''));
  if (dataRows.length > 1_024 || dataRows.some((entry) => entry.length !== headers.length)) {
    throw new TypeError('TENANT_BULK_CSV_INVALID');
  }
  return {
    schemaVersion: 1,
    type: expectedType,
    rows: dataRows.map((entry) => Object.fromEntries(headers.map((header, index) => [
      header, decodeCell(entry[index]),
    ]))),
  };
}

function downloadCsv(document, filename) {
  const blob = new Blob([tenantBulkDocumentToCsv(document)], { type: 'text/csv;charset=utf-8' });
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

export function createBulkTransferPanel({ adapter, types, rerender, isCurrent } = {}) {
  if (!supportsBulkTransfer(adapter) || !Array.isArray(types) || types.length < 1
    || typeof rerender !== 'function' || typeof isCurrent !== 'function') {
    throw new TypeError('TENANT_BULK_PANEL_INVALID');
  }
  let panel = null;
  const lifecycleCurrent = () => isCurrent() && panel?.isConnected !== false
    && document.documentElement?.dataset?.sessionLocked !== 'true';
  const type = el('select');
  types.forEach((value) => type.appendChild(el('option', { value, text: t(`tenantBulk.type.${value}`) })));
  const file = el('input', { type: 'file', attrs: { accept: 'text/csv,.csv' } });
  const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
  const errors = el('ul');
  const apply = button(t('tenantBulk.apply'), { className: 'primary' });
  apply.disabled = true;
  let validated = null;

  const selectedDocument = async (selected, selectedType) => {
    if (!selected || selected.size > MAX_BYTES) throw new TypeError('TENANT_BULK_FILE_INVALID');
    return tenantBulkCsvToDocument(await selected.text(), selectedType);
  };

  const template = button(t('tenantBulk.template'), { className: 'secondary' });
  template.addEventListener('click', async () => {
    if (!lifecycleCurrent()) return;
    template.disabled = true;
    const selectedType = type.value;
    try {
      const value = await adapter.loadBulkTemplate(selectedType);
      if (lifecycleCurrent()) downloadCsv(value, `${selectedType}-template.csv`);
    } catch {
      if (lifecycleCurrent()) status.textContent = t('tenantBulk.downloadFailed');
    } finally { if (lifecycleCurrent()) template.disabled = false; }
  });
  const exportButton = button(t('tenantBulk.export'), { className: 'secondary' });
  exportButton.addEventListener('click', async () => {
    if (!lifecycleCurrent()) return;
    exportButton.disabled = true;
    const selectedType = type.value;
    try {
      const value = await adapter.exportBulk(selectedType);
      if (lifecycleCurrent()) downloadCsv(value.document, `${selectedType}-revision-${value.revision}.csv`);
    } catch {
      if (lifecycleCurrent()) status.textContent = t('tenantBulk.downloadFailed');
    } finally { if (lifecycleCurrent()) exportButton.disabled = false; }
  });
  const validate = button(t('tenantBulk.validate'), { className: 'secondary' });
  let generation = 0, applyPending = false;
  const invalidate = () => {
    generation += 1; validated = null; apply.disabled = true; errors.replaceChildren(); status.textContent = '';
  };
  validate.addEventListener('click', async () => {
    if (applyPending || !lifecycleCurrent()) return;
    const selectedType = type.value, selectedFile = file.files?.[0], current = generation + 1;
    generation = current; validated = null; apply.disabled = true; errors.replaceChildren();
    try {
      const documentValue = await selectedDocument(selectedFile, selectedType);
      const result = await adapter.validateBulk(selectedType, documentValue);
      if (generation !== current || type.value !== selectedType || file.files?.[0] !== selectedFile
        || !lifecycleCurrent()) return;
      validated = result.receipt ? { type: selectedType, file: selectedFile,
        document: documentValue, receiptId: result.receipt.id } : null;
      result.errors.forEach((entry) => errors.appendChild(el('li', {
        text: t('tenantBulk.error', { row: entry.row === null ? '-' : entry.row + 1, code: entry.code }),
      })));
      apply.disabled = !result.valid || !result.changed || !validated;
      status.textContent = result.valid
        ? t(result.changed ? 'tenantBulk.validChanged' : 'tenantBulk.validUnchanged') : t('tenantBulk.invalid');
      announce(status.textContent, { assertive: !result.valid });
    } catch {
      if (generation !== current || !lifecycleCurrent()) return;
      status.textContent = t('tenantBulk.fileInvalid'); announce(status.textContent, { assertive: true });
    }
  });
  apply.addEventListener('click', async () => {
    const candidate = validated;
    if (applyPending || !candidate || candidate.type !== type.value
      || candidate.file !== file.files?.[0] || !lifecycleCurrent()) return;
    applyPending = true; apply.disabled = true; validate.disabled = true;
    try {
      await adapter.applyBulk(candidate.type, candidate.document, candidate.receiptId);
      if (validated === candidate) validated = null;
      if (lifecycleCurrent()) { announce(t('tenantBulk.applied')); rerender(); }
    } catch {
      if (lifecycleCurrent()) { status.textContent = t('tenantBulk.applyFailed'); announce(status.textContent, { assertive: true }); }
    } finally {
      applyPending = false;
      if (lifecycleCurrent()) { validate.disabled = false; apply.disabled = true; }
    }
  });
  type.addEventListener('change', invalidate); file.addEventListener('change', invalidate);
  panel = el('section', { className: 'card', dataset: { tenantBulkTransfer: 'true' } }, [
    el('h3', { text: t('tenantBulk.title') }), el('p', { text: t('tenantBulk.description') }),
    el('div', { className: 'form-grid' }, [
      el('label', {}, [el('span', { text: t('tenantBulk.type') }), type]),
      el('label', {}, [el('span', { text: t('tenantBulk.file') }), file]),
    ]),
    el('div', { className: 'button-row' }, [template, exportButton, validate, apply]), status, errors,
  ]);
  return panel;
}
