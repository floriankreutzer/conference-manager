import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformOwnerCustomerClient } from '../src/platform-admin/production/owner-customer/client.js';
import { createPlatformOwnerCustomerController } from '../src/platform-admin/production/owner-customer/controller.js';
const uuid=n=>`ba000000-0000-4000-8000-${String(n).padStart(12,'0')}`,state='S'.repeat(43),csrf='C'.repeat(43);
const directory=()=>({ status: 'confirmation_required',customerStartUrl: 'https://app-int.example.test/?auth=owner_start',
  tenants: [{ tenantId: uuid(2),displayName: 'Customer',status: 'active' }],nextTenantId: null,
  roles: ['employee','conference_manager','tenant_admin'],requestId: uuid(1) });
function clientFixture({ response=directory(),refresh=true,confirmation=null }={}) {
  const calls=[],forms=[],events=[];let active=false;
  const client=createPlatformOwnerCustomerClient({ origin: 'https://ops-int.example.com',
    apiClient: { async request(path,options={}) { calls.push({ path,options,active });
      return path.endsWith('/options') ? { state } : response; } },
    runExclusive: async work=>{ assert.equal(active,false);active=true;try { return await work(new AbortController().signal); }
      finally { active=false;events.push('released'); } },
    refreshSession: async()=>{ events.push('refresh');return refresh; },csrfTokenProvider: ()=>csrf,
    microsoftConfirmation: confirmation ?? (async value=>{ assert.equal(active,true);return value.state; }),
    browser: { authenticate() { assert.fail('OWNER_MUST_NOT_REQUEST_APPLICATION_PASSKEY'); } },
    navigation: { submit(...args) { assert.equal(active,true);forms.push(args); },reset() { events.push('cleared'); },dispose() {} } });
  return { client,calls,forms,events,active: ()=>active };
}
test('owner directory accepts only closed current targets, fixed start path and bounded keyset pages without mutation',async()=>{
  const f=clientFixture(),result=await f.client.pendingIntent();assert.equal(result.pending,true);
  assert.equal(result.tenants[0].tenantId,uuid(2));assert.ok(Object.isFrozen(result.tenants));
  assert.equal('currentGeneration' in f.client,false);assert.equal('replace' in f.client,false);
  assert.deepEqual(f.calls.map(x=>x.path),['auth/owner/intent']);assert.deepEqual(f.forms,[]);assert.deepEqual(f.events,[]);
  const none=clientFixture({ response: { status: 'none',customerStartUrl: directory().customerStartUrl,requestId: uuid(1) } });
  assert.equal((await none.client.pendingIntent()).pending,false);
  for (const response of [{ ...directory(),userId: uuid(9) },{ ...directory(),nextTenantId: uuid(3) },
    { ...directory(),tenants: [...directory().tenants,...directory().tenants] },
    { ...directory(),customerStartUrl: 'https://ops-int.example.com/?auth=owner_start' },
    ...['http://app-int.example.test/?auth=owner_start','https://app-int.example.test/?auth=owner_start&next=x',
      'https://u@app-int.example.test/?auth=owner_start','https://app-int.example.test/path'].map(customerStartUrl=>({ ...directory(),customerStartUrl })),
    { ...directory(),tenants: [{ ...directory().tenants[0],status: 'suspended' }] },
    { ...directory(),tenants: [{ ...directory().tenants[0],displayName: 'bad\nname' }] }]) {
    const bad=clientFixture({ response });await assert.rejects(bad.client.pendingIntent());assert.equal(bad.forms.length,0);
  }
  const tenants=Array.from({ length: 50 },(_,i)=>({ tenantId: uuid(i+10),displayName: 'Customer',status: 'onboarding' }));
  const page=clientFixture({ response: { ...directory(),tenants,nextTenantId: tenants.at(-1).tenantId } });
  assert.equal((await page.client.pendingIntent({ afterTenantId: uuid(8) })).nextTenantId,uuid(59));
  assert.equal(page.calls[0].path,'auth/owner/intent?afterTenantId='+uuid(8));
  await assert.rejects(page.client.pendingIntent({ afterTenantId: 'foreign&injected=true' }));assert.equal(page.calls.length,1);
});
test('owner approval keeps the existing queue pinned, submits only selected target role and Microsoft state, then refreshes',async()=>{
  const f=clientFixture();let enter;const entered=new Promise(resolve=>{ enter=resolve; });
  const operation=f.client.approve({ tenantId: uuid(2),role: 'tenant_admin' },{ onNavigation: enter });
  await entered;assert.equal(f.active(),true);assert.equal(f.forms[0][0],'platform-owner-approve');
  assert.deepEqual(f.calls[0].options.body,{ tenantId: uuid(2),role: 'tenant_admin' });
  assert.deepEqual(JSON.parse(f.forms[0][1].payload),{ tenantId: uuid(2),role: 'tenant_admin',state });
  assert.equal(f.forms[0][1].csrfToken,csrf);f.client.cancelNavigation();await operation;
  assert.deepEqual(f.events.slice(-2),['refresh','released']);assert.equal(f.calls.length,1);
  for (const value of [{ tenantId: uuid(2),role: 'platform_security_admin' },
    { tenantId: uuid(2),role: 'employee',userId: uuid(9) },{ tenantId: uuid(2),role: 'employee',response: {} }]) {
    assert.throws(()=>f.client.approve(value,{ onNavigation() {} }));
  }
  assert.equal(f.calls.length,1);
});
test('cancelled owner Microsoft confirmation never submits a form or retries the request',async()=>{
  const f=clientFixture({ confirmation: async()=>{ throw Object.assign(new Error('CANCELLED'),{ code: 'PLATFORM_MICROSOFT_OPERATION_CANCELLED' }); } });
  await assert.rejects(f.client.approve({ tenantId: uuid(2),role: 'employee' },{ onNavigation() { assert.fail(); } }));
  assert.equal(f.calls.length,1);assert.equal(f.forms.length,0);assert.equal(f.active(),false);
});
function controllerFixture({ pending=true,failure=null }={}) {
  const calls=[];let release;
  const api={ async pendingIntent(query) { calls.push(['read',query]);return { pending,tenants: directory().tenants,
    nextTenantId: uuid(3),customerStartUrl: directory().customerStartUrl }; },
    async refresh() { calls.push('refresh'); },async approve(value,{ onNavigation }) {
      calls.push(['approve',value]);if (failure) throw failure;onNavigation();await new Promise(resolve=>{ release=resolve; });
      calls.push('refresh'); },cancelNavigation() { calls.push('cancel');release?.(); },stop() { calls.push('stop');release?.(); } };
  const controller=createPlatformOwnerCustomerController({ api,reauthenticate: ()=>calls.push('reauthenticate') });
  return { controller,calls };
}
test('owner controller requires pending browser intent and a target on the current page, never auto-approves',async()=>{
  for (const pending of [false,true]) {
    const f=controllerFixture({ pending });await f.controller.load();assert.equal(f.calls.length,1);
    await f.controller.approve({ tenantId: uuid(9),role: 'employee' });
    await f.controller.approve({ tenantId: uuid(2),role: 'platform_security_admin' });assert.equal(f.calls.length,1);
    if (!pending) { await f.controller.approve({ tenantId: uuid(2),role: 'employee' });assert.equal(f.calls.length,1);continue; }
    const approval=f.controller.approve({ tenantId: uuid(2),role: 'conference_manager' });await Promise.resolve();
    assert.equal(f.controller.snapshot().phase,'continuing');
    await f.controller.approve({ tenantId: uuid(2),role: 'employee' });assert.equal(f.calls.length,2);
    await f.controller.check();await approval;assert.equal(f.controller.snapshot().phase,'ready');
    assert.deepEqual(f.calls.slice(-3),['cancel','refresh',['read',{ afterTenantId: null }]]);
  }
});
test('unknown owner approval outcome requires a fresh status check and does not replay; expired authority requires sign-in',async()=>{
  for (const failure of [new Error('UNKNOWN'),Object.assign(new Error('EXPIRED'),{ code: 'HTTP_401' })]) {
    const f=controllerFixture({ failure });await f.controller.load();await f.controller.approve({ tenantId: uuid(2),role: 'employee' });
    await f.controller.approve({ tenantId: uuid(2),role: 'employee' });assert.equal(f.calls.filter(x=>x[0]==='approve').length,1);
    if (failure.code==='HTTP_401') { assert.equal(f.controller.snapshot().phase,'reauthentication_required');
      await f.controller.check();f.controller.reauthenticate();assert.equal(f.calls.at(-1),'reauthenticate'); }
    else { await f.controller.check();assert.equal(f.controller.snapshot().phase,'ready');
      assert.deepEqual(f.calls.slice(-2),['refresh',['read',{ afterTenantId: null }]]); }
    f.controller.stop();await f.controller.nextPage();assert.equal(f.calls.at(-1),'stop');
  }
});
