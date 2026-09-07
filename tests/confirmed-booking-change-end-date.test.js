import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { productionUtcInstant } from '../src/employee/production-time.js';

const BOOKING_CHANGE_EDITOR_SOURCE = new URL(
  '../src/shared/production-booking-change-editor.js',
  import.meta.url,
);

test('confirmed booking changes preserve a distinct overnight end date', async () => {
  const editor = await readFile(BOOKING_CHANGE_EDITOR_SOURCE, 'utf8');
  const start = editor.indexOf('export function openProductionBookingChangeDialog');
  assert.ok(start >= 0);
  const changeDialog = editor.slice(start);

  assert.match(changeDialog, /const endDate = el\('input', \{ attrs: \{ type: 'date', value: endValue\.date, required: 'required' \} \}\);/);
  assert.match(changeDialog, /changeEndDate-\$\{request\.id\}[\s\S]{0,160}production\.employee\.endDate/);
  assert.match(changeDialog, /endDate: endDate\.value,[\s\S]{0,160}endTime: end\.value/);
  assert.match(changeDialog, /let previousStartDate = date\.value;[\s\S]{0,220}endDate\.value = date\.value/);

  const startsAt = productionUtcInstant('2026-09-15', '23:30', 'Europe/Berlin');
  const endsAt = productionUtcInstant('2026-09-16', '01:30', 'Europe/Berlin');
  assert.equal(startsAt, '2026-09-15T21:30:00.000Z');
  assert.equal(endsAt, '2026-09-15T23:30:00.000Z');
  assert.equal(Date.parse(endsAt) > Date.parse(startsAt), true);
});
