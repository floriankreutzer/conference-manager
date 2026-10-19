import assert from 'node:assert/strict';
import test from 'node:test';
import { createCateringConfigurationApi } from '../src/platform/catering-configuration-api.js';
import { CATERING_CAPABILITIES } from '../src/shared/catering-configuration.js';
import { discoverCateringConfiguration } from '../src/platform/catering-configuration-runtime.js';
import { featureFlags } from '../src/platform/feature-flags.js';

const id = (n) => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const capabilities = () => Object.fromEntries(CATERING_CAPABILITIES.map((key) => [key, 'manual']));
const configuration = () => ({ initialOrderMode: 'manager_review', capabilities: capabilities() });
const current = (n = 1) => ({ schemaVersion: 1, integrationId: id(n), providerId: 'manual_catering', revision: 1,
  configuration: configuration() });
const page = (connections = []) => ({ schemaVersion: 1,
  providers: [{ providerId: 'manual_catering', capabilities: capabilities() }], connections, nextAfterIntegrationId: null });
const context = (overrides = {}) => ({ isDemoRuntime: () => false, isTenantAdmin: () => true,
  hasTenantAdminPermission: () => true, ...overrides });

test('Catering wire client bounds pages and sends only source selection/configuration/command intent', async () => {
  const calls = [];
  const api = createCateringConfigurationApi({ apiClient: { async request(path, options) {
    calls.push({ path, options });
    return options.method === 'GET' || options.method === undefined ? page([current(2)])
      : { ...current(2), revision: options.method === 'PUT' ? 2 : 1 };
  } } });
  const result = await api.listConnections({ afterIntegrationId: id(1) });
  assert.ok(Object.isFrozen(result.connections));
  assert.equal(calls[0].path, `v1/integrations/catering?afterIntegrationId=${id(1)}`);
  await api.createConnection({ commandId: id(3), providerId: 'manual_catering', configuration: configuration() });
  assert.deepEqual(calls[1].options, { method: 'POST', body: {
    schemaVersion: 1, commandId: id(3), providerId: 'manual_catering', configuration: configuration(),
  } });
  await api.saveConfiguration({ integrationId: id(2), expectedRevision: 1, configuration: configuration() });
  assert.deepEqual(calls[2].options, { method: 'PUT', body: { schemaVersion: 1, expectedRevision: 1, configuration: configuration() } });
  assert.equal(JSON.stringify(calls).includes('tenantId'), false);
});

test('Catering response parser rejects secret/unknown fields, source upgrades, foreign object acknowledgements and malformed pages', async () => {
  for (const value of [
    { ...page(), privateReference: 'untrusted' }, page([{ ...current(), credentials: 'untrusted' }]),
    page([{ ...current(), revision: Number.MAX_SAFE_INTEGER }]), page([current(2), current(1)]),
    page([current(1), current(1)]), page(Array.from({ length: 21 }, (_, i) => current(i + 1))),
    { ...page([current()]), nextAfterIntegrationId: id(1) },
    page([{ ...current(), providerId: 'unknown_supplier' }]),
    page([{ ...current(), configuration: { ...configuration(), capabilities: { ...capabilities(), 'catering.order': 'api' } } }]),
    { ...page(), providers: [{ providerId: 'manual_catering', capabilities: {} }] },
  ]) {
    const api = createCateringConfigurationApi({ apiClient: { request: async () => value } });
    await assert.rejects(api.listConnections());
  }
  const api = createCateringConfigurationApi({ apiClient: { request: async () => ({ ...current(9), revision: 2 }) } });
  await assert.rejects(api.saveConfiguration({ integrationId: id(1), expectedRevision: 1, configuration: configuration() }));
});

test('Catering client validates mutation input before network and retains typed authority/conflict errors', async () => {
  const calls = [];
  const api = createCateringConfigurationApi({ apiClient: { request: async (...args) => { calls.push(args); return current(); } } });
  for (const change of [{ commandId: 'untrusted' }, { providerId: 'unknown' },
    { configuration: { ...configuration(), endpoint: 'https://untrusted.test' } }]) {
    await assert.rejects(api.createConnection({ commandId: id(3), providerId: 'manual_catering', configuration: configuration(), ...change }));
  }
  await assert.rejects(api.listConnections({ afterIntegrationId: 'untrusted' }));
  await assert.rejects(api.saveConfiguration({ integrationId: id(1), expectedRevision: 0, configuration: configuration() }));
  assert.deepEqual(calls, []);
  const conflict = createCateringConfigurationApi({ apiClient: { async request() {
    throw Object.assign(new Error('HTTP_409'), { code: 'HTTP_409', currentRevision: 3, serverCode: 'TENANT_SETTINGS_REVISION_CONFLICT' });
  } } });
  await assert.rejects(conflict.saveConfiguration({ integrationId: id(1), expectedRevision: 1, configuration: configuration() }),
    { code: 'HTTP_409', currentRevision: 3, serverCode: 'TENANT_SETTINGS_REVISION_CONFLICT' });
});

test('discovery admits the centrally default-off presentation only after a valid server page', async () => {
  assert.equal(featureFlags.isEnabled('catering.configuration'), false);
  for (const value of [false, undefined, 'true', 1]) {
    assert.equal(featureFlags.forServerCateringConfiguration(value).isEnabled('catering.configuration'), false);
  }
  let signal;
  const runtime = await discoverCateringConfiguration({ context: context(), authentication: { apiClient: {
    async request(path, options) { signal = options.signal; return page(); },
  } } });
  assert.equal(runtime.featureFlags.isEnabled('catering.configuration'), true);
  assert.equal(signal.aborted, true);
  assert.equal(featureFlags.isEnabled('catering.configuration'), false);
});

test('discovery skips Demo and missing Admin permission, hides optional failures and propagates authority loss', async () => {
  let calls = 0;
  const authentication = { apiClient: { async request() { calls += 1; return page(); } } };
  for (const projection of [context({ isDemoRuntime: () => true }), context({ isTenantAdmin: () => false }),
    context({ hasTenantAdminPermission: () => false })]) {
    assert.equal(await discoverCateringConfiguration({ context: projection, authentication }), null);
  }
  assert.equal(calls, 0);
  for (const code of ['HTTP_404', 'HTTP_503']) {
    const unavailable = { apiClient: { async request() { throw Object.assign(new Error(code), { code }); } } };
    assert.equal(await discoverCateringConfiguration({ context: context(), authentication: unavailable }), null);
  }
  for (const code of ['HTTP_401', 'HTTP_403']) {
    const denied = { apiClient: { async request() { throw Object.assign(new Error(code), { code }); } } };
    await assert.rejects(discoverCateringConfiguration({ context: context(), authentication: denied }), { code });
  }
  assert.equal(await discoverCateringConfiguration({ context: context(), authentication: { apiClient: { request: async () => ({}) } } }), null);
});

test('bounded discovery aborts a stalled projection and cannot later enable the default-off global flag', async () => {
  let signal;
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  const runtime = await discoverCateringConfiguration({ context: context(), timeoutMs: 5, authentication: { apiClient: {
    request: async (path, options) => { signal = options.signal; return promise; },
  } } });
  assert.equal(runtime, null);
  assert.equal(signal.aborted, true);
  release(page());
  await promise;
  assert.equal(featureFlags.isEnabled('catering.configuration'), false);
});
