import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomerHandoffStart } from '../src/platform/customer-authentication/handoff-start.js';

const origin='https://127.0.0.1',requestId='ba000000-0000-4000-8000-000000000001';
const ready=()=>new Response(JSON.stringify({ status: 'ready',requestId }),{ headers: { 'Content-Type': 'application/json' } });
function fixture(fetchImpl=async()=>ready()) {
  const calls=[],forms=[];
  const start=createCustomerHandoffStart({ origin,fetchImpl: async(...args)=>{ calls.push(args);return fetchImpl(...args); },
    navigation: { submit: (...args)=>forms.push(args),dispose() {} } });
  return { start,calls,forms };
}
test('initial test access waits for bounded same-origin readiness before exactly one native POST',async()=>{
  let resolve;const f=fixture(()=>new Promise(done=>{ resolve=done; }));
  const pending=f.start.start();await f.start.start();assert.equal(f.calls.length,1);assert.deepEqual(f.forms,[]);
  resolve(ready());await pending;await f.start.start();
  assert.deepEqual(f.forms,[['customer-start']]);assert.equal(f.calls.length,1);
  const [url,init]=f.calls[0];assert.equal(String(url),origin+'/api/v1/health/ready');assert.equal(init.method,'GET');
  assert.equal(init.redirect,'error');assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');
  assert.equal(init.referrerPolicy,'no-referrer');assert.ok(init.signal instanceof AbortSignal);assert.equal(init.body,undefined);
});
test('cold-start HTML, unavailable or malformed readiness never posts or retries automatically',async()=>{
  for (const response of [new Response('<html>Starting</html>',{ headers: { 'Content-Type': 'text/html' } }),
    new Response('{}',{ status: 503 }),new Response(JSON.stringify({ status: 'not_ready',requestId })),
    new Response(JSON.stringify({ status: 'ready',requestId,extra: true })),
    new Response(JSON.stringify({ status: 'ready',requestId: 'invalid' }))]) {
    const f=fixture(async()=>response);await assert.rejects(f.start.start());assert.deepEqual(f.forms,[]);assert.equal(f.calls.length,1);
  }
  let attempt=0;const f=fixture(async()=>{ if (++attempt===1) throw new Error('OFFLINE');return ready(); });
  await assert.rejects(f.start.start());assert.equal(attempt,1);await f.start.start();assert.deepEqual(f.forms,[['customer-start']]);
});
test('foreign response and disposal during readiness cannot start a handoff',async()=>{
  const response=ready();Object.defineProperty(response,'url',{ value: 'https://foreign.invalid/api/v1/health/ready' });
  const foreign=fixture(async()=>response);await assert.rejects(foreign.start.start());assert.deepEqual(foreign.forms,[]);
  let resolve;const f=fixture(()=>new Promise(done=>{ resolve=done; }));const pending=f.start.start();f.start.dispose();
  assert.equal(f.calls[0][1].signal.aborted,true);resolve(ready());await pending;await f.start.start();assert.deepEqual(f.forms,[]);
  for (const options of [{ origin: 'http://127.0.0.1' },{ origin: origin+'/' },{ timeoutMs: 999 },{ timeoutMs: 15001 }]) {
    assert.throws(()=>createCustomerHandoffStart({ origin,fetchImpl: async()=>ready(),...options }));
  }
});
test('readiness timeout aborts the read without submitting or retrying',async()=>{
  let calls=0,posts=0;
  const start=createCustomerHandoffStart({ origin,timeoutMs: 1000,fetchImpl: async(_url,{ signal })=>{
    calls++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('ABORTED')),{ once: true }));
  },navigation: { submit() { posts++; },dispose() {} } });
  await assert.rejects(start.start(),/ABORTED/);assert.equal(calls,1);assert.equal(posts,0);start.dispose();
});
test('an uncertain native navigation cannot be posted again or described as an unsent read failure',async()=>{
  let posts=0;
  const start=createCustomerHandoffStart({ origin,fetchImpl: async()=>ready(),navigation: {
    submit() { posts++;throw new Error('NAVIGATION_UNCERTAIN'); },dispose() {},
  } });
  await assert.rejects(start.start(),error=>error.code==='CUSTOMER_HANDOFF_START_UNCONFIRMED');
  await start.start();assert.equal(posts,1);start.dispose();
});
