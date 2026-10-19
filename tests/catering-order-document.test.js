import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createCateringOrderDocument, cateringOrderDocumentCsv,
  requireCurrentCateringDocumentSource } from '../src/manager/catering-order-document.js';
import { csvCellNeedsPrefix, spreadsheetSafeCsvCell } from '../src/shared/spreadsheet-csv-cell.js';

const source = JSON.parse(await readFile(new URL('./fixtures/catering-order.json', import.meta.url), 'utf8'));
const options = { orderId: source.order.orderId, generatedAt: new Date('2026-10-19T13:00:00.000Z'), notice: 'Export is not transmission.' };
function approved() {
  const value = structuredClone(source);
  value.state = { ...value.state, revision: 3, status: 'released' };
  value.quote = { revision: 1, cost: { amountMinor: 9007199254740989, currency: 'EUR' },
    expiresAt: '2030-01-01T12:00:00.000Z', expired: false };
  value.decision = { sequence: 1, decision: 'approved', quoteRevision: 1, cost: { ...value.quote.cost } };
  return value;
}
function rows(csv) {
  const result = []; let row = [];
  for (const entry of csv.matchAll(/"((?:[^"\r\n]|"")*)"(,|\r\n)/gu)) {
    row.push(entry[1].replaceAll('""', '"'));
    if (entry[2] === '\r\n') { result.push(row); row = []; }
  }
  const [headers, ...records] = result;
  return records.map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index]])));
}

test('manual document projects only supplier delivery context and preserves descriptive package contents without selling prices', () => {
  const value = approved(); const document = createCateringOrderDocument(value, options);
  assert.equal(document.orderId, value.order.orderId); assert.equal(document.generatedAt, options.generatedAt.toISOString());
  assert.equal(document.quote.cost.amountMinor, 9007199254740989); assert.equal(document.quote.approved, true);
  assert.equal(document.positions.length, value.order.positions.length);
  assert.equal(document.positions[0].components.length, 2);
  assert.equal(Object.isFrozen(document.positions[0].components[0]), true);
  assert.equal(Object.isFrozen(document.positions), true);
  assert.equal(document.positions[0].components[0].price, undefined);
  assert.doesNotMatch(JSON.stringify(document), /conferencePrice|unitPrice|conferenceLineTotalMinor|requester|allocations|tenantId/);
  value.order.title = 'changed'; assert.notEqual(document.title, value.order.title);
  const unknown = createCateringOrderDocument(source, options); assert.equal(unknown.quote, null);
  assert.equal(unknown.status, 'pending_quote');
});

test('CSV carries the exact supplier total once with stable UTC fields and no inferred per-position supplier charges', () => {
  const value = approved(); const csv = cateringOrderDocumentCsv(value, options); const records = rows(csv);
  assert.equal(records.length, value.order.positions.length + 1);
  assert.equal(records[0].record_kind, 'summary'); assert.equal(records[0].quoted_supplier_total_minor, '9007199254740989');
  assert.equal(records[0].cost_approved, 'true'); assert.equal(records[0].generated_at_utc, options.generatedAt.toISOString());
  assert.equal(records[0].notice, options.notice);
  for (const position of records.slice(1)) {
    assert.equal(position.record_kind, 'position'); assert.equal(position.quoted_supplier_total_minor, '');
    assert.equal(position.order_id, value.order.orderId); assert.equal(position.order_version, '1');
    assert.ok(Number(position.quantity) > 0);
  }
  assert.equal(JSON.parse(records[1].components_json).length, 2);
  assert.doesNotMatch(csv, /conferencePrice|unitPrice|lineTotalMinor|requester|allocations/);
  const draft = rows(cateringOrderDocumentCsv(source, options));
  assert.equal(draft[0].quoted_supplier_total_minor, ''); assert.equal(draft[0].cost_approved, 'false');
});

test('every CSV text cell uses the shared spreadsheet formula and quote escaping contract', () => {
  for (const text of ['=1+1','+SUM(A1:A2)','-2+3','@SUM(A1:A2)','  =cmd()', '\tformula', '\rformula', '\nformula', "'literal"]) {
    assert.equal(csvCellNeedsPrefix(text), true);
    assert.equal(spreadsheetSafeCsvCell(text), `"'${text.replaceAll('"', '""')}"`);
  }
  assert.equal(spreadsheetSafeCsvCell('plain,"quoted"'), '"plain,""quoted"""');
  for (const value of [{},[],Symbol('unsafe'),() => {},NaN,Infinity]) assert.throws(() => spreadsheetSafeCsvCell(value), /CSV_CELL_INVALID/);
  const value = approved(); value.order.title = '=HYPERLINK("https://synthetic.invalid")';
  value.order.positions[0].name = '@formula'; value.order.positions[0].description = '  +formula';
  const records = rows(cateringOrderDocumentCsv(value, options));
  assert.equal(records[0].conference_title, `'${value.order.title}`);
  assert.equal(records[1].position_name, "'@formula"); assert.equal(records[1].description, "'  +formula");
});

test('document source preflight rejects any changed displayed version, quote, decision or factual state', () => {
  const displayed = approved();
  assert.deepEqual(requireCurrentCateringDocumentSource(displayed, structuredClone(displayed), options.orderId), displayed);
  for (const mutate of [
    (v) => { v.order.orderVersion++; }, (v) => { v.state.revision++; }, (v) => { v.state.status = 'queued'; },
    (v) => { v.quote.expired = true; }, (v) => { v.quote.cost.amountMinor--; v.decision.cost.amountMinor--; },
    (v) => { v.decision.sequence++; }, (v) => { v.order.title = 'changed'; },
  ]) {
    const current = structuredClone(displayed); mutate(current);
    assert.throws(() => requireCurrentCateringDocumentSource(displayed, current, options.orderId), /SOURCE_CHANGED/);
  }
  const foreign = structuredClone(displayed); foreign.order.orderId = 'e0000000-0000-4000-8000-000000009999';
  assert.throws(() => requireCurrentCateringDocumentSource(displayed, foreign, options.orderId), /INVALID/);
});

test('manual documents reject private fields, getters and malformed source rather than exporting partial data', () => {
  for (const mutate of [
    (v) => { v.credentials = 'private'; }, (v) => { v.order.tenantId = 'private'; },
    (v) => { v.quote.cost.amountMinor = Number.MAX_SAFE_INTEGER; }, (v) => { v.order.positions = []; },
  ]) {
    const value = approved(); mutate(value);
    assert.throws(() => cateringOrderDocumentCsv(value, options), /INVALID/);
  }
  let reads = 0; const getter = approved();
  Object.defineProperty(getter, 'order', { enumerable: true, get() { reads++; return source.order; } });
  assert.throws(() => createCateringOrderDocument(getter, options), /INVALID/); assert.equal(reads, 0);
  assert.throws(() => createCateringOrderDocument(approved(), { ...options, generatedAt: new Date(NaN) }), /TIME_INVALID/);
  for (const notice of ['', 'x'.repeat(1001), '\0', {}, undefined]) {
    assert.throws(() => cateringOrderDocumentCsv(approved(), { ...options, notice }), /NOTICE_INVALID/);
  }
});
