import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformPasskeyOperationsClient } from '../src/platform-admin/production/passkey-operations-client.js';
function deferred() { let resolve;const promise=new Promise(done=>{ resolve=done; });return { promise,resolve }; }
function fixture() {
  const calls=[];
  const client=createPlatformPasskeyOperationsClient({ origin: 'https://127.0.0.1',csrfTokenProvider: ()=>'C'.repeat(43),
    refreshSession: async()=>true,fetchImpl: async(url,options)=>{
      calls.push({ path: new URL(url).pathname,method: options.method });
      return new Response('{}',{ headers: { 'Content-Type': 'application/json' } });
    } });return { client,calls };
}
test('explicit synthetic proof ceremony and ordinary operations share one bounded queue while ordinary reads stay parallel',async()=>{
  const f=fixture(),entered=deferred(),release=deferred();let finished=false;
  const native=f.client.runExclusive(async signal=>{ assert.ok(signal instanceof AbortSignal);entered.resolve();await release.promise; });
  await entered.promise;
  const ordinary=f.client.request('tenants',{ method: 'POST',body: {} }).then(()=>{ finished=true; });
  await f.client.request('tenants');assert.deepEqual(f.calls.map(x=>x.method),['GET']);assert.equal(finished,false);
  release.resolve();await native;await ordinary;assert.deepEqual(f.calls.map(x=>x.method),['GET','POST']);
});
test('stopping explicit proof work aborts its port and prevents every queued ordinary mutation from reaching transport',async()=>{
  const f=fixture(),entered=deferred();
  const native=f.client.runExclusive(signal=>new Promise(resolve=>{
    signal.addEventListener('abort',resolve,{ once: true });entered.resolve();
  }));await entered.promise;
  const waiting=f.client.request('tenants',{ method: 'POST',body: {} });f.client.stop();await native;
  await assert.rejects(waiting,/CANCELLED/);assert.equal(f.calls.length,0);
  await assert.rejects(f.client.runExclusive(()=>assert.fail('NO_WORK')),/CANCELLED/);
});
