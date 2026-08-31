import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { roomPlanProjection } from '../src/manager/server-room-plan.js';

const MANAGER_SOURCE = new URL('../src/manager/production-application.js', import.meta.url);

test('room-plan domain rejects a missing reference date', () => {
  assert.throws(() => roomPlanProjection({
    catalog: {
      sites: [{ id: 'berlin', timeZone: 'Europe/Berlin' }],
      rooms: [{ id: 'room-1', siteId: 'berlin' }],
    },
    requests: [],
    siteId: 'berlin',
    date: '',
  }), /ROOM_PLAN_DATE_INVALID/);
});

test('Manager room-plan UI fails closed and announces an invalid reference date', async () => {
  const manager = await readFile(MANAGER_SOURCE, 'utf8');

  assert.match(manager, /required: 'required',[\s\S]*'aria-describedby': dateErrorId/);
  assert.match(manager, /dateError[\s\S]*role: 'alert'[\s\S]*'aria-live': 'assertive'/);
  assert.match(manager, /date\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(manager, /dateError\.textContent = t\('validation\.date'\)/);
  assert.match(manager, /tableRoot\.replaceChildren\(\)/);
  assert.match(manager, /error\.message === 'ROOM_PLAN_DATE_INVALID'/);
  assert.match(manager, /date\.removeAttribute\('aria-invalid'\)/);
  assert.match(manager, /control: date,[\s\S]*required: true/);
});
