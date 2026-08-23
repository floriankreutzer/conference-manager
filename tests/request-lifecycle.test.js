import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCancelledRequest,
  createResubmittedRequest,
  createSubmittedRequest,
  requestMatchesFilter,
  validateRequestSubmission,
} from '../src/employee/request-lifecycle.js';
import { emptyRequestForm } from '../src/employee/request-session.js';
import { confirmBooking, decideBooking } from '../src/manager/booking-lifecycle.js';

const catalog = {
  rooms: [{ id: 'R1', location: 'Berlin', capacity: 10, rate: 100, active: true }],
  services: [{ id: 'av', price: 20, active: true }],
  cateringPackages: [],
  cateringItems: [],
};

function stateFixture() {
  return {
    step: 6,
    form: {
      ...emptyRequestForm(),
      title: '  Steering  ',
      location: 'Berlin',
      date: '2026-09-10',
      start: '09:00',
      end: '10:00',
      internalParticipants: 4,
      externalParticipants: 1,
      specialRequirements: '  Screen  ',
      dietaryRequirements: '  None  ',
    },
    roomId: 'R1',
    serviceIds: ['av'],
    cateringMode: 'NONE',
    packageSelection: null,
    quantities: {},
    allocations: [{ costCenter: 'CC-1', percent: 100 }],
    editingRequestId: null,
  };
}

test('submission validation uses the baseline schedule, room, conflict and allocation rules', () => {
  const state = stateFixture();
  assert.equal(validateRequestSubmission({
    state,
    catalog,
    requests: [],
    today: '2026-08-23',
  }), null);

  const conflict = [{
    id: 'CR-OLD',
    roomId: 'R1',
    date: '2026-09-10',
    start: '09:30',
    end: '10:30',
    status: 'Confirmed',
  }];
  assert.deepEqual(validateRequestSubmission({
    state,
    catalog,
    requests: conflict,
    today: '2026-08-23',
  }), { step: 2, field: 'rooms', key: 'validation.roomBusy' });
});

test('new submission preserves persisted fields, status and history semantics', () => {
  const state = stateFixture();
  const request = createSubmittedRequest({
    state,
    catalog,
    localized: (value) => value?.en || String(value || ''),
    now: '2026-08-23T20:00:00.000Z',
    id: 'CR-2026-123456',
  });

  assert.equal(request.id, 'CR-2026-123456');
  assert.equal(request.title, 'Steering');
  assert.equal(request.specialRequirements, 'Screen');
  assert.equal(request.dietaryRequirements, 'None');
  assert.equal(request.status, 'Submitted');
  assert.equal(request.calendarStatus, 'Tentative');
  assert.equal(request.createdAt, '2026-08-23T20:00:00.000Z');
  assert.deepEqual(request.statusHistory, [{
    status: 'Submitted',
    calendarStatus: 'Tentative',
    at: '2026-08-23T20:00:00.000Z',
    note: '',
  }]);
});

test('resubmission retains request identity and original data while applying edited request fields', () => {
  const state = stateFixture();
  state.form.title = 'Edited';
  state.editingRequestId = 'CR-1';
  const existing = {
    id: 'CR-1',
    title: 'Original',
    createdAt: '2026-08-01T08:00:00.000Z',
    status: 'Change Requested',
    calendarStatus: 'Tentative',
    statusHistory: [{ status: 'Change Requested', calendarStatus: 'Tentative', at: '2026-08-20T08:00:00.000Z', note: 'Adjust time' }],
  };

  const request = createResubmittedRequest({
    existing,
    state,
    catalog,
    localized: (value) => value?.en || String(value || ''),
    now: '2026-08-23T20:10:00.000Z',
  });

  assert.equal(request.id, 'CR-1');
  assert.equal(request.createdAt, existing.createdAt);
  assert.equal(request.title, 'Edited');
  assert.equal(request.status, 'Submitted');
  assert.equal(request.resubmittedAt, '2026-08-23T20:10:00.000Z');
  assert.equal(request.statusHistory.at(-1).status, 'Submitted');
});

test('cancellation and manager decisions preserve calendar and history transitions', () => {
  const base = {
    id: 'CR-9',
    title: 'Board',
    status: 'Submitted',
    calendarStatus: 'Tentative',
    statusHistory: [],
  };
  const cancelled = createCancelledRequest(base, '2026-08-23T20:20:00.000Z');
  assert.equal(cancelled.status, 'Cancelled');
  assert.equal(cancelled.calendarStatus, 'Released');
  assert.equal(cancelled.cancelledAt, '2026-08-23T20:20:00.000Z');

  const confirmed = confirmBooking(base, '2026-08-23T20:30:00.000Z');
  assert.equal(confirmed.status, 'Confirmed');
  assert.equal(confirmed.calendarStatus, 'Busy');
  assert.equal(confirmed.confirmedAt, '2026-08-23T20:30:00.000Z');

  const changed = decideBooking(base, 'change', ' Move room ', '2026-08-23T20:40:00.000Z');
  assert.equal(changed.status, 'Change Requested');
  assert.equal(changed.changeReason, 'Move room');
  assert.equal(changed.calendarStatus, 'Tentative');

  const rejected = decideBooking(base, 'reject', ' Capacity ', '2026-08-23T20:50:00.000Z');
  assert.equal(rejected.status, 'Rejected');
  assert.equal(rejected.rejectionReason, 'Capacity');
  assert.equal(rejected.calendarStatus, 'Released');
});

test('request list filtering remains baseline-compatible', () => {
  const today = '2026-08-23';
  assert.equal(requestMatchesFilter({ date: '2026-08-24', status: 'Submitted' }, 'ACTIVE', today), true);
  assert.equal(requestMatchesFilter({ date: '2026-08-24', status: 'Cancelled' }, 'ACTIVE', today), false);
  assert.equal(requestMatchesFilter({ date: '2026-08-20', status: 'Confirmed' }, 'PAST', today), true);
  assert.equal(requestMatchesFilter({ date: '2026-08-20', status: 'Cancelled' }, 'ALL', today), true);
});

test('manager decisions reject unsupported actions and empty reasons', () => {
  const base = { id: 'CR-1', status: 'Submitted', statusHistory: [] };
  assert.throws(() => decideBooking(base, 'approve', 'ok'), /Unsupported manager booking action/);
  assert.throws(() => decideBooking(base, 'reject', '   '), /reason is required/);
});
