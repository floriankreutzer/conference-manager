import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCosts,
  cloneForRepeat,
  isRoomConflict,
  requestTimeline,
  totalParticipants,
  validateAllocations,
  validateRoom,
  validateSchedule,
} from '../src/core/domain.js';

const VALID_FORM = Object.freeze({
  title: 'Security test',
  location: 'Berlin',
  date: '2099-01-15',
  start: '09:00',
  end: '10:00',
  internalParticipants: 1,
  externalParticipants: 0,
});

const MANIPULATED_VALUES = Object.freeze([
  null,
  undefined,
  false,
  true,
  0,
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  '',
  '   ',
  '<script>alert(1)</script>',
  'javascript:alert(1)',
  [],
  [null, {}, '<svg/onload=alert(1)>'],
  {},
  { __proto__: { polluted: true } },
]);

test('domain entry points do not crash on manipulated scalar and collection input', () => {
  for (const value of MANIPULATED_VALUES) {
    assert.doesNotThrow(() => totalParticipants(value));
    assert.doesNotThrow(() => validateSchedule(value));
    assert.doesNotThrow(() => validateAllocations(value));
    assert.doesNotThrow(() => requestTimeline(value));
    assert.doesNotThrow(() => cloneForRepeat(value));
    assert.doesNotThrow(() => isRoomConflict(value, value));
    assert.doesNotThrow(() => calculateCosts(value));
  }
});

test('null allocation entries fail validation instead of throwing', () => {
  assert.deepEqual(validateAllocations([null]), {
    step: 5,
    field: 'allocation-cost-center-0',
    key: 'validation.centers',
  });
});

test('malformed room and request collections fail closed', () => {
  const result = validateRoom({
    roomId: 'ROOM-1',
    form: VALID_FORM,
    rooms: [null, false, { id: 'ROOM-1', location: 'Berlin', capacity: 10, active: true }],
    requests: [null, false, { roomId: 'ROOM-1', date: '2099-01-15', start: '09:30', end: '10:30', status: 'Submitted' }],
  });
  assert.deepEqual(result, { step: 2, field: 'rooms', key: 'validation.roomBusy' });
});

test('malformed history entries are ignored without prototype side effects', () => {
  const timeline = requestTimeline({
    createdAt: '2099-01-01T10:00:00.000Z',
    statusHistory: [null, false, { status: 'Confirmed', at: '2099-01-02T10:00:00.000Z', note: '' }],
  });
  assert.equal(timeline.length, 2);
  assert.equal({}.polluted, undefined);
});

test('cost calculation treats malformed optional collections as empty', () => {
  assert.deepEqual(calculateCosts({
    room: null,
    services: null,
    selectedServiceIds: null,
    cateringPackage: null,
    items: [null, false],
    quantities: null,
  }), {
    roomCost: 0,
    serviceCost: 0,
    cateringCost: 0,
    total: 0,
  });
});
