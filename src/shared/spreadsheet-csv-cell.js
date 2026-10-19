const FORMULA_PREFIX = /^(?:\s*[=+\-@]|[\t\r\n])/u;

export function csvCellNeedsPrefix(text) {
  return typeof text === 'string' && (text.startsWith("'") || FORMULA_PREFIX.test(text));
}

// Spreadsheet safety is independent of RFC-style quoting: quoted cells can still
// execute formulas. Use the same prefix/quote rule for every exported text cell.
export function spreadsheetSafeCsvCell(value) {
  if (value !== null && value !== undefined && !['string','number','boolean'].includes(typeof value)) {
    throw new TypeError('CSV_CELL_INVALID');
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('CSV_CELL_INVALID');
  let text = value === null || value === undefined ? '' : String(value);
  if (csvCellNeedsPrefix(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
