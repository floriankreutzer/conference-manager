import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductionPersistenceError, createProductionPersistence } from '../src/platform/production-persistence.js';

const NOW = '2026-08-27T12:00:00.000Z';
const REQUEST_ID = 'request-1';
const CORRELATION_ID = '11111111-1111-4111-8111-111111111111';
const CONTEXT = 'catalog_context';

function api(resolver) {
  const calls = [];
  return { calls, client: { async request(path, options = {}) {
    calls.push({ path, options });
    return resolver(path, options);
  } } };
}

const revisions = () => ({ organization: 1, locations: 1, catalogue: 1, bookingPolicies: 1, costAllocation: 1 });
const policy = () => ({
  policyVersionId: 'policy-1', effectiveFrom: '2026-01-01T00:00:00.000Z', evaluatedAt: NOW,
  rules: {
    minimumLeadTimeMinutes: 0, maximumAdvanceMinutes: 527040,
    cancellationWindowMinutes: 0, changeWindowMinutes: 0, maximumParticipants: 500,
    allowedSiteIds: [], allowedRoomIds: [], allowedServiceIds: [],
  },
});
function catalogPage(section, overrides = {}) {
  return {
    schemaVersion: 2, configurationRevisions: revisions(), bookingPolicy: policy(),
    organization: { defaultCurrency: 'EUR' }, costAllocation: { allocationRequired: false },
    context: CONTEXT, section, entries: [],
    page: { limit: 10, complete: true, nextCursor: null }, ...overrides,
  };
}
function legacyRequest(overrides = {}) {
  return {
    schemaVersion: 1, version: 1, id: REQUEST_ID, roomId: null, status: 'Submitted',
    statusReason: null, startsAt: '2026-09-01T10:00:00.000Z',
    endsAt: '2026-09-01T11:00:00.000Z', internalParticipants: 1, externalParticipants: 0,
    statusChangedAt: NOW, createdAt: NOW, updatedAt: NOW, details: null, pricing: null,
    configurationRevisions: null, policy: null, allocations: null, ...overrides,
  };
}
function requestPage(overrides = {}) {
  return {
    schemaVersion: 2, asOf: NOW, requests: [legacyRequest()],
    page: { limit: 10, complete: true, nextCursor: null }, ...overrides,
  };
}
function requestRoomContextEnvelope(overrides = {}) {
  return {
    schemaVersion: 1,
    requestRef: {
      id: REQUEST_ID,
      schemaVersion: 2,
      version: 7,
      status: 'Confirmed',
    },
    currentRoomContext: {
      locationsRevision: 12,
      room: {
        id: 'room-retired',
        siteId: 'site-retired',
        name: 'Retired Room',
        capacity: 20,
        active: false,
      },
      site: {
        id: 'site-retired',
        name: 'Retired Site',
        active: false,
        timeZone: 'Europe/Berlin',
      },
    },
    requestId: CORRELATION_ID,
    ...overrides,
  };
}

test('profile hydration accepts only the exact server profile projection', async () => {
  const harness = api(() => ({ schemaVersion: 1, profile: { displayName: 'Demo Employee' } }));
  assert.deepEqual(
    await createProductionPersistence({ apiClient: harness.client }).loadProfile(),
    { displayName: 'Demo Employee' },
  );
  assert.deepEqual(harness.calls, [{ path: 'v1/application/profile', options: {} }]);

  await assert.rejects(
    createProductionPersistence({
      apiClient: api(() => ({ profile: { displayName: 'Demo Employee' } })).client,
    }).loadProfile(),
    (error) => error.code === 'PRODUCTION_SCHEMA_VERSION_UNSUPPORTED',
  );
  for (const payload of [
    { schemaVersion: 1, profile: { displayName: 'Demo Employee' }, tenantId: 'attacker' },
    { schemaVersion: 1, profile: { displayName: 'Demo Employee', tenantId: 'attacker' } },
    { schemaVersion: 1, profile: { displayName: ' Demo Employee ' } },
  ]) {
    await assert.rejects(
      createProductionPersistence({ apiClient: api(() => payload).client }).loadProfile(),
      (error) => error.code === 'PRODUCTION_PROFILE_INVALID',
    );
  }
});

test('production persistence assembles every bounded catalogue section with one generation', async () => {
  const harness = api((path) => catalogPage(new URL(`https://example.test/${path}`).searchParams.get('section')));
  const catalog = await createProductionPersistence({ apiClient: harness.client }).loadCatalog();
  assert.deepEqual(catalog.configurationRevisions, revisions());
  assert.equal(harness.calls.length, 6);
  assert.match(harness.calls[0].path, /section=sites/);
  for (const call of harness.calls.slice(1)) assert.match(call.path, /context=catalog_context/);
});

test('catalogue generation permits observation-time drift but rejects policy drift', async () => {
  let count = 0;
  const observed = api((path) => {
    const section = new URL(`https://example.test/${path}`).searchParams.get('section');
    count += 1;
    return catalogPage(section, {
      bookingPolicy: { ...policy(), evaluatedAt: `2026-08-27T12:00:0${count}.000Z` },
    });
  });
  await createProductionPersistence({ apiClient: observed.client }).loadCatalog();

  count = 0;
  const changed = api((path) => {
    const section = new URL(`https://example.test/${path}`).searchParams.get('section');
    count += 1;
    const current = policy();
    return catalogPage(section, count === 2 ? {
      bookingPolicy: {
        ...current,
        rules: { ...current.rules, maximumParticipants: 499 },
      },
    } : {});
  });
  await assert.rejects(
    createProductionPersistence({ apiClient: changed.client }).loadCatalog(),
    (error) => error.code === 'PRODUCTION_CATALOG_INVALID',
  );
});

test('catalogue assembly rejects cross-page generation drift', async () => {
  let count = 0;
  const harness = api((path) => {
    const section = new URL(`https://example.test/${path}`).searchParams.get('section');
    count += 1;
    return catalogPage(section, count === 2 ? { context: 'different_context' } : {});
  });
  await assert.rejects(createProductionPersistence({ apiClient: harness.client }).loadCatalog(),
    (error) => error.code === 'PRODUCTION_CATALOG_INVALID');
});

test('Request list follows opaque cursors and accepts explicit legacy facts only', async () => {
  let number = 0;
  const harness = api(() => requestPage(++number === 1 ? {
    requests: [], page: { limit: 10, complete: false, nextCursor: 'next_page' },
  } : {}));
  const requests = await createProductionPersistence({ apiClient: harness.client }).listRequests();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].details, null);
  assert.match(harness.calls[1].path, /cursor=next_page/);
});

test('Request list rejects unversioned, expanded and duplicate server records', async () => {
  for (const payload of [
    { requests: [] }, requestPage({ tenantId: 'attacker' }),
    requestPage({ requests: [legacyRequest(), legacyRequest()] }),
  ]) {
    const harness = api(() => payload);
    await assert.rejects(createProductionPersistence({ apiClient: harness.client }).listRequests(),
      (error) => error.code === 'PRODUCTION_REQUEST_LIST_INVALID');
  }
});

test('detail, transition and history use exact schema-v2 envelopes', async () => {
  const harness = api((path) => path.includes('/history') ? {
    schemaVersion: 2, requestId: CORRELATION_ID, asOfVersion: 1,
    history: [{ version: 1, schemaVersion: 1, operation: 'migrated_legacy', capturedAt: NOW, request: legacyRequest() }],
    page: { limit: 10, complete: true, nextCursor: null },
  } : { schemaVersion: 2, request: legacyRequest(), requestId: CORRELATION_ID });
  const persistence = createProductionPersistence({ apiClient: harness.client });
  assert.equal((await persistence.loadRequest(REQUEST_ID)).id, REQUEST_ID);
  assert.equal((await persistence.transitionRequest(REQUEST_ID, { transition: 'cancel' })).status, 'Submitted');
  assert.equal((await persistence.loadRequestHistory(REQUEST_ID))[0].operation, 'migrated_legacy');
});

test('Request Room context uses the exact GET boundary and accepts inactive or null context', async () => {
  const signal = new AbortController().signal;
  const harness = api(() => requestRoomContextEnvelope());
  const persistence = createProductionPersistence({ apiClient: harness.client });

  assert.deepEqual(await persistence.loadRequestRoomContext(REQUEST_ID, { signal }), {
    requestRef: {
      id: REQUEST_ID,
      schemaVersion: 2,
      version: 7,
      status: 'Confirmed',
    },
    currentRoomContext: {
      locationsRevision: 12,
      room: {
        id: 'room-retired',
        siteId: 'site-retired',
        name: 'Retired Room',
        capacity: 20,
        active: false,
      },
      site: {
        id: 'site-retired',
        name: 'Retired Site',
        active: false,
        timeZone: 'Europe/Berlin',
      },
    },
  });
  assert.deepEqual(harness.calls, [{
    path: `v1/requests/${REQUEST_ID}/room-context`,
    options: { signal },
  }]);

  const empty = api(() => requestRoomContextEnvelope({ currentRoomContext: null }));
  assert.deepEqual(
    await createProductionPersistence({ apiClient: empty.client })
      .loadRequestRoomContext(REQUEST_ID),
    {
      requestRef: {
        id: REQUEST_ID,
        schemaVersion: 2,
        version: 7,
        status: 'Confirmed',
      },
      currentRoomContext: null,
    },
  );
  assert.deepEqual(empty.calls, [{
    path: `v1/requests/${REQUEST_ID}/room-context`,
    options: {},
  }]);
});

test('Request Room context rejects authority expansion and malformed projections', async () => {
  const invalidPayloads = [
    requestRoomContextEnvelope({ tenantId: 'attacker' }),
    requestRoomContextEnvelope({
      requestRef: { ...requestRoomContextEnvelope().requestRef, id: 'request-2' },
    }),
    requestRoomContextEnvelope({
      requestRef: {
        ...requestRoomContextEnvelope().requestRef,
        tenantId: 'attacker',
      },
    }),
    requestRoomContextEnvelope({
      requestRef: {
        ...requestRoomContextEnvelope().requestRef,
        schemaVersion: 3,
      },
    }),
    requestRoomContextEnvelope({
      currentRoomContext: {
        ...requestRoomContextEnvelope().currentRoomContext,
        selectable: true,
      },
    }),
    requestRoomContextEnvelope({
      currentRoomContext: {
        ...requestRoomContextEnvelope().currentRoomContext,
        room: {
          ...requestRoomContextEnvelope().currentRoomContext.room,
          priceMinor: 10_000,
        },
      },
    }),
    requestRoomContextEnvelope({
      currentRoomContext: {
        ...requestRoomContextEnvelope().currentRoomContext,
        room: {
          ...requestRoomContextEnvelope().currentRoomContext.room,
          siteId: 'different-site',
        },
      },
    }),
    requestRoomContextEnvelope({
      currentRoomContext: {
        ...requestRoomContextEnvelope().currentRoomContext,
        site: {
          ...requestRoomContextEnvelope().currentRoomContext.site,
          timeZone: 'UTC+02:00',
        },
      },
    }),
    requestRoomContextEnvelope({
      currentRoomContext: {
        ...requestRoomContextEnvelope().currentRoomContext,
        room: {
          ...requestRoomContextEnvelope().currentRoomContext.room,
          active: 'false',
        },
      },
    }),
    requestRoomContextEnvelope({ requestId: '../correlation' }),
  ];

  for (const payload of invalidPayloads) {
    await assert.rejects(
      createProductionPersistence({ apiClient: api(() => payload).client })
        .loadRequestRoomContext(REQUEST_ID),
      (error) => error.code === 'PRODUCTION_REQUEST_ROOM_CONTEXT_INVALID',
    );
  }
});

test('booking changes accept only the common schema-v2 result family', async () => {
  const ref = { id: REQUEST_ID, schemaVersion: 1, version: 1, status: 'Confirmed' };
  const harness = api(() => ({
    schemaVersion: 2, result: { status: 'blocked', alternatives: ['room-2'], change: null, requestRef: ref },
  }));
  const result = await createProductionPersistence({ apiClient: harness.client })
    .decideBookingChange(REQUEST_ID, CORRELATION_ID, 'approve');
  assert.deepEqual(result.alternatives, ['room-2']);
  assert.equal(result.requestRef.version, 1);
});

test('booking-change decisions send only the exact normalized approve or reject intent', async () => {
  const requestRef = {
    id: REQUEST_ID, schemaVersion: 1, version: 1, status: 'Confirmed',
  };
  const rejectedChange = {
    id: CORRELATION_ID,
    status: 'rejected',
    roomId: 'room-1',
    startsAt: '2026-09-01T10:00:00.000Z',
    endsAt: '2026-09-01T11:00:00.000Z',
    internalParticipants: 1,
    externalParticipants: 0,
    rejectionReason: 'Not approved',
    createdAt: NOW,
    updatedAt: NOW,
    requestSchemaVersion: 1,
    baseRequestVersion: 1,
    request: null,
    proposedRequest: null,
  };
  const harness = api((_path, options) => ({
    schemaVersion: 2,
    result: options.body.decision === 'approve'
      ? { status: 'blocked', alternatives: [], change: null, requestRef }
      : { change: rejectedChange, requestRef },
  }));
  const persistence = createProductionPersistence({ apiClient: harness.client });

  await persistence.decideBookingChange(REQUEST_ID, CORRELATION_ID, 'approve');
  await persistence.decideBookingChange(
    REQUEST_ID,
    CORRELATION_ID,
    'reject',
    '  Not approved  ',
  );

  assert.deepEqual(harness.calls, [
    {
      path: `v1/requests/${REQUEST_ID}/booking-change/${CORRELATION_ID}/decision`,
      options: { method: 'POST', body: { decision: 'approve' } },
    },
    {
      path: `v1/requests/${REQUEST_ID}/booking-change/${CORRELATION_ID}/decision`,
      options: {
        method: 'POST',
        body: { decision: 'reject', reason: 'Not approved' },
      },
    },
  ]);
});

test('invalid booking-change decision intent fails before transport', async () => {
  const harness = api(() => { throw new Error('transport must not run'); });
  const persistence = createProductionPersistence({ apiClient: harness.client });
  for (const [decision, reason] of [
    ['hold', undefined],
    ['approve', 'Unexpected reason'],
    ['approve', null],
    ['reject', undefined],
    ['reject', null],
    ['reject', '   '],
    ['reject', ` ${'x'.repeat(1_001)} `],
  ]) {
    await assert.rejects(
      persistence.decideBookingChange(REQUEST_ID, CORRELATION_ID, decision, reason),
      (error) => error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID',
    );
  }
  assert.equal(harness.calls.length, 0);
});

test('booking-change proposals bind the edited Request version without a preflight reload', async () => {
  const draft = {
    title: 'Updated conference',
    roomId: 'room-1',
    startsAt: '2026-09-01T10:00:00.000Z',
    endsAt: '2026-09-01T11:00:00.000Z',
    internalParticipants: 2,
    externalParticipants: 0,
    serviceIds: [],
    catering: { participantCount: 0, packageSelection: null, itemQuantities: [] },
    dietaryRequirements: null,
    specialRequirements: null,
    allocations: [],
    configurationRevisions: revisions(),
  };
  const proposedRequest = {
    schemaVersion: 2,
    version: 8,
    id: REQUEST_ID,
    roomId: draft.roomId,
    status: 'Confirmed',
    statusReason: null,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    internalParticipants: draft.internalParticipants,
    externalParticipants: draft.externalParticipants,
    statusChangedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    details: {
      title: draft.title,
      specialRequirements: null,
      dietaryRequirements: null,
      serviceIds: [],
      catering: draft.catering,
    },
    pricing: {
      currency: 'EUR',
      totalMinor: 0,
      breakdown: {
        roomMinor: 0,
        servicesMinor: 0,
        cateringPackageMinor: 0,
        cateringItemsMinor: 0,
      },
      room: {
        id: draft.roomId,
        siteId: 'site-1',
        name: 'Room 1',
        price: { amountMinor: 0, currency: 'EUR' },
      },
      services: [],
      catering: { participantCount: 0, packageSelection: null, items: [] },
    },
    configurationRevisions: revisions(),
    policy: policy(),
    allocations: {
      schemaVersion: 1,
      configurationRevision: 1,
      snapshottedAt: NOW,
      model: 'percentage_basis_points',
      totalBasisPoints: 0,
      totalMinor: 0,
      allocatedMinor: 0,
      unallocatedMinor: 0,
      currency: 'EUR',
      entries: [],
    },
  };
  const harness = api(() => ({
    schemaVersion: 2,
    result: {
      change: {
        id: CORRELATION_ID,
        status: 'pending',
        roomId: draft.roomId,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        internalParticipants: draft.internalParticipants,
        externalParticipants: draft.externalParticipants,
        rejectionReason: null,
        createdAt: NOW,
        updatedAt: NOW,
        requestSchemaVersion: 2,
        baseRequestVersion: 7,
        request: draft,
        proposedRequest,
      },
      requestRef: { id: REQUEST_ID, schemaVersion: 1, version: 7, status: 'Confirmed' },
    },
  }));

  await createProductionPersistence({ apiClient: harness.client })
    .proposeBookingChange(REQUEST_ID, 7, draft);

  assert.deepEqual(harness.calls, [{
    path: `v1/requests/${REQUEST_ID}/booking-change`,
    options: {
      method: 'POST',
      body: { schemaVersion: 2, expectedVersion: 7, request: draft },
    },
  }]);
  const rejected = api(() => { throw new Error('transport must not run'); });
  await assert.rejects(
    createProductionPersistence({ apiClient: rejected.client })
      .proposeBookingChange(REQUEST_ID, 0, draft),
    (error) => error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID',
  );
  assert.equal(rejected.calls.length, 0);
});

test('booking changes reject duplicate alternatives and authority expansion', async () => {
  const ref = { id: REQUEST_ID, schemaVersion: 1, version: 1, status: 'Confirmed' };
  for (const result of [
    { status: 'blocked', alternatives: ['room-2', 'room-2'], change: null, requestRef: ref },
    { change: null, requestRef: ref, tenantId: 'attacker' },
  ]) {
    const harness = api(() => ({ schemaVersion: 2, result }));
    await assert.rejects(
      createProductionPersistence({ apiClient: harness.client }).decideBookingChange(REQUEST_ID, CORRELATION_ID, 'approve'),
      (error) => error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID');
  }
});

test('booking-change adapters bind responses to the requested path and concurrency token', async () => {
  const foreignRef = {
    id: 'request-2', schemaVersion: 1, version: 1, status: 'Confirmed',
  };
  await assert.rejects(
    createProductionPersistence({
      apiClient: api(() => ({
        schemaVersion: 2, result: { change: null, requestRef: foreignRef },
      })).client,
    }).loadBookingChange(REQUEST_ID),
    (error) => error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID',
  );
  await assert.rejects(
    createProductionPersistence({
      apiClient: api(() => ({
        schemaVersion: 2,
        result: {
          change: {
            id: 'different-change', status: 'rejected', roomId: 'room-1',
            startsAt: '2026-09-01T10:00:00.000Z', endsAt: '2026-09-01T11:00:00.000Z',
            internalParticipants: 1, externalParticipants: 0, rejectionReason: 'Not approved',
            createdAt: NOW, updatedAt: NOW, requestSchemaVersion: 1, baseRequestVersion: 1,
            request: null, proposedRequest: null,
          },
          requestRef: { id: REQUEST_ID, schemaVersion: 1, version: 1, status: 'Confirmed' },
        },
      })).client,
    }).decideBookingChange(REQUEST_ID, CORRELATION_ID, 'reject', 'Not approved'),
    (error) => error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID',
  );

  const draft = {
    title: 'Updated conference', roomId: 'room-1',
    startsAt: '2026-09-01T10:00:00.000Z', endsAt: '2026-09-01T11:00:00.000Z',
    internalParticipants: 1, externalParticipants: 0, serviceIds: [],
    catering: { participantCount: 0, packageSelection: null, itemQuantities: [] },
    dietaryRequirements: null, specialRequirements: null, allocations: [],
    configurationRevisions: revisions(),
  };
  await assert.rejects(
    createProductionPersistence({
      apiClient: api(() => ({
        schemaVersion: 2,
        result: {
          change: {
            id: CORRELATION_ID, status: 'pending', roomId: draft.roomId,
            startsAt: draft.startsAt, endsAt: draft.endsAt,
            internalParticipants: draft.internalParticipants,
            externalParticipants: draft.externalParticipants,
            rejectionReason: null, createdAt: NOW, updatedAt: NOW,
            requestSchemaVersion: 1, baseRequestVersion: 6,
            request: null, proposedRequest: null,
          },
          requestRef: { id: REQUEST_ID, schemaVersion: 1, version: 6, status: 'Confirmed' },
        },
      })).client,
    }).proposeBookingChange(REQUEST_ID, 7, draft),
    (error) => error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID',
  );
});

test('transport failures never become browser-local success', async () => {
  const cause = new Error('network');
  const persistence = createProductionPersistence({ apiClient: { async request() { throw cause; } } });
  await assert.rejects(persistence.listRequests(),
    (error) => error instanceof ProductionPersistenceError
      && error.code === 'PRODUCTION_PERSISTENCE_UNAVAILABLE' && error.cause === cause);
});

test('unsafe Request identifiers fail before transport', async () => {
  const harness = api(() => { throw new Error('must not call'); });
  await assert.rejects(createProductionPersistence({ apiClient: harness.client }).loadRequest('../tenant'),
    (error) => error.code === 'REQUEST_ID_INVALID');
  assert.equal(harness.calls.length, 0);
});
