import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeProductionRequestDetailEnvelope,
  normalizeProductionRequestDraft,
  normalizeProductionRequestHistoryPage,
  normalizeProductionRequestListPage,
  normalizeProductionBookingChangeEnvelope,
} from '../src/platform/production-request-wire.js';

const NOW = '2026-09-12T08:00:00.000Z';
const START = '2026-09-15T10:00:00.000Z';
const END = '2026-09-15T11:00:00.000Z';
const REVISIONS = { organization: 1, locations: 1, catalogue: 1, bookingPolicies: 1, costAllocation: 1 };

export function compatibleRequest({ equipment = false, attribution = false } = {}) {
  return {
    schemaVersion: equipment ? 3 : 2, version: 1, id: 'request-1', roomId: 'room-1',
    status: 'Confirmed', statusReason: null, startsAt: START, endsAt: END,
    internalParticipants: 2, externalParticipants: 0,
    createdAt: NOW, updatedAt: NOW, statusChangedAt: NOW,
    ...(attribution ? { requesterAttribution: { displayName: 'Historical requester' } } : {}),
    details: {
      title: 'Equipment review', serviceIds: [], dietaryRequirements: null, specialRequirements: null,
      ...(equipment ? { equipmentIds: ['equipment-1'] } : {}),
      catering: { participantCount: 0, packageSelection: null, itemQuantities: [] },
    },
    pricing: {
      currency: 'EUR', totalMinor: equipment ? 2500 : 0,
      breakdown: { roomMinor: 0, servicesMinor: 0, cateringPackageMinor: 0, cateringItemsMinor: 0,
        ...(equipment ? { equipmentMinor: 2500 } : {}) },
      room: { id: 'room-1', siteId: 'site-1', name: 'Room', price: { amountMinor: 0, currency: 'EUR' } },
      services: [],
      ...(equipment ? { equipment: [{ equipment: {
        id: 'equipment-1', name: 'Portable display', description: null,
        price: { amountMinor: 2500, currency: 'EUR' },
      }, lineTotalMinor: 2500 }] } : {}),
      catering: { participantCount: 0, packageSelection: null, items: [] },
    },
    configurationRevisions: { ...REVISIONS },
    policy: {
      policyVersionId: 'policy-1', effectiveFrom: '2026-01-01T00:00:00.000Z', evaluatedAt: NOW,
      rules: { minimumLeadTimeMinutes: 0, maximumAdvanceMinutes: 527040,
        cancellationWindowMinutes: 0, changeWindowMinutes: 0, maximumParticipants: 500,
        allowedSiteIds: [], allowedRoomIds: [], allowedServiceIds: [] },
    },
    allocations: {
      schemaVersion: 1, configurationRevision: 1, snapshottedAt: NOW,
      model: 'percentage_basis_points', totalBasisPoints: 0,
      totalMinor: equipment ? 2500 : 0, allocatedMinor: 0, unallocatedMinor: equipment ? 2500 : 0,
      currency: 'EUR', entries: [],
    },
  };
}

function detail(request, schemaVersion = 2) {
  return { schemaVersion, request, requestId: 'correlation-1' };
}

test('API-01/API-03 accept independent composition and attribution versions without reinterpreting v2', () => {
  for (const equipment of [false, true]) {
    for (const attribution of [false, true]) {
      const request = compatibleRequest({ equipment, attribution });
      const normalized = normalizeProductionRequestDetailEnvelope(detail(request, attribution ? 3 : 2));
      assert.deepEqual(normalized, request);
      assert.equal(Object.isFrozen(normalized.pricing), true);
    }
  }
  assert.throws(() => normalizeProductionRequestDetailEnvelope(detail(compatibleRequest({ attribution: true }), 2)));
  assert.throws(() => normalizeProductionRequestDetailEnvelope(detail(compatibleRequest(), 3)));
  const hybrid = compatibleRequest({ equipment: true });
  hybrid.schemaVersion = 2;
  assert.throws(() => normalizeProductionRequestDetailEnvelope(detail(hybrid)));
});

test('API-01 rejects tampered Equipment identity, totals, currency, duplicate and missing lines', () => {
  for (const tamper of [
    (r) => { r.details.equipmentIds = ['other']; },
    (r) => { r.details.equipmentIds.push('equipment-1'); },
    (r) => { r.pricing.equipment[0].lineTotalMinor = 1; },
    (r) => { r.pricing.breakdown.equipmentMinor = 1; },
    (r) => { r.pricing.equipment[0].equipment.price.currency = 'USD'; },
    (r) => { r.pricing.equipment[0].equipment.tenantId = 'foreign'; },
    (r) => { delete r.pricing.equipment; },
    (r) => { r.pricing.equipment.push(structuredClone(r.pricing.equipment[0])); },
  ]) {
    const request = compatibleRequest({ equipment: true });
    tamper(request);
    assert.throws(() => normalizeProductionRequestDetailEnvelope(detail(request)));
  }
});

test('API-01 drafts retain explicit v3 empty selections and reject browser price or attribution authority', () => {
  const request = compatibleRequest();
  const draft = {
    title: request.details.title, roomId: request.roomId, startsAt: START, endsAt: END,
    internalParticipants: 2, externalParticipants: 0, serviceIds: [],
    catering: request.details.catering, dietaryRequirements: null, specialRequirements: null,
    allocations: [], configurationRevisions: REVISIONS,
  };
  assert.deepEqual(normalizeProductionRequestDraft(draft), draft);
  assert.deepEqual(normalizeProductionRequestDraft({ ...draft, equipmentIds: [] }).equipmentIds, []);
  assert.deepEqual(normalizeProductionRequestDraft({ ...draft, equipmentIds: ['z', 'a'] }).equipmentIds, ['a', 'z']);
  for (const fields of [
    { equipmentIds: ['a', 'a'] }, { equipmentIds: Array.from({ length: 201 }, (_, i) => `item-${i}`) },
    { equipmentIds: ['a'], totalMinor: 0 }, { requesterAttribution: { displayName: 'Spoof' } },
  ]) assert.throws(() => normalizeProductionRequestDraft({ ...draft, ...fields }));
});

test('API-03 list and history require versioned exact historical attribution and honest legacy nulls', () => {
  const request = compatibleRequest({ attribution: true });
  const decomposedName = 'Jose\u0301';
  const unicodeRequest = structuredClone(request);
  unicodeRequest.requesterAttribution.displayName = decomposedName;
  assert.equal(normalizeProductionRequestDetailEnvelope(detail(unicodeRequest, 3))
    .requesterAttribution.displayName, decomposedName);
  const page = { limit: 10, complete: true, nextCursor: null };
  const list = { schemaVersion: 3, asOf: NOW, requests: [request], page };
  assert.equal(normalizeProductionRequestListPage(list).requests[0].requesterAttribution.displayName, 'Historical requester');
  const history = {
    schemaVersion: 3, requestId: request.id, asOfVersion: 1, page,
    history: [{ version: 1, schemaVersion: 2, operation: 'created', capturedAt: NOW, request, actorAttribution: null }],
  };
  assert.equal(normalizeProductionRequestHistoryPage(history).history[0].actorAttribution, null);
  history.history[0].actorAttribution = { displayName: 'Historic manager', roleAtAction: 'conference_manager' };
  assert.equal(normalizeProductionRequestHistoryPage(history).history[0].actorAttribution.roleAtAction, 'conference_manager');
  for (const actor of [
    { displayName: '', roleAtAction: null }, { displayName: 'Name\n', roleAtAction: null },
    { displayName: 'Name', roleAtAction: 'tenant_admin' },
    { displayName: 'Name', roleAtAction: 'employee', userId: 'internal' },
  ]) {
    history.history[0].actorAttribution = actor;
    assert.throws(() => normalizeProductionRequestHistoryPage(history));
  }
});

test('API-03 booking changes preserve separate initiator and decider with composition v3', () => {
  const proposedRequest = compatibleRequest({ equipment: true, attribution: true });
  proposedRequest.version = 2;
  const request = {
    ...proposedRequest.details, roomId: proposedRequest.roomId, startsAt: START, endsAt: END,
    internalParticipants: 2, externalParticipants: 0, allocations: [], configurationRevisions: REVISIONS,
  };
  const change = {
    id: 'change-1', status: 'pending', roomId: 'room-1', startsAt: START, endsAt: END,
    internalParticipants: 2, externalParticipants: 0, rejectionReason: null, createdAt: NOW, updatedAt: NOW,
    requestSchemaVersion: 3, baseRequestVersion: 1, request, proposedRequest,
    initiatorAttribution: { displayName: 'Manager', roleAtAction: 'conference_manager' }, deciderAttribution: null,
  };
  const envelope = { schemaVersion: 3, result: { change,
    requestRef: { id: 'request-1', version: 1, schemaVersion: 3, status: 'Confirmed' } } };
  const normalized = normalizeProductionBookingChangeEnvelope(envelope);
  assert.equal(normalized.change.deciderAttribution, null);
  change.deciderAttribution = { ...change.initiatorAttribution };
  assert.throws(() => normalizeProductionBookingChangeEnvelope(envelope));
  change.deciderAttribution = null;
  change.request.equipmentIds = [];
  assert.throws(() => normalizeProductionBookingChangeEnvelope(envelope));
  change.request.equipmentIds = ['equipment-1'];
  change.status = 'applied';
  change.deciderAttribution = { ...change.initiatorAttribution };
  envelope.result.requestRef.version = 2;
  const applied = normalizeProductionBookingChangeEnvelope(envelope);
  assert.notEqual(applied.change.initiatorAttribution, applied.change.deciderAttribution);
  assert.deepEqual(applied.change.initiatorAttribution, applied.change.deciderAttribution);
  change.deciderAttribution.userId = 'internal';
  assert.throws(() => normalizeProductionBookingChangeEnvelope(envelope));
});
