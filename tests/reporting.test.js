import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportModel, managerOverview, reportRange } from '../src/manager/reporting.js';

const catalog = {
  rooms: [
    { id: 'R1', name: { de: 'Raum 1', en: 'Room 1' }, active: true },
    { id: 'R2', name: { de: 'Raum 2', en: 'Room 2' }, active: true },
  ],
  services: [
    { id: 'S1', name: { de: 'Service 1', en: 'Service 1' }, active: true },
    { id: 'S2', name: { de: 'Service 2', en: 'Service 2' }, active: true },
  ],
  cateringItems: [
    { id: 'coffee', name: { de: 'Kaffee', en: 'Coffee' }, unit: { de: 'Person', en: 'Person' } },
  ],
};

const requests = [
  { id: 'A', date: '2026-08-10', start: '09:00', end: '11:00', roomId: 'R1', status: 'Confirmed', participants: 10, cateringParticipants: 7, serviceIds: ['S1'], packageSelection: { packageId: 'meeting', packageName: 'Meeting', tier: 'Basic' }, quantities: { coffee: 2 } },
  { id: 'B', date: '2026-08-11', start: '12:00', end: '13:30', roomId: 'R1', status: 'Confirmed', internalParticipants: 4, externalParticipants: 2, serviceIds: ['S1', 'S2'], quantities: {} },
  { id: 'C', date: '2026-08-12', start: '14:00', end: '15:00', roomId: 'R2', status: 'Submitted', participants: 5 },
  { id: 'D', date: '2026-08-13', start: '14:00', end: '15:00', roomId: 'R2', status: 'Rejected', participants: 5 },
];

test('reportRange supports day month quarter and year', () => {
  assert.deepEqual(reportRange('DAY', '2026-08-22'), { type: 'DAY', start: '2026-08-22', end: '2026-08-22', days: 1 });
  assert.deepEqual(reportRange('MONTH', '2026-08-22'), { type: 'MONTH', start: '2026-08-01', end: '2026-08-31', days: 31 });
  assert.deepEqual(reportRange('QUARTER', '2026-08-22'), { type: 'QUARTER', start: '2026-07-01', end: '2026-09-30', days: 92 });
  assert.deepEqual(reportRange('YEAR', '2026-08-22'), { type: 'YEAR', start: '2026-01-01', end: '2026-12-31', days: 365 });
});

test('buildReportModel restores detailed room service and catering reporting', () => {
  const range = reportRange('MONTH', '2026-08-22');
  const model = buildReportModel({ requests, catalog, range });
  assert.equal(model.kpis.confirmedBookings, 2);
  assert.equal(model.kpis.participants, 16);
  assert.equal(model.kpis.openRequests, 1);
  assert.equal(model.roomRows.find((room) => room.id === 'R1').bookings, 2);
  assert.equal(model.roomRows.find((room) => room.id === 'R1').hours, 3.5);
  assert.equal(model.serviceRows.find((service) => service.id === 'S1').bookings, 2);
  assert.equal(model.packageRows[0].bookings, 1);
  assert.equal(model.packageRows[0].participants, 7);
  assert.equal(model.itemRows[0].quantity, 2);
  assert.equal(model.kpis.cateringParticipants, 7);
});

test('managerOverview restores manager action and date filters', () => {
  const overview = managerOverview(requests, '2026-08-10');
  assert.equal(overview.action.length, 1);
  assert.equal(overview.today.length, 1);
  assert.equal(overview.nextSevenDays.length, 3);
  assert.equal(overview.upcoming.length, 3);
});
