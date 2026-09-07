import assert from 'node:assert/strict';
import test from 'node:test';

import {
  managerCanProposeBookingChange,
  managerRequestActions,
} from '../src/manager/production-request-actions.js';
import { productionBookingChangeOverrides } from '../src/shared/production-booking-change.js';

test('Conference Manager cancellation is exposed only for the four eligible workflow states', () => {
  for (const status of ['Submitted', 'In Review', 'Confirmed', 'Change Requested']) {
    assert.equal(managerRequestActions(status).includes('cancel'), true, status);
    assert.equal(Object.isFrozen(managerRequestActions(status)), true);
  }
  for (const status of ['Draft', 'Rejected', 'Cancelled', 'Unknown', null]) {
    assert.deepEqual(managerRequestActions(status), [], status);
  }
});

test('Conference Manager workflow actions preserve existing server-authoritative transitions', () => {
  assert.deepEqual(managerRequestActions('Submitted'), [
    'start_review', 'reject', 'request_change', 'cancel',
  ]);
  assert.deepEqual(managerRequestActions('In Review'), [
    'confirm', 'reject', 'request_change', 'cancel',
  ]);
});

test('confirmed booking change proposals fail closed unless the lookup proves no open change', () => {
  assert.equal(managerCanProposeBookingChange('Confirmed', null), true);
  assert.equal(managerCanProposeBookingChange('Confirmed', undefined), false);
  assert.equal(managerCanProposeBookingChange('Confirmed', { status: 'pending' }), false);
  assert.equal(managerCanProposeBookingChange('In Review', null), false);
});

test('shared booking-change validation derives exact UTC instants and bounded participant counts', () => {
  const catalog = {
    sites: [{ id: 'site-1', timeZone: 'Europe/Berlin' }],
    rooms: [{ id: 'room-1', siteId: 'site-1', active: true }],
  };
  assert.deepEqual(productionBookingChangeOverrides({
    catalog,
    roomId: 'room-1',
    startDate: '2026-09-15',
    endDate: '2026-09-16',
    startTime: '23:30',
    endTime: '01:30',
    internalParticipants: '7',
    externalParticipants: '2',
    now: Date.parse('2026-09-01T00:00:00.000Z'),
  }), {
    roomId: 'room-1',
    startsAt: '2026-09-15T21:30:00.000Z',
    endsAt: '2026-09-15T23:30:00.000Z',
    internalParticipants: 7,
    externalParticipants: 2,
  });
  assert.equal(productionBookingChangeOverrides({
    catalog,
    roomId: 'room-1',
    startDate: '2026-09-15',
    endDate: '2026-09-15',
    startTime: '09:00',
    endTime: '10:00',
    internalParticipants: '501',
    externalParticipants: '0',
    now: Date.parse('2026-09-01T00:00:00.000Z'),
  }), null);
});
