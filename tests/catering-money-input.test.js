import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCateringMoneyInput as parse } from '../src/manager/catering-money-input.js';

test('comma/dot decimal input produces exact known minor-unit prices without floating-point rounding',() => {
  for (const value of ['2.50','2,50',' 2.5 ','0002,50']) assert.deepEqual(parse(value,'EUR'),{ amountMinor: 250,currency: 'EUR' });
  assert.deepEqual(parse('0','CHF'),{ amountMinor: 0,currency: 'CHF' });
  assert.deepEqual(parse('0,01','USD'),{ amountMinor: 1,currency: 'USD' });
  assert.equal(Object.isFrozen(parse('1','GBP')),true);
});
test('unknown supplier cost is nullable while an absent selling price never becomes zero',() => {
  assert.equal(parse(' ','EUR',{ nullable: true }),null);
  assert.throws(() => parse(' ','EUR'));
  assert.equal(parse('0','EUR',{ nullable: true }).amountMinor,0);
});
test('unit and aggregate maxima remain distinct, exact and safe',() => {
  assert.equal(parse('10000000.00','EUR').amountMinor,1000000000);
  assert.throws(() => parse('10000000.01','EUR'));
  assert.equal(parse('90071992547409.90','EUR',{ aggregate: true }).amountMinor,9007199254740990);
  assert.throws(() => parse('90071992547409.91','EUR',{ aggregate: true }));
});
test('ambiguous decimals, negative values, non-text shapes, unsafe currencies and forged options fail closed',() => {
  for (const value of ['1e3','-1','+1','1.001','1,000.00','1.000,00','.5','1.','1\u00852',1,null,{}]) {
    assert.throws(() => parse(value,'EUR'));
  }
  assert.throws(() => parse('1','foreign')); assert.throws(() => parse('1','EUR',{ nullable: 'yes' }));
});
