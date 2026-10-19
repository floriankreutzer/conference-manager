import assert from 'node:assert/strict';
import test from 'node:test';
import { createCateringProviderCatalogueApi as createApi,
  normalizeProviderCatalogueSource as normalize } from '../src/platform/catering-provider-catalogue-api.js';

const id = (n) => `d0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const terms = () => ({ minimumLeadTimeMinutes: null,minimumOrderValue: null,changeCutoffMinutes: 60,cancelCutoffMinutes: 0 });
const item = (id = 'coffee') => ({ id,name: 'Synthetic received coffee',description: null,providerPrice: { amountMinor: 250,currency: 'EUR' } });
const source = () => ({ schemaVersion: 1,sourceVersion: null,items: [item()],packages: [],terms: terms() });
const summary = () => ({ sourceVersion: null,itemCount: 1,packageCount: 0,terms: terms() });
const entry = (revision) => ({ revision,configurationRevision: 1,recordedAt: '2026-10-19T00:00:00.000Z',
  reference: 'Synthetic actual supplier list',summary: summary() });
const history = (revision = 1) => ({ schemaVersion: 1,integrationId: id(1),providerId: 'manual_catering',
  configurationRevision: 1,currentRevision: revision,canReceive: true,
  revisions: Array.from({ length: Math.min(20,revision) },(_,i) => entry(revision-i)),nextBeforeRevision: revision>20 ? revision-19 : null });
const details = () => ({ schemaVersion: 1,integrationId: id(1),providerId: 'manual_catering',revision: 1,configurationRevision: 1,
  recordedAt: '2026-10-19T00:00:00.000Z',reference: 'Synthetic list',sourceVersion: null,terms: terms(),itemCount: 1,packageCount: 0,
  section: 'items',entries: [item()],nextAfterEntryId: null });
const intent = () => ({ schemaVersion: 1,commandId: id(2),expectedRevision: 0,expectedConfigurationRevision: 1,
  reference: 'Synthetic actual supplier list',attestReceivedFromSupplier: true,source: source() });
const forResponse = (response) => createApi({ apiClient: { request: async () => response } });
const ack = () => ({ schemaVersion: 1,commandId: id(2),revision: 1,configurationRevision: 1,replayed: false,
  recordedAt: '2026-10-19T00:00:00.000Z' });

test('source transport binds selected connection, exact history cursors and immutable detail without disclosing private fields', async () => {
  const calls = []; const responses = [history(21),{ ...history(),currentRevision: 21 },details()];
  const api = createApi({ apiClient: { request: async (path,options) => { calls.push({ path,options }); return responses.shift(); } } });
  const first = await api.loadSourceHistory({ integrationId: id(1) }); assert.equal(first.nextBeforeRevision,2);
  assert.equal((await api.loadSourceHistory({ integrationId: id(1),beforeRevision: 2 })).revisions[0].revision,1);
  const detail = await api.loadSourceDetails({ integrationId: id(1),revision: 1 });
  assert.equal(detail.entries[0].providerPrice.amountMinor,250); assert.equal(Object.isFrozen(detail.entries[0].providerPrice),true);
  assert.deepEqual(calls.map((call) => call.path),[
    `v1/tenant/catering/provider-catalogues/${id(1)}`,`v1/tenant/catering/provider-catalogues/${id(1)}?beforeRevision=2`,
    `v1/tenant/catering/provider-catalogues/${id(1)}/revisions/1?section=items`,
  ]); assert.ok(calls.every((call) => !call.options.method));
  assert.doesNotMatch(JSON.stringify(first),/providerPrice|actorUserId|tenantId|commandId|credential/);
});

test('history rejects truncated pages, false EOF, unsafe terms, foreign scope and scope or publication claims', async () => {
  for (const value of [ { ...history(),tenantId: id(9) },{ ...history(),integrationId: id(9) },
    { ...history(),providerId: 'unknown' },{ ...history(21),nextBeforeRevision: null },
    { ...history(21),revisions: history(21).revisions.slice(1) },{ ...history(),canReceive: 'true' },
    { ...history(),revisions: [{ ...entry(1),summary: { ...summary(),published: true } }] },
    { ...history(),revisions: [{ ...entry(1),summary: { ...summary(),terms: { ...terms(),cancelCutoffMinutes: -1 } } }] },
    { ...history(),revisions: [{ ...entry(1),configurationRevision: 2 }] } ]) {
    await assert.rejects(forResponse(value).loadSourceHistory({ integrationId: id(1) }));
  }
  let calls = 0; const api = createApi({ apiClient: { request: async () => { calls++; } } });
  for (const beforeRevision of [0,-1,'1',Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(api.loadSourceHistory({ integrationId: id(1),beforeRevision }));
  }
  await assert.rejects(api.loadSourceDetails({ integrationId: 'foreign',revision: 1 }));
  await assert.rejects(api.loadSourceDetails({ integrationId: id(1),revision: 1,section: 'credentials' }));
  await assert.rejects(api.loadSourceDetails({ integrationId: id(1),revision: 1,afterEntryId: '../foreign' })); assert.equal(calls,0);
});

test('detail validates the immutable revision, sparse values, monotonic entry cursors, genuine first-page EOF and private-field exclusion', async () => {
  for (const value of [{ ...details(),revision: 2 },{ ...details(),section: 'packages' },{ ...details(),actorUserId: id(9) },
    { ...details(),itemCount: 2 },{ ...details(),nextAfterEntryId: 'foreign' },{ ...details(),entries: Array(1) },
    { ...details(),entries: [{ ...item(),published: true }] },{ ...details(),entries: [{ ...item(),providerPrice: { amountMinor: -1,currency: 'EUR' } }] }]) {
    await assert.rejects(forResponse(value).loadSourceDetails({ integrationId: id(1),revision: 1 }));
  }
  await assert.rejects(forResponse(details()).loadSourceDetails({ integrationId: id(1),revision: 1,afterEntryId: 'coffee' }));
  const partial = { ...details(),itemCount: 2,nextAfterEntryId: 'coffee' };
  assert.equal((await forResponse(partial).loadSourceDetails({ integrationId: id(1),revision: 1 })).nextAfterEntryId,'coffee');
});

test('manual receipt requires deliberate attestation and exact acknowledgement, without retries after any uncertain or conflicting write', async () => {
  let received; const api = createApi({ apiClient: { request: async (path,options) => { received = { path,options }; return ack(); } } });
  const saved = await api.receiveSource({ integrationId: id(1),command: intent() }); assert.equal(saved.revision,1);
  assert.equal(received.path,`v1/tenant/catering/provider-catalogues/${id(1)}`);
  assert.equal(received.options.method,'POST'); assert.deepEqual(received.options.body,intent());
  for (const command of [{ ...intent(),attestReceivedFromSupplier: false },{ ...intent(),tenantId: id(1) },
    { ...intent(),expectedRevision: MAX_SAFE() },{ ...intent(),source: { ...source(),published: true } }]) {
    await assert.rejects(forResponse(ack()).receiveSource({ integrationId: id(1),command }));
  }
  for (const response of [{ ...ack(),revision: 2 },{ ...ack(),commandId: id(3) },{ ...ack(),configurationRevision: 2 },
    { ...ack(),replayed: 'true' },{ ...ack(),providerPrice: 1 }]) {
    await assert.rejects(forResponse(response).receiveSource({ integrationId: id(1),command: intent() }));
  }
  for (const code of ['NETWORK_ERROR','HTTP_409','HTTP_401','HTTP_403']) {
    let count = 0; const transport = createApi({ apiClient: { request: async () => {
      count++; throw Object.assign(new Error(code),{ code,serverCode: 'SYNTHETIC_SERVER_FAILURE' });
    } } });
    await assert.rejects(transport.receiveSource({ integrationId: id(1),command: intent() }),
      (error) => error.code === code && error.serverCode === 'SYNTHETIC_SERVER_FAILURE'); assert.equal(count,1);
  }
});
function MAX_SAFE() { return Number.MAX_SAFE_INTEGER - 1; }

test('source values retain unknown costs and full capacity, reject executable or foreign component shapes, and isolate mutation', () => {
  const value = source(); value.items[0].providerPrice = null;
  const normalized = normalize(value); assert.equal(normalized.items[0].providerPrice,null);
  assert.equal(normalized.terms.minimumLeadTimeMinutes,null); assert.equal(normalized.terms.cancelCutoffMinutes,0);
  value.items[0].name = 'Changed'; assert.equal(normalized.items[0].name,'Synthetic received coffee');
  const full = source(); full.items = Array.from({ length: 300 },(_,i) => item(`i-${i}`));
  full.packages = Array.from({ length: 100 },(_,i) => ({ ...item(`p-${i}`),itemIds: full.items.map((entry) => entry.id),
    variants: Array.from({ length: 20 },(_,j) => item(`v-${j}`)) }));
  assert.equal(normalize(full).packages[0].variants.length,20);
  full.packages[0].itemIds.push('foreign'); assert.throws(() => normalize(full));
  let reads = 0; const getter = source(); Object.defineProperty(getter,'items',{ enumerable: true,get() { reads++; return []; } });
  assert.throws(() => normalize(getter)); assert.equal(reads,0);
  assert.throws(() => normalize({ ...source(),items: [{ ...item(),name: '\ud800' }] }));
});

test('source discovery accepts disabled historical connections while rejecting foreign, reordered, incomplete and private pages', async () => {
  const connection = (n) => ({ integrationId: id(n),providerId: 'manual_catering',configurationRevision: 2,
    currentRevision: 1,canReceive: false });
  const value = { schemaVersion: 1,connections: Array.from({ length: 20 },(_,i) => connection(i+1)),nextAfterIntegrationId: id(20) };
  const page = await forResponse(value).listSourceConnections(); assert.equal(page.connections[0].canReceive,false);
  assert.equal(Object.isFrozen(page.connections[0]),true);
  for (const changed of [ { ...value,connections: [...value.connections].reverse() },{ ...value,nextAfterIntegrationId: id(19) },
    { ...value,connections: value.connections.slice(1) },{ ...value,tenantId: id(9) },
    { ...value,connections: [{ ...connection(1),credential: 'private' }] },
    { ...value,connections: [{ ...connection(1),providerId: 'unknown' }] } ]) {
    await assert.rejects(forResponse(changed).listSourceConnections());
  }
  await assert.rejects(forResponse(value).listSourceConnections({ afterIntegrationId: id(1) }));
  let requested; const api = createApi({ apiClient: { request: async (path) => { requested = path;
    return { schemaVersion: 1,connections: [connection(21)],nextAfterIntegrationId: null }; } } });
  assert.equal((await api.listSourceConnections({ afterIntegrationId: id(20) })).connections.length,1);
  assert.equal(requested,`v1/tenant/catering/provider-catalogues?afterIntegrationId=${id(20)}`);
});
