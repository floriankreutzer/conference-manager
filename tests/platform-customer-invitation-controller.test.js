import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformInvitationController } from '../src/platform-admin/customer-invitation-controller.js';
const person={ recipient: 'Synthetic@example.test',roles: ['tenant_admin'],locale: 'de' };
const draft={ displayName: 'Synthetic',reason: 'Explicit reason',invitations: [person] };
function fixture({ create=async()=>({ invitations: [] }),list=async()=>[],mutate=async()=>{} }={}) {
  const calls=[],api={ create: async value=>{ calls.push(value);return create(value); },issue: async value=>{ calls.push(value);return []; },
    list,mutate };return { api,calls };
}
test('unknown creation outcome retains only the immutable command and needs an explicit retry',async()=>{
  let attempts=0;const f=fixture({ create: async()=>{ if (++attempts===1) throw new Error('NETWORK');return { invitations: [] }; } });
  const c=createPlatformInvitationController({ api: f.api,idFactory: ()=> 'command-one' });
  const input=structuredClone(draft);await c.issue(input);assert.equal(c.snapshot().status,'retry');
  input.reason='Changed reason';input.invitations[0].roles=[];
  await c.issue(input);assert.equal(f.calls.length,1);await c.retry();
  assert.equal(f.calls.length,2);assert.equal(f.calls[0],f.calls[1]);assert.equal(f.calls[1].reason,draft.reason);
  assert.deepEqual(f.calls[1].invitations[0].roles,['tenant_admin']);assert.equal(c.snapshot().status,'complete');
});
test('a cancelled or refused check of an earlier unknown write preserves that original command and outcome',async()=>{
  for (const tenantId of [null,'tenant']) {
    for (const code of ['PLATFORM_MICROSOFT_OPERATION_CANCELLED','PLATFORM_PASSKEY_OPERATION_CANCELLED',
      'PLATFORM_MICROSOFT_OPERATION_NOT_EXECUTED','PLATFORM_PASSKEY_OPERATION_NOT_EXECUTED','HTTP_403']) {
      const calls=[];let ids=0;
      const send=async value=>{
        calls.push(value);if (calls.length===1) throw new Error('NETWORK');
        if (calls.length===2) throw Object.assign(new Error(),{ code });
        return tenantId===null ? { invitations: [] } : [];
      };
      const c=createPlatformInvitationController({ tenantId,idFactory: ()=>`command-${++ids}`,
        api: { create: send,issue: send,list: async()=>{
          if (calls.length===2) throw Object.assign(new Error(),{ code: 'PLATFORM_MICROSOFT_OPERATION_CANCELLED' });return [];
        },mutate: async()=>{} } });
      if (tenantId!==null) await c.load();
      await c.issue(draft);await c.retry();
      assert.equal(c.snapshot().status,'retry');assert.equal(c.snapshot().error,'unknown');
      if (tenantId!==null) { await c.load();assert.equal(c.snapshot().error,'unknown'); }
      await c.issue({ ...draft,reason: 'Different intent' });assert.equal(calls.length,2);
      await c.retry();assert.equal(calls.length,3);assert.equal(ids,1);
      assert.equal(calls[0],calls[1]);assert.equal(calls[0],calls[2]);
      assert.equal(c.snapshot().status,tenantId===null ? 'complete' : 'ready');
    }
  }
});
test('known denial and cancelled proof have no retry while detached completions cannot restore data',async()=>{
  for (const code of ['PLATFORM_CUSTOMER_INVITATION_INPUT_INVALID','HTTP_400','HTTP_401','HTTP_403','HTTP_409','HTTP_429',
    'PLATFORM_PASSKEY_OPERATION_CANCELLED','PLATFORM_MICROSOFT_OPERATION_CANCELLED']) {
    const f=fixture({ create: async()=>{ throw Object.assign(new Error(),{ code }); } });
    const c=createPlatformInvitationController({ api: f.api });await c.issue(draft);await c.retry();assert.equal(f.calls.length,1);
    assert.equal(c.snapshot().status,'error');
  }
  let resolve,created=0;const f=fixture({ create: ()=>new Promise(done=>{ resolve=done; }) });
  const c=createPlatformInvitationController({ api: f.api,onCreated: async()=>{ created++; } });
  const running=c.issue(draft);c.stop();resolve({ invitations: [person] });await running;
  assert.equal(created,0);assert.equal(c.snapshot().items.length,0);
});

test('failed or cancelled invitation reads cannot enable issuance before an explicit successful refresh',async()=>{
  for (const code of ['NETWORK','PLATFORM_MICROSOFT_OPERATION_CANCELLED','PLATFORM_PASSKEY_OPERATION_CANCELLED','HTTP_403']) {
    let fails=true;
    const f=fixture({ list: async()=>{ if (fails) throw Object.assign(new Error(),{ code });return []; } });
    const c=createPlatformInvitationController({ api: f.api,tenantId: 'tenant' });
    await c.load();assert.equal(c.snapshot().status,'refresh_required');
    if (code.includes('CANCELLED')) assert.equal(c.snapshot().error,'cancelled');
    await c.issue(draft);await c.retry();assert.equal(f.calls.length,0);
    fails=false;await c.load();assert.equal(c.snapshot().status,'ready');
    await c.issue(draft);assert.equal(f.calls.length,1);
  }
});
test('invitation access failures distinguish session, refusal and unavailable customer scope without retrying writes',async()=>{
  for (const [code,expected] of [['HTTP_401','session'],['HTTP_403','denied'],['HTTP_404','unavailable']]) {
    const failure=()=>{ throw Object.assign(new Error(),{ code }); };
    const creation=fixture({ create: failure });
    const create=createPlatformInvitationController({ api: creation.api });
    await create.issue(draft);assert.equal(create.snapshot().error,expected);
    await create.issue(draft);await create.retry();assert.equal(creation.calls.length,1);
    let denied=true;
    const existing=fixture({ list: async()=>denied ? failure() : [] });
    const manage=createPlatformInvitationController({ api: existing.api,tenantId: 'tenant' });
    await manage.load();assert.equal(manage.snapshot().error,expected);
    assert.equal(manage.snapshot().status,'refresh_required');
    await manage.issue(draft);assert.equal(existing.calls.length,0);
    denied=false;await manage.load();assert.equal(manage.snapshot().error,null);
    await manage.issue(draft);assert.equal(existing.calls.length,1);
  }
});
test('mutations use displayed revisions, serialize work and require a read after unknown outcome',async()=>{
  const item={ id: 'invitation',revision: 7,state: 'pending' };let reads=0,writes=0;
  const f=fixture({ list: async()=>{ reads++;return [item]; },mutate: async(operation,value)=>{
    writes++;assert.equal(operation,'revoke');assert.equal(value.expectedRevision,7);assert.equal(value.reason,'Audit reason');throw new Error('NETWORK');
  } });
  const c=createPlatformInvitationController({ api: f.api,tenantId: 'tenant',idFactory: ()=> 'command' });
  await c.load();await c.mutate('revoke','invitation','Audit reason');assert.equal(c.snapshot().status,'refresh_required');
  await c.mutate('revoke','invitation','Audit reason');assert.equal(writes,1);assert.equal(reads,1);
  await c.load();assert.equal(reads,2);assert.equal(c.snapshot().status,'ready');
});

test('a committed creation is never retried when the directory refresh callback fails',async()=>{
  const f=fixture(),c=createPlatformInvitationController({ api: f.api,onCreated: async()=>{ throw new Error('REFRESH_UNAVAILABLE'); } });
  await c.issue(draft);assert.equal(c.snapshot().status,'complete');assert.equal(c.snapshot().error,'refresh');
  await c.retry();await c.issue(draft);assert.equal(f.calls.length,1);
});
