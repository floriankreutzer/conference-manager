import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomerAccountController } from '../src/platform/customer-authentication/account-controller.js';
function fixture({ initialConfirmation=false,lost=false,unavailable=false,reauthentication=false,pending=null }={}) {
  const calls=[];const state={ linked: false };
  const client={ async accountState() {
    calls.push('state');if (unavailable) throw new Error('SYNTHETIC_READ_UNAVAILABLE');
    return { microsoftLinked: state.linked,emailReauthenticationRequired: reauthentication };
  },async startLink(csrf) { calls.push(`start:${csrf}`);return 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize'; },
  async linkConfirmation() { calls.push('proof');if (pending) await pending;return true; },
  async confirmLink() { calls.push('confirm');if (pending) await pending;if (lost) throw new Error('SYNTHETIC_AMBIGUOUS_RESPONSE'); },
  clear() { calls.push('clear'); } };
  const controller=createCustomerAccountController({ client,initialConfirmation,currentSession: ()=>({ csrfToken: 'S'.repeat(43) }),
    navigate: ()=>calls.push('navigate'),completeSession: async()=>calls.push('session'),
    reauthenticate: async()=>calls.push('reauthenticate'),cancel: ()=>calls.push('close') });return { controller,calls,state };
}
test('profile requires authoritative fresh-email status before explicitly starting Microsoft and never confirms implicitly',async()=>{
  const f=fixture();await f.controller.start();assert.equal(f.calls.length,0);
  await f.controller.load();assert.equal(f.controller.snapshot().phase,'ready');assert.deepEqual(f.calls,['state']);
  await f.controller.start();assert.equal(f.controller.snapshot().phase,'redirecting');
  assert.deepEqual(f.calls,['state',`start:${'S'.repeat(43)}`,'navigate']);
  await f.controller.start();assert.equal(f.calls.length,3);assert.equal(f.calls.includes('confirm'),false);
});
test('callback confirmation reads the browser-bound proof first, then commits only after the explicit user action',async()=>{
  const f=fixture({ initialConfirmation: true });await f.controller.load();assert.equal(f.controller.snapshot().phase,'confirmation');
  assert.deepEqual(f.calls,['proof']);await f.controller.confirm();assert.equal(f.controller.snapshot().phase,'linked');
  assert.deepEqual(f.calls,['proof','confirm','session']);await f.controller.confirm();assert.equal(f.calls.length,3);
});
test('ambiguous confirmation cannot be replayed and reads current link state independently',async()=>{
  const f=fixture({ initialConfirmation: true,lost: true });await f.controller.load();await f.controller.confirm();
  assert.equal(f.controller.snapshot().phase,'refresh_required');assert.equal(f.controller.snapshot().error,'refresh');
  await f.controller.confirm();assert.equal(f.calls.filter(value=>value==='confirm').length,1);
  assert.equal(f.calls.includes('session'),false);f.state.linked=true;await f.controller.check();
  assert.equal(f.controller.snapshot().phase,'linked');assert.equal(f.calls.filter(value=>value==='confirm').length,1);
});
test('unknown account state cannot enable linking and stale email authority requires an explicit reauthentication action',async()=>{
  const failed=fixture({ unavailable: true });await failed.controller.load();assert.equal(failed.controller.snapshot().phase,'check_required');
  await failed.controller.start();assert.deepEqual(failed.calls,['state']);
  const stale=fixture({ reauthentication: true });await stale.controller.load();assert.equal(stale.controller.snapshot().phase,'reauthentication_required');
  await stale.controller.start();assert.deepEqual(stale.calls,['state']);await stale.controller.reauthenticate();
  assert.deepEqual(stale.calls,['state','reauthenticate']);
});
test('disposed confirmation cannot publish late proof or navigate after its in-flight commit',async()=>{
  let release;let pending=new Promise(resolve=>{ release=resolve; });
  const f=fixture({ initialConfirmation: true,pending });const loading=f.controller.load();f.controller.dispose();release();await loading;
  assert.equal(f.calls.includes('session'),false);await f.controller.confirm();assert.equal(f.calls.includes('confirm'),false);
  pending=Promise.resolve();const g=fixture({ initialConfirmation: true,pending });await g.controller.load();
  const completing=g.controller.confirm();g.controller.dispose();await completing;
  assert.equal(g.calls.includes('session'),false);assert.equal(g.calls.includes('navigate'),false);
});
