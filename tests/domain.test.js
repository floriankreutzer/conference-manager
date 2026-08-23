import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_COST_COMPONENT,
  PARTICIPANT_LIMIT,
  REQUEST_STATUS,
  calculateCosts,
  cloneForRepeat,
  isRoomConflict,
  validateAllocations,
  validateRequest,
  validateRoom,
  validateSchedule,
} from '../src/core/domain.js';

const baseForm = {
  title: 'Workshop', location: 'Berlin', date: '2026-08-24', start: '09:00', end: '12:00',
  internalParticipants: 8, externalParticipants: 2,
};
const rooms = [{ id: 'R1', location: 'Berlin', capacity: 12, active: true, rate: 100 }];

test('progression: valid schedule is accepted', () => {
  assert.equal(validateSchedule(baseForm, '2026-08-22'), null);
});

test('regression: past dates are rejected', () => {
  assert.equal(validateSchedule({ ...baseForm, date: '2026-08-21' }, '2026-08-22')?.key, 'validation.dateFuture');
});

test('regression: end time must be after start time', () => {
  assert.equal(validateSchedule({ ...baseForm, end: '08:59' }, '2026-08-22')?.key, 'validation.end');
});

test('regression: negative participant counts are rejected', () => {
  assert.equal(validateSchedule({ ...baseForm, internalParticipants: -1 }, '2026-08-22')?.key, 'validation.negative');
});

test('progression: participant counts accept the documented upper bound', () => {
  assert.equal(validateSchedule({ ...baseForm, internalParticipants: PARTICIPANT_LIMIT, externalParticipants: 0 }, '2026-08-22'), null);
});

test('regression: fractional participant counts are rejected by the domain', () => {
  const result = validateSchedule({ ...baseForm, internalParticipants: 1.5 }, '2026-08-22');
  assert.deepEqual(result, { step: 1, field: 'internalParticipants', key: 'validation.participantRange' });
});

test('regression: participant counts above the domain maximum are rejected', () => {
  const result = validateSchedule({ ...baseForm, externalParticipants: PARTICIPANT_LIMIT + 1 }, '2026-08-22');
  assert.deepEqual(result, { step: 1, field: 'externalParticipants', key: 'validation.participantRange' });
});

test('regression: non-finite participant counts remain rejected', () => {
  assert.equal(validateSchedule({ ...baseForm, internalParticipants: Number.POSITIVE_INFINITY }, '2026-08-22')?.key, 'validation.negative');
});

test('progression: stale or deactivated room is rejected', () => {
  assert.equal(validateRoom({ roomId: 'R1', form: baseForm, rooms: [{ ...rooms[0], active: false }], requests: [] })?.key, 'validation.roomChanged');
});

test('regression: room capacity changes are revalidated', () => {
  assert.equal(validateRoom({ roomId: 'R1', form: baseForm, rooms: [{ ...rooms[0], capacity: 9 }], requests: [] })?.key, 'validation.roomChanged');
});

test('regression: overlapping active request blocks a room', () => {
  const existing = [{ id: 'CR-1', roomId: 'R1', date: baseForm.date, start: '10:00', end: '11:00', status: REQUEST_STATUS.SUBMITTED }];
  assert.equal(validateRoom({ roomId: 'R1', form: baseForm, rooms, requests: existing })?.key, 'validation.roomBusy');
});

test('progression: editing request excludes its own provisional reservation', () => {
  const existing = [{ id: 'CR-1', roomId: 'R1', date: baseForm.date, start: '09:00', end: '12:00', status: REQUEST_STATUS.CHANGE_REQUESTED }];
  assert.equal(validateRoom({ roomId: 'R1', form: baseForm, rooms, requests: existing, excludeRequestId: 'CR-1' }), null);
});

test('regression: invalid individual allocation percentages are rejected even if total is 100', () => {
  assert.equal(validateAllocations([{ costCenter: 'A', percent: -20 }, { costCenter: 'B', percent: 120 }])?.key, 'validation.percentRange');
});

test('regression: allocation total must equal 100', () => {
  assert.equal(validateAllocations([{ costCenter: 'A', percent: 60 }, { costCenter: 'B', percent: 30 }])?.key, 'validation.alloc');
});

test('progression: final validation combines schedule, room and allocations', () => {
  assert.equal(validateRequest({ roomId: 'R1', form: baseForm, rooms, requests: [], allocations: [{ costCenter: '1000', percent: 100 }], today: '2026-08-22' }), null);
});

test('cost calculation uses dedicated catering participant count', () => {
  const result = calculateCosts({ room: { rate: 100 }, services: [{ id: 'host', price: 90 }], selectedServiceIds: ['host'], cateringPackage: { pricePerPerson: 10 }, cateringParticipants: 5, items: [{ id: 'water', price: 2 }], quantities: { water: 3 } });
  assert.deepEqual(result, { roomCost: 100, serviceCost: 90, cateringCost: 56, total: 246 });
});

test('security regression: invalid and negative monetary components fail safe to zero', () => {
  const result = calculateCosts({
    room: { rate: -10 },
    services: [{ id: 'host', price: Number.POSITIVE_INFINITY }],
    selectedServiceIds: ['host'],
    cateringPackage: { pricePerPerson: Number.NaN },
    cateringParticipants: 4,
    items: [{ id: 'water', price: -2 }],
    quantities: { water: 3 },
  });
  assert.deepEqual(result, { roomCost: 0, serviceCost: 0, cateringCost: 0, total: 0 });
});

test('security regression: oversized prices and quantities fail safe instead of inflating totals', () => {
  const result = calculateCosts({
    room: { rate: MAX_COST_COMPONENT + 1 },
    services: [{ id: 'host', price: MAX_COST_COMPONENT + 1 }],
    selectedServiceIds: ['host'],
    cateringPackage: { pricePerPerson: 10 },
    cateringParticipants: PARTICIPANT_LIMIT + 1,
    items: [{ id: 'water', price: 2 }],
    quantities: { water: PARTICIPANT_LIMIT + 1 },
  });
  assert.deepEqual(result, { roomCost: 0, serviceCost: 0, cateringCost: 0, total: 0 });
});

test('security regression: fractional quantities are not treated as billable counts', () => {
  const result = calculateCosts({
    cateringPackage: { pricePerPerson: 10 },
    cateringParticipants: 1.5,
    items: [{ id: 'water', price: 2 }],
    quantities: { water: 2.5 },
  });
  assert.deepEqual(result, { roomCost: 0, serviceCost: 0, cateringCost: 0, total: 0 });
});

test('repeat of a past request clears schedule and room but preserves business details', () => {
  const result = cloneForRepeat({ title: 'Old event', location: 'Berlin', date: '2026-08-20', start: '09:00', end: '10:00', roomId: 'R1', serviceIds: ['host'], allocations: [{ costCenter: '1000', percent: 100 }] }, '2026-08-22');
  assert.equal(result.date, '');
  assert.equal(result.start, '');
  assert.equal(result.roomId, null);
  assert.deepEqual(result.serviceIds, ['host']);
  assert.equal(result.allocations[0].costCenter, '1000');
});

test('conflict helper ignores rejected and cancelled requests', () => {
  const candidate = { roomId: 'R1', date: '2026-08-24', start: '09:00', end: '12:00' };
  assert.equal(isRoomConflict([{ id: 'x', ...candidate, status: REQUEST_STATUS.REJECTED }], candidate), false);
  assert.equal(isRoomConflict([{ id: 'x', ...candidate, status: REQUEST_STATUS.CANCELLED }], candidate), false);
});
