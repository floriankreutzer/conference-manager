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

test('production persistence loads each authoritative domain only through the API contract', async () => {
  const responses = new Map([
    [DOMAIN_ENDPOINTS.profile, { schemaVersion: 1, profile: { displayName: 'User' } }],
    [DOMAIN_ENDPOINTS.catalog, {
      schemaVersion: 1,
      catalog: { sites: [], rooms: [], services: [], cateringPackages: [], cateringItems: [] },
    }],
    [DOMAIN_ENDPOINTS.siteInfo, { schemaVersion: 1, siteInfo: { Berlin: { active: true } } }],
    [DOMAIN_ENDPOINTS.requests, { schemaVersion: 1, requests: [{ id: 'CR-1' }] }],
    [DOMAIN_ENDPOINTS.notifications, { schemaVersion: 1, notifications: [{ id: 'notice-1' }] }],
    [DOMAIN_ENDPOINTS.configuration, { schemaVersion: 1, configuration: { timezone: 'Europe/Berlin' } }],
  ]);
  const api = apiWithResponses(responses);
  const persistence = createProductionPersistence({ apiClient: api.client });

  assert.equal((await persistence.loadProfile()).displayName, 'User');
  assert.deepEqual(await persistence.loadCatalog(), {
    sites: [], rooms: [], services: [], cateringPackages: [], cateringItems: [],
  });
  assert.equal((await persistence.loadSiteInfo()).Berlin.active, true);
  assert.deepEqual((await persistence.listRequests()).map((entry) => entry.id), ['CR-1']);
  assert.deepEqual((await persistence.listNotifications()).map((entry) => entry.id), ['notice-1']);
  assert.equal((await persistence.loadConfiguration()).timezone, 'Europe/Berlin');
  assert.deepEqual(api.calls.map((call) => call.path), Object.values(DOMAIN_ENDPOINTS));
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

test('production writes use explicit API operations and propagate authoritative failure', async () => {
  const api = apiWithResponses(new Map([
    [DOMAIN_ENDPOINTS.requests, ({ method }) => {
      assert.equal(method, 'POST');
      return { schemaVersion: 1, request: { id: 'CR-2026-100001', status: 'Submitted' } };
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
