import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCTION_API_PATH,
  ProductionPersistenceError,
  createProductionRepositories,
} from '../src/core/production-persistence.js';
import { RUNTIME_MODE } from '../src/core/security-policy.js';
import {
  KEYS,
  ProductionStorageAccessError,
  readJson,
  writeJson,
} from '../src/core/storage.js';
import { createPersistenceRuntime } from '../src/platform/persistence-runtime.js';

class TrackingStorage {
  #values = new Map();

  constructor(seed = {}) {
    Object.entries(seed).forEach(([key, value]) => this.#values.set(String(key), String(value)));
    this.reads = [];
    this.writes = [];
  }

  getItem(key) {
    this.reads.push(key);
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.writes.push(key);
    this.#values.set(String(key), String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

function runtimeDocument(mode) {
  return {
    querySelector(selector) {
      if (selector === 'meta[name="conference-runtime"]') {
        return { getAttribute: () => mode };
      }
      return null;
    },
  };
}

function requestRecord(overrides = {}) {
  return {
    id: 'REQ-1',
    roomId: 'room-a',
    status: 'Submitted',
    statusReason: null,
    startsAt: '2026-09-01T10:00:00.000Z',
    endsAt: '2026-09-01T11:00:00.000Z',
    internalParticipants: 4,
    externalParticipants: 1,
    statusChangedAt: '2026-08-24T10:00:00.000Z',
    updatedAt: '2026-08-24T10:00:00.000Z',
    ...overrides,
  };
}

function fakeApi(handler) {
  const calls = [];
  return {
    calls,
    async request(path, options = {}) {
      calls.push({ path, options });
      return handler(path, options);
    },
  };
}

test('production request repository uses semantic API operations and rejects client authority fields', async () => {
  const api = fakeApi((path, options) => {
    if (path === PRODUCTION_API_PATH.requests && !options.method) {
      return { schemaVersion: 1, requests: [requestRecord()] };
    }
    return { request: requestRecord({ status: options.body?.transition === 'confirm' ? 'Confirmed' : 'Submitted' }) };
  });
  const repositories = createProductionRepositories({ apiClient: api });

  assert.deepEqual(await repositories.requests.list(), [requestRecord()]);
  await repositories.requests.create({
    title: 'Leadership meeting',
    roomId: 'room-a',
    startsAt: '2026-09-01T10:00:00.000Z',
    endsAt: '2026-09-01T11:00:00.000Z',
  });
  const confirmed = await repositories.requests.transition('REQ-1', 'confirm');
  assert.equal(confirmed.status, 'Confirmed');

  assert.equal(api.calls[1].path, PRODUCTION_API_PATH.requests);
  assert.equal(api.calls[1].options.method, 'POST');
  assert.equal(api.calls[2].path, 'v1/requests/REQ-1/transitions');
  assert.deepEqual(api.calls[2].options.body, { transition: 'confirm' });

  await assert.rejects(
    repositories.requests.create({ title: 'Injected', tenantId: 'foreign', status: 'Confirmed' }),
    (error) => error instanceof ProductionPersistenceError
      && error.code === 'PRODUCTION_REQUEST_AUTHORITY_FIELD_REJECTED',
  );
});

test('production catalog, profile, notifications, and configuration use versioned API envelopes', async () => {
  const api = fakeApi((path, options) => {
    if (path === PRODUCTION_API_PATH.catalog) {
      return { schemaVersion: 1, catalog: options.body?.catalog || { rooms: [] } };
    }
    if (path === PRODUCTION_API_PATH.profile) {
      return { schemaVersion: 1, profile: options.body?.profile || { firstName: 'Ada', lastName: 'Lovelace' } };
    }
    if (path === PRODUCTION_API_PATH.notifications || path.endsWith('/read')) {
      return { schemaVersion: 1, notifications: [{ id: 'notice-1', key: 'received' }] };
    }
    if (path === PRODUCTION_API_PATH.configuration) {
      return { schemaVersion: 1, configuration: options.body?.configuration || { siteInfo: {} } };
    }
    throw new Error('UNEXPECTED_PATH');
  });
  const repositories = createProductionRepositories({ apiClient: api });

  assert.deepEqual(await repositories.catalog.get(), { rooms: [] });
  assert.deepEqual(await repositories.profile.get(), { firstName: 'Ada', lastName: 'Lovelace' });
  assert.equal((await repositories.notifications.list())[0].id, 'notice-1');
  assert.deepEqual(await repositories.configuration.get(), { siteInfo: {} });
  assert.deepEqual(await repositories.catalog.save({ rooms: [{ id: 'room-a' }] }), { rooms: [{ id: 'room-a' }] });
  assert.equal((await repositories.notifications.markRead('notice-1'))[0].id, 'notice-1');
});

test('production API failures propagate and never fall back to stale browser state', async () => {
  const stale = new TrackingStorage({
    [KEYS.requests]: JSON.stringify([requestRecord({ id: 'STALE-LOCAL' })]),
    [KEYS.catalog]: JSON.stringify({ rooms: [{ id: 'STALE-ROOM' }] }),
  });
  globalThis.localStorage = stale;
  globalThis.document = runtimeDocument('production');

  const repositories = createPersistenceRuntime({
    mode: RUNTIME_MODE.PRODUCTION,
    apiClient: fakeApi(() => {
      throw new Error('API_OFFLINE');
    }),
  });

  await assert.rejects(repositories.requests.list(), /API_OFFLINE/);
  await assert.rejects(repositories.catalog.get(), /API_OFFLINE/);
  assert.deepEqual(stale.reads, []);
  assert.deepEqual(stale.writes, []);
});

test('authoritative LocalStorage keys fail closed in production while draft remains non-authoritative', () => {
  const storage = new TrackingStorage({
    [KEYS.requests]: JSON.stringify([requestRecord({ id: 'STALE-LOCAL' })]),
    [KEYS.draft]: JSON.stringify({ title: 'Local draft' }),
  });
  globalThis.localStorage = storage;
  globalThis.document = runtimeDocument('production');

  for (const key of [KEYS.requests, KEYS.catalog, KEYS.siteInfo, KEYS.notifications, KEYS.profile]) {
    assert.throws(
      () => readJson(key, null),
      (error) => error instanceof ProductionStorageAccessError
        && error.code === 'PRODUCTION_BROWSER_STORAGE_FORBIDDEN'
        && error.key === key,
    );
    assert.throws(() => writeJson(key, {}), ProductionStorageAccessError);
  }

  assert.deepEqual(readJson(KEYS.draft, null), { title: 'Local draft' });
  assert.equal(writeJson(KEYS.draft, { title: 'Updated draft' }), true);
});

test('demo runtime preserves existing browser repository compatibility', () => {
  const saved = [requestRecord({ id: 'DEMO-REQUEST' })];
  const storage = new TrackingStorage({ [KEYS.requests]: JSON.stringify(saved) });
  globalThis.localStorage = storage;
  globalThis.document = runtimeDocument('demo');

  const repositories = createPersistenceRuntime({ mode: RUNTIME_MODE.DEMO });
  assert.equal(repositories.mode, 'demo');
  assert.deepEqual(repositories.requests.all(), saved);
  assert.ok(storage.reads.includes(KEYS.requests));
});

test('malformed production responses fail closed instead of being treated as persisted state', async () => {
  const repositories = createProductionRepositories({
    apiClient: fakeApi((path) => {
      if (path === PRODUCTION_API_PATH.requests) {
        return { schemaVersion: 999, requests: [requestRecord()] };
      }
      return { request: requestRecord({ tenantId: 'should-not-be-exposed' }) };
    }),
  });

  await assert.rejects(
    repositories.requests.list(),
    (error) => error instanceof ProductionPersistenceError
      && error.code === 'PRODUCTION_SCHEMA_VERSION_UNSUPPORTED',
  );
  await assert.rejects(
    repositories.requests.get('REQ-1'),
    (error) => error instanceof ProductionPersistenceError
      && error.code === 'PRODUCTION_REQUEST_TENANT_EXPOSED',
  );
});
