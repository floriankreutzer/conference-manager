import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  #values = new Map();

  constructor(seed = {}) {
    Object.entries(seed).forEach(([key, value]) => this.#values.set(String(key), String(value)));
  }

  get length() { return this.#values.size; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
  removeItem(key) { this.#values.delete(String(key)); }
  clear() { this.#values.clear(); }
}

class SelectiveFailingStorage extends MemoryStorage {
  constructor(failingKey, seed = {}) {
    super(seed);
    this.failingKey = failingKey;
  }

  setItem(key, value) {
    if (key === this.failingKey) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    super.setItem(key, value);
  }
}

let runtimeMode = 'demo';
globalThis.document = {
  documentElement: {},
  querySelector(selector) {
    if (selector === 'meta[name="conference-runtime"]') return { getAttribute: () => runtimeMode };
    return null;
  },
};
globalThis.localStorage = new MemoryStorage();

const storage = await import('../src/core/storage.js');
const parityData = await import('../src/shared/parity-data.js');

const existingRequests = [{ id: 'CR-2026-100001', title: 'Existing request' }];

test.afterEach(() => {
  runtimeMode = 'demo';
  globalThis.localStorage = new MemoryStorage();
});

test('regression: request save fails closed when browser persistence fails', () => {
  globalThis.localStorage = new SelectiveFailingStorage(storage.KEYS.requests, {
    [storage.KEYS.requests]: JSON.stringify(existingRequests),
  });

  assert.throws(
    () => storage.requestRepository.save([{ id: 'CR-2026-100002', title: 'New request' }, ...existingRequests]),
    (error) => {
      assert.equal(error instanceof storage.RepositoryWriteError, true);
      assert.equal(error.code, 'REPOSITORY_WRITE_FAILED');
      assert.equal(error.key, storage.KEYS.requests);
      return true;
    },
  );
  assert.deepEqual(storage.requestRepository.all(), existingRequests);
});

test('regression: request update fails closed instead of returning an unsaved value', () => {
  globalThis.localStorage = new SelectiveFailingStorage(storage.KEYS.requests, {
    [storage.KEYS.requests]: JSON.stringify(existingRequests),
  });

  assert.throws(
    () => storage.requestRepository.update((list) => list.map((request) => ({ ...request, title: 'Unsaved update' }))),
    (error) => error instanceof storage.RepositoryWriteError && error.code === 'REPOSITORY_WRITE_FAILED',
  );
  assert.equal(storage.requestRepository.all()[0].title, 'Existing request');
});

test('progression: notification persistence remains best-effort after primary business data succeeds', () => {
  globalThis.localStorage = new SelectiveFailingStorage(storage.KEYS.notifications, {
    [storage.KEYS.notifications]: '[]',
  });

  assert.doesNotThrow(() => storage.notificationRepository.save([{ id: 'notice-1' }]));
  assert.deepEqual(storage.notificationRepository.all(), []);
});

test('regression: manager catalog persistence fails closed when browser storage rejects the write', () => {
  const existingCatalog = { rooms: [{ id: 'R1', rate: 100 }] };
  globalThis.localStorage = new SelectiveFailingStorage(storage.KEYS.catalog, {
    [storage.KEYS.catalog]: JSON.stringify(existingCatalog),
  });

  assert.throws(
    () => parityData.writeCatalog({ rooms: [{ id: 'R1', rate: 200 }] }),
    (error) => error instanceof storage.RepositoryWriteError
      && error.code === 'REPOSITORY_WRITE_FAILED'
      && error.key === storage.KEYS.catalog,
  );
  assert.deepEqual(parityData.catalogData().rooms, existingCatalog.rooms);
});

test('regression: manager site persistence fails closed when browser storage rejects the write', () => {
  const existingSites = { Berlin: { address: 'Existing address' } };
  globalThis.localStorage = new SelectiveFailingStorage(storage.KEYS.siteInfo, {
    [storage.KEYS.siteInfo]: JSON.stringify(existingSites),
  });

  assert.throws(
    () => parityData.writeSites({ Berlin: { address: 'Unsaved address' } }),
    (error) => error instanceof storage.RepositoryWriteError
      && error.code === 'REPOSITORY_WRITE_FAILED'
      && error.key === storage.KEYS.siteInfo,
  );
  assert.deepEqual(parityData.siteData(), existingSites);
});

test('regression: Demo image sources reject remote URLs and preserve managed local assets', () => {
  const browserContext = {
    baseUrl: 'https://conference.test/conference-manager/',
    origin: 'https://conference.test',
  };
  const managedAsset = 'assets/demo/route-openstreetmap.svg';
  assert.equal(parityData.validatedImageSource(managedAsset, browserContext), managedAsset);
  assert.equal(
    parityData.validatedImageSource(
      'https://conference.test/conference-manager/assets/demo/route-openstreetmap.svg',
      browserContext,
    ),
    'https://conference.test/conference-manager/assets/demo/route-openstreetmap.svg',
  );
  assert.equal(
    parityData.validatedImageSource('https://example.invalid/remote.svg', browserContext),
    null,
  );
  assert.equal(
    parityData.validatedImageSource('x'.repeat(parityData.DEMO_IMAGE_SOURCE_MAX_LENGTH + 1), browserContext),
    null,
  );

  const safeSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
  const safeDataUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(safeSvg)}`;
  assert.equal(parityData.validatedImageSource(safeDataUrl, browserContext), safeDataUrl);
  const remoteSvg = '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/a.svg"/></svg>';
  assert.equal(
    parityData.validatedImageSource(
      `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(remoteSvg)}`,
      browserContext,
    ),
    null,
  );

  globalThis.localStorage = new MemoryStorage({
    [storage.KEYS.catalog]: JSON.stringify({
      rooms: [],
      services: [],
      cateringItems: [],
      cateringPackages: [{
        id: 'meeting',
        variants: [{ tier: 'Basic', image: managedAsset }],
      }],
    }),
  });
  parityData.ensureParityCatalog();
  assert.equal(parityData.catalogData().cateringPackages[0].variants[0].image, managedAsset);
});

test('progression: production runtime blocks authoritative LocalStorage reads and writes', () => {
  runtimeMode = 'production';
  globalThis.localStorage = new MemoryStorage({
    [storage.KEYS.requests]: JSON.stringify([{ id: 'browser-forged' }]),
    [storage.KEYS.role]: 'manager',
  });

  for (const operation of [
    () => storage.requestRepository.all(),
    () => storage.requestRepository.save([]),
    () => storage.readString(storage.KEYS.role, 'employee'),
    () => storage.writeString(storage.KEYS.role, 'manager'),
    () => storage.readJson(storage.KEYS.profile, {}),
  ]) {
    assert.throws(
      operation,
      (error) => error instanceof storage.ProductionBrowserPersistenceError
        && error.code === 'PRODUCTION_BROWSER_PERSISTENCE_BLOCKED',
    );
  }
});

test('progression: production still permits non-authoritative local UI preferences', () => {
  runtimeMode = 'production';
  globalThis.localStorage = new MemoryStorage();

  assert.equal(storage.writeString(storage.KEYS.language, 'en'), true);
  assert.equal(storage.readString(storage.KEYS.language, 'de'), 'en');
  assert.equal(storage.writeJson(storage.KEYS.draft, { title: 'local-only draft' }), true);
  assert.equal(storage.readJson(storage.KEYS.draft, null).title, 'local-only draft');
});
