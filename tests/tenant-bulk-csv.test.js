import assert from 'node:assert/strict';
import test from 'node:test';

import {
  tenantBulkCsvToDocument,
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
