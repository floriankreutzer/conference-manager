import assert from 'node:assert/strict';
import test from 'node:test';
import { cateringMoneyText, cateringQuoteExpiry, cateringQuoteMinorUnits } from '../src/manager/catering-quote-draft.js';

test('supplier quote draft preserves exact aggregate minor units without rounding', () => {
  for (const [value, expected] of [['0',0],['0.01',1],['12.5',1250],['90071992547409.90',9007199254740990]]) {
    assert.equal(cateringQuoteMinorUnits(value), expected);
  }
  for (const value of ['',null,12,'-1','1e3','12,50','1.001','90071992547409.91',' 1','1.']) {
    assert.throws(() => cateringQuoteMinorUnits(value), /INVALID/);
  }
});

test('local quote expiry validates calendar values before standardized UTC conversion', () => {
  const value = '2030-02-28T12:15';
  assert.equal(cateringQuoteExpiry(value), new Date(value).toISOString());
  for (const invalid of ['',null,'2030-02-30T12:15','2030-13-01T12:15','2030-01-01T24:00','2030-01-01T12:15Z']) {
    assert.throws(() => cateringQuoteExpiry(invalid), /INVALID/);
  }
});

test('quote display retains every minor unit at the aggregate boundary in both languages', () => {
  assert.equal(cateringMoneyText({ amountMinor: 9007199254740990, currency: 'EUR' }, 'en-GB'), '€90,071,992,547,409.90');
  assert.equal(cateringMoneyText({ amountMinor: 9007199254740989, currency: 'EUR' }, 'de-DE'), '90.071.992.547.409,89\u00a0€');
});
