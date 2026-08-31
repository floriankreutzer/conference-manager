import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { applicationProjectionPayload } from './e2e/fixtures/application-projections.js';

const previousDocument = globalThis.document;
const previousLocalStorage = globalThis.localStorage;
globalThis.document = {
  documentElement: { lang: 'de' },
  querySelector(selector) {
    if (selector !== 'meta[name="conference-runtime"]') return null;
    return { getAttribute: () => 'production' };
  },
};
globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};
const { createApplicationContextFromState } = await import('../src/platform/application-context.js');
if (previousDocument === undefined) delete globalThis.document;
else globalThis.document = previousDocument;
if (previousLocalStorage === undefined) delete globalThis.localStorage;
else globalThis.localStorage = previousLocalStorage;

const SESSION = Object.freeze({
  user: Object.freeze({ id: '11111111-1111-4111-8111-111111111111' }),
  tenant: Object.freeze({ id: '22222222-2222-4222-8222-222222222222', status: 'active' }),
  roles: Object.freeze(['employee']),
  permissions: Object.freeze(['request:read', 'request:cancel']),
  session: Object.freeze({ expiresAt: '2099-01-01T00:00:00.000Z' }),
});

function contextFor(apiClient, options = {}) {
  return createApplicationContextFromState({
    runtimeMode: 'production',
    productionSession: SESSION,
    productionAuthenticationStatus: 'authenticated',
    authenticationRuntime: Object.freeze({ apiClient }),
    requiredProjectionTimeoutMs: 5,
    ...options,
  });
}

test('post-bootstrap Request refresh aborts a stalled server projection and keeps the last safe state', async () => {
  let aborted = false;
  const context = contextFor(Object.freeze({
    async request(path, options = {}) {
      assert.match(path, /^v1\/application\/requests\?/);
      assert.equal(options.signal instanceof AbortSignal, true);
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      });
    },
  }), {
    serverRequests: Object.freeze([{ id: 'last-safe-request' }]),
  });

  await assert.rejects(() => context.refreshRequests());
  assert.equal(aborted, true);
  assert.deepEqual(context.requests(), [{ id: 'last-safe-request' }]);
});

test('reference-data refresh replaces the cached catalog only after a bounded valid server snapshot', async () => {
  const signals = [];
  const context = contextFor(Object.freeze({
    async request(path, options = {}) {
      signals.push(options.signal);
      const payload = applicationProjectionPayload(
        new URL(`https://conference.test/api/${path}`),
        { defaultCurrency: 'GBP' },
      );
      assert.notEqual(payload, null);
      return payload;
    },
  }), {
    serverCatalog: Object.freeze({
      sites: Object.freeze([{ id: 'stale-site' }]),
      rooms: Object.freeze([]),
    }),
  });

  assert.equal(context.getCatalog().sites[0].id, 'stale-site');
  const refreshed = await context.reloadReferenceData();

  assert.equal(signals.length, 6);
  assert.equal(signals.every((signal) => signal instanceof AbortSignal), true);
  assert.equal(refreshed.sites[0].id, 'fixture-site');
  assert.equal(refreshed.organization.defaultCurrency, 'GBP');
  assert.equal(context.getCatalog(), refreshed);
});

test('Welcome treats Request and reference refreshes as required server projections', async () => {
  const source = await readFile(new URL('../src/platform/app-shell.js', import.meta.url), 'utf8');

  assert.match(source, /context\.refreshRequests\(\)/);
  assert.match(source, /context\.reloadReferenceData\(\)/);
  assert.match(source, /requestResult\.status === 'rejected' \|\| referenceResult\.status === 'rejected'/);
});
