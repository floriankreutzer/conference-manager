const MAX_BYTES = 65_536;
const DANGEROUS_CELL = /^[=+\-@]/;
const JSON_CELL_PREFIX = 'json:';
const NUMBER_COLUMNS = new Set(['capacity', 'order']);
const BOOLEAN_COLUMNS = new Set(['active']);

function csvEscape(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (DANGEROUS_CELL.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return `${JSON_CELL_PREFIX}${JSON.stringify(value)}`;
  return String(value);
}
const TYPE_HEADERS = Object.freeze({
  rooms: ['id', 'name', 'description', 'capacity', 'active', 'floor', 'equipment', 'accessibility', 'serviceIds', 'cateringPackageIds', 'guestPublicValues'],
  services: ['id', 'name', 'description', 'price', 'active', 'order', 'siteIds', 'roomIds'],
  'catering-items': ['id', 'name', 'description', 'price', 'active', 'order', 'siteIds', 'roomIds'],
  'catering-packages': ['id', 'name', 'description', 'price', 'active', 'order', 'siteIds', 'roomIds', 'itemIds', 'variants'],
});
function headersFor(documentValue) {
  const configured = TYPE_HEADERS[documentValue.type];
  if (configured) return configured;
  const keys = new Set(['id']);
  for (const row of documentValue.rows || []) Object.keys(row).forEach((key) => keys.add(key));
  return ['id', ...[...keys].filter((key) => key !== 'id').sort()];
}
export function tenantBulkDocumentToCsv(documentValue) {
  if (!documentValue || documentValue.schemaVersion !== 1 || typeof documentValue.type !== 'string'
    || !Array.isArray(documentValue.rows)) throw new TypeError('TENANT_BULK_DOCUMENT_INVALID');
  const headers = headersFor(documentValue);
  return `${[
    `# conference-manager-bulk-v1,type=${documentValue.type}`,
    headers.map(csvEscape).join(','),
    ...documentValue.rows.map((row) => headers.map((header) => csvEscape(cellValue(row[header]))).join(',')),
  ].join('\r\n')}\r\n`;
}
function parseCsvRows(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) throw new TypeError('TENANT_BULK_CSV_INVALID');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
function decodeCell(value, header) {
  if (value.startsWith(JSON_CELL_PREFIX)) return JSON.parse(value.slice(JSON_CELL_PREFIX.length));
  if (value.startsWith("'") && DANGEROUS_CELL.test(value.slice(1))) return value.slice(1);
  if (value === '') return null;
  if (NUMBER_COLUMNS.has(header) && /^-?\d+$/.test(value)) {
    const number = Number(value); if (Number.isSafeInteger(number)) return number;
  }
  if (BOOLEAN_COLUMNS.has(header) && ['true', 'false'].includes(value)) return value === 'true';
  return value;
}
export function tenantBulkCsvToDocument(text, expectedType) {
  if (typeof text !== 'string' || text.length < 1 || text.length > MAX_BYTES) throw new TypeError('TENANT_BULK_CSV_INVALID');
  const rows = parseCsvRows(text);
  const match = (rows.shift()?.[0] || '').match(/^# conference-manager-bulk-v1,type=([a-z-]+)$/);
  if (!match || match[1] !== expectedType) throw new TypeError('TENANT_BULK_CSV_INVALID');
  const headers = rows.shift();
  if (!headers?.length || headers[0] !== 'id' || new Set(headers).size !== headers.length
    || headers.some((header) => !/^[A-Za-z][A-Za-z0-9]*$/.test(header))) throw new TypeError('TENANT_BULK_CSV_INVALID');
  const dataRows = rows.filter((entry) => entry.some((cell) => cell !== ''));
  if (dataRows.length > 1_024 || dataRows.some((entry) => entry.length !== headers.length)) throw new TypeError('TENANT_BULK_CSV_INVALID');
  return { schemaVersion: 1, type: expectedType, rows: dataRows.map((entry) => Object.fromEntries(headers
    .map((header, index) => [header, decodeCell(entry[index], header)])
    .filter(([header, value]) => header === 'id' || value !== null))) };
}
