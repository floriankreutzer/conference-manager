const MAX_BYTES = 65_536;
const DANGEROUS_CELL = /^(?:\s*[=+\-@]|[\t\r\n])/u;
const MAX_FIELD_BYTES = 16_384;
const MAX_ROWS = 1_024;
const JSON_CELL_PREFIX = 'json:';
const NUMBER_COLUMNS = new Set(['capacity', 'order']);
const BOOLEAN_COLUMNS = new Set(['active']);
const JSON_COLUMNS = new Set(['address', 'mediaAssetIds', 'price', 'guestPresentation', 'guestPublicValues', 'equipment', 'accessibility', 'serviceIds', 'cateringPackageIds', 'siteIds', 'roomIds', 'itemIds', 'variants']);

function csvEscape(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (text.startsWith("'") || DANGEROUS_CELL.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return `${JSON_CELL_PREFIX}${JSON.stringify(value)}`;
  return String(value);
}
const TYPE_HEADERS = Object.freeze({
  sites: ['id', 'name', 'active', 'timeZone', 'address'],
  rooms: ['id', 'siteId', 'name', 'description', 'capacity', 'active', 'floor', 'equipment', 'accessibility', 'serviceIds', 'cateringPackageIds', 'floorplanAssetId', 'mediaAssetIds'],
  services: ['id', 'name', 'description', 'price', 'active', 'order', 'siteIds', 'roomIds'],
  equipment: ['id', 'name', 'description', 'price', 'active', 'order', 'siteIds', 'roomIds'],
  'cost-centers': ['id', 'code', 'name', 'group', 'active'],
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
    headers.map(csvEscape).join(','),
    ...documentValue.rows.map((row) => headers.map((header) => csvEscape(cellValue(row[header]))).join(',')),
  ].join('\r\n')}\r\n`;
}
export class TenantBulkCsvError extends TypeError {
  constructor(reason, row = 1, column = 1) {
    super('TENANT_BULK_CSV_INVALID');
    this.reason = reason;
    this.row = row;
    this.column = column;
  }
}

function parseCsvRows(text) {
  const rows = [];
  let row = [], cell = '', state = 'start';
  const fail = (reason) => { throw new TenantBulkCsvError(reason, rows.length + 1, row.length + 1); };
  const finishCell = () => {
    if (new TextEncoder().encode(cell).byteLength > MAX_FIELD_BYTES) fail('limit');
    row.push(cell); cell = ''; state = 'start';
  };
  const finishRow = () => {
    finishCell(); rows.push(row); row = [];
    if (rows.length > MAX_ROWS + 1) fail('limit');
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\0') fail('syntax');
    if (state === 'quoted') {
      if (char === '"') {
        if (text[index + 1] === '"') { cell += '"'; index += 1; }
        else state = 'closed';
      } else cell += char;
    } else if (char === ',') finishCell();
    else if (char === '\n' || char === '\r') {
      finishRow();
      if (char === '\r' && text[index + 1] === '\n') index += 1;
    } else if (char === '"' && state === 'start') state = 'quoted';
    else {
      if (char === '"' || state === 'closed') fail('syntax');
      cell += char; state = 'unquoted';
    }
  }
  if (state === 'quoted') fail('syntax');
  if (cell || row.length || state !== 'start') finishRow();
  return rows;
}

function boundedJson(value, depth = 0) {
  if (depth > 8) throw new TenantBulkCsvError('limit');
  if (Array.isArray(value) && value.length > 300) throw new TenantBulkCsvError('limit');
  if (value && typeof value === 'object') {
    if (Object.keys(value).length > 32) throw new TenantBulkCsvError('limit');
    Object.values(value).forEach((entry) => boundedJson(entry, depth + 1));
  }
  return value;
}

export function tenantBulkCsvBytesToDocument(bytes, expectedType) {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 1 || bytes.byteLength > MAX_BYTES) {
    throw new TenantBulkCsvError('limit');
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new TenantBulkCsvError('encoding'); }
  return tenantBulkCsvToDocument(text, expectedType);
}
function decodeCell(value, header) {
  if (JSON_COLUMNS.has(header) && value.startsWith(JSON_CELL_PREFIX)) {
    const decoded = boundedJson(JSON.parse(value.slice(JSON_CELL_PREFIX.length)));
    const arrayLimit = header === 'variants' ? 20 : header === 'itemIds' ? 300 : 200;
    if (Array.isArray(decoded) && decoded.length > arrayLimit) throw new TenantBulkCsvError('limit');
    return decoded;
  }
  if (value.startsWith("'") && (value.slice(1).startsWith("'") || DANGEROUS_CELL.test(value.slice(1)))) return value.slice(1);
  if (value === '') return null;
  if (NUMBER_COLUMNS.has(header) && /^-?\d+$/.test(value)) {
    const number = Number(value); if (Number.isSafeInteger(number)) return number;
  }
  if (BOOLEAN_COLUMNS.has(header) && ['true', 'false'].includes(value)) return value === 'true';
  return value;
}
export function tenantBulkCsvToDocument(text, expectedType) {
  if (typeof text !== 'string' || text.length < 1 || text.length > MAX_BYTES || new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new TenantBulkCsvError('limit');
  const rows = parseCsvRows(text.replace(/^\uFEFF/u, ''));
  const headers = rows.shift();
  if (!Object.hasOwn(TYPE_HEADERS, expectedType) || !headers?.length || headers[0] !== 'id' || new Set(headers).size !== headers.length
    || headers.some((header) => !TYPE_HEADERS[expectedType].includes(header))) throw new TenantBulkCsvError('header');
  const dataRows = rows.filter((entry) => entry.some((cell) => cell !== ''));
  if (dataRows.length > 1_024 || dataRows.some((entry) => entry.length !== headers.length)) throw new TenantBulkCsvError('syntax');
  const ids = new Set();
  const parsedRows = dataRows.map((entry, rowIndex) => {
    if (!entry[0] || ids.has(entry[0])) throw new TenantBulkCsvError('identity', rowIndex + 2, 1);
    ids.add(entry[0]);
    return Object.fromEntries(headers.map((header, index) => {
      try { return [header, decodeCell(entry[index], header)]; }
      catch { throw new TenantBulkCsvError('value', rowIndex + 2, index + 1); }
    }));
  });
  return { schemaVersion: 1, type: expectedType, rows: parsedRows };
}
