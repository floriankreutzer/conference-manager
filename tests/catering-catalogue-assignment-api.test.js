import assert from 'node:assert/strict';
import test from 'node:test';
import { createCateringCatalogueAssignmentApi } from '../src/platform/catering-catalogue-assignment-api.js';
import { discoverCateringCatalogueAssignments } from '../src/platform/catering-catalogue-assignment-runtime.js';
import { featureFlags } from '../src/platform/feature-flags.js';

const id = (n) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const assignment = () => ({ kind: 'item', entryId: 'coffee', integrationId: id(1) });
const projection = (extra = {}) => ({ schemaVersion: 1, revision: 0, currentCatalogueRevision: 2,
  assignedCatalogueRevision: null, assignments: [], stale: true, ...extra });
const apiFor = (response) => createCateringCatalogueAssignmentApi({ apiClient: { request: async () => response } });

test('assignment transport accepts initial zero revision and sends both independent CAS revisions', async () => {
  assert.equal((await apiFor(projection()).loadAssignments()).revision, 0);
  let received;
  const api = createCateringCatalogueAssignmentApi({ apiClient: { request: async (path, options) => {
    received = { path, options };
    return projection({ revision: 1, assignedCatalogueRevision: 2, assignments: [assignment()], stale: false });
  } } });
  const result = await api.saveAssignments({ expectedRevision: 0, catalogueRevision: 2, assignments: [assignment()] });
  assert.equal(result.revision, 1);
  assert.deepEqual(received, { path: 'v1/tenant/catering/catalogue-assignments', options: { method: 'PUT', body: {
    schemaVersion: 1, expectedRevision: 0, catalogueRevision: 2, assignments: [assignment()],
  } } });
  assert.equal(Object.isFrozen(result.assignments[0]), true);
});

test('assignment transport rejects corrupt revision, scope-bearing fields and duplicate ownership', async () => {
  for (const value of [projection({ tenantId: id(2) }), projection({ revision: -1 }), projection({ stale: false }),
    projection({ assignments: [assignment()] }), projection({ revision: 1 }),
    projection({ revision: 1, assignedCatalogueRevision: 3 }),
    projection({ revision: 1, assignedCatalogueRevision: 2, assignments: [assignment(), assignment()] })]) {
    await assert.rejects(apiFor(value).loadAssignments(), /INVALID/);
  }
  let calls = 0;
  const api = createCateringCatalogueAssignmentApi({ apiClient: { request: async () => { calls++; } } });
  for (const proposed of [[{ ...assignment(), tenantId: id(2) }], [{ ...assignment(), integrationId: 'foreign' }],
    [{ ...assignment(), kind: 'service' }], Array.from({ length: 401 }, assignment)]) {
    await assert.rejects(api.saveAssignments({ expectedRevision: 0, catalogueRevision: 2, assignments: proposed }), /INVALID/);
  }
  assert.equal(calls, 0);
});

test('save requires exact persisted acknowledgement and never retries lost or conflicting writes', async () => {
  assert.equal((await apiFor(projection({ revision: Number.MAX_SAFE_INTEGER - 1,
    assignedCatalogueRevision: 2, assignments: [assignment()], stale: false })).loadAssignments()).revision,
  Number.MAX_SAFE_INTEGER - 1);
  await assert.rejects(apiFor(null).saveAssignments({ expectedRevision: Number.MAX_SAFE_INTEGER - 1,
    catalogueRevision: 2, assignments: [assignment()] }), /INVALID/);
  for (const response of [projection({ revision: 2, assignedCatalogueRevision: 2, stale: false }),
    projection({ revision: 1, assignedCatalogueRevision: 2, assignments: [assignment()], stale: true })]) {
    await assert.rejects(apiFor(response).saveAssignments({ expectedRevision: 0, catalogueRevision: 2, assignments: [assignment()] }), /INVALID/);
  }
  for (const code of ['AUTHENTICATION_REQUIRED', 'AUTHORIZATION_DENIED', 'CATERING_ASSIGNMENT_REVISION_CONFLICT', 'NETWORK_ERROR']) {
    let calls = 0;
    const api = createCateringCatalogueAssignmentApi({ apiClient: { request: async () => {
      calls++; throw Object.assign(new Error(code), { code, currentRevision: 0 });
    } } });
    await assert.rejects(api.saveAssignments({ expectedRevision: 0, catalogueRevision: 2, assignments: [] }),
      (error) => error.code === code && error.currentRevision === 0);
    assert.equal(calls, 1);
  }
});

test('safe lookup uses bounded strictly ordered pages and rejects credentials or unknown providers', async () => {
  const connections = Array.from({ length: 20 }, (_, n) => ({ integrationId: id(n + 1), providerId: 'manual_catering' }));
  const page = { schemaVersion: 1, connections, nextAfterIntegrationId: id(20) };
  assert.equal((await apiFor(page).listConnections()).connections.length, 20);
  for (const response of [{ ...page, connections: [...connections, connections[0]] },
    { ...page, nextAfterIntegrationId: id(19) }, { ...page, connections: [...connections].reverse() },
    { ...page, connections: [{ ...connections[0], credentials: 'forbidden' }] },
    { ...page, connections: [{ ...connections[0], providerId: 'unknown' }] }]) {
    await assert.rejects(apiFor(response).listConnections(), /INVALID/);
  }
  await assert.rejects(apiFor(page).listConnections({ afterIntegrationId: id(1) }), /INVALID/);
});

const context = (extra = {}) => ({ isDemoRuntime: () => false, isManager: () => true,
  canManageTenantCatalogue: () => true, ...extra });

test('optional Manager discovery stays closed for Demo, other roles, malformed data and unavailable server', async () => {
  let calls = 0;
  const authentication = { apiClient: { request: async () => { calls++; return projection(); } } };
  for (const scope of [context({ isDemoRuntime: () => true }), context({ isManager: () => false }),
    context({ canManageTenantCatalogue: () => false })]) {
    assert.equal(await discoverCateringCatalogueAssignments({ context: scope, authentication }), null);
  }
  assert.equal(calls, 0);
  const enabled = await discoverCateringCatalogueAssignments({ context: context(), authentication });
  assert.equal(enabled.featureFlags.isEnabled('catering.catalogue'), true);
  assert.equal(enabled.featureFlags.isEnabled('catering.configuration'), false);
  assert.equal(featureFlags.isEnabled('catering.catalogue'), false);
  for (const value of [null, {}, { ...projection(), secret: 'forbidden' }]) {
    assert.equal(await discoverCateringCatalogueAssignments({ context: context(), authentication: {
      apiClient: { request: async () => value },
    } }), null);
  }
  for (const code of ['HTTP_404', 'HTTP_503']) {
    assert.equal(await discoverCateringCatalogueAssignments({ context: context(), authentication: {
      apiClient: { request: async () => { throw Object.assign(new Error(code), { code }); } },
    } }), null);
  }
  for (const code of ['HTTP_401', 'HTTP_403']) {
    await assert.rejects(discoverCateringCatalogueAssignments({ context: context(), authentication: {
      apiClient: { request: async () => { throw Object.assign(new Error(code), { code }); } },
    } }), { code });
  }
});

test('discovery deadline aborts the read and a late result cannot change central flags', async () => {
  let resolve;
  let signal;
  const result = await discoverCateringCatalogueAssignments({ context: context(), timeoutMs: 5,
    authentication: { apiClient: { request: async (_path, options) => {
      signal = options.signal;
      return new Promise((done) => { resolve = done; });
    } } } });
  assert.equal(result, null);
  assert.equal(signal.aborted, true);
  resolve(projection());
  await Promise.resolve();
  assert.equal(featureFlags.isEnabled('catering.catalogue'), false);
  for (const value of [undefined, false, 'true', 1]) {
    assert.equal(featureFlags.forServerCateringCatalogue(value).isEnabled('catering.catalogue'), false);
  }
});
