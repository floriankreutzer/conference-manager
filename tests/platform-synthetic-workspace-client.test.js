import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformSyntheticWorkspaceClient } from '../src/platform-admin/production/synthetic-workspace/client.js';
const uuid=index=>`ba000000-0000-4000-8000-${String(index).padStart(12,'0')}`,STATE='S'.repeat(43),CSRF='C'.repeat(43);
const snapshot=()=>({ generationId: uuid(2),revision: 1,available: true,tenants: ['northwind','contoso','fabrikam'].map((slot,index)=>({
  slot,tenantId: uuid(index+3),status: ['active','ready','onboarding'][index] })) });
const directory=()=>({ generation: snapshot(),retainedGenerations: 1,canReplace: true,replaceAfter: null,requestId: uuid(1) });
function fixture({ refresh=true,browser=null,respond=null,assuranceMode='application_passkey',microsoftConfirmation=null }={}) {
  const calls=[],forms=[],events=[];let active=false;
  const client=createPlatformSyntheticWorkspaceClient({ origin: 'https://127.0.0.1',assuranceMode,microsoftConfirmation,
    apiClient: { async request(path,options={}) {
      calls.push({ path,options,active });assert.ok(options.signal instanceof AbortSignal);
      if (respond) return respond(path,options);
      if (path==='synthetic/generation') return directory();
      if (path==='auth/delegation/intent') return { status: 'confirmation_required',slots: ['northwind','contoso','fabrikam'],
        roles: ['employee','conference_manager','tenant_admin'],requestId: uuid(1) };
      if (path.endsWith('/options')) return { status: 'passkey_required',state: STATE,options: { challenge: STATE },requestId: uuid(1) };
      if (path.endsWith('/replace')) return { status: 'generation_replaced',generation: snapshot(),csrfToken: CSRF,requestId: uuid(1) };
      assert.fail('UNKNOWN_PATH');
    } },runExclusive: async work=>{
      assert.equal(active,false);active=true;events.push('queue');
      try { return await work(new AbortController().signal); } finally { active=false;events.push('release'); }
    },refreshSession: async()=>{ events.push('session');return refresh; },csrfTokenProvider: ()=>CSRF,
    browser: browser || { async authenticate(options,{ signal }) {
      assert.equal(active,true);assert.equal(options.challenge,STATE);assert.ok(signal instanceof AbortSignal);
      events.push('assertion');return { id: 'candidate-signature' };
    } },navigation: { submit: (...args)=>{ assert.equal(active,true);forms.push(args); },
      reset() { events.push('form-cleared'); },dispose() { events.push('disposed'); } } });
  return { client,calls,forms,events,active: ()=>active };
}

test('own directory and signed-intent discovery accept only minimized closed projections and never provision on GET',async()=>{
  const f=fixture(),view=await f.client.currentGeneration();assert.equal(view.generation.tenants[1].status,'ready');
  assert.equal(await f.client.pendingIntent(),true);assert.equal(f.forms.length,0);assert.deepEqual(f.events,[]);
  assert.deepEqual(f.calls.map(x=>x.path),['synthetic/generation','auth/delegation/intent']);
  for (const malformed of [{ ...directory(),operatorId: uuid(9) },{ ...directory(),retainedGenerations: 33 },
    { ...directory(),generation: { ...snapshot(),tenants: snapshot().tenants.slice(1) } },
    { ...directory(),generation: { ...snapshot(),tenants: snapshot().tenants.map(x=>({ ...x,tenantId: uuid(3) })) } },
    { ...directory(),canReplace: true,replaceAfter: new Date().toISOString() }]) {
    const bad=fixture({ respond: ()=>malformed });await assert.rejects(bad.client.currentGeneration(),/RESPONSE_INVALID/);
    assert.equal(bad.forms.length,0);
  }
  const none=fixture({ respond: ()=>({ status: 'none',requestId: uuid(1) }) });assert.equal(await none.client.pendingIntent(),false);
});

test('explicit generation replacement signs exactly the expected own revision and verifies normal session before releasing its queue',async()=>{
  const f=fixture();await f.client.replace({ expectedGenerationId: null,expectedRevision: 0 });
  assert.deepEqual(f.events,['queue','assertion','session','release']);assert.equal(f.forms.length,0);
  assert.deepEqual(f.calls.map(x=>x.path),['synthetic/generation/options','synthetic/generation/replace']);
  assert.deepEqual(f.calls[0].options.body,{ expectedGenerationId: null,expectedRevision: 0 });
  assert.deepEqual(f.calls[1].options.body,{ expectedGenerationId: null,expectedRevision: 0,state: STATE,response: { id: 'candidate-signature' } });
  assert.equal(f.calls.every(x=>x.active),true);
  for (const value of [{ expectedGenerationId: uuid(2),expectedRevision: 0 },{ expectedGenerationId: null,expectedRevision: 1 },
    { expectedGenerationId: null,expectedRevision: 0,operatorId: uuid(9) }]) assert.throws(()=>f.client.replace(value));
  assert.equal(f.calls.length,2);
});

test('unknown commit response and missing refreshed session never repeat a mutation or mint an elevated browser state',async()=>{
  const missing=fixture({ refresh: false });await assert.rejects(missing.client.replace({ expectedGenerationId: null,expectedRevision: 0 }),
    /SESSION_REFRESH_REQUIRED/);assert.equal(missing.calls.length,2);assert.equal(missing.forms.length,0);
  let writes=0;const unknown=fixture({ respond(path) {
    if (path.endsWith('/options')) return { status: 'passkey_required',state: STATE,options: { challenge: STATE },requestId: uuid(1) };
    writes++;throw new Error('SYNTHETIC_COMMIT_OUTCOME_UNKNOWN');
  } });
  await assert.rejects(unknown.client.replace({ expectedGenerationId: null,expectedRevision: 0 }),/OUTCOME_UNKNOWN/);
  assert.equal(writes,1);assert.equal(unknown.forms.length,0);assert.equal(unknown.active(),false);
});

test('native approval keeps proof-cookie serialization pinned until explicit check and fresh ordinary session resolution',async()=>{
  const f=fixture();let entered;const seen=new Promise(resolve=>{ entered=resolve; });let settled=false;
  const task=f.client.approve({ generationId: uuid(2),slot: 'fabrikam',role: 'tenant_admin' },{ onNavigation: entered })
    .then(()=>{ settled=true; });
  await seen;assert.equal(settled,false);assert.equal(f.active(),true);assert.equal(f.forms.length,1);
  assert.equal(f.forms[0][0],'platform-approve');assert.equal(f.forms[0][1].csrfToken,CSRF);
  assert.deepEqual(JSON.parse(f.forms[0][1].payload),{ generationId: uuid(2),slot: 'fabrikam',role: 'tenant_admin',
    state: STATE,response: { id: 'candidate-signature' } });
  f.client.cancelNavigation();await task;assert.equal(f.active(),false);
  assert.deepEqual(f.events.slice(-3),['form-cleared','session','release']);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'auth/delegation/options');
});

test('stopping an in-flight browser prompt aborts it without submitting a form or running a mutation',async()=>{
  let entered;const seen=new Promise(resolve=>{ entered=resolve; });
  const f=fixture({ browser: { authenticate(_options,{ signal }) {
    entered();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('SYNTHETIC_NATIVE_ABORT')),{ once: true }));
  } } });
  const task=f.client.approve({ generationId: uuid(2),slot: 'northwind',role: 'employee' },{ onNavigation: ()=>assert.fail('NO_NAVIGATION') });
  await seen;f.client.stop();await assert.rejects(task,/NATIVE_ABORT/);assert.equal(f.forms.length,0);assert.equal(f.calls.length,1);
  await assert.rejects(f.client.currentGeneration(),/CANCELLED/);assert.equal(f.calls.length,1);
});

test('Microsoft synthetic creation and native approval hold the same queue and send state without an application-key response',async()=>{
  const challenge={ status: 'microsoft_required',state: STATE },confirmations=[];
  const f=fixture({ assuranceMode: 'microsoft_mfa',browser: { authenticate: ()=>assert.fail('NO_APPLICATION_KEY') },
    async microsoftConfirmation(value,{ signal }) {
      assert.equal(f.active(),true);assert.ok(signal instanceof AbortSignal);confirmations.push(value);return value.state;
    },respond(path) {
      if (path.endsWith('/options')) return challenge;
      if (path.endsWith('/replace')) return { status: 'generation_replaced',generation: snapshot(),csrfToken: CSRF,requestId: uuid(1) };
      assert.fail('NO_OTHER_ROUTE');
    } });
  await f.client.replace({ expectedGenerationId: null,expectedRevision: 0 });
  assert.deepEqual(f.calls[1].options.body,{ expectedGenerationId: null,expectedRevision: 0,state: STATE });
  let navigated;const seen=new Promise(resolve=>{ navigated=resolve; });
  const approval=f.client.approve({ generationId: uuid(2),slot: 'fabrikam',role: 'tenant_admin' },{ onNavigation: navigated });
  await seen;assert.equal(f.active(),true);
  assert.deepEqual(JSON.parse(f.forms[0][1].payload),{ generationId: uuid(2),slot: 'fabrikam',role: 'tenant_admin',state: STATE });
  f.client.cancelNavigation();await approval;assert.equal(f.active(),false);assert.equal(confirmations.length,2);
});

test('cancelled Microsoft confirmation sends no generation mutation or navigation',async()=>{
  const f=fixture({ assuranceMode: 'microsoft_mfa',respond: ()=>({ status: 'microsoft_required',state: STATE }),
    microsoftConfirmation: async()=>{ throw Object.assign(new Error('cancelled'),{ code: 'PLATFORM_MICROSOFT_OPERATION_CANCELLED' }); } });
  await assert.rejects(f.client.replace({ expectedGenerationId: null,expectedRevision: 0 }),{ code: 'PLATFORM_MICROSOFT_OPERATION_CANCELLED' });
  assert.equal(f.calls.length,1);assert.equal(f.forms.length,0);assert.equal(f.active(),false);
});
