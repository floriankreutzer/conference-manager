import assert from 'node:assert/strict';
import test from 'node:test';

import {
  tenantBulkCsvToDocument,
  tenantBulkCsvBytesToDocument,
  tenantBulkDocumentToCsv,
} from '../src/shared/tenant-bulk-csv.js';

test('CSV bulk presentation round-trips bounded nested catalogue values', () => {
  const document = {
    schemaVersion: 1,
    type: 'catering-packages',
    rows: [{
      id: 'coffee-break',
      name: 'Coffee, Break',
      description: null,
      price: { amountMinor: 1250, currency: 'EUR' },
      active: true,
      order: 1,
      siteIds: ['berlin'],
      roomIds: [],
      itemIds: ['coffee'],
      variants: [{ id: 'standard', name: 'Standard' }],
    }],
  };
  const csv = tenantBulkDocumentToCsv(document);
  assert.match(csv, /^"id","name","description","price","active","order","siteIds","roomIds","itemIds","variants"\r\n/);
  assert.deepEqual(tenantBulkCsvToDocument(csv, 'catering-packages'), document);
});

test('CSV export neutralizes spreadsheet formulas without changing re-import meaning', () => {
  const document = {
    schemaVersion: 1, type: 'services',
    rows: [{ id: 'service-1', name: '=HYPERLINK("bad")', description: null,
      price: { amountMinor: 0, currency: 'EUR' }, active: true, order: 1, siteIds: [], roomIds: [] }],
  };
  const csv = tenantBulkDocumentToCsv(document);
  assert.match(csv, /'=HYPERLINK/);
  assert.deepEqual(tenantBulkCsvToDocument(csv, 'services'), document);
});

test('CSV import rejects duplicate headers and excessive rows', () => {
  assert.throws(() => tenantBulkCsvToDocument(
    '"id","id"\r\n"a","b"\r\n', 'services',
  ), /TENANT_BULK_CSV_INVALID/);
  const rows = Array.from({ length: 1025 }, (_, index) => `s-${index},Name`).join('\r\n');
  assert.throws(() => tenantBulkCsvToDocument(
    `"id","name"\r\n${rows}\r\n`, 'services',
  ), /TENANT_BULK_CSV_INVALID/);
});

for (const invalid of ['id,name\r\na,ab"cd\r\n', 'id,name\r\na,"b"trailing\r\n',
  'id,name\r\na,"unterminated', 'id,name\r\na,b\0c']) {
  test(`CSV rejects ambiguous quoting/control syntax ${JSON.stringify(invalid)}`, () => {
    assert.throws(() => tenantBulkCsvToDocument(invalid, 'services'), /TENANT_BULK_CSV_INVALID/);
  });
}

test('CSV handles literal quotes, embedded newlines, commas, UTF-8 BOM and empty final cells', () => {
  assert.deepEqual(tenantBulkCsvToDocument('\uFEFFid,name,description\r\na,"Hello, ""world""",\r\nb,"line1\nline2",\r\n', 'services').rows,
    [{ id: 'a', name: 'Hello, "world"', description: null }, { id: 'b', name: 'line1\nline2', description: null }]);
});

test('CSV enforces byte limits rather than JavaScript character counts and fatal UTF-8', () => {
  assert.throws(() => tenantBulkCsvToDocument('id,name\r\na,' + 'ä'.repeat(33000), 'services'), /TENANT_BULK_CSV_INVALID/);
  assert.throws(() => tenantBulkCsvBytesToDocument(Uint8Array.from([0xc3, 0x28]).buffer, 'services'),
    (error) => error.reason === 'encoding');
  const text = 'id,name\r\na,Größe\r\n';
  assert.deepEqual(tenantBulkCsvBytesToDocument(new TextEncoder().encode(text).buffer, 'equipment'),
    tenantBulkCsvToDocument(text, 'equipment'));
});

test('CSV rejects unknown/duplicate headers, missing/duplicate IDs and bounded field/collection overflow', () => {
  for (const input of ['id,tenantId\r\na,foreign', 'id,name\r\na,b\r\na,c', 'id,name\r\n,name',
    'id,name\r\na,' + 'x'.repeat(16385), 'id,siteIds\r\na,"json:' + JSON.stringify(Array(301).fill('x')).replaceAll('"','""') + '"']) {
    assert.throws(() => tenantBulkCsvToDocument(input, 'services'), /TENANT_BULK_CSV_INVALID/);
  }
});

test('CSV spreadsheet neutralization is reversible for all dangerous prefixes and literal apostrophes', () => {
  for (const name of ['=1+1', '+cmd', '-123', '@SUM(1)', '  =SUM(1)', '\tformula', "'=literal", "'ordinary", "''literal"]) {
    const source = { schemaVersion: 1, type: 'equipment', rows: [{ id: 'a', name }] };
    const csv = tenantBulkDocumentToCsv(source);
    assert.ok(csv.includes('"\''));
    const result = tenantBulkCsvToDocument(csv, 'equipment');
    assert.equal(result.rows[0].name, name);
  }
});
