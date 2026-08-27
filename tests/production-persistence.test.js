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

test('production persistence assembles every bounded catalogue section with one generation', async () => {
  const harness = api((path) => catalogPage(new URL(`https://example.test/${path}`).searchParams.get('section')));
  const catalog = await createProductionPersistence({ apiClient: harness.client }).loadCatalog();
  assert.deepEqual(catalog.configurationRevisions, revisions());
  assert.equal(harness.calls.length, 6);
  assert.match(harness.calls[0].path, /section=sites/);
  for (const call of harness.calls.slice(1)) assert.match(call.path, /context=catalog_context/);
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
