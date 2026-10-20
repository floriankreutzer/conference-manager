import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomerHandoffClient } from '../src/platform/customer-authentication/handoff-client.js';
const ID='b8000000-0000-4000-8000-000000000001',CSRF='c'.repeat(64);
const value=()=>({ slot: 'northwind',role: 'tenant_admin',accountSwitchRequired: false,csrfToken: CSRF,requestId: ID });
function fixture() {
  const calls=[],forms=[];let reply=value();
  const client=createCustomerHandoffClient({ origin: 'https://127.0.0.1',async fetchImpl(url,init) {
    calls.push({ url: String(url),init });if (reply instanceof Error) throw reply;
    return reply instanceof Response ? reply : new Response(JSON.stringify(reply),{ headers: { 'Content-Type': 'application/json' } });
  },navigation: { submit: (...args)=>forms.push(args),dispose() {},reset() {} } });
  return { client,calls,forms,reply(next) { reply=next; } };
}
test('Customer handoff reads only minimized current state, keeps proof private and completes once through a fixed native form',async()=>{
  const f=fixture();assert.throws(f.client.complete,/CONFIRMATION_REQUIRED/);
  assert.deepEqual(await f.client.confirmation(),{ slot: 'northwind',role: 'tenant_admin',accountSwitchRequired: false });
  assert.equal(f.calls[0].url,'https://127.0.0.1/api/v1/auth/delegation/confirmation');
  f.client.complete();assert.deepEqual(f.forms,[['customer-complete',{ csrfToken: CSRF }]]);
  assert.throws(f.client.complete,/CONFIRMATION_REQUIRED/);assert.equal(f.calls.length,1);
  f.client.start();assert.deepEqual(f.forms[1],['customer-start']);
  for (const { init } of f.calls) { assert.equal(init.redirect,'error');assert.equal(init.credentials,'same-origin');
    assert.equal(init.cache,'no-store');assert.equal(init.referrerPolicy,'no-referrer');assert.ok(init.signal instanceof AbortSignal); }
});
test('cookie presence requires explicit current-only logout; uncertain logout clears proof before a fresh read',async()=>{
  const f=fixture();f.reply({ ...value(),accountSwitchRequired: true });await f.client.confirmation();
  assert.throws(f.client.complete,/CONFIRMATION_REQUIRED/);assert.equal(f.calls.length,1);
  f.reply(new Error('SYNTHETIC_RESPONSE_LOST'));await assert.rejects(f.client.logout(),/SYNTHETIC_RESPONSE_LOST/);
  assert.deepEqual(JSON.parse(f.calls[1].init.body),{});assert.equal(f.calls[1].init.headers['X-CSRF-Token'],CSRF);
  assert.equal(f.calls[1].url,'https://127.0.0.1/api/v1/auth/delegation/logout');
  await assert.rejects(f.client.logout(),/CONFIRMATION_REQUIRED/);assert.throws(f.client.complete,/CONFIRMATION_REQUIRED/);
  f.reply(value());await f.client.confirmation();f.client.complete();assert.equal(f.forms.length,1);
});
test('malformed or additional authority and foreign responses invalidate previous confirmation without navigation or retry',async()=>{
  for (const bad of [{ ...value(),tenantId: ID },{ ...value(),role: 'platform_admin' },{ ...value(),slot: 'foreign' },
    { ...value(),accountSwitchRequired: 'false' },{ ...value(),csrfToken: 'S'.repeat(43) },{ ...value(),requestId: 'unknown' }]) {
    const f=fixture();await f.client.confirmation();f.reply(bad);await assert.rejects(f.client.confirmation());
    assert.throws(f.client.complete,/CONFIRMATION_REQUIRED/);assert.equal(f.forms.length,0);assert.equal(f.calls.length,2);
  }
});
