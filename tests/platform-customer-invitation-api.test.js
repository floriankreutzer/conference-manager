import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformCustomerInvitationApi } from '../src/platform-admin/customer-invitation-api.js';
const id=n=>`a1000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const intent=extra=>({ recipient: 'Person@example.test',roles: ['conference_manager'],locale: 'de',...extra });
const row=extra=>({ id: id(2),revision: 1,...intent(),state: 'pending',expiresAt: '2026-10-30T12:00:00.000Z',delivery: 'queued',...extra });
const tenant={ id: id(1),displayName: 'Synthetic customer',status: 'onboarding' };
const creation=extra=>({ displayName: tenant.displayName,reason: 'Synthetic onboarding',invitations: [intent()],commandId: id(9),...extra });
function fixture(reply) {
  const calls=[];const client=createPlatformCustomerInvitationApi({ apiClient: { async request(path,options) {
    calls.push({ path,options });return typeof reply==='function' ? reply(path,options) : reply;
  } } });return { client,calls };
}
test('owner-inclusive creation validates the new direct contract and signs all individual intents',async()=>{
  const owner=row({ id: id(3),recipient: 'Owner@example.test',roles: ['tenant_admin'],locale: 'en' });
  const f=fixture({ schemaVersion: 1,outcome: 'updated',tenant,invitations: [row(),owner] });
  const result=await f.client.create(creation());assert.equal(result.invitations.length,2);
  assert.equal(f.calls[0].path,'tenants');assert.equal(f.calls[0].options.idempotencyKey,id(9));
  assert.deepEqual(f.calls[0].options.body,{ displayName: tenant.displayName,reason: 'Synthetic onboarding',invitations: [intent()],
    confirmation: { action: 'tenant.invitation.create',displayName: tenant.displayName } });
  const augmented=fixture({ schemaVersion: 1,outcome: 'idempotent',tenant,invitations: [row({ roles: ['conference_manager','tenant_admin'],locale: 'en' })] });
  assert.equal((await augmented.client.create(creation())).invitations.length,1);
  const onlyOwner=fixture({ schemaVersion: 1,outcome: 'updated',tenant,invitations: [owner] });
  await onlyOwner.client.create(creation({ invitations: [] }));
});
test('Platform collection and mutations preserve exact target, reason, revision and immutable command key',async()=>{
  const f=fixture({ schemaVersion: 1,items: [row()] });assert.equal((await f.client.list({ tenantId: id(1) }))[0].id,id(2));
  assert.equal(f.calls[0].path,`tenants/${id(1)}/invitations?limit=100`);
  const batch=fixture({ schemaVersion: 1,outcome: 'updated',invitations: [row()] });
  const input={ tenantId: id(1),reason: 'Additional recipient',commandId: id(9),invitations: [intent()] };
  await batch.client.issue(input);await batch.client.issue(input);
  assert.deepEqual(batch.calls[0].options.body,batch.calls[1].options.body);
  assert.equal(batch.calls[0].options.idempotencyKey,batch.calls[1].options.idempotencyKey);
  assert.deepEqual(batch.calls[0].options.body.confirmation,{ action: 'tenant.invitation.create',tenantId: id(1) });
  for (const operation of ['reissue','revoke']) {
    const response=row({ revision: 2,state: operation==='revoke' ? 'revoked' : 'pending',delivery: operation==='revoke' ? 'cancelled' : 'queued' });
    const m=fixture({ schemaVersion: 1,outcome: 'updated',invitation: response });
    await m.client.mutate(operation,{ tenantId: id(1),invitationId: id(2),expectedRevision: 1,reason: 'Explicit action',commandId: id(9) });
    assert.equal(m.calls[0].options.method,operation==='revoke' ? 'DELETE' : 'POST');
    assert.deepEqual(m.calls[0].options.body,{ expectedRevision: 1,reason: 'Explicit action',
      confirmation: { action: `tenant.invitation.${operation}`,tenantId: id(1) } });
  }
});
test('malformed commands, invented roles, recipient bounds and target traversal fail before transport',async()=>{
  const f=fixture(null);
  for (const value of [creation({ invitations: Array(20).fill(intent()) }),creation({ invitations: Array(1) }),
    creation({ invitations: [intent(),intent()] }),creation({ invitations: [intent({ roles: ['platform_operator'] })] }),
    creation({ invitations: [intent({ userId: id(5) })] }),creation({ commandId: '../target' }),
    creation({ displayName: ' Unsafe ' }),{ ...creation(),ownerRecipient: 'arbitrary@example.test' }]) {
    await assert.rejects(f.client.create(value),/INPUT_INVALID/);
  }
  await assert.rejects(f.client.list({ tenantId: '../other' }),/INPUT_INVALID/);
  await assert.rejects(f.client.mutate('revoke',{ tenantId: id(1),invitationId: id(2),expectedRevision: Number.MAX_SAFE_INTEGER-1,
    reason: 'Reason',commandId: id(9) }),/INPUT_INVALID/);
  assert.equal(f.calls.length,0);
});
test('foreign, private, stale, duplicate, unordered and legacy successful responses fail closed',async()=>{
  for (const items of [[row({ tenantId: id(4) })],[row(),row()],[row({ id: id(3) }),row()],
    [row({ roles: ['platform_admin'] })],[row({ state: 'revoked',delivery: 'queued' })]]) {
    const f=fixture({ schemaVersion: 1,items });await assert.rejects(f.client.list({ tenantId: id(1) }),/CONTRACT_INVALID/);
  }
  for (const invitations of [[row()],[row({ recipient: 'Foreign@example.test',roles: ['tenant_admin'] })],
    [row({ roles: ['tenant_admin'] })],[row(),row({ id: id(3),recipient: 'Foreign@example.test',roles: ['conference_manager'] })]]) {
    const f=fixture({ schemaVersion: 1,outcome: 'updated',tenant,invitations });
    await assert.rejects(f.client.create(creation()),/CONTRACT_INVALID/);
  }
  const legacy=fixture({ schemaVersion: 1,outcome: 'updated',tenant,invitation: {},oneTimeDelivery: { available: true } });
  await assert.rejects(legacy.client.create(creation()),/CONTRACT_INVALID/);
  const network=fixture(()=>{ throw new Error('NETWORK'); });await assert.rejects(network.client.create(creation()),/NETWORK/);
  assert.equal(network.calls.length,1,'unknown write outcomes never trigger automatic retry');
});
