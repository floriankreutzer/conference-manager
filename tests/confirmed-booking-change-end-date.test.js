import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { productionUtcInstant } from '../src/employee/production-time.js';

const EMPLOYEE_SOURCE = new URL('../src/employee/production-application.js', import.meta.url);

test('confirmed booking changes preserve a distinct overnight end date', async () => {
  const employee = await readFile(EMPLOYEE_SOURCE, 'utf8');
  const start = employee.indexOf('function changeDialog');
  const end = employee.indexOf('async function loadCatalog', start);
  assert.ok(start >= 0 && end > start);
  const changeDialog = employee.slice(start, end);

  assert.match(changeDialog, /const endDate = el\('input', \{ attrs: \{ type: 'date', value: endValue\.date \} \}\);/);
  assert.match(changeDialog, /changeEndDate-\$\{request\.id\}[\s\S]{0,160}production\.employee\.endDate/);
  assert.match(changeDialog, /productionUtcInstant\(endDate\.value, end\.value, targetTimeZone\)/);
  assert.match(changeDialog, /let previousStartDate = date\.value;[\s\S]{0,220}endDate\.value = date\.value/);

  const startsAt = productionUtcInstant('2026-09-15', '23:30', 'Europe/Berlin');
  const endsAt = productionUtcInstant('2026-09-16', '01:30', 'Europe/Berlin');
  assert.equal(startsAt, '2026-09-15T21:30:00.000Z');
  assert.equal(endsAt, '2026-09-15T23:30:00.000Z');
  assert.equal(Date.parse(endsAt) > Date.parse(startsAt), true);
});
