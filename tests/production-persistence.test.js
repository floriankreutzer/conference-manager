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
function attributedLegacyRequest(overrides = {}) {
  return legacyRequest({
    requesterAttribution: { displayName: 'Historical requester' },
    ...overrides,
  });
}
function historyPage(overrides = {}) {
  return {
    schemaVersion: 2,
    requestId: CORRELATION_ID,
    asOfVersion: 2,
    history: [],
    page: { limit: 10, complete: true, nextCursor: null },
    ...overrides,
  };
}
function reportPage(overrides = {}) {
  return {
    schemaVersion: 2,
    asOf: NOW,
    range: {
      field: 'startsAt',
      fromInclusive: '2026-09-01T00:00:00.000Z',
      toExclusive: '2026-09-02T00:00:00.000Z',
      timeZone: 'UTC',
    },
    requests: [],
    page: { limit: 10, complete: true, nextCursor: null },
    ...overrides,
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

function guestPresentation(overrides = {}) {
  return {
    address: { line1: 'Main Street 1', line2: null, postalCode: '10115', city: 'Berlin', countryCode: 'DE' },
    publicTransport: 'Use the central station exit', arrival: 'Use the main entrance', parking: null,
    reception: 'Check in at reception', building: null, visitorNotes: null, accessibility: 'Step-free entrance',
    wifiPolicy: 'credentials_on_arrival', wifiNetworkName: 'Guest',
    contact: { name: 'Reception', email: 'reception@example.test', phone: null },
    routeUrl: 'https://www.openstreetmap.org/way/123',
    ...overrides,
  };
}

function guestRoomContextEnvelope(guest = guestPresentation()) {
  const legacy = requestRoomContextEnvelope();
  return {
    ...legacy,
    schemaVersion: 2,
    currentRoomContext: {
      ...legacy.currentRoomContext,
      room: {
        ...legacy.currentRoomContext.room,
        floor: null,
        accessibility: [],
        floorplanAssetId: null,
        mediaAssetIds: [],
      },
      guestPresentation: guest,
    },
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
  const harness = api((path) => {
    const section = new URL(`https://example.test/${path}`).searchParams.get('section');
    return catalogPage(section, section === 'rooms' ? { entries: [{
      id: 'room-1', siteId: 'site-1', name: 'Room 1', capacity: 10, active: true,
      price: { amountMinor: 0, currency: 'EUR' }, equipment: ['Display'],
      floorplanAssetId: 'floorplan-room-1', mediaAssetIds: ['room-1-front'],
    }] } : section === 'equipment' ? { entries: [{
      id: 'display-1', name: 'Display', description: null, active: true, order: 1,
      price: { amountMinor: 2500, currency: 'EUR' }, siteIds: ['site-1'], roomIds: ['room-1'],
    }] } : section === 'sites' ? { entries: [{
      id: 'site-1', name: 'Site 1', active: true, timeZone: 'Europe/Berlin',
    }] } : {});
  });
  const catalog = await createProductionPersistence({ apiClient: harness.client }).loadCatalog();
  assert.deepEqual(catalog.configurationRevisions, revisions());
  assert.equal(harness.calls.length, 7);
  assert.match(harness.calls[0].path, /section=sites/);
  for (const call of harness.calls.slice(1)) assert.match(call.path, /context=catalog_context/);
  assert.deepEqual(catalog.rooms[0].equipment, ['Display']);
  assert.equal(catalog.rooms[0].floorplanAssetId, 'floorplan-room-1');
  assert.deepEqual(catalog.equipment.map(({ id }) => id), ['display-1']);
});

test('Equipment catalogue entries are exact, active and applicable only inside the assembled Tenant graph', async () => {
  const load = (equipment) => createProductionPersistence({
    apiClient: api((path) => {
      const section = new URL(`https://example.test/${path}`).searchParams.get('section');
      if (section === 'sites') return catalogPage(section, { entries: [{
        id: 'site-1', name: 'Site 1', active: true, timeZone: 'Europe/Berlin',
      }] });
      if (section === 'rooms') return catalogPage(section, { entries: [{
        id: 'room-1', siteId: 'site-1', name: 'Room 1', capacity: 10, active: true,
        price: { amountMinor: 0, currency: 'EUR' },
      }] });
      return catalogPage(section, section === 'equipment' ? { entries: [equipment] } : {});
    }).client,
  }).loadCatalog();
  const valid = {
    id: 'display-1', name: 'Display', description: null, active: true, order: 1,
    price: { amountMinor: 2500, currency: 'EUR' }, siteIds: ['site-1'], roomIds: ['room-1'],
  };
  assert.equal((await load(valid)).equipment[0].price.amountMinor, 2500);
  for (const invalid of [
    { ...valid, tenantId: 'foreign' },
    { ...valid, active: false },
    { ...valid, siteIds: ['site-2'] },
    { ...valid, roomIds: ['room-2'] },
  ]) {
    await assert.rejects(load(invalid), (error) => (
      ['PRODUCTION_CATALOG_PAGE_INVALID', 'PRODUCTION_CATALOG_INVALID'].includes(error.code)
    ));
  }
});

test('Room presentation accepts the exact pre-cutover schema with safe empty visual defaults', async () => {
  const harness = api((path) => {
    const section = new URL(`https://example.test/${path}`).searchParams.get('section');
    if (section === 'sites') return catalogPage(section, { entries: [{
      id: 'site-1', name: 'Site 1', active: true, timeZone: 'Europe/Berlin',
    }] });
    return catalogPage(section, section === 'rooms' ? { entries: [{
      id: 'room-1', siteId: 'site-1', name: 'Room 1', capacity: 10, active: true,
      price: { amountMinor: 0, currency: 'EUR' },
    }] } : {});
  });

  const catalog = await createProductionPersistence({ apiClient: harness.client }).loadCatalog();
  assert.deepEqual(catalog.rooms[0].equipment, []);
  assert.equal(catalog.rooms[0].floorplanAssetId, null);
  assert.deepEqual(catalog.rooms[0].mediaAssetIds, []);
});

test('Room presentation projection rejects unsafe or expanded server payloads', async () => {
  for (const room of [
    {
      id: 'room-1', siteId: 'site-1', name: 'Room 1', capacity: 10, active: true,
      price: { amountMinor: 0, currency: 'EUR' }, equipment: ['Display', 'Display'],
      floorplanAssetId: null, mediaAssetIds: [],
    },
    {
      id: 'room-1', siteId: 'site-1', name: 'Room 1', capacity: 10, active: true,
      price: { amountMinor: 0, currency: 'EUR' }, equipment: [],
      floorplanAssetId: 'https://attacker.invalid/room', mediaAssetIds: [],
    },
    {
      id: 'room-1', siteId: 'site-1', name: 'Room 1', capacity: 10, active: true,
      price: { amountMinor: 0, currency: 'EUR' }, equipment: [],
      floorplanAssetId: null, mediaAssetIds: [], providerId: 'internal',
    },
  ]) {
    const harness = api((path) => {
      const section = new URL(`https://example.test/${path}`).searchParams.get('section');
      if (section === 'sites') return catalogPage(section, { entries: [{
        id: 'site-1', name: 'Site 1', active: true, timeZone: 'Europe/Berlin',
      }] });
      return catalogPage(section, section === 'rooms' ? { entries: [room] } : {});
    });
    await assert.rejects(
      createProductionPersistence({ apiClient: harness.client }).loadCatalog(),
      (error) => error.code === 'PRODUCTION_CATALOG_PAGE_INVALID',
    );
  }
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

test('catalogue pagination rejects cursor cycles', async () => {
  const harness = api((path) => {
    const section = new URL(`https://example.test/${path}`).searchParams.get('section');
    return catalogPage(section, {
      page: { limit: 10, complete: false, nextCursor: 'same_cursor' },
    });
  });
  await assert.rejects(
    createProductionPersistence({ apiClient: harness.client }).loadCatalog(),
    (error) => error.code === 'PRODUCTION_CATALOG_INVALID',
  );
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

test('Request list paginates newest-first while report paginates oldest-first', async () => {
  const listFirst = legacyRequest({ id: 'request-a', startsAt: '2026-09-03T10:00:00.000Z', endsAt: '2026-09-03T11:00:00.000Z' });
  const listTied = legacyRequest({ id: 'request-b', startsAt: listFirst.startsAt, endsAt: listFirst.endsAt });
  const listOlder = legacyRequest({ id: 'request-c', startsAt: '2026-09-02T10:00:00.000Z', endsAt: '2026-09-02T11:00:00.000Z' });
  const listPages = [requestPage({ requests: [listFirst, listTied],
    page: { limit: 10, complete: false, nextCursor: 'next_page' } }),
  requestPage({ requests: [listOlder] })];
  assert.deepEqual((await createProductionPersistence({ apiClient: api(() => listPages.shift()).client })
    .listRequests()).map((request) => request.id), ['request-a', 'request-b', 'request-c']);
  for (const invalidSecond of [listFirst, legacyRequest({ id: 'request-z',
    startsAt: '2026-09-04T10:00:00.000Z', endsAt: '2026-09-04T11:00:00.000Z' })]) {
    const pages = [requestPage({ requests: [listFirst],
      page: { limit: 10, complete: false, nextCursor: 'next_page' } }),
    requestPage({ requests: [invalidSecond] })];
    await assert.rejects(createProductionPersistence({ apiClient: api(() => pages.shift()).client })
      .listRequests(), (error) => error.code === 'PRODUCTION_REQUEST_LIST_INVALID');
  }
  const reportEarlier = legacyRequest({ id: 'request-a', startsAt: '2026-09-01T09:00:00.000Z', endsAt: '2026-09-01T10:00:00.000Z' });
  const reportLater = legacyRequest({ id: 'request-b' });
  const reportPages = [reportPage({ requests: [reportEarlier],
    page: { limit: 10, complete: false, nextCursor: 'next_page' } }),
  reportPage({ requests: [reportLater] })];
  const range = ['2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z'];
  assert.deepEqual((await createProductionPersistence({ apiClient: api(() => reportPages.shift()).client })
    .loadRequestReport(...range)).requests.map((request) => request.id), ['request-a', 'request-b']);
  const reversed = [reportPage({ requests: [reportLater],
    page: { limit: 10, complete: false, nextCursor: 'next_page' } }),
  reportPage({ requests: [reportEarlier] })];
  await assert.rejects(createProductionPersistence({ apiClient: api(() => reversed.shift()).client })
    .loadRequestReport(...range), (error) => error.code === 'PRODUCTION_REQUEST_REPORT_INVALID');
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

test('Request list pagination binds one generation and rejects global duplicates', async () => {
  const first = requestPage({
    schemaVersion: 3,
    requests: [attributedLegacyRequest()],
    page: { limit: 10, complete: false, nextCursor: 'next_page' },
  });
  const downgraded = requestPage({
    requests: [legacyRequest({ id: 'request-2', startsAt: '2026-09-01T12:00:00.000Z', endsAt: '2026-09-01T13:00:00.000Z' })],
  });
  let call = 0;
  await assert.rejects(
    createProductionPersistence({ apiClient: api(() => (++call === 1 ? first : downgraded)).client })
      .listRequests(),
    (error) => error.code === 'PRODUCTION_REQUEST_LIST_INVALID',
  );

  call = 0;
  await assert.rejects(
    createProductionPersistence({ apiClient: api(() => requestPage(++call === 1 ? {
      page: { limit: 10, complete: false, nextCursor: 'next_page' },
    } : {
      requests: [legacyRequest({ version: 2 })],
    })).client }).listRequests(),
    (error) => error.code === 'PRODUCTION_REQUEST_LIST_INVALID',
  );
});

test('API-03 Request attribution cannot silently downgrade across calls or endpoint families', async () => {
  const attributed = requestPage({ schemaVersion: 3, requests: [attributedLegacyRequest()] });
  const legacy = requestPage();
  const responses = [legacy, attributed, legacy];
  const persistence = createProductionPersistence({ apiClient: api(() => responses.shift()).client });
  assert.equal((await persistence.listRequests())[0].requesterAttribution, undefined);
  assert.equal((await persistence.listRequests())[0].requesterAttribution.displayName, 'Historical requester');
  await assert.rejects(persistence.listRequests(),
    (error) => error.code === 'PRODUCTION_REQUEST_LIST_INVALID');

  const legacyResponseByPath = (path) => {
    if (path.includes('/reports/')) return reportPage();
    if (path.includes('/history')) return historyPage();
    return { schemaVersion: 2, request: legacyRequest(), requestId: CORRELATION_ID };
  };
  const harness = api((path) => path.startsWith('v1/application/requests?')
    ? attributed : legacyResponseByPath(path));
  const shared = createProductionPersistence({ apiClient: harness.client });
  await shared.listRequests();
  for (const operation of [
    () => shared.loadRequest(REQUEST_ID),
    () => shared.loadRequestHistory(REQUEST_ID),
    () => shared.loadRequestReport('2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
    () => shared.transitionRequest(REQUEST_ID, { transition: 'cancel' }, legacyRequest()),
  ]) {
    await assert.rejects(operation(), (error) => /_INVALID$/u.test(error.code));
  }
});

test('Request pagination rejects cursor cycles and enforces a hard page cap', async () => {
  const cyclic = api(() => requestPage({
    requests: [],
    page: { limit: 10, complete: false, nextCursor: 'same_cursor' },
  }));
  await assert.rejects(
    createProductionPersistence({ apiClient: cyclic.client }).listRequests(),
    (error) => error.code === 'PRODUCTION_REQUEST_LIST_INVALID',
  );

  let pageNumber = 0;
  const unbounded = api(() => requestPage({
    requests: [],
    page: { limit: 10, complete: false, nextCursor: `cursor_${++pageNumber}` },
  }));
  await assert.rejects(
    createProductionPersistence({ apiClient: unbounded.client }).listRequests(),
    (error) => error.code === 'PRODUCTION_REQUEST_LIST_INVALID',
  );
  assert.equal(unbounded.calls.length, 200);
});

test('detail, transition and history use exact schema-v2 envelopes', async () => {
  const harness = api((path) => path.includes('/history') ? {
    schemaVersion: 2, requestId: CORRELATION_ID, asOfVersion: 1,
    history: [{ version: 1, schemaVersion: 1, operation: 'migrated_legacy', capturedAt: NOW, request: legacyRequest() }],
    page: { limit: 10, complete: true, nextCursor: null },
  } : { schemaVersion: 2, request: legacyRequest(path.includes('/transitions')
    ? { status: 'Cancelled', version: 2 } : {}), requestId: CORRELATION_ID });
  const persistence = createProductionPersistence({ apiClient: harness.client });
  assert.equal((await persistence.loadRequest(REQUEST_ID)).id, REQUEST_ID);
  assert.equal((await persistence.transitionRequest(REQUEST_ID, { transition: 'cancel' }, legacyRequest())).status, 'Cancelled');
  assert.equal(harness.calls[1].options.ifMatchVersion, 1);
  assert.equal((await persistence.loadRequestHistory(REQUEST_ID))[0].operation, 'migrated_legacy');
});

test('Request transitions accept only the intended target status and normalized reason', async () => {
  for (const [transition, status, reason] of [
    ['start_review', 'In Review', undefined],
    ['confirm', 'Confirmed', undefined],
    ['reject', 'Rejected', 'Not available'],
    ['request_change', 'Change Requested', 'Please clarify'],
    ['cancel', 'Cancelled', undefined],
  ]) {
    const intent = { transition, ...(reason === undefined ? {} : { reason: ` ${reason} ` }) };
    const expected = legacyRequest({ status, statusReason: reason ?? null, version: 2 });
    const persistence = createProductionPersistence({ apiClient: api(() => ({
      schemaVersion: 2, request: expected, requestId: CORRELATION_ID,
    })).client });
    assert.equal((await persistence.transitionRequest(REQUEST_ID, intent, legacyRequest())).status, status);
    for (const changed of [
      legacyRequest({ status: 'Submitted' }),
      legacyRequest({ status, statusReason: reason ? 'Different reason' : null, id: 'other-request' }),
      legacyRequest({ status, statusReason: reason ?? null, version: 3 }),
    ]) {
      await assert.rejects(
        createProductionPersistence({ apiClient: api(() => ({
          schemaVersion: 2, request: changed, requestId: CORRELATION_ID,
        })).client }).transitionRequest(REQUEST_ID, intent, legacyRequest()),
        (error) => error.code === 'PRODUCTION_REQUEST_DETAIL_INVALID',
      );
    }
    if (reason) {
      await assert.rejects(
        createProductionPersistence({ apiClient: api(() => ({
          schemaVersion: 2,
          request: legacyRequest({ status, statusReason: 'Different reason' }),
          requestId: CORRELATION_ID,
        })).client }).transitionRequest(REQUEST_ID, intent, legacyRequest()),
        (error) => error.code === 'PRODUCTION_REQUEST_DETAIL_INVALID',
      );
    }
  }
  const transport = api(() => { throw new Error('unexpected network call'); });
  for (const invalid of [
    { transition: 'reopen' }, { transition: 'confirm', reason: 'extra' },
    { transition: 'reject' }, { transition: 'reject', reason: '  ' },
    { transition: 'cancel', tenantId: 'other' },
  ]) {
    await assert.rejects(
      createProductionPersistence({ apiClient: transport.client }).transitionRequest(REQUEST_ID, invalid, legacyRequest()),
      (error) => error.code === 'PRODUCTION_TRANSITION_INVALID',
    );
  }
  assert.equal(transport.calls.length, 0);
  const reconciled = legacyRequest({ status: 'Cancelled', version: 4 });
  assert.deepEqual(
    await createProductionPersistence({ apiClient: api(() => ({
      schemaVersion: 2, request: reconciled, requestId: CORRELATION_ID,
    })).client }).transitionRequest(REQUEST_ID, { transition: 'cancel' }, reconciled),
    reconciled,
  );
});

test('Request history pagination binds attribution generation and global versions', async () => {
  const attributedRequest = attributedLegacyRequest({ version: 2 });
  const first = historyPage({
    schemaVersion: 3,
    history: [{
      version: 2,
      schemaVersion: 1,
      operation: 'migrated_legacy',
      capturedAt: NOW,
      request: attributedRequest,
      actorAttribution: null,
    }],
    page: { limit: 10, complete: false, nextCursor: 'next_page' },
  });
  const downgraded = historyPage({
    history: [{
      version: 1,
      schemaVersion: 1,
      operation: 'migrated_legacy',
      capturedAt: NOW,
      request: legacyRequest(),
    }],
  });
  let call = 0;
  await assert.rejects(
    createProductionPersistence({ apiClient: api(() => (++call === 1 ? first : downgraded)).client })
      .loadRequestHistory(REQUEST_ID),
    (error) => error.code === 'PRODUCTION_REQUEST_HISTORY_INVALID',
  );

  const duplicate = historyPage({
    history: [{
      version: 1,
      schemaVersion: 1,
      operation: 'migrated_legacy',
      capturedAt: NOW,
      request: legacyRequest(),
    }],
  });
  call = 0;
  await assert.rejects(
    createProductionPersistence({ apiClient: api(() => historyPage(++call === 1 ? {
      history: duplicate.history,
      page: { limit: 10, complete: false, nextCursor: 'next_page' },
    } : { history: duplicate.history })).client }).loadRequestHistory(REQUEST_ID),
    (error) => error.code === 'PRODUCTION_REQUEST_HISTORY_INVALID',
  );
});

test('history and report pagination reject cursor cycles and report generation drift', async () => {
  const cyclicHistory = api(() => historyPage({
    page: { limit: 10, complete: false, nextCursor: 'same_cursor' },
  }));
  await assert.rejects(
    createProductionPersistence({ apiClient: cyclicHistory.client }).loadRequestHistory(REQUEST_ID),
    (error) => error.code === 'PRODUCTION_REQUEST_HISTORY_INVALID',
  );

  const cyclicReport = api(() => reportPage({
    page: { limit: 10, complete: false, nextCursor: 'same_cursor' },
  }));
  await assert.rejects(
    createProductionPersistence({ apiClient: cyclicReport.client }).loadRequestReport(
      '2026-09-01T00:00:00.000Z',
      '2026-09-02T00:00:00.000Z',
    ),
    (error) => error.code === 'PRODUCTION_REQUEST_REPORT_INVALID',
  );

  let call = 0;
  const driftingReport = api(() => reportPage(++call === 1 ? {
    page: { limit: 10, complete: false, nextCursor: 'next_page' },
  } : { asOf: '2026-08-27T12:00:01.000Z' }));
  await assert.rejects(
    createProductionPersistence({ apiClient: driftingReport.client }).loadRequestReport(
      '2026-09-01T00:00:00.000Z',
      '2026-09-02T00:00:00.000Z',
    ),
    (error) => error.code === 'PRODUCTION_REQUEST_REPORT_INVALID',
  );

  await assert.rejects(
    createProductionPersistence({ apiClient: api(() => reportPage({
      range: {
        ...reportPage().range,
        toExclusive: '2026-09-03T00:00:00.000Z',
      },
    })).client }).loadRequestReport(
      '2026-09-01T00:00:00.000Z',
      '2026-09-02T00:00:00.000Z',
    ),
    (error) => error.code === 'PRODUCTION_REQUEST_REPORT_INVALID',
  );
});

test('Request Room context uses the exact GET boundary and accepts inactive or null context', async () => {
  const signal = new AbortController().signal;
  const harness = api(() => requestRoomContextEnvelope());
  const persistence = createProductionPersistence({ apiClient: harness.client });

  assert.deepEqual(await persistence.loadRequestRoomContext(REQUEST_ID, { signal }), {
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
      schemaVersion: 1,
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

test('Request Guest context reuses the exact secret-free Site projection contract', async () => {
  const harness = api(() => guestRoomContextEnvelope());
  const result = await createProductionPersistence({ apiClient: harness.client })
    .loadRequestRoomContext(REQUEST_ID, { projection: 'guest', schemaVersion: 2 });
  assert.equal(result.schemaVersion, 2);
  assert.deepEqual(result.currentRoomContext.guestPresentation, guestPresentation());
  assert.deepEqual(harness.calls, [{
    path: `v1/requests/${REQUEST_ID}/room-context?projection=guest`,
    options: {},
  }]);

  for (const guest of [
    { ...guestPresentation(), arrival: 'Password: exposed' },
    { ...guestPresentation(), routeUrl: 'https://example.test/private' },
    { ...guestPresentation(), routeUrl: 'https://maps.apple.com/?token=exposed' },
    { ...guestPresentation(), wifiPolicy: 'not_available' },
    { ...guestPresentation(), token: 'authority' },
  ]) {
    await assert.rejects(
      createProductionPersistence({ apiClient: api(() => guestRoomContextEnvelope(guest)).client })
        .loadRequestRoomContext(REQUEST_ID, { projection: 'guest', schemaVersion: 2 }),
      (error) => error.code === 'PRODUCTION_REQUEST_ROOM_CONTEXT_INVALID',
    );
  }
});

test('Request Guest room fields reject credential labels and invisible Unicode before display', async () => {
  const room = guestRoomContextEnvelope().currentRoomContext.room;
  for (const unsafeRoom of [
    { ...room, floor: 'Password sunshine' },
    { ...room, floor: 'North\u202e1' },
    { ...room, accessibility: ['Door code 1234'] },
    { ...room, accessibility: ['Lift\u200baccess'] },
    { ...room, accessibility: ['Wi-Fi code 1234'] },
    { ...room, accessibility: ['Passcode 1234'] },
    { ...room, floor: 'Auth token abc' },
    { ...room, floor: 'D-o-o-г code 1234' },
    { ...room, accessibility: ['Doorcode1234'] },
    { ...room, accessibility: ['PasswortSommer2026'] },
    { ...room, accessibility: ['Passwordissecret'] },
    { ...room, accessibility: ['Pɑssword Sommer2026'] },
    { ...room, accessibility: ['раѕѕԝогԁ Sommer2026'] },
    { ...room, accessibility: ['ОТР 123456'] },
    { ...room, accessibility: ['GuestPassword1234'] },
    { ...room, accessibility: ['guestpassword1234'] },
    { ...room, accessibility: ['MyPasswortSommer2026'] },
    { ...room, accessibility: ['MainDoorcode1234'] },
    { ...room, accessibility: ['OfficeDoor code 1234'] },
    { ...room, accessibility: ['GuestWiFipasswordSommer2026'] },
    { ...room, accessibility: ['SecretPIN1234'] },
    { ...room, accessibility: ['ᏢᎪᏚᏚᎳᎾᎡᎠ Sommer2026'] },
    { ...room, accessibility: ['Ꮲ.Ꭺ.Ꮪ.Ꮪ.Ꮃ.Ꮎ.Ꭱ.Ꭰ Sommer2026'] },
    { ...room, accessibility: ['P@sswordless entrance at Door 4'] },
    { ...room, accessibility: ['GuestPasswordless entrance'] },
    { ...room, accessibility: ['2026Passwordless access'] },
    { ...room, accessibility: ['Door@c0de 1234'] },
    { ...room, accessibility: ['Door$c0de 1234'] },
    { ...room, accessibility: ['API@k3y abc'] },
    { ...room, accessibility: ['API$k3y abc'] },
    { ...room, accessibility: ['ᏢᏆᏁ 1234'] },
    { ...room, accessibility: ['Ꮲ.Ꮖ.Ꮑ 1234'] },
  ]) {
    const envelope = guestRoomContextEnvelope();
    envelope.currentRoomContext.room = unsafeRoom;
    await assert.rejects(createProductionPersistence({ apiClient: api(() => envelope).client })
      .loadRequestRoomContext(REQUEST_ID, { projection: 'guest', schemaVersion: 2 }),
    (error) => error.code === 'PRODUCTION_REQUEST_ROOM_CONTEXT_INVALID');
  }
  const safe = guestRoomContextEnvelope();
  safe.currentRoomContext.room = { ...room, floor: '2', accessibility: ['Step-free access'] };
  const result = await createProductionPersistence({ apiClient: api(() => safe).client })
    .loadRequestRoomContext(REQUEST_ID, { projection: 'guest', schemaVersion: 2 });
  assert.equal(result.currentRoomContext.room.floor, '2');
  assert.deepEqual(result.currentRoomContext.room.accessibility, ['Step-free access']);
  for (const floor of ['B[1]', 'Level -1', 'E\u0301tage 2']) {
    const allowed = guestRoomContextEnvelope();
    allowed.currentRoomContext.room = { ...room, floor, accessibility: ['Step-free access'] };
    const next = await createProductionPersistence({ apiClient: api(() => allowed).client })
      .loadRequestRoomContext(REQUEST_ID, { projection: 'guest', schemaVersion: 2 });
    assert.equal(next.currentRoomContext.room.floor, floor);
  }
  for (const floor of [
    'Этаж 2', '東京 2', 'Berlin Москва', '会議室A', 'Reception/受付', 'Информация о транспорте',
    'Door入口案内', 'Gate入口案内', 'Access入口案内', 'Entrance入口案内',
    'WiFi接続案内', 'WLAN接続案内', 'API利用案内', 'ᎣᏏᏲ ᎠᏰᎵ',
    'Door 入口 案内', 'Gate / 入口 / 案内', 'WiFi 接続 案内',
    'WLAN – 接続 – 案内', 'API 利用 案内',
    'Use the passwordless entrance at Door 4', 'Passwordless access — Этаж 2',
    'Meet at Door @ reception', 'Parking costs $5 at reception',
  ]) {
    const allowed = guestRoomContextEnvelope();
    allowed.currentRoomContext.room = { ...room, floor, accessibility: ['Безбарьерный вход'] };
    const next = await createProductionPersistence({ apiClient: api(() => allowed).client })
      .loadRequestRoomContext(REQUEST_ID, { projection: 'guest', schemaVersion: 2 });
    assert.equal(next.currentRoomContext.room.floor, floor);
    assert.deepEqual(next.currentRoomContext.room.accessibility, ['Безбарьерный вход']);
  }
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
        schemaVersion: 4,
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

  await assert.rejects(
    createProductionPersistence({ apiClient: api(() => guestRoomContextEnvelope()).client })
      .loadRequestRoomContext(REQUEST_ID),
    (error) => error.code === 'PRODUCTION_REQUEST_ROOM_CONTEXT_INVALID',
  );
  await assert.rejects(
    createProductionPersistence({ apiClient: api(() => requestRoomContextEnvelope()).client })
      .loadRequestRoomContext(REQUEST_ID, { projection: 'guest', schemaVersion: 2 }),
    (error) => error.code === 'PRODUCTION_REQUEST_ROOM_CONTEXT_INVALID',
  );
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
  const wrongReason = api(() => ({
    schemaVersion: 2, result: {
      change: { ...rejectedChange, rejectionReason: 'A different reason' }, requestRef,
    },
  }));
  await assert.rejects(
    createProductionPersistence({ apiClient: wrongReason.client })
      .decideBookingChange(REQUEST_ID, CORRELATION_ID, 'reject', 'Not approved'),
    (error) => error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID',
  );
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

test('booking-change reads reject a different Request generation even for an empty result', async () => {
  const visible = legacyRequest({ status: 'Confirmed', version: 4 });
  const matching = { id: REQUEST_ID, schemaVersion: 1, version: 4, status: 'Confirmed' };
  const payloadFor = (requestRef) => ({ schemaVersion: 2, result: { change: null, requestRef } });
  const accepted = api(() => payloadFor(matching));
  assert.equal(await createProductionPersistence({ apiClient: accepted.client })
    .loadBookingChange(REQUEST_ID, { expectedRequest: visible }), null);
  assert.deepEqual(accepted.calls.map(({ options }) => options), [{}]);
  for (const requestRef of [
    { ...matching, version: 5 }, { ...matching, schemaVersion: 2 },
    { ...matching, status: 'Cancelled' },
  ]) {
    const persistence = createProductionPersistence({ apiClient: api(() => payloadFor(requestRef)).client });
    await assert.rejects(persistence.loadBookingChange(REQUEST_ID, { expectedRequest: visible }),
      (error) => error.code === 'PRODUCTION_BOOKING_CHANGE_INVALID');
  }
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

test('structured Guest context negotiates v3 and rejects prose-shaped public values', async () => {
  const fixture = guestRoomContextEnvelope();
  fixture.schemaVersion = 3;
  fixture.currentRoomContext.guestPublicValues = {
    publicTransport: 'available', parking: 'not_available', arrival: 'reception',
    accessibilityFeatures: ['step_free_entry'],
  };
  fixture.currentRoomContext.room.guestPublicValues = {
    floorNumber: 2, accessibilityFeatures: ['lift'],
  };
  const harness = api(() => fixture);
  const response = await createProductionPersistence({ apiClient: harness.client })
    .loadRequestRoomContext(REQUEST_ID, { projection: 'guest' });
  assert.equal(response.schemaVersion, 3);
  assert.equal(response.currentRoomContext.room.guestPublicValues.floorNumber, 2);
  assert.deepEqual(harness.calls, [{
    path: `v1/requests/${REQUEST_ID}/room-context?projection=guest&schemaVersion=3`, options: {},
  }]);
  fixture.currentRoomContext.guestPublicValues.arrival = 'Door code 1234';
  await assert.rejects(createProductionPersistence({ apiClient: api(() => fixture).client })
    .loadRequestRoomContext(REQUEST_ID, { projection: 'guest' }),
  (error) => error.code === 'PRODUCTION_REQUEST_ROOM_CONTEXT_INVALID');
  fixture.currentRoomContext.guestPublicValues.arrival = 'reception';
  fixture.currentRoomContext.room.guestPublicValues.floorNumber = '2';
  await assert.rejects(createProductionPersistence({ apiClient: api(() => fixture).client })
    .loadRequestRoomContext(REQUEST_ID, { projection: 'guest' }),
  (error) => error.code === 'PRODUCTION_REQUEST_ROOM_CONTEXT_INVALID');
  fixture.currentRoomContext.room.guestPublicValues = null;
  fixture.currentRoomContext.guestPublicValues = null;
  const withdrawn = await createProductionPersistence({ apiClient: api(() => fixture).client })
    .loadRequestRoomContext(REQUEST_ID, { projection: 'guest' });
  assert.equal(withdrawn.currentRoomContext.guestPublicValues, null);
  assert.equal(withdrawn.currentRoomContext.room.guestPublicValues, null);
});
