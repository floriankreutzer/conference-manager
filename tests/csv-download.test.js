import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadCsvText } from '../src/shared/csv-download.js';

test('CSV download accepts only bounded serialized content and safe filenames before allocating a URL', () => {
  for (const [csv, filename] of [['', 'file.csv'], [{}, 'file.csv'], ['界'.repeat(700000), 'file.csv'],
    ['"header"\r\n', '../file.csv'], ['"header"\r\n', 'https://synthetic.invalid/file.csv'],
    ['"header"\r\n', 'file.csv.html'], ['"header"\r\n', 'file\0.csv']]) {
    assert.throws(() => downloadCsvText(csv, filename), /CSV_DOWNLOAD_INVALID/);
  }
});

test('CSV download revokes its exact temporary URL and removes the anchor even if activation fails', { timeout: 1000 }, async () => {
  const previousDocument = globalThis.document;
  const previousCreate = URL.createObjectURL; const previousRevoke = URL.revokeObjectURL;
  try {
    for (const fail of [false,true]) {
      let bytes; let clicked = 0; let removed = 0; let appended = 0; let release;
      const revoked = new Promise((resolve) => { release = resolve; });
      const anchor = { remove() { removed++; }, click() { clicked++; if (fail) throw new Error('SYNTHETIC_DOWNLOAD_FAILURE'); } };
      globalThis.document = { createElement(tag) { assert.equal(tag, 'a'); return anchor; },
        body: { appendChild(element) { assert.equal(element, anchor); appended++; } } };
      URL.createObjectURL = (blob) => { bytes = blob; return 'blob:synthetic-download'; };
      URL.revokeObjectURL = (value) => { assert.equal(value, 'blob:synthetic-download'); release(); };
      const csv = '"header"\r\n"safe"\r\n';
      if (fail) assert.throws(() => downloadCsvText(csv, 'order-v1.csv'), /SYNTHETIC_DOWNLOAD_FAILURE/);
      else downloadCsvText(csv, 'order-v1.csv');
      await revoked;
      assert.equal(await bytes.text(), csv); assert.equal(bytes.type, 'text/csv;charset=utf-8');
      assert.equal(anchor.href, 'blob:synthetic-download'); assert.equal(anchor.download, 'order-v1.csv');
      assert.equal(anchor.hidden, true); assert.equal(clicked, 1); assert.equal(removed, 1); assert.equal(appended, 1);
    }
  } finally { globalThis.document = previousDocument; URL.createObjectURL = previousCreate; URL.revokeObjectURL = previousRevoke; }
});
