import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomerMicrosoftClient } from '../src/platform/customer-authentication/microsoft-client.js';
const ID='b8000000-0000-4000-8000-000000000001',CSRF='c'.repeat(64),SESSION_CSRF='S'.repeat(43);
const json=(value,status=200)=>new Response(status===204 ? null : JSON.stringify(value),{
  status,headers: { 'Content-Type': 'application/json' } });
const choice=()=>({ status: 'membership_required',requestId: ID,csrfToken: CSRF,items: [{ membershipId: ID,displayName: 'Invited' }] });
const confirmation=()=>({ status: 'link_confirmation_required',requestId: ID,csrfToken: CSRF });
function fixture() {
  const calls=[];let response=json(choice());
  const client=createCustomerMicrosoftClient({ origin: 'https://127.0.0.1',async fetchImpl(url,init) {
    calls.push({ url: String(url),init });if (response instanceof Error) throw response;return response;
  } });return { client,calls,reply(value,status=200) { response=value instanceof Response || value instanceof Error ? value : json(value,status); } };
}
test('Microsoft membership choice keeps flow proof private and uses one fixed explicit selection before clearing it',async()=>{
  const f=fixture(),items=await f.client.choices();assert.equal(Object.isFrozen(items),true);
  assert.deepEqual(items,[{ membershipId: ID,displayName: 'Invited' }]);
  assert.equal(JSON.stringify(items).includes(CSRF),false);f.reply(null,204);await f.client.select(ID);
  assert.equal(f.calls[1].url,'https://127.0.0.1/api/v1/auth/microsoft/selection');
  assert.deepEqual(JSON.parse(f.calls[1].init.body),{ membershipId: ID });assert.equal(f.calls[1].init.headers['X-CSRF-Token'],CSRF);
  await assert.rejects(f.client.select(ID),/CSRF_TOKEN_REQUIRED/);assert.equal(f.calls.length,2);
  for (const { init } of f.calls) {
    assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
    assert.equal(init.referrerPolicy,'no-referrer');assert.ok(init.signal instanceof AbortSignal);
    assert.doesNotMatch(init.body ?? '',/tenantId|userId|roles|provider|browserToken|flowId/);
  }
});
test('account-link start and explicit confirmation use separate session/flow CSRF proofs and no caller identity fields',async()=>{
  const f=fixture();await assert.rejects(f.client.startLink(CSRF),/CSRF_TOKEN_REQUIRED/);assert.equal(f.calls.length,0);
  const url='https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?state=synthetic';
  f.reply({ authorizationUrl: url,requestId: ID });assert.equal(await f.client.startLink(SESSION_CSRF),url);
  assert.deepEqual(JSON.parse(f.calls[0].init.body),{});assert.equal(f.calls[0].init.headers['X-CSRF-Token'],SESSION_CSRF);
  await assert.rejects(f.client.confirmLink(),/CSRF_TOKEN_REQUIRED/);f.reply(confirmation());await f.client.linkConfirmation();
  f.reply(null,204);await f.client.confirmLink();assert.deepEqual(JSON.parse(f.calls[2].init.body),{ confirm: true });
  assert.equal(f.calls[2].init.headers['X-CSRF-Token'],CSRF);await assert.rejects(f.client.confirmLink(),/CSRF_TOKEN_REQUIRED/);
});
test('leaked authority, duplicate members and unknown/malformed proof fields cannot replace validated choice custody',async()=>{
  for (const value of [{ ...choice(),tenantId: ID },{ ...choice(),csrfToken: SESSION_CSRF },{ ...choice(),requestId: 'bad' },
    { ...choice(),items: [{ ...choice().items[0],roles: ['tenant_admin'] }] },{ ...choice(),items: Array(101).fill(choice().items[0]) },
    { ...choice(),items: [choice().items[0],choice().items[0]] },{ ...choice(),items: [{ membershipId: ID,displayName: 'bad\nlabel' }] }]) {
    const f=fixture();await f.client.choices();f.reply(value);await assert.rejects(f.client.choices());
    f.reply(null,204);await assert.rejects(f.client.select(ID),/CSRF_TOKEN_REQUIRED/);assert.equal(f.calls.length,2);
  }
});
test('foreign redirect, unsafe provider navigation and wrong HTTP success status fail closed without a retry',async()=>{
  for (const url of ['https://other.invalid/steal','http://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
    'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize#token',
    'https://login.microsoftonline.com/organizations/v2.0/adminconsent']) {
    const f=fixture();f.reply({ authorizationUrl: url,requestId: ID });
    await assert.rejects(f.client.startLink(SESSION_CSRF),/CUSTOMER_MICROSOFT_RESPONSE_INVALID/);assert.equal(f.calls.length,1);
  }
  const f=fixture();await f.client.choices();f.reply(null,200);
  await assert.rejects(f.client.select(ID),/CUSTOMER_MICROSOFT_RESPONSE_INVALID/);assert.equal(f.calls.length,2);
});
test('network or provider failure performs one attempt and clear removes both kinds of in-memory flow proof',async()=>{
  for (const response of [new Error('synthetic unavailable'),json({ error: { code: 'AUTHENTICATION_REJECTED' } },401),
    json({ error: { code: 'RATE_LIMITED' } },429),json({ error: { code: 'INTERNAL_ERROR' } },503)]) {
    const f=fixture();await f.client.choices();f.reply(response);await assert.rejects(f.client.select(ID));assert.equal(f.calls.length,2);
  }
  const f=fixture();await f.client.choices();f.reply(confirmation());await f.client.linkConfirmation();f.client.clear();
  await assert.rejects(f.client.select(ID),/CSRF_TOKEN_REQUIRED/);await assert.rejects(f.client.confirmLink(),/CSRF_TOKEN_REQUIRED/);
  assert.equal(f.calls.length,2);
});
test('current personal link state is minimized, strictly typed and separate from any browser-selected account',async()=>{
  const f=fixture();f.reply({ status: 'account',microsoftLinked: true,emailReauthenticationRequired: true,requestId: ID });
  assert.deepEqual(await f.client.accountState(),{ microsoftLinked: true,emailReauthenticationRequired: true });
  assert.equal(f.calls[0].url,'https://127.0.0.1/api/v1/auth/microsoft/link/status');assert.equal(f.calls[0].init.body,undefined);
  f.reply({ status: 'account',microsoftLinked: 'true',emailReauthenticationRequired: false,requestId: ID });
  await assert.rejects(f.client.accountState(),/CUSTOMER_MICROSOFT_RESPONSE_INVALID/);
});
test('clearing a disposed view prevents a late response from rearming its private flow proof',async()=>{
  let resolve;
  const client=createCustomerMicrosoftClient({ origin: 'https://127.0.0.1',fetchImpl: ()=>new Promise(value=>{ resolve=value; }) });
  const pending=client.linkConfirmation();client.clear();resolve(json(confirmation()));
  await assert.rejects(pending,/CUSTOMER_MICROSOFT_RESPONSE_INVALID/);
  await assert.rejects(client.confirmLink(),/CSRF_TOKEN_REQUIRED/);
});
