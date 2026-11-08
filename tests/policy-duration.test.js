import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DURATION_FACTORS, durationMinutes, initialDurationUnit } from '../src/tenant-admin/sections/booking-policies/duration.js';

test('policy durations preserve 366 days and every allowed minute across unit round trips', () => {
  assert.equal(initialDurationUnit(527040), 'days');
  assert.equal(durationMinutes('366', 'days', 1, 1054080), 527040);
  for (let minutes = 0; minutes <= 1054080; minutes += 1) {
    for (const [unit, factor] of Object.entries(DURATION_FACTORS)) {
      assert.equal(durationMinutes(String(minutes / factor), unit, 0, 1054080), minutes);
    }
  }
});

test('policy durations reject partial minutes, unknown units, non-finite and out-of-range values', () => {
  for (const [value, unit] of [['', 'days'], ['0.001', 'days'], ['0.1', 'minutes'], ['Infinity', 'hours'],
    ['NaN', 'hours'], ['-1', 'minutes'], ['732.1', 'days'], ['1', 'weeks'], ['1', '__proto__']]) {
    assert.throws(() => durationMinutes(value, unit, 0, 1054080), /POLICY_DURATION_INVALID/);
  }
  assert.equal(initialDurationUnit(61), 'minutes');
  assert.equal(initialDurationUnit(120), 'hours');
  assert.throws(() => durationMinutes('0', 'minutes', 1, 1054080));
});
