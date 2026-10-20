import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiSecurityError } from '../src/core/api-client.js';
import { createCustomerHandoffController } from '../src/platform/customer-authentication/handoff-controller.js';
function fixture({ switched=false,lost=false,pending=null }={}) {
  const calls=[];let switchRequired=switched;
  const client={ async confirmation() { calls.push('read');if (pending) await pending;
    return { slot: 'contoso',role: 'employee',accountSwitchRequired: switchRequired }; },
  async logout() { calls.push('logout');switchRequired=false;if (lost) throw new Error('SYNTHETIC_AMBIGUOUS'); },
  complete() { calls.push('complete'); },start() { calls.push('start'); },clear() { calls.push('clear'); },dispose() { calls.push('dispose'); } };
  return { client,calls,controller: createCustomerHandoffController({ client,cancel: ()=>calls.push('cancel') }) };
}
test('current browser-bound confirmation never completes implicitly or signs out an existing session',async()=>{
  const f=fixture();await f.controller.confirm();await f.controller.switchAccount();assert.deepEqual(f.calls,[]);
  await f.controller.load();assert.equal(f.controller.snapshot().phase,'confirmation');assert.deepEqual(f.calls,['read']);
  await f.controller.switchAccount();assert.deepEqual(f.calls,['read']);await f.controller.confirm();
  assert.deepEqual(f.calls,['read','complete']);await f.controller.confirm();assert.equal(f.calls.length,2);
});
test('explicit logout is separate from final confirmation and lost responses cannot cause blind logout or completion replay',async()=>{
  for (const lost of [false,true]) {
    const f=fixture({ switched: true,lost });await f.controller.load();await f.controller.confirm();assert.deepEqual(f.calls,['read']);
    await f.controller.switchAccount();assert.equal(f.calls.filter(x=>x==='logout').length,1);
    assert.equal(f.calls.includes('complete'),false);await f.controller.switchAccount();
    assert.equal(f.calls.filter(x=>x==='logout').length,1);
    if (lost) { assert.equal(f.controller.snapshot().phase,'check_required');await f.controller.confirm();await f.controller.check(); }
    assert.equal(f.controller.snapshot().phase,'confirmation');await f.controller.confirm();assert.equal(f.calls.at(-1),'complete');
  }
});
test('expired proof cannot open a session and restart requires a new explicit navigation',async()=>{
  const f=fixture();f.client.confirmation=async()=>{ throw new ApiSecurityError('HTTP_401'); };
  await f.controller.load();assert.equal(f.controller.snapshot().phase,'expired');await f.controller.confirm();
  assert.equal(f.calls.includes('complete'),false);await f.controller.restart();assert.equal(f.calls.includes('start'),true);
});
test('disposed and overlapping reads cannot publish late state, revoke or navigate',async()=>{
  let release;const pending=new Promise(resolve=>{ release=resolve; });const f=fixture({ pending });
  const read=f.controller.load();await f.controller.load();await f.controller.check();assert.deepEqual(f.calls,['read']);
  f.controller.dispose();release();await read;await f.controller.confirm();await f.controller.switchAccount();
  assert.equal(f.calls.includes('complete'),false);assert.equal(f.calls.includes('logout'),false);
  assert.equal(f.controller.snapshot().phase,'loading');
});
