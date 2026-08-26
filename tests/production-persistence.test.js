import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOMAIN_ENDPOINTS,
  ProductionPersistenceError,
  createProductionPersistence,
} from '../src/platform/production-persistence.js';

function apiWithResponses(responses = new Map()) {
  const calls = [];
  return {
    calls,
    client: {
      async request(path, options = {}) {
        calls.push({ path, options });
        const response = responses.get(path);
        if (response instanceof Error) throw response;
        if (typeof response === 'function') return response(options);
        if (response === undefined) throw new Error('unconfigured endpoint');
        return structuredClone(response);
      },
    },
  };
}

function requestFixture(overrides = {}) {
  return {
    id: 'CR-2026-100001',
    roomId: 'room-1',
    status: 'Submitted',
    statusReason: null,
    startsAt: '2026-09-01T08:00:00.000Z',
    endsAt: '2026-09-01T09:00:00.000Z',
    internalParticipants: 1,
    externalParticipants: 0,
    statusChangedAt: '2026-08-26T10:00:00.000Z',
    updatedAt: '2026-08-26T10:00:00.000Z',
    ...overrides,
  };
}

function catalogFixture(overrides = {}) {
  return {
    sites: [{ id: 'berlin', name: 'Berlin', active: true, timeZone: 'Europe/Berlin' }],
    rooms: [{ id: 'room-1', siteId: 'berlin', name: 'Room 1', capacity: 12, active: true }],
    services: [{ id: 'service-1', name: 'Service', active: true, priceMinor: 100, currency: 'EUR' }],
    cateringPackages: [],
    cateringItems: [],
    ...overrides,
  };
}

function bookingChangeFixture(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'pending',
    roomId: 'room-2',
    startsAt: '2026-09-01T10:00:00.000Z',
    endsAt: '2026-09-01T11:00:00.000Z',
    internalParticipants: 4,
    externalParticipants: 1,
    rejectionReason: null,
    createdAt: '2026-08-26T10:00:00.000Z',
    updatedAt: '2026-08-26T10:00:00.000Z',
    ...overrides,
  };
}

test('production persistence loads each authoritative domain only through the API contract', async () => {
  const responses = new Map([
    [DOMAIN_ENDPOINTS.profile, { schemaVersion: 1, profile: { displayName: 'User' } }],
    [DOMAIN_ENDPOINTS.catalog, {
      schemaVersion: 1,
      catalog: catalogFixture(),
    }],
    [DOMAIN_ENDPOINTS.siteInfo, { schemaVersion: 1, siteInfo: { Berlin: { active: true } } }],
    [DOMAIN_ENDPOINTS.requests, { schemaVersion: 1, requests: [requestFixture()] }],
    [DOMAIN_ENDPOINTS.roomAvailability, {
      schemaVersion: 1,
      availability: { available: true, conflictCount: 0 },
    }],
    [DOMAIN_ENDPOINTS.notifications, { schemaVersion: 1, notifications: [{ id: 'notice-1' }] }],
    [DOMAIN_ENDPOINTS.configuration, { schemaVersion: 1, configuration: { timezone: 'Europe/Berlin' } }],
  ]);
  const api = apiWithResponses(responses);
  const persistence = createProductionPersistence({ apiClient: api.client });

  assert.equal((await persistence.loadProfile()).displayName, 'User');
  assert.deepEqual(await persistence.loadCatalog(), catalogFixture());
  assert.equal((await persistence.loadSiteInfo()).Berlin.active, true);
  assert.deepEqual((await persistence.listRequests()).map((entry) => entry.id), ['CR-2026-100001']);
  assert.deepEqual(await persistence.checkRoomAvailability({
    roomId: 'room-1',
    startsAt: '2026-09-01T08:00:00.000Z',
    endsAt: '2026-09-01T09:00:00.000Z',
  }), { available: true, conflictCount: 0 });
  assert.deepEqual((await persistence.listNotifications()).map((entry) => entry.id), ['notice-1']);
  assert.equal((await persistence.loadConfiguration()).timezone, 'Europe/Berlin');
  assert.deepEqual(api.calls.map((call) => call.path), Object.values(DOMAIN_ENDPOINTS));
});

test('confirmed booking changes use only the request-bound proposal and decision endpoints', async () => {
  const requestId = 'CR-2026-100001';
  const change = bookingChangeFixture();
  const basePath = `v1/requests/${requestId}/booking-change`;
  const decisionPath = `${basePath}/${change.id}/decision`;
  const api = apiWithResponses(new Map([
    [basePath, (options) => options.method === 'POST'
      ? { schemaVersion: 1, result: { change, request: requestFixture({ status: 'Confirmed' }) } }
      : { schemaVersion: 1, result: { change } }],
    [decisionPath, (options) => {
      assert.deepEqual(options, { method: 'POST', body: { decision: 'approve' } });
      return { schemaVersion: 1, result: { status: 'blocked', alternatives: ['room-3'] } };
    }],
  ]));
  const persistence = createProductionPersistence({ apiClient: api.client });

  assert.deepEqual(await persistence.loadBookingChange(requestId), change);
  const proposed = await persistence.proposeBookingChange(requestId, {
    roomId: change.roomId,
    startsAt: change.startsAt,
    endsAt: change.endsAt,
    internalParticipants: change.internalParticipants,
    externalParticipants: change.externalParticipants,
  });
  assert.equal(proposed.change.id, change.id);
  assert.deepEqual(await persistence.decideBookingChange(requestId, change.id, 'approve'), {
    status: 'blocked', alternatives: ['room-3'],
  });
  assert.deepEqual(api.calls.map(({ path }) => path), [basePath, basePath, decisionPath]);
});

test('booking-change responses reject extra authority and malformed workflow state', async () => {
  const requestId = 'CR-2026-100001';
  const path = `v1/requests/${requestId}/booking-change`;
  for (const change of [
    { ...bookingChangeFixture(), tenantId: 'injected' },
    bookingChangeFixture({ status: 'unknown' }),
    bookingChangeFixture({ status: 'rejected', rejectionReason: null }),
  ]) {
    const persistence = createProductionPersistence({ apiClient: apiWithResponses(new Map([
      [path, { schemaVersion: 1, result: { change } }],
    ])).client });
    await assert.rejects(
      persistence.loadBookingChange(requestId),
      (error) => error instanceof ProductionPersistenceError
        && error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID',
    );
  }
});

test('booking-change proposal requires a non-null authoritative pending change', async () => {
  const requestId = 'CR-2026-100001';
  const path = `v1/requests/${requestId}/booking-change`;
  for (const change of [
    null,
    bookingChangeFixture({ status: 'applying' }),
    bookingChangeFixture({ status: 'applied' }),
    bookingChangeFixture({ status: 'rejected', rejectionReason: 'Declined' }),
  ]) {
    const persistence = createProductionPersistence({ apiClient: apiWithResponses(new Map([[
      path,
      { schemaVersion: 1, result: { change, request: requestFixture({ status: 'Confirmed' }) } },
    ]])).client });
    await assert.rejects(
      persistence.proposeBookingChange(requestId, {
        roomId: 'room-1',
        startsAt: '2026-09-01T08:00:00.000Z',
        endsAt: '2026-09-01T09:00:00.000Z',
        internalParticipants: 1,
        externalParticipants: 0,
      }),
      (error) => error instanceof ProductionPersistenceError
        && error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID',
    );
  }
});

test('blocked booking-change alternatives are bounded arrays of unique public IDs', async () => {
  const requestId = 'CR-2026-100001';
  const changeId = bookingChangeFixture().id;
  const path = `v1/requests/${requestId}/booking-change/${changeId}/decision`;
  const invalidAlternatives = [
    null,
    'room-1',
    ['room-1', 'room-1'],
    ['room-1', 'room-2', 'room-3', 'room-4', 'room-5', 'room-6'],
    ['room-1', { id: 'injected' }],
  ];
  for (const alternatives of invalidAlternatives) {
    const persistence = createProductionPersistence({ apiClient: apiWithResponses(new Map([[
      path,
      { schemaVersion: 1, result: { status: 'blocked', alternatives } },
    ]])).client });
    await assert.rejects(
      persistence.decideBookingChange(requestId, changeId, 'approve'),
      (error) => error instanceof ProductionPersistenceError
        && error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID',
    );
  }
});

test('booking-change rejection requires a matching authoritative rejected payload', async () => {
  const requestId = 'CR-2026-100001';
  const change = bookingChangeFixture();
  const path = `v1/requests/${requestId}/booking-change/${change.id}/decision`;
  const persistence = createProductionPersistence({ apiClient: apiWithResponses(new Map([[
    path,
    { schemaVersion: 1, result: { status: 'rejected', change } },
  ]])).client });

  await assert.rejects(
    persistence.decideBookingChange(requestId, change.id, 'reject', 'No longer required'),
    (error) => error instanceof ProductionPersistenceError
      && error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID',
  );
});

test('room availability uses the exact server-authoritative UTC request contract', async () => {
  const api = apiWithResponses(new Map([
    [DOMAIN_ENDPOINTS.roomAvailability, (options) => {
      assert.deepEqual(options, {
        method: 'POST',
        body: {
          roomId: 'room-1',
          startsAt: '2026-09-01T08:00:00.000Z',
          endsAt: '2026-09-01T09:00:00.000Z',
        },
      });
      return { schemaVersion: 1, availability: { available: false, conflictCount: 1 } };
    }],
  ]));
  const persistence = createProductionPersistence({ apiClient: api.client });

  assert.deepEqual(await persistence.checkRoomAvailability({
    roomId: 'room-1',
    startsAt: '2026-09-01T08:00:00.000Z',
    endsAt: '2026-09-01T09:00:00.000Z',
    ignoredByAdapter: 'not-forwarded',
  }), { available: false, conflictCount: 1 });
  assert.equal(api.calls.length, 1);
});

test('room availability rejects malformed requests before transport', async () => {
  const api = apiWithResponses();
  const persistence = createProductionPersistence({ apiClient: api.client });
  const invalidWindows = [
    { roomId: 'room-1', startsAt: '2026-02-30T08:00:00.000Z', endsAt: '2026-03-02T09:00:00.000Z' },
    { roomId: 'room-1', startsAt: '2026-09-01T09:00:00.000Z', endsAt: '2026-09-01T08:00:00.000Z' },
    { roomId: 'room-1', startsAt: '2026-09-01T08:00:00+02:00', endsAt: '2026-09-01T09:00:00+02:00' },
  ];
  for (const window of invalidWindows) {
    await assert.rejects(
      persistence.checkRoomAvailability(window),
      (error) => error instanceof ProductionPersistenceError
        && error.code === 'AVAILABILITY_WINDOW_INVALID',
    );
  }
  assert.equal(api.calls.length, 0);
});

test('room availability rejects malformed positive-response schemas fail closed', async () => {
  const invalidResponses = [
    { schemaVersion: 1, availability: { available: true, conflictCount: 1 } },
    { schemaVersion: 1, availability: { available: false, conflictCount: 2 } },
    { schemaVersion: 1, availability: { available: true, conflictCount: 0, provider: 'hidden' } },
    { schemaVersion: 1, availability: { available: true, conflictCount: 0 }, extra: true },
  ];
  const window = {
    roomId: 'room-1',
    startsAt: '2026-09-01T08:00:00.000Z',
    endsAt: '2026-09-01T09:00:00.000Z',
  };
  for (const response of invalidResponses) {
    const api = apiWithResponses(new Map([[DOMAIN_ENDPOINTS.roomAvailability, response]]));
    const persistence = createProductionPersistence({ apiClient: api.client });
    await assert.rejects(
      persistence.checkRoomAvailability(window),
      (error) => error instanceof ProductionPersistenceError
        && error.code === 'PRODUCTION_AVAILABILITY_INVALID',
    );
  }
});

test('production persistence never converts an API failure into browser-local success', async () => {
  const api = apiWithResponses(new Map([
    [DOMAIN_ENDPOINTS.requests, new Error('network unavailable')],
  ]));
  const persistence = createProductionPersistence({ apiClient: api.client });

  await assert.rejects(
    persistence.listRequests(),
    (error) => error instanceof ProductionPersistenceError
      && error.code === 'PRODUCTION_PERSISTENCE_UNAVAILABLE',
  );
});

test('production persistence rejects malformed or unversioned server data fail closed', async () => {
  const api = apiWithResponses(new Map([
    [DOMAIN_ENDPOINTS.requests, { requests: [{ id: 'stale-browser-shaped-record' }] }],
    [DOMAIN_ENDPOINTS.catalog, {
      schemaVersion: 2,
      catalog: { sites: [], rooms: [], services: [], cateringPackages: [], cateringItems: [] },
    }],
  ]));
  const persistence = createProductionPersistence({ apiClient: api.client });

  await assert.rejects(
    persistence.listRequests(),
    (error) => error instanceof ProductionPersistenceError
      && error.code === 'PRODUCTION_SCHEMA_VERSION_UNSUPPORTED',
  );
  await assert.rejects(
    persistence.loadCatalog(),
    (error) => error instanceof ProductionPersistenceError
      && error.code === 'PRODUCTION_SCHEMA_VERSION_UNSUPPORTED',
  );
});

test('production catalog rejects a missing site collection instead of guessing browser authority', async () => {
  const api = apiWithResponses(new Map([
    [DOMAIN_ENDPOINTS.catalog, {
      schemaVersion: 1,
      catalog: { rooms: [], services: [], cateringPackages: [], cateringItems: [] },
    }],
  ]));
  const persistence = createProductionPersistence({ apiClient: api.client });

  await assert.rejects(
    persistence.loadCatalog(),
    (error) => error instanceof ProductionPersistenceError
      && error.code === 'PRODUCTION_CATALOG_INVALID',
  );
});

test('production catalog accepts only the minimized backend wire schema and valid references', async () => {
  const invalidCatalogs = [
    catalogFixture({ unexpected: true }),
    catalogFixture({ sites: [{ id: 'berlin', name: 'Berlin', active: true, timeZone: 'Invalid/Zone' }] }),
    catalogFixture({ sites: [{ id: 'berlin', name: 'Berlin', active: true, timeZone: null, tenantId: 'injected' }] }),
    catalogFixture({ sites: [
      { id: 'berlin', name: 'Berlin', active: true, timeZone: 'Europe/Berlin' },
      { id: 'berlin', name: 'Duplicate', active: true, timeZone: 'Europe/Berlin' },
    ] }),
    catalogFixture({ rooms: [{ id: 'room-1', siteId: 'missing', name: 'Room 1', capacity: 12, active: true }] }),
    catalogFixture({ rooms: [{ id: 'room-1', siteId: 'berlin', name: 'Room 1', capacity: 0, active: true }] }),
    catalogFixture({ services: [{ id: 'service-1', name: 'Service', active: true, priceMinor: -1, currency: 'EUR' }] }),
  ];
  for (const catalog of invalidCatalogs) {
    const api = apiWithResponses(new Map([[
      DOMAIN_ENDPOINTS.catalog,
      { schemaVersion: 1, catalog },
    ]]));
    await assert.rejects(
      createProductionPersistence({ apiClient: api.client }).loadCatalog(),
      (error) => error instanceof ProductionPersistenceError
        && error.code === 'PRODUCTION_CATALOG_INVALID',
    );
  }
});

test('production request collections reject unknown fields, missing fields, invalid types and duplicate IDs', async () => {
  const invalidCollections = [
    [requestFixture({ tenantId: 'injected' })],
    [{ ...requestFixture(), roomId: undefined }],
    [requestFixture({ status: 'Browser Approved' })],
    [requestFixture({ status: 'Rejected', statusReason: null })],
    [requestFixture({ statusReason: 'Unexpected browser reason' })],
    [requestFixture({ startsAt: '2026-09-01T08:00:00+02:00' })],
    [requestFixture({ internalParticipants: 1.5 })],
    [requestFixture(), requestFixture()],
  ];
  for (const requests of invalidCollections) {
    const api = apiWithResponses(new Map([[
      DOMAIN_ENDPOINTS.requests,
      { schemaVersion: 1, requests },
    ]]));
    await assert.rejects(
      createProductionPersistence({ apiClient: api.client }).listRequests(),
      (error) => error instanceof ProductionPersistenceError
        && error.code === 'PRODUCTION_REQUESTS_INVALID',
    );
  }
});

test('production request response accepts the backend nullable room reference without inventing a replacement', async () => {
  const api = apiWithResponses(new Map([[
    DOMAIN_ENDPOINTS.requests,
    { schemaVersion: 1, requests: [requestFixture({ roomId: null })] },
  ]]));
  const [request] = await createProductionPersistence({ apiClient: api.client }).listRequests();
  assert.equal(request.roomId, null);
});

test('production catalog and request envelopes reject unknown response fields', async () => {
  const catalogApi = apiWithResponses(new Map([[
    DOMAIN_ENDPOINTS.catalog,
    { schemaVersion: 1, catalog: catalogFixture(), tenantId: 'injected' },
  ]]));
  await assert.rejects(
    createProductionPersistence({ apiClient: catalogApi.client }).loadCatalog(),
    (error) => error.code === 'PRODUCTION_CATALOG_INVALID',
  );

  const requestApi = apiWithResponses(new Map([[
    DOMAIN_ENDPOINTS.requests,
    { schemaVersion: 1, requests: [requestFixture()], requesterUserId: 'injected' },
  ]]));
  await assert.rejects(
    createProductionPersistence({ apiClient: requestApi.client }).listRequests(),
    (error) => error.code === 'PRODUCTION_REQUESTS_INVALID',
  );
});

test('production writes use explicit API operations and propagate authoritative failure', async () => {
  const api = apiWithResponses(new Map([
    [DOMAIN_ENDPOINTS.requests, ({ method }) => {
      assert.equal(method, 'POST');
      return { schemaVersion: 1, request: requestFixture() };
    }],
    ['v1/requests/CR-2026-100001/transitions', new Error('database unavailable')],
  ]));
  const persistence = createProductionPersistence({ apiClient: api.client });

  const created = await persistence.createRequest({
    roomId: 'room-1',
    startsAt: '2026-09-01T08:00:00.000Z',
    endsAt: '2026-09-01T09:00:00.000Z',
    internalParticipants: 1,
    externalParticipants: 0,
  });
  assert.equal(created.id, 'CR-2026-100001');
  await assert.rejects(
    persistence.transitionRequest('CR-2026-100001', { transition: 'cancel' }),
    (error) => error instanceof ProductionPersistenceError
      && error.code === 'PRODUCTION_PERSISTENCE_UNAVAILABLE',
  );
});

test('production adapters reject unsafe request identifiers before transport', async () => {
  const api = apiWithResponses();
  const persistence = createProductionPersistence({ apiClient: api.client });

  await assert.rejects(
    persistence.transitionRequest('../../other-tenant', { transition: 'cancel' }),
    (error) => error instanceof ProductionPersistenceError && error.code === 'REQUEST_ID_INVALID',
  );
  assert.equal(api.calls.length, 0);
});
