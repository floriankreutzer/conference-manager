import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyChangeRequestToState,
  applyRepeatToState,
  availableRoomModel,
  calculateRequestCostSummary,
  createDraftPayload,
  emptyRequestForm,
  hasMeaningfulDraft,
  restoreDraftState,
} from '../src/employee/request-session.js';

function catalogFixture() {
  return {
    rooms: [
      { id: 'R1', location: 'Berlin', capacity: 8, rate: 100, active: true },
      { id: 'R2', location: 'Berlin', capacity: 12, rate: 150, active: true },
      { id: 'R3', location: 'Berlin', capacity: 20, rate: 200, active: true },
    ],
    services: [{ id: 'av', price: 25, active: true }],
    cateringPackages: [{ id: 'P1', name: { de: 'Paket', en: 'Package' }, variants: [{ tier: 'A', pricePerPerson: 10 }] }],
    cateringItems: [{ id: 'coffee', price: 3, active: true }],
  };
}

function requestState() {
  return {
    view: 'employee',
    step: 4,
    form: {
      ...emptyRequestForm(),
      title: 'Architecture Review',
      location: 'Berlin',
      date: '2026-09-10',
      start: '09:00',
      end: '10:00',
      internalParticipants: 6,
      externalParticipants: 2,
      cateringParticipants: 5,
    },
    roomId: 'R2',
    serviceIds: ['av'],
    cateringMode: 'BOTH',
    packageSelection: { packageId: 'P1', tier: 'A' },
    quantities: { coffee: 2 },
    allocations: [{ costCenter: 'CC-1', percent: 100 }],
    editingRequestId: null,
  };
}

test('draft payload preserves the baseline storage shape and meaningful detection', () => {
  const state = requestState();
  const payload = createDraftPayload(state, '2026-08-23T20:00:00.000Z');

  assert.deepEqual(payload, {
    savedAt: '2026-08-23T20:00:00.000Z',
    form: state.form,
    step: 4,
    roomId: 'R2',
    serviceIds: ['av'],
    cateringMode: 'BOTH',
    packageSelection: { packageId: 'P1', tier: 'A' },
    quantities: { coffee: 2 },
    allocations: [{ costCenter: 'CC-1', percent: 100 }],
  });
  assert.equal(hasMeaningfulDraft(payload), true);

  const emptyPayload = createDraftPayload({
    ...state,
    form: emptyRequestForm(),
    roomId: null,
    serviceIds: [],
    packageSelection: null,
  }, '2026-08-23T20:00:00.000Z');
  assert.equal(hasMeaningfulDraft(emptyPayload), false);
});

test('draft restore clamps the step and retains catalog-compatible quantity defaults', () => {
  const state = requestState();
  restoreDraftState(state, {
    form: { title: 'Restored' },
    step: 99,
    roomId: 'R1',
    serviceIds: ['av'],
    cateringMode: 'ITEMS',
    packageSelection: null,
    quantities: {},
    allocations: [],
  }, catalogFixture());

  assert.equal(state.step, 6);
  assert.equal(state.form.title, 'Restored');
  assert.equal(state.form.location, '');
  assert.deepEqual(state.quantities, { coffee: 0 });
  assert.deepEqual(state.allocations, [{ costCenter: '', percent: 100 }]);
});

test('room availability keeps free rooms first and preserves best-fit capacity ordering', () => {
  const state = requestState();
  state.form.internalParticipants = 7;
  state.form.externalParticipants = 1;
  const requests = [{
    id: 'CR-1',
    roomId: 'R2',
    date: state.form.date,
    start: state.form.start,
    end: state.form.end,
    status: 'Confirmed',
  }];

  const model = availableRoomModel({ state, catalog: catalogFixture(), requests });
  assert.equal(model.type, 'available');
  assert.deepEqual(model.rooms.map((room) => room.id), ['R1', 'R3', 'R2']);
});

test('cost summary preserves room, service, package and item calculations', () => {
  const costs = calculateRequestCostSummary(requestState(), catalogFixture());
  assert.deepEqual(costs, {
    roomCost: 150,
    serviceCost: 25,
    cateringCost: 56,
    total: 231,
  });
});

test('repeat and change editing rebuild the same request session semantics', () => {
  const catalog = catalogFixture();
  const state = requestState();
  const stored = {
    id: 'CR-42',
    title: 'Stored',
    location: 'Berlin',
    date: '2026-09-12',
    start: '13:00',
    end: '14:00',
    internalParticipants: 3,
    externalParticipants: 1,
    specialRequirements: 'Hybrid',
    dietaryRequirements: 'Vegan',
    cateringParticipants: 4,
    roomId: 'R1',
    serviceIds: ['av'],
    packageSelection: { packageId: 'P1', tier: 'A' },
    quantities: { coffee: 1 },
    allocations: [{ costCenter: 'CC-X', percent: 100 }],
  };

  const copied = applyRepeatToState(state, stored, catalog, '2026-08-23');
  assert.equal(copied.copiedFromPast, false);
  assert.equal(state.editingRequestId, null);
  assert.equal(state.cateringMode, 'BOTH');
  assert.equal(state.view, 'employee');

  applyChangeRequestToState(state, stored, catalog);
  assert.equal(state.editingRequestId, 'CR-42');
  assert.equal(state.form.title, 'Stored');
  assert.equal(state.cateringMode, 'BOTH');
  assert.deepEqual(state.allocations, [{ costCenter: 'CC-X', percent: 100 }]);
});
