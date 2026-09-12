import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = { documentElement: {} };

const {
  initialServerRequestCalendarMonth,
  projectServerRequestCalendar,
  shiftServerRequestCalendarMonth,
} = await import('../src/employee/server-request-calendar.js');

function request(overrides = {}) {
  return Object.freeze({
    id: 'request-1',
    roomId: 'room-a',
    status: 'Confirmed',
    startsAt: '2026-09-12T22:30:00.000Z',
    details: Object.freeze({ title: 'Night workshop' }),
    ...overrides,
  });
}

const catalog = Object.freeze({
  sites: Object.freeze([Object.freeze({ id: 'site-a', timeZone: 'Europe/Berlin' })]),
  rooms: Object.freeze([Object.freeze({ id: 'room-a', siteId: 'site-a', name: 'Room A' })]),
});

test('Employee calendar projects server timestamps into the Room local date', () => {
  const projection = projectServerRequestCalendar([request()], catalog);

  assert.equal(projection.entries.length, 1);
  assert.equal(projection.unplaced.length, 0);
  assert.deepEqual(projection.entries[0].wallTime, {
    date: '2026-09-13',
    time: '00:30',
    timestamp: Date.parse('2026-09-12T22:30:00.000Z'),
    timeZone: 'Europe/Berlin',
  });
  assert.equal(initialServerRequestCalendarMonth(projection), '2026-09-01');
});

test('Employee calendar uses an immutable retired-Room context and exposes invalid time safely', () => {
  const retired = request({ id: 'request-retired', roomId: 'room-retired' });
  const invalid = request({ id: 'request-invalid', roomId: 'room-invalid' });
  const roomContexts = [
    Object.freeze({
      room: Object.freeze({ id: 'room-retired', siteId: 'site-retired' }),
      site: Object.freeze({ id: 'site-retired', timeZone: 'America/New_York' }),
    }),
    undefined,
  ];

  const projection = projectServerRequestCalendar([retired, invalid], catalog, roomContexts);

  assert.equal(projection.entries[0].request.id, 'request-retired');
  assert.equal(projection.entries[0].wallTime.date, '2026-09-12');
  assert.deepEqual(projection.unplaced.map(({ request: entry }) => entry.id), ['request-invalid']);
});

test('Employee calendar month navigation is UTC-stable across year boundaries', () => {
  assert.equal(shiftServerRequestCalendarMonth('2026-12-01', 1), '2027-01-01');
  assert.equal(shiftServerRequestCalendarMonth('2026-01-01', -1), '2025-12-01');
  assert.equal(shiftServerRequestCalendarMonth('invalid', 1), null);
  assert.equal(shiftServerRequestCalendarMonth('2026-12-01', 0.5), null);
});
