import assert from 'node:assert/strict';
import test from 'node:test';
import { formatProductionDateTimeInput, productionUtcInstant } from '../src/core/production-time.js';

test('diagnostic input wall times preserve the selected UTC instant across browser zones and seasons', () => {
  for (const [instant, zone, expected] of [
    ['2026-07-01T12:34:00.000Z', 'UTC', '2026-07-01T12:34'],
    ['2026-07-01T12:34:00.000Z', 'Europe/Berlin', '2026-07-01T14:34'],
    ['2026-01-01T12:34:00.000Z', 'Europe/Berlin', '2026-01-01T13:34'],
    ['2026-12-31T23:30:00.000Z', 'Europe/Berlin', '2027-01-01T00:30'],
  ]) {
    const value = formatProductionDateTimeInput(instant, zone);
    assert.equal(value, expected);
    const [date, time] = value.split('T');
    assert.equal(productionUtcInstant(date, time, zone), instant);
  }
});

test('diagnostic input formatting refuses unknown timezones and unusable values', () => {
  for (const [value, zone] of [[null, 'UTC'], ['invalid', 'UTC'], ['2026-07-01T12:34:00.000Z', 'invalid/zone']]) {
    assert.equal(formatProductionDateTimeInput(value, zone), '');
  }
});

test('diagnostic lookup never silently selects a different instant for a DST gap or overlap', () => {
  assert.equal(productionUtcInstant('2026-03-29', '02:30', 'Europe/Berlin'), null);
  assert.equal(productionUtcInstant('2026-10-25', '02:30', 'Europe/Berlin'), null);
  assert.equal(productionUtcInstant('2026-03-29', '03:30', 'Europe/Berlin'), '2026-03-29T01:30:00.000Z');
  assert.equal(productionUtcInstant('2026-10-25', '03:30', 'Europe/Berlin'), '2026-10-25T02:30:00.000Z');
});
