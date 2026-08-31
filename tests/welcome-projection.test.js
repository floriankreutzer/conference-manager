import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatRequestDateTime,
  requestOccursToday,
  requestSiteTimeZone,
} from '../src/platform/welcome-projection.js';

const catalog = Object.freeze({
  sites: Object.freeze([
    Object.freeze({ id: 'berlin', timeZone: 'Europe/Berlin' }),
    Object.freeze({ id: 'new-york', timeZone: 'America/New_York' }),
  ]),
  rooms: Object.freeze([
    Object.freeze({ id: 'room-berlin', siteId: 'berlin' }),
    Object.freeze({ id: 'room-new-york', siteId: 'new-york' }),
  ]),
});

test('Welcome derives request dates from each room Site time zone', () => {
  const now = Date.parse('2026-08-30T22:30:00.000Z');
  const berlin = { roomId: 'room-berlin', startsAt: '2026-08-31T05:00:00.000Z' };
  const newYork = { roomId: 'room-new-york', startsAt: '2026-08-31T05:00:00.000Z' };

  assert.equal(requestSiteTimeZone(catalog, berlin), 'Europe/Berlin');
  assert.equal(requestOccursToday({ catalog, request: berlin, now }), true);
  assert.equal(requestOccursToday({ catalog, request: newYork, now }), false);
  assert.match(formatRequestDateTime({ catalog, request: berlin, locale: 'de-DE' }), /07:00/);
  assert.match(formatRequestDateTime({ catalog, request: newYork, locale: 'en-US' }), /01:00/);
});

test('Welcome does not fall back to the browser time zone without authoritative Site data', () => {
  const request = { roomId: 'missing-room', startsAt: '2026-08-30T23:00:00.000Z' };
  assert.equal(requestSiteTimeZone(catalog, request), null);
  assert.equal(requestOccursToday({ catalog, request, now: Date.parse(request.startsAt) }), false);
  assert.equal(formatRequestDateTime({ catalog, request, locale: 'de-DE' }), '');
});
