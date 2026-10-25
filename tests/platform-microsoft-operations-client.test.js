import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformMicrosoftOperationsClient,loadPlatformMicrosoftConfiguration }
  from '../src/platform-admin/production/microsoft-operations-client.js';
import { requirePlatformMicrosoftOperationChallenge,requirePlatformMicrosoftOperationStatus }
  from '../src/platform-admin/production/microsoft-operation-contracts.js';
import { MICROSOFT_OPERATION_ORIGIN as origin,MICROSOFT_OPERATION_ID as id,MICROSOFT_OPERATION_STATE as state,
  microsoftOperationChallenge } from './support/platform-microsoft-operation-fixture.js';

const json=(value,status=200)=>new Response(JSON.stringify(value),{ status,headers: { 'content-type': 'application/json' } });
function fixture({ fetcher,confirmation,refreshSession }={}) {
  const calls=[];let refreshed=0,confirmed=0;
  const client=createPlatformMicrosoftOperationsClient({ origin,csrfTokenProvider: ()=>'C'.repeat(43),
    refreshSession: refreshSession ?? (async()=>{ refreshed++;return true; }),
    confirmation: confirmation ?? (async(pending,{ signal,readStatus })=>{
      confirmed++;assert.equal(pending.state,state);assert.equal(signal.aborted,false);
      assert.equal(await readStatus({ signal }),'verified');
    }),fetchImpl: async(url,init)=>{
      calls.push({ url: String(url),init });
      if (fetcher) return fetcher(url,init,calls.length);
      if (String(url).endsWith('/auth/microsoft/operation/status')) return json({ status: 'verified',requestId: id });
      return calls.length===1 ? json(microsoftOperationChallenge(),428) : json({ changed: true });
    },
  });return { client,calls,refreshed: ()=>refreshed,confirmed: ()=>confirmed };
}
test('Microsoft retries only the exact428 request once after source-bound status and refreshes the normal session',async()=>{
  const f=fixture(),body={ reason: 'Synthetic exact operation' };
  assert.deepEqual(await f.client.request('tenants',{ method: 'POST',body,idempotencyKey: id }),{ changed: true });
  assert.equal(f.calls.length,3);const [first,status,last]=f.calls;
  assert.equal(first.url,last.url);assert.equal(first.init.body,last.init.body);assert.equal(first.init.method,last.init.method);
  assert.equal(first.init.headers['Idempotency-Key'],last.init.headers['Idempotency-Key']);
  assert.equal(last.init.headers['X-Platform-Microsoft-Proof'],state);assert.equal(last.init.headers['X-Platform-Passkey-Proof'],undefined);
  assert.equal(last.init.credentials,'same-origin');assert.equal(last.init.redirect,'error');assert.equal(last.init.cache,'no-store');
  assert.equal(status.init.method,'POST');assert.deepEqual(JSON.parse(status.init.body),{ state });
  assert.equal(status.init.headers['X-CSRF-Token'],'C'.repeat(43));assert.equal(f.confirmed(),1);assert.equal(f.refreshed(),1);
});
test('Microsoft challenge rejects foreign redirects, extra authority, duplicate fields and missing literal MFA request before navigation',()=>{
  const valid=microsoftOperationChallenge();assert.equal(requirePlatformMicrosoftOperationChallenge(valid,origin).state,state);
  for (const patch of [{ ...valid,roles: ['owner'] },{ ...valid,status: 'passkey_required' },{ ...valid,requestId: 'private' },
    { ...valid,get state() { throw new Error('private-accessor'); } }]) {
    assert.throws(()=>requirePlatformMicrosoftOperationChallenge(patch,origin),/RESPONSE_INVALID/);
  }
  for (const mutate of [url=>{ url.hostname='evil.example'; },url=>url.searchParams.set('redirect_uri','https://evil.example'),
    url=>url.searchParams.append('state',state),url=>url.searchParams.set('scope','openid profile User.Read'),
    url=>url.searchParams.set('max_age','300'),url=>url.searchParams.delete('claims'),url=>{ url.hash='private'; },
    url=>url.searchParams.set('claims',JSON.stringify({ id_token: { auth_time: { essential: true } } }))]) {
    const url=new URL(valid.authorizationUrl);mutate(url);
    assert.throws(()=>requirePlatformMicrosoftOperationChallenge({ ...valid,authorizationUrl: url.href },origin),/RESPONSE_INVALID/);
  }
  for (const amr of [{ essential: true },{ essential: true,values: [] },{ essential: true,values: ['pwd'] },
    { essential: true,values: ['mfa','pwd'] },{ essential: false,values: ['mfa'] },
    { essential: true,values: ['mfa'],extra: true }]) {
    const url=new URL(valid.authorizationUrl);
    url.searchParams.set('claims',JSON.stringify({ id_token: { auth_time: { essential: true },amr } }));
    assert.throws(()=>requirePlatformMicrosoftOperationChallenge({ ...valid,authorizationUrl: url.href },origin),/RESPONSE_INVALID/);
  }
  for (const status of [{ status: 'consumed',requestId: id },{ status: 'verified',requestId: id,principal: {} }]) {
    assert.throws(()=>requirePlatformMicrosoftOperationStatus(status),/RESPONSE_INVALID/);
  }
});
test('Microsoft cancellation, status failure, network error and non428 refusal never execute a mutation retry',async()=>{
  const cancelled=fixture({ confirmation: async()=>{ throw new Error('private-cancel'); } });
  await assert.rejects(cancelled.client.request('tenants',{ method: 'POST',body: {} }),/PLATFORM_MICROSOFT_OPERATION_FAILED/);
  assert.equal(cancelled.calls.length,1);
  for (const code of [400,401,403,409,429,503]) {
    const f=fixture({ fetcher: ()=>json({ error: { code: 'REFUSED' } },code) });
    await assert.rejects(f.client.request('tenants',{ method: 'POST',body: {} }));assert.equal(f.calls.length,1);
  }
  const statusFailure=fixture({ fetcher: (url)=>String(url).endsWith('/status') ? json({ status: 'verified',roles: ['owner'] })
    : json(microsoftOperationChallenge(),428) });
  await assert.rejects(statusFailure.client.request('tenants',{ method: 'POST',body: {} }));assert.equal(statusFailure.calls.length,2);
  const network=fixture({ fetcher: ()=>{ throw new Error('private-network'); } });
  await assert.rejects(network.client.request('tenants',{ method: 'POST',body: {} }),/PLATFORM_MICROSOFT_OPERATION_FAILED/);
  assert.equal(network.calls.length,1);
});
test('Microsoft capability is explicit and closed;404 preserves older profiles without pretending a capability exists',async()=>{
  assert.deepEqual(await loadPlatformMicrosoftConfiguration({ request: async()=>({ mode: 'microsoft_mfa',environment: 'int' }) }),
    { mode: 'microsoft_mfa',environment: 'int' });
  assert.equal(await loadPlatformMicrosoftConfiguration({ request: async()=>{ throw { code: 'HTTP_404' }; } }),null);
  for (const value of [{ mode: 'microsoft_mfa',environment: 'int',roles: [] },{ mode: 'unknown',environment: 'int' }]) {
    await assert.rejects(loadPlatformMicrosoftConfiguration({ request: async()=>value }),/PLATFORM_MICROSOFT_OPERATION_FAILED/);
  }
});

test('explicit synthetic confirmation validates the complete challenge and uses status without retrying any business request',async()=>{
  const f=fixture(),signal=new AbortController().signal;
  assert.equal(await f.client.runExclusive(()=>f.client.confirmOperation(microsoftOperationChallenge(),{ signal })),state);
  assert.equal(f.calls.length,1);assert.ok(f.calls[0].url.endsWith('/auth/microsoft/operation/status'));
  assert.equal(f.refreshed(),0);assert.equal(f.confirmed(),1);
  await assert.rejects(f.client.confirmOperation({ state,authorizationUrl: microsoftOperationChallenge().authorizationUrl },{ signal }));
  await assert.rejects(f.client.confirmOperation(microsoftOperationChallenge()),/CANCELLED/);
  assert.equal(f.calls.length,1);
});
