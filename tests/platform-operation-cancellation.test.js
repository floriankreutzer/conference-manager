import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformMicrosoftOperationsClient } from '../src/platform-admin/production/microsoft-operations-client.js';
import { createPlatformAdminApi } from '../src/platform-admin/platform-api.js';
import { createPlatformPasskeyOperationsClient } from '../src/platform-admin/production/passkey-operations-client.js';
import { createPlatformInvitationController } from '../src/platform-admin/customer-invitation-controller.js';
import { MICROSOFT_OPERATION_ORIGIN as origin,microsoftOperationChallenge } from './support/platform-microsoft-operation-fixture.js';

const json=(body,status=200)=>new Response(JSON.stringify(body),{ status,headers: { 'content-type': 'application/json' } });
const error=code=>Object.assign(new Error('Private provider detail'),{ code });
const command={ displayName: 'Synthetic',reason: 'Explicit reason',invitations: [] };
function fixture({ fetchImpl,confirmation=async()=>{},refreshSession=async()=>true,onSessionRefreshRequired }={}) {
  const calls=[];
  const client=createPlatformMicrosoftOperationsClient({ origin,csrfTokenProvider: ()=>'C'.repeat(43),
    refreshSession,confirmation,onSessionRefreshRequired,fetchImpl: async(url,init)=>{
      calls.push({ url: String(url),init });return fetchImpl ? fetchImpl(url,init,calls.length) : json(microsoftOperationChallenge(),428);
    } });
  return { client,calls };
}
test('explicit Microsoft cancellation and failed proof are distinct and never replay the protected request',async()=>{
  for (const [raw,expected] of [['PLATFORM_MICROSOFT_OPERATION_CANCELLED','PLATFORM_MICROSOFT_OPERATION_CANCELLED'],
    ['PLATFORM_MICROSOFT_OPERATION_FAILED','PLATFORM_MICROSOFT_OPERATION_NOT_EXECUTED']]) {
    for (const method of ['GET','POST']) {
      const f=fixture({ confirmation: async()=>{ throw error(raw); } });
      await assert.rejects(f.client.request(method==='GET' ? 'audit/exports' : 'tenants',{
        method,...(method==='POST' ? { body: command } : {}),
      }),value=>value.code===expected && value.cause===undefined && !value.message.includes('Private'));
      assert.equal(f.calls.length,1);
    }
  }
});
test('the actual Platform API adapter preserves trusted cancellation through audit export, not arbitrary matching codes',async()=>{
  const microsoft=fixture({ confirmation: async()=>{ throw error('PLATFORM_MICROSOFT_OPERATION_CANCELLED'); } });
  const passkey=createPlatformPasskeyOperationsClient({ origin,csrfTokenProvider: ()=>'C'.repeat(43),refreshSession: async()=>true,
    fetchImpl: async()=>json({ status: 'passkey_required',state: 'S'.repeat(43),requestId: '11111111-1111-4111-8111-111111111111',
      options: { challenge: 'S'.repeat(43) } },428),browser: { authenticate: async()=>{ throw error('PLATFORM_PASSKEY_BROWSER_CANCELLED'); } } });
  for (const [apiClient,code] of [[microsoft.client,'PLATFORM_MICROSOFT_OPERATION_CANCELLED'],[passkey,'PLATFORM_PASSKEY_OPERATION_CANCELLED']]) {
    const api=createPlatformAdminApi({ apiClient });
    await assert.rejects(api.loadAudit({ exportView: true }),value=>value.code===code);
  }
  for (const code of ['PLATFORM_MICROSOFT_OPERATION_CANCELLED','PLATFORM_PASSKEY_OPERATION_CANCELLED','HTTP_403']) {
    const api=createPlatformAdminApi({ apiClient: { request: async()=>{ throw error(code); } } });
    await assert.rejects(api.loadAudit({ exportView: true }),value=>value.code==='PLATFORM_AUDIT_UNAVAILABLE');
  }
  assert.equal(microsoft.calls.length,1);
});
test('aborted dispatched writes keep their unknown outcome and immutable command on explicit retry',async()=>{
  for (const challenged of [false,true]) {
    const abort=new AbortController();let fail=true;
    const f=fixture({ fetchImpl: (url,init,index)=>{
      if (challenged && index===1) return json(microsoftOperationChallenge(),428);
      if (fail) { abort.abort();throw new DOMException('Private transport detail','AbortError'); }
      return json({ invitations: [] });
    } });
    const received=[];
    const api={ create: async value=>{
      received.push(value);return f.client.request('tenants',{
        method: 'POST',body: value,idempotencyKey: value.commandId,...(fail ? { signal: abort.signal } : {}),
      });
    },issue: async()=>{},list: async()=>[],mutate: async()=>{} };
    const c=createPlatformInvitationController({ api,idFactory: ()=> '11111111-1111-4111-8111-111111111111' });
    await c.issue(command);assert.equal(c.snapshot().status,'retry');assert.equal(c.snapshot().error,'unknown');
    assert.equal(f.calls.length,challenged ? 2 : 1);
    fail=false;await c.retry();assert.equal(c.snapshot().status,'complete');assert.equal(received[0],received[1]);
    assert.equal(f.calls[0].init.body,f.calls.at(-1).init.body);
    assert.equal(f.calls[0].init.headers['Idempotency-Key'],f.calls.at(-1).init.headers['Idempotency-Key']);
  }
});
test('stopping during session refresh preserves the completed-operation refresh-required error',async()=>{
  let f;
  f=fixture({ fetchImpl: (url,init,index)=>index===1 ? json(microsoftOperationChallenge(),428) : json({ changed: true }),
    refreshSession: async()=>false,onSessionRefreshRequired: ()=>f.client.stop() });
  await assert.rejects(f.client.request('tenants',{ method: 'POST',body: command }),
    value=>value.code==='PLATFORM_MICROSOFT_SESSION_REFRESH_REQUIRED');
  assert.equal(f.calls.length,2);
});
test('cancelled, failed and post-commit invitation reads report read state without resubmitting a write',async()=>{
  for (const code of ['NETWORK','PLATFORM_MICROSOFT_OPERATION_NOT_EXECUTED','PLATFORM_MICROSOFT_OPERATION_CANCELLED']) {
    let reads=0,writes=0;
    const api={ create: async()=>{},issue: async()=>{ writes++; },mutate: async()=>{},list: async()=>{
      if (++reads>1) throw error(code);return [];
    } };
    const c=createPlatformInvitationController({ api,tenantId: 'synthetic' });
    await c.load();await c.issue(command);await c.retry();
    assert.equal(writes,1);assert.equal(reads,2);assert.equal(c.snapshot().status,'refresh_required');
    assert.equal(c.snapshot().error,code.endsWith('CANCELLED') ? 'cancelled' : 'read');
    c.stop();assert.equal(c.snapshot().items.length,0);
  }
});
