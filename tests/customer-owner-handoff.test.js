import assert from 'node:assert/strict';
import test from 'node:test';
import { createOwnerCustomerHandoffClient } from '../src/platform/customer-authentication/handoff-client.js';
import { createOwnerCustomerHandoffController } from '../src/platform/customer-authentication/handoff-controller.js';

const ID='b8000000-0000-4000-8000-000000000001',CSRF='c'.repeat(64);
const value=()=>({ tenantId: ID,tenantName: 'Own Customer',role: 'tenant_admin',accountSwitchRequired: false,
  csrfToken: CSRF,requestId: ID });
function fixture() {
  const calls=[],forms=[];let reply=value();
  const client=createOwnerCustomerHandoffClient({ origin: 'https://customer.example.test',async fetchImpl(url,init) {
    calls.push({ url: String(url),init });if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply),{ headers: { 'Content-Type': 'application/json' } });
  },navigation: { submit: (...args)=>forms.push(args),dispose() {},reset() {} } });
  return { client,calls,forms,reply: next=>{ reply=next; } };
}

test('owner Customer client keeps confirmation proof private and uses only its fixed namespace and one-use native form',async()=>{
  const f=fixture();assert.throws(f.client.complete,/CONFIRMATION_REQUIRED/);
  assert.deepEqual(await f.client.confirmation(),{ tenantId: ID,tenantName: 'Own Customer',role: 'tenant_admin',accountSwitchRequired: false });
  assert.equal(f.calls[0].url,'https://customer.example.test/api/v1/auth/owner/confirmation');
  f.client.complete();assert.deepEqual(f.forms,[['customer-owner-complete',{ csrfToken: CSRF }]]);
  assert.throws(f.client.complete,/CONFIRMATION_REQUIRED/);f.client.start();assert.deepEqual(f.forms[1],['customer-owner-start']);
  assert.equal(f.calls[0].init.credentials,'same-origin');assert.equal(f.calls[0].init.redirect,'error');
});

test('owner Customer confirmation rejects synthetic fields, injected identity and malformed current target without navigation',async()=>{
  for (const changes of [{ slot: 'northwind' },{ userId: ID },{ tenantId: 'foreign' },{ role: 'platform_security_admin' },
    { tenantName: '' },{ tenantName: 'x'.repeat(201) },{ tenantName: 'unsafe\nname' },{ csrfToken: 'S'.repeat(43) }]) {
    const f=fixture();await f.client.confirmation();f.reply({ ...value(),...changes });
    await assert.rejects(f.client.confirmation());assert.throws(f.client.complete,/CONFIRMATION_REQUIRED/);assert.equal(f.forms.length,0);
  }
});

test('owner entry waits for explicit start and existing Customer account requires explicit logout plus another current read',async()=>{
  const f=fixture(),start=createOwnerCustomerHandoffController({ client: f.client,initialStart: true,cancel() {} });
  await start.load();assert.equal(start.snapshot().phase,'start');assert.equal(f.calls.length,0);assert.equal(f.forms.length,0);
  await start.confirm();assert.equal(f.forms.length,0);await start.begin();assert.deepEqual(f.forms,[['customer-owner-start']]);
  await start.begin();assert.equal(f.forms.length,1);start.dispose();
  const calls=[];let switched=false;
  const client={ async confirmation() { calls.push('read');return { tenantId: ID,tenantName: 'Own Customer',role: 'employee',
    accountSwitchRequired: !switched }; },async logout() { calls.push('logout');switched=true; },complete() { calls.push('complete'); },
  start() { calls.push('start'); },clear() {},dispose() {} };
  const controller=createOwnerCustomerHandoffController({ client,cancel() {} });await controller.load();
  assert.equal(controller.snapshot().phase,'switch_required');await controller.confirm();assert.deepEqual(calls,['read']);
  await controller.switchAccount();assert.deepEqual(calls,['read','logout','read']);assert.equal(controller.snapshot().phase,'confirmation');
  await controller.confirm();assert.deepEqual(calls,['read','logout','read','complete']);await controller.confirm();assert.equal(calls.length,4);
});
