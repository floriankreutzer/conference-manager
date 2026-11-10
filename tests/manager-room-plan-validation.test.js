import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { adjacentRoomPlanDate, roomPlanProjection, roomPlanTimeline, siteLocalIsoDate } from '../src/manager/server-room-plan.js';
import { PRODUCTION_APPLICATION_MESSAGES } from '../src/core/i18n-production-application-messages.js';

const MANAGER_SOURCE = new URL('../src/manager/server-analytics-view.js', import.meta.url);

test('CO-311: adjacent planning dates follow calendar days across leap, month and year boundaries', () => {
  for (const [date, next] of [
    ['2028-02-28', '2028-02-29'], ['2028-02-29', '2028-03-01'],
    ['2027-02-28', '2027-03-01'], ['2000-02-28', '2000-02-29'],
    ['2100-02-28', '2100-03-01'], ['2027-12-31', '2028-01-01'],
    ['2026-03-28', '2026-03-29'], ['2026-03-29', '2026-03-30'],
    ['2026-10-24', '2026-10-25'], ['2026-10-25', '2026-10-26'],
  ]) {
    assert.equal(adjacentRoomPlanDate(date, 1), next);
    assert.equal(adjacentRoomPlanDate(next, -1), date);
  }
});

test('CO-311: date navigation rejects malformed, impossible and out-of-range dates instead of normalizing them', () => {
  for (const date of ['', null, '2027-02-29', '2028-02-30', '2028-13-01', '2028-00-01',
    '2028-01-00', '2028-2-29', '2028-02-29T00:00:00Z', ' 2028-02-29', '0099-12-31']) {
    assert.throws(() => adjacentRoomPlanDate(date, 1), /ROOM_PLAN_DATE_INVALID/);
  }
  assert.throws(() => adjacentRoomPlanDate('9999-12-31', 1), /ROOM_PLAN_DATE_INVALID/);
  assert.throws(() => adjacentRoomPlanDate('0100-01-01', -1), /ROOM_PLAN_DATE_INVALID/);
  for (const direction of [0, 2, -2, 0.5, '1', null]) {
    assert.throws(() => adjacentRoomPlanDate('2028-02-29', direction), /ROOM_PLAN_DATE_INVALID/);
  }
});

test('CO-311: today derives from the selected Site even when its local date differs from UTC', () => {
  const now = Date.parse('2028-02-29T23:30:00.000Z');
  assert.equal(siteLocalIsoDate(now, 'Europe/Berlin'), '2028-03-01');
  assert.equal(siteLocalIsoDate(now, 'America/New_York'), '2028-02-29');
  assert.equal(siteLocalIsoDate(now, 'Pacific/Kiritimati'), '2028-03-01');
});

test('CO-311: full-day timelines retain real 23/25-hour extents and adjacent local midnight boundaries', () => {
  const timeZone = 'Europe/Berlin';
  for (const [date, hours] of [['2026-03-29', 23], ['2026-10-25', 25]]) {
    const current = roomPlanTimeline({ date, timeZone });
    const previous = roomPlanTimeline({ date: adjacentRoomPlanDate(date, -1), timeZone });
    const next = roomPlanTimeline({ date: adjacentRoomPlanDate(date, 1), timeZone });
    assert.equal((current.end - current.start) / 3_600_000, hours);
    assert.equal(previous.end, current.start);
    assert.equal(current.end, next.start);
    assert.equal(current.ticks.length, 5);
    assert.equal(current.ticks[0], current.start);
    assert.equal(current.ticks.at(-1), current.end);
    assert.ok(current.ticks.every((value, index, all) => index === 0 || value > all[index - 1]));
  }
});

test('CO-311: the bounded working window uses hourly ticks without inventing nonexistent or ambiguous wall times', () => {
  for (const date of ['2026-03-29', '2026-10-25']) {
    const result = roomPlanTimeline({ date, timeZone: 'Europe/Berlin', timeWindow: 'WORK' });
    assert.equal((result.end - result.start) / 3_600_000, 10);
    assert.deepEqual(result.ticks, Array.from({ length: 11 }, (_, index) => result.start + index * 3_600_000));
  }
  const skippedNoon = roomPlanTimeline({ date: '2000-01-15', timeZone: 'Africa/Khartoum', timeWindow: 'WORK' });
  const hour = (value) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Khartoum', hour: '2-digit', hourCycle: 'h23' }).format(value);
  assert.deepEqual(skippedNoon.ticks.map(hour), ['08', '09', '10', '11', '13', '14', '15', '16', '17', '18']);
  const repeatedDay = roomPlanTimeline({ date: '1969-09-30', timeZone: 'Pacific/Kwajalein' });
  assert.equal((repeatedDay.end - repeatedDay.start) / 3_600_000, 47);
  assert.deepEqual(repeatedDay.ticks, [repeatedDay.start, repeatedDay.end]);
  assert.throws(() => roomPlanTimeline({ date: '1969-09-30', timeZone: 'Pacific/Kwajalein', timeWindow: 'WORK' }), /ROOM_PLAN_DATE_INVALID/);
  assert.throws(() => roomPlanTimeline({ date: '2011-12-30', timeZone: 'Pacific/Apia' }), /ROOM_PLAN_DATE_INVALID/);
  assert.throws(() => roomPlanTimeline({ date: '2028-02-29', timeZone: 'invalid' }), /ROOM_PLAN_DATE_INVALID/);
  assert.throws(() => roomPlanTimeline({ date: '2028-02-29', timeZone: 'Europe/Berlin', timeWindow: 'OTHER' }), /ROOM_PLAN_WINDOW_INVALID/);
});

test('CO-311: day navigation preserves overlap, Site scope and exclusion of Rejected/Cancelled requests', () => {
  const catalog = { sites: [{ id: 'berlin', timeZone: 'Europe/Berlin' }],
    rooms: [{ id: 'room-1', siteId: 'berlin', capacity: 12 }] };
  const request = { id: 'overnight', roomId: 'room-1', status: 'Confirmed',
    startsAt: '2026-03-28T22:30:00.000Z', endsAt: '2026-03-29T01:30:00.000Z' };
  const requests = [request, ...['Rejected', 'Cancelled'].map((status) => ({ ...request, id: status, status })),
    { ...request, roomId: 'other-site-room', id: 'other-site' }];
  for (const date of ['2026-03-28', adjacentRoomPlanDate('2026-03-28', 1)]) {
    const result = roomPlanProjection({ catalog, requests, siteId: 'berlin', date });
    assert.equal(result[0].room.capacity, 12);
    assert.deepEqual(result[0].requests, [request]);
  }
});

test('CO-311: day actions, selected-day context and capacity have complete DE/EN translations', () => {
  for (const language of ['de', 'en']) {
    for (const suffix of ['previousDay', 'today', 'nextDay', 'day', 'capacity']) {
      const key = `production.manager.roomPlan.${suffix}`;
      const copy = PRODUCTION_APPLICATION_MESSAGES[language][key];
      assert.equal(typeof copy, 'string');
      assert.ok(copy.length > 0);
    }
    assert.deepEqual(PRODUCTION_APPLICATION_MESSAGES[language]['production.manager.roomPlan.day'].match(/\{\w+\}/g), ['{date}', '{timeZone}']);
    assert.deepEqual(PRODUCTION_APPLICATION_MESSAGES[language]['production.manager.roomPlan.capacity'].match(/\{\w+\}/g), ['{count}']);
  }
});

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

test('MGR-09: Manager room-plan UI fails closed and announces an invalid reference date', async () => {
  const manager = await readFile(MANAGER_SOURCE, 'utf8');

  assert.match(manager, /required: 'required',[\s\S]*'aria-describedby': 'managerRoomPlanError'/);
  assert.match(manager, /managerRoomPlanError[\s\S]*role: 'alert'[\s\S]*'aria-live': 'assertive'/);
  assert.match(manager, /date\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(manager, /error\.textContent = t\('validation\.date'\)/);
  assert.match(manager, /results\.replaceChildren\(\)/);
  assert.match(manager, /caught\?\.message !== 'ROOM_PLAN_DATE_INVALID'/);
  assert.match(manager, /date\.removeAttribute\('aria-invalid'\)/);
  assert.match(manager, /control: date,[\s\S]*required: true/);
});

test('MGR-09 MGR-10: initial dates use the persisted selected Site timezone', async () => {
  const manager = await readFile(MANAGER_SOURCE, 'utf8');

  assert.match(manager, /const initialSite = sites\.find\(\(entry\) => entry\.id === state\.siteId\)/);
  assert.equal((manager.match(/siteLocalIsoDate\(Date\.now\(\), initialSite\.timeZone\)/g) || []).length, 2);
  assert.doesNotMatch(manager, /siteLocalIsoDate\(Date\.now\(\), sites\[0\]\.timeZone\)/);
});
