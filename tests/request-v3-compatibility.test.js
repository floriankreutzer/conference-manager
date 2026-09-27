import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeProductionRequestDetailEnvelope,
  normalizeProductionRequestDraft,
  normalizeProductionRequestHistoryPage,
  normalizeProductionRequestListPage,
  normalizeProductionRequestReportPage,
  normalizeProductionBookingChangeEnvelope,
} from '../src/platform/production-request-wire.js';
import { createProductionPersistence } from '../src/platform/production-persistence.js';

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

function requestDraft(request) {
  return {
    title: request.details.title,
    roomId: request.roomId,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
    internalParticipants: request.internalParticipants,
    externalParticipants: request.externalParticipants,
    serviceIds: [...request.details.serviceIds],
    ...(request.schemaVersion === 3 ? { equipmentIds: [...request.details.equipmentIds] } : {}),
    catering: structuredClone(request.details.catering),
    dietaryRequirements: request.details.dietaryRequirements,
    specialRequirements: request.details.specialRequirements,
    allocations: [],
    configurationRevisions: { ...request.configurationRevisions },
  };
}

function emptyEquipmentRequest({ attribution = true, version = 1 } = {}) {
  const request = compatibleRequest({ equipment: true, attribution });
  request.version = version;
  request.details.equipmentIds = [];
  request.pricing.equipment = [];
  request.pricing.breakdown.equipmentMinor = 0;
  request.pricing.totalMinor = 0;
  request.allocations.totalMinor = 0;
  request.allocations.unallocatedMinor = 0;
  return request;
}

function bookingChangeEnvelope({ proposedRequest, draft, requestSchemaVersion, outerSchemaVersion = 3 } = {}) {
  return {
    schemaVersion: outerSchemaVersion,
    result: {
      change: {
        id: 'change-1', status: 'pending', roomId: draft.roomId,
        startsAt: draft.startsAt, endsAt: draft.endsAt,
        internalParticipants: draft.internalParticipants,
        externalParticipants: draft.externalParticipants,
        rejectionReason: null, createdAt: NOW, updatedAt: NOW,
        requestSchemaVersion, baseRequestVersion: 1, request: draft, proposedRequest,
        initiatorAttribution: { displayName: 'Manager', roleAtAction: 'conference_manager' },
        deciderAttribution: null,
      },
      requestRef: { id: 'request-1', version: 1, schemaVersion: requestSchemaVersion, status: 'Confirmed' },
    },
  };
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

test('API-01 mutations and booking proposals preserve explicit empty Equipment v3 intent', async () => {
  const mutationRequest = emptyEquipmentRequest();
  const draft = requestDraft(mutationRequest);
  const proposedRequest = emptyEquipmentRequest({ version: 2 });
  const responses = [
    { schemaVersion: 3, request: { ...mutationRequest, status: 'Submitted' }, requestId: 'correlation-1' },
    { schemaVersion: 3, request: { ...mutationRequest, status: 'Submitted', version: 2 }, requestId: 'correlation-2' },
    bookingChangeEnvelope({ proposedRequest, draft, requestSchemaVersion: 3 }),
  ];
  const calls = [];
  const persistence = createProductionPersistence({ apiClient: {
    async request(path, options) {
      calls.push({ path, options });
      return responses.shift();
    },
  } });

  await persistence.createRequest(draft);
  await persistence.resubmitRequest('request-1', 1, draft);
  await persistence.proposeBookingChange('request-1', 1, draft);

  assert.deepEqual(calls.map(({ options }) => options.body.schemaVersion), [3, 3, 3]);
  assert.deepEqual(calls.map(({ options }) => options.body.request.equipmentIds), [[], [], []]);
});

test('API-01 mutation responses reject composition downgrade and lost Equipment selections', async () => {
  const sentRequest = compatibleRequest({ equipment: true, attribution: true });
  const sentDraft = requestDraft(sentRequest);
  const downgraded = compatibleRequest({ attribution: true });
  const lostEquipment = emptyEquipmentRequest();
  const invalidMutationResponses = [
    { schemaVersion: 3, request: downgraded, requestId: 'correlation-1' },
    { schemaVersion: 3, request: lostEquipment, requestId: 'correlation-2' },
  ];
  for (const response of invalidMutationResponses) {
    await assert.rejects(
      createProductionPersistence({ apiClient: { async request() { return response; } } })
        .createRequest(sentDraft),
      (error) => error.code === 'PRODUCTION_REQUEST_MUTATION_INVALID',
    );
    await assert.rejects(
      createProductionPersistence({ apiClient: { async request() { return response; } } })
        .resubmitRequest('request-1', 1, sentDraft),
      (error) => error.code === 'PRODUCTION_REQUEST_MUTATION_INVALID',
    );
  }

  downgraded.version = 2;
  const downgradedDraft = requestDraft(downgraded);
  await assert.rejects(
    createProductionPersistence({ apiClient: { async request() {
      return bookingChangeEnvelope({
        proposedRequest: downgraded,
        draft: downgradedDraft,
        requestSchemaVersion: 2,
      });
    } } }).proposeBookingChange('request-1', 1, sentDraft),
    (error) => error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID',
  );

  lostEquipment.version = 2;
  await assert.rejects(
    createProductionPersistence({ apiClient: { async request() {
      return bookingChangeEnvelope({
        proposedRequest: lostEquipment,
        draft: requestDraft(lostEquipment),
        requestSchemaVersion: 3,
      });
    } } }).proposeBookingChange('request-1', 1, sentDraft),
    (error) => error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID',
  );
});

test('API-01 mutation success is bound to every submitted field, version and status', async () => {
  const draft = requestDraft(emptyEquipmentRequest());
  const response = { schemaVersion: 3, request: {
    ...emptyEquipmentRequest(), status: 'Submitted',
  }, requestId: 'correlation-1' };
  const edits = [
    (item) => { item.request.details.title = 'Different title'; },
    (item) => { item.request.roomId = 'room-2'; item.request.pricing.room.id = 'room-2'; },
    (item) => { item.request.startsAt = '2026-09-15T10:15:00.000Z'; },
    (item) => { item.request.internalParticipants = 3; },
    (item) => { item.request.details.specialRequirements = 'Different requirements'; },
    (item) => {
      item.request.details.catering.participantCount = 1;
      item.request.pricing.catering.participantCount = 1;
    },
    (item) => {
      item.request.configurationRevisions.costAllocation = 2;
      item.request.allocations.configurationRevision = 2;
    },
    (item) => { item.request.version = 2; },
    (item) => { item.request.status = 'Confirmed'; },
  ];
  for (const edit of edits) {
    const tampered = structuredClone(response);
    edit(tampered);
    assert.ok(normalizeProductionRequestDetailEnvelope(tampered), 'independently valid response');
    await assert.rejects(
      createProductionPersistence({ apiClient: { async request() { return tampered; } } }).createRequest(draft),
      (error) => error.code === 'PRODUCTION_REQUEST_MUTATION_INVALID',
    );
  }
  const wrongResubmission = structuredClone(response);
  await assert.rejects(
    createProductionPersistence({ apiClient: { async request() { return wrongResubmission; } } })
      .resubmitRequest('request-1', 1, draft),
    (error) => error.code === 'PRODUCTION_REQUEST_MUTATION_INVALID',
  );
});

test('API-01 booking proposal binds the returned draft and proposed snapshot to submitted intent', async () => {
  const request = emptyEquipmentRequest();
  const draft = requestDraft(request);
  const envelope = bookingChangeEnvelope({
    draft, proposedRequest: emptyEquipmentRequest({ version: 2 }), requestSchemaVersion: 3,
  });
  const edits = [
    (item) => { item.result.change.request.title = 'Changed draft'; },
    (item) => { item.result.change.proposedRequest.details.title = 'Changed snapshot'; },
    (item) => {
      item.result.change.proposedRequest.configurationRevisions.costAllocation = 2;
      item.result.change.proposedRequest.allocations.configurationRevision = 2;
    },
  ];
  for (const edit of edits) {
    const tampered = structuredClone(envelope);
    edit(tampered);
    assert.ok(normalizeProductionBookingChangeEnvelope(tampered), 'independently valid proposal');
    await assert.rejects(
      createProductionPersistence({ apiClient: { async request() { return tampered; } } })
        .proposeBookingChange('request-1', 1, draft),
      (error) => error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID',
    );
  }
});

test('API-03 list and history require versioned exact historical attribution and honest legacy nulls', () => {
  const request = compatibleRequest({ attribution: true });
  const decomposedName = 'Jose\u0301';
  const unicodeRequest = structuredClone(request);
  unicodeRequest.requesterAttribution.displayName = decomposedName;
  assert.throws(() => normalizeProductionRequestDetailEnvelope(detail(unicodeRequest, 3)));
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
    { displayName: 'Admin\u202eUser', roleAtAction: null },
    { displayName: 'Admin\u2066User\u2069', roleAtAction: null },
    { displayName: 'Admin\u200bUser', roleAtAction: null },
    { displayName: 'Admin\u00adUser', roleAtAction: null },
    { displayName: 'Admin\ufeffUser', roleAtAction: null },
    { displayName: 'Admin\ud800User', roleAtAction: null },
    { displayName: 'Name', roleAtAction: 'tenant_admin' },
    { displayName: 'Name', roleAtAction: 'employee', userId: 'internal' },
  ]) {
    history.history[0].actorAttribution = actor;
    assert.throws(() => normalizeProductionRequestHistoryPage(history));
  }
});

test('API-03 attribution length counts Unicode code points as PostgreSQL does', () => {
  const request = compatibleRequest({ attribution: true });
  request.requesterAttribution.displayName = '😀'.repeat(160);
  assert.equal(normalizeProductionRequestDetailEnvelope(detail(request, 3))
    .requesterAttribution.displayName, '😀'.repeat(160));
  request.requesterAttribution.displayName += '😀';
  assert.throws(() => normalizeProductionRequestDetailEnvelope(detail(request, 3)));
});

test('API-03 list orders newest-first with id ties; report remains oldest-first', () => {
  const request = (id, startsAt) => {
    const result = compatibleRequest({ attribution: true });
    result.id = id;
    result.startsAt = startsAt;
    result.endsAt = new Date(Date.parse(startsAt) + 3_600_000).toISOString();
    return result;
  };
  const first = request('request-a', '2026-09-16T10:00:00.000Z');
  const tied = request('request-b', first.startsAt);
  const older = request('request-c', '2026-09-15T10:00:00.000Z');
  const page = { limit: 10, complete: true, nextCursor: null };
  const list = { schemaVersion: 3, asOf: NOW, requests: [first, tied, older], page };
  assert.deepEqual(normalizeProductionRequestListPage(list).requests.map((entry) => entry.id),
    ['request-a', 'request-b', 'request-c']);
  assert.throws(() => normalizeProductionRequestListPage({ ...list, requests: [older, first] }));
  assert.throws(() => normalizeProductionRequestListPage({ ...list, requests: [tied, first] }));
  const report = { ...list, range: { field: 'startsAt',
    fromInclusive: '2026-09-15T00:00:00.000Z',
    toExclusive: '2026-09-17T00:00:00.000Z', timeZone: 'UTC' },
  requests: [older, first, tied] };
  assert.deepEqual(normalizeProductionRequestReportPage(report).requests.map((entry) => entry.id),
    ['request-c', 'request-a', 'request-b']);
  assert.throws(() => normalizeProductionRequestReportPage({ ...report, requests: [first, older] }));
  const futureUpdate = structuredClone(older);
  futureUpdate.updatedAt = '2026-09-13T08:00:00.000Z';
  assert.throws(() => normalizeProductionRequestReportPage({ ...report, requests: [futureUpdate] }));
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
