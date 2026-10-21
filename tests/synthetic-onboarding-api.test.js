import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { discoverProtectedSyntheticOnboarding,normalizeSyntheticOnboardingView } from '../src/platform/synthetic-onboarding-api.js';
import { featureFlags } from '../src/platform/feature-flags.js';

const requestId=randomUUID(),mode={ mode: 'synthetic',provider: 'synthetic_calendar',requestId };
const view={ ...mode,microsoftConnection: 'not_applicable',tenantStatus: 'onboarding',locationsRevision: 2,roomCount: 0,boundRoomCount: 0,
  calendarWriteEntitled: true,readiness: { ready: false,checks: { roomsImported: false,calendarResourcesBound: false,
    directoryEntitled: true,calendarEntitled: true } },candidates: [
    { key: 'workshop',name: 'Fabrikam Workshop',capacity: 12,building: 'Fabrikam Campus',timeZone: 'Europe/Berlin',imported: false },
    { key: 'focus',name: 'Fabrikam Focus',capacity: 6,building: 'Fabrikam Campus',timeZone: 'Europe/Berlin',imported: false },
  ] };
function fixture() {
  const state={ mode,view,writeError: null },calls=[];
  const apiClient={ async request(path,options) {
    calls.push({ path,options });assert.equal(options.signal.aborted,false);
    if (path==='v1/tenant/runtime') { if (state.mode instanceof Error) throw state.mode;return structuredClone(state.mode); }
    if (options.method==='POST' && state.writeError) throw state.writeError;
    return { ...structuredClone(state.view),...(path.endsWith('/rooms/import') ? { importedCount: 0 } : {}) };
  } };
  return { state,calls,apiClient,discover: ()=>discoverProtectedSyntheticOnboarding({ apiClient }) };
}

test('current REAL metadata alone keeps Microsoft presentation; unknown, malformed or unavailable mode cannot select fallback',async()=>{
  const real=fixture();real.state.mode={ mode: 'real',provider: 'microsoft365',requestId };
  assert.equal(await real.discover(),null);assert.equal(real.calls.length,1);
  for (const value of [{ ...mode,provider: 'microsoft365' },{ ...mode,extra: true },{ ...mode,mode: 'unknown' },
    Object.assign(new Error('unavailable'),{ code: 'HTTP_503' })]) {
    const f=fixture();f.state.mode=value;const adapter=await f.discover();assert.ok(adapter);
    await assert.rejects(adapter.getView());assert.equal(f.calls.every(call=>call.path==='v1/tenant/runtime'),true);
  }
  const forbidden=fixture();forbidden.state.mode=Object.assign(new Error('denied'),{ code: 'HTTP_403' });
  await assert.rejects(forbidden.discover(),{ code: 'HTTP_403' });
});

test('local-calendar views are truthful, closed, bounded, coherent and detached from mutable response objects',()=>{
  const copy=structuredClone(view),normalized=normalizeSyntheticOnboardingView(copy);
  copy.candidates[0].name='Changed';copy.readiness.checks.directoryEntitled=false;
  assert.equal(normalized.candidates[0].name,'Fabrikam Workshop');assert.ok(Object.isFrozen(normalized.readiness.checks));
  for (const change of [{ microsoftConnection: 'connected' },{ mode: 'real' },{ provider: 'microsoft365' },{ roomCount: -1 },
    { boundRoomCount: 1 },{ locationsRevision: 0 },{ requestId: {} },{ extra: true },{ readiness: { ...view.readiness,ready: true } },
    { candidates: [view.candidates[0],view.candidates[0]] }]) assert.throws(()=>normalizeSyntheticOnboardingView({ ...view,...change }));
});

test('client uses captured same-origin API/CSRF transport, exact mutation intent and no automatic write retry',async()=>{
  const f=fixture(),adapter=await f.discover();f.apiClient.request=()=>{ assert.fail('captured API port must remain fixed'); };
  assert.equal((await adapter.getView()).mode,'synthetic');
  const keys=['workshop','focus'],promise=adapter.importRooms({ expectedRevision: 2,selectedKeys: keys });keys[0]='foreign';
  await promise;const write=f.calls.find(call=>call.options.method==='POST');
  assert.deepEqual(write.options.body,{ expectedRevision: 2,selectedKeys: ['focus','workshop'] });
  assert.equal(Object.hasOwn(write.options.body,'tenantId'),false);
  await adapter.transition({ expectedRevision: 2,expectedStatus: 'onboarding',targetStatus: 'ready' });
  f.state.writeError=Object.assign(new Error('lost response'),{ code: 'NETWORK_ERROR' });
  const before=f.calls.length;await assert.rejects(adapter.importRooms({ expectedRevision: 2,selectedKeys: ['focus'] }));
  assert.equal(f.calls.length,before+1);
  f.state.mode={ mode: 'real',provider: 'microsoft365',requestId };
  await assert.rejects(adapter.getView(),{ code: 'SYNTHETIC_ONBOARDING_RELOAD_REQUIRED' });
});

test('malformed, accessor, foreign, duplicate and illegal input is refused before any POST',async()=>{
  const f=fixture(),adapter=await f.discover(),before=f.calls.length;
  const accessor={ expectedRevision: 2,selectedKeys: ['focus'] };
  Object.defineProperty(accessor,'selectedKeys',{ get() { assert.fail('input getter cannot execute'); } });
  const array=[];Object.defineProperty(array,0,{ get() { assert.fail('array getter cannot execute'); } });
  for (const input of [accessor,{ expectedRevision: 2,selectedKeys: array },{ expectedRevision: 2,selectedKeys: ['focus'],mode: 'real' },
    { expectedRevision: 0,selectedKeys: ['focus'] },{ expectedRevision: 2,selectedKeys: ['focus','focus'] },
    { expectedRevision: 2,selectedKeys: ['foreign'] }]) await assert.rejects(adapter.importRooms(input));
  await assert.rejects(adapter.transition({ expectedRevision: 2,expectedStatus: 'onboarding',targetStatus: 'active' }));
  await assert.rejects(adapter.transition({ expectedRevision: 2,expectedStatus: 'ready',targetStatus: 'active',tenantId: randomUUID() }));
  assert.equal(f.calls.length,before);
});

test('synthetic onboarding presentation remains off by default and unavailable for PROD or ambiguous document metadata',()=>{
  const metadata={ 'conference-protected-runtime': 'true','conference-deployment-environment': 'int',
    'conference-protected-synthetic': 'enabled' };
  const document={ querySelectorAll(selector) { const key=selector.match(/name="([^"]+)"/)?.[1];
    return Object.hasOwn(metadata,key) ? [{ content: metadata[key] }] : []; } };
  assert.equal(featureFlags.forProtectedDocument(document).isEnabled('customer.synthetic-onboarding'),true);
  metadata['conference-deployment-environment']='prod';
  assert.equal(featureFlags.forProtectedDocument(document).isEnabled('customer.synthetic-onboarding'),false);
  assert.equal(featureFlags.forProtectedDocument({ querySelectorAll: ()=>[] }).isEnabled('customer.synthetic-onboarding'),false);
  assert.equal(featureFlags.isEnabled('customer.synthetic-onboarding'),false);
});
