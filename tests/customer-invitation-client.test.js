import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomerInvitationClient } from '../src/platform/customer-invitations/client.js';

const id=n => `c1000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const intent=extra => ({ recipient: 'Person@example.com',roles: ['tenant_admin'],locale: 'de',...extra });
const row=extra => ({ id: id(1),revision: 1,...intent(),state: 'pending',expiresAt: '2026-10-30T12:00:00.000Z',
  delivery: 'queued',...extra });
function fixture(reply) {
  const calls=[];return { calls,client: createCustomerInvitationClient({ apiClient: { async request(path,options) {
    calls.push({ path,options });return typeof reply==='function' ? reply(path,options) : reply;
  } } }) };
}

test('invitation transport uses fixed bounded routes and closed session/CSRF business commands',async () => {
  const f=fixture({ invitations: [row()],requestId: id(9) });
  assert.equal((await f.client.list())[0].recipient,'Person@example.com');
  assert.equal(f.calls[0].path,'v1/tenant/invitations?limit=100');
  await f.client.issueBatch({ commandId: id(10),invitations: [intent({ recipient: 'Person@EXAMPLE.COM' })] });
  assert.equal(f.calls[1].path,'v1/tenant/invitations');
  assert.deepEqual(f.calls[1].options.body,{ commandId: id(10),invitations: [intent()] });
  assert.equal(f.calls[1].options.method,'POST');
  const revoke=fixture({ invitation: row({ state: 'revoked',revision: 2,delivery: 'cancelled' }),requestId: id(9) });
  assert.equal((await revoke.client.mutate('revoke',{ invitationId: id(1),expectedRevision: 1 })).delivery,'cancelled');
  assert.equal(revoke.calls[0].path,`v1/tenant/invitations/${id(1)}/revoke`);
  assert.deepEqual(revoke.calls[0].options.body,{ expectedRevision: 1 });
});

test('batch bounds, duplicates, invented privilege and authority overrides never reach transport',async () => {
  const f=fixture(null);
  const sparse=Array(1);
  for (const command of [{ commandId: id(10),invitations: [] },{ commandId: id(10),invitations: Array(21).fill(intent()) },
    { commandId: id(10),invitations: sparse },{ commandId: id(10),invitations: [intent(),intent()] },
    { commandId: id(10),invitations: [intent({ roles: ['platform_admin'] })] },
    { commandId: id(10),invitations: [intent({ tenantId: id(3) })] },
    { commandId: id(10),invitations: [intent()],tenantId: id(3) }]) {
    await assert.rejects(f.client.issueBatch(command),/CUSTOMER_INVITATION_INPUT_INVALID/);
  }
  for (const value of [{ invitationId: '../foreign',expectedRevision: 1 },{ invitationId: id(1),expectedRevision: 0 },
    { invitationId: id(1),expectedRevision: 1,roles: ['tenant_admin'] }]) {
    await assert.rejects(f.client.mutate('revoke',value),/CUSTOMER_INVITATION_INPUT_INVALID/);
  }
  await assert.rejects(f.client.list({ afterId: 'https://foreign.example' }),/CUSTOMER_INVITATION_INPUT_INVALID/);
  assert.equal(f.calls.length,0);
});

test('foreign/private, duplicate, unordered and contradictory receipts fail closed after one request',async () => {
  for (const invitations of [[row({ tenantId: id(3) })],[row(),row()],[row({ id: id(2) }),row()],Array(1),
    [row({ delivery: 'delivered' })],[row({ state: 'revoked',delivery: 'queued' })],
    [row({ expiresAt: 'not a date' })],[row({ roles: ['platform_admin'] })]]) {
    const f=fixture({ invitations,requestId: id(9) });await assert.rejects(f.client.list(),/CUSTOMER_INVITATION_RESPONSE_INVALID/);
    assert.equal(f.calls.length,1);
  }
  const wrong=fixture({ invitations: [row({ recipient: 'Other@example.com' })],requestId: id(9) });
  await assert.rejects(wrong.client.issueBatch({ commandId: id(10),invitations: [intent()] }),/CUSTOMER_INVITATION_RESPONSE_INVALID/);
  const stale=fixture({ invitation: row({ revision: 1 }),requestId: id(9) });
  await assert.rejects(stale.client.mutate('reissue',{ invitationId: id(1),expectedRevision: 1 }),/CUSTOMER_INVITATION_RESPONSE_INVALID/);
});

test('legitimate terminal and in-flight observations remain distinct and never imply successful delivery',async () => {
  for (const delivery of ['processing','accepted','failed','cancelled']) {
    const f=fixture({ invitations: [row({ state: 'revoked',delivery })],requestId: id(9) });
    assert.equal((await f.client.list())[0].delivery,delivery);
  }
});
