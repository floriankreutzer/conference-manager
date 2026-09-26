import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterManagerEntries,
  managerCockpitModel,
  reportSiteOptions,
  roomPlanSiteOptions,
  serverReportModel,
  serverReportRange,
} from '../src/manager/server-cockpit-model.js';

const catalog = {
  sites: [{ id: 'berlin', name: 'Berlin', timeZone: 'Europe/Berlin' }, { id: 'ny', name: 'New York', timeZone: 'America/New_York' }],
  rooms: [{ id: 'room-a', siteId: 'berlin', name: 'Spree' }, { id: 'room-b', siteId: 'ny', name: 'Hudson' }],
  services: [{ id: 'service-a', name: 'Video' }],
  cateringPackages: [], cateringItems: [],
};
function request(overrides = {}) {
  return { id: 'request-a', roomId: 'room-a', startsAt: '2026-03-29T00:00:00.000Z', endsAt: '2026-03-29T03:00:00.000Z',
    status: 'Confirmed', internalParticipants: 4, externalParticipants: 2, requesterAttribution: { displayName: 'Requester Alpha' },
    details: { title: 'Board meeting', serviceIds: ['service-a'], catering: { participantCount: 3,
      packageSelection: { packageId: 'retired-package', variantId: 'standard' }, itemQuantities: [{ itemId: 'coffee', quantity: 7 }] } },
    pricing: { room: { id: 'room-a', siteId: 'berlin', name: 'Spree at booking' }, services: [{ service: { id: 'service-a', name: 'Video at booking' } }],
      catering: { packageSelection: { package: { name: 'Breakfast' }, variant: { name: 'Standard' } }, items: [{ item: { id: 'coffee', name: 'Coffee' }, quantity: 7 }] } },
    ...overrides };
}

test('MGR-02 MGR-03: cockpit combines persisted requester, room, status, site and actionable quick filters', () => {
  const first = request({ status: 'Submitted' });
  const second = request({ id: 'request-b', status: 'Confirmed', roomId: 'room-b', pricing: null });
  const cancelled = request({ id: 'request-c', status: 'Cancelled' });
  const model = managerCockpitModel({ requests: [first, second, cancelled], catalog, now: Date.parse('2026-03-29T00:30:00.000Z'), changes: [null, { status: 'pending' }] });
  assert.equal(model.action.length, 2);
  assert.equal(model.today.length, 2);
  assert.equal(model.upcoming.length, 2);
  assert.deepEqual(filterManagerEntries(model.entries, { search: 'REQUESTER alpha', status: 'OPEN', siteId: 'berlin', quick: 'ACTION' }).map((entry) => entry.request.id), ['request-a']);
  assert.equal(filterManagerEntries(model.entries, { search: 'hudson', siteId: 'berlin' }).length, 0);
  assert.equal(filterManagerEntries(model.entries, { search: 'hudson', siteId: 'ny' }).length, 1);
  assert.equal(filterManagerEntries(model.entries, { quick: 'unknown' }).length, 0);
  assert.equal(filterManagerEntries(model.entries).length, 3);
});

test('MGR-02 MGR-04: deactivated-room context keeps site-local summaries without inventing requester identity', () => {
  const value = request({ roomId: 'retired-room', pricing: null, requesterAttribution: null });
  const model = managerCockpitModel({ requests: [value], catalog, roomContexts: [{ room: { id: 'retired-room', siteId: 'ny', name: 'Retired' }, site: catalog.sites[1] }], now: Date.parse('2026-03-29T00:30:00.000Z') });
  assert.equal(model.today.length, 1);
  assert.equal(filterManagerEntries(model.entries, { siteId: 'ny' }).length, 1);
  assert.equal(filterManagerEntries(model.entries, { search: 'Requester Alpha' }).length, 0);
});

test('MGR-10: report periods honor Site DST, calendar quarters, leap years and invalid boundaries', () => {
  const spring = serverReportRange('DAY', '2026-03-29', 'Europe/Berlin');
  assert.equal(spring.fromInclusive, '2026-03-28T23:00:00.000Z');
  assert.equal(spring.toExclusive, '2026-03-29T22:00:00.000Z');
  const autumn = serverReportRange('DAY', '2026-10-25', 'Europe/Berlin');
  assert.equal((Date.parse(autumn.toExclusive) - Date.parse(autumn.fromInclusive)) / 3_600_000, 25);
  assert.deepEqual(serverReportRange('QUARTER', '2026-11-10', 'Europe/Berlin'), {
    fromInclusive: '2026-09-30T22:00:00.000Z', toExclusive: '2026-12-31T23:00:00.000Z', start: '2026-10-01', end: '2026-12-31', timeZone: 'Europe/Berlin',
  });
  assert.equal(serverReportRange('MONTH', '2028-02-20', 'Europe/Berlin').end, '2028-02-29');
  assert.equal(serverReportRange('YEAR', '2026-09-12', 'Europe/Berlin').end, '2026-12-31');
  for (const [type, date, zone] of [['unknown', '2026-01-01', 'UTC'], ['DAY', '2026-02-30', 'UTC'], ['MONTH', '', 'UTC'], ['YEAR', '2026-01-01', 'invalid']]) {
    assert.throws(() => serverReportRange(type, date, zone), /MANAGER_REPORT_PERIOD_INVALID/);
  }
});

test('MGR-10: report shows persisted room/service/catering snapshots and actual elapsed hours across DST', () => {
  const range = serverReportRange('DAY', '2026-03-29', 'Europe/Berlin');
  const model = serverReportModel({ requests: [request(), request({ id: 'pending', status: 'Submitted' }), request({ id: 'cancelled', status: 'Cancelled' }), request({ id: 'other-site', roomId: 'room-b', pricing: null }), request({ id: 'outside', startsAt: range.toExclusive })], catalog, siteId: 'berlin', range });
  assert.equal(model.scoped.length, 3);
  assert.equal(model.confirmed.length, 1);
  assert.equal(model.hours, 3);
  assert.equal(model.participants, 6);
  assert.equal(model.openCount, 1);
  assert.equal(model.cateringBookings, 1);
  assert.equal(model.roomRows[0].name, 'Spree at booking');
  assert.equal(model.serviceRows[0].name, 'Video at booking');
  assert.equal(model.packageRows[0].name, 'Breakfast · Standard');
  assert.equal(model.packageRows[0].participants, 3);
  assert.equal(model.itemRows[0].quantity, 7);
});

test('MGR-10: report keeps the persisted Site when a Room later moves between Sites', () => {
  const movedRoomCatalog = {
    ...catalog,
    rooms: catalog.rooms.map((room) => room.id === 'room-a' ? { ...room, siteId: 'ny', name: 'Spree moved' } : room),
  };
  const berlinRange = serverReportRange('DAY', '2026-03-29', 'Europe/Berlin');
  const berlin = serverReportModel({ requests: [request()], catalog: movedRoomCatalog, siteId: 'berlin', range: berlinRange });
  const newYork = serverReportModel({ requests: [request()], catalog: movedRoomCatalog, siteId: 'ny', range: berlinRange });

  assert.equal(berlin.scoped.length, 1);
  assert.equal(berlin.roomRows[0].name, 'Spree at booking');
  assert.equal(newYork.scoped.length, 0);
  assert.deepEqual(reportSiteOptions(movedRoomCatalog).map(({ id }) => id), ['berlin', 'ny']);
  assert.deepEqual(roomPlanSiteOptions(movedRoomCatalog).map(({ id }) => id), ['ny']);
});

test('MGR-10: empty operational report has no invented utilization or cost allocation totals', () => {
  const model = serverReportModel({ requests: [], catalog, siteId: 'berlin', range: serverReportRange('MONTH', '2026-03-29', 'Europe/Berlin') });
  assert.equal(model.hours, 0); assert.equal(model.participants, 0);
  assert.deepEqual(model.roomRows, []); assert.deepEqual(model.serviceRows, []);
  assert.equal(Object.hasOwn(model, 'utilization'), false); assert.equal(Object.hasOwn(model, 'costAllocation'), false);
});
