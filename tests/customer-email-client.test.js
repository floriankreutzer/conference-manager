import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomerEmailClient } from '../src/platform/customer-authentication/client.js';

const ID='f3000000-0000-4000-8000-000000000001',CSRF='a'.repeat(64),NEXT='b'.repeat(64);
const NOW=Date.parse('2026-10-20T08:00:00.000Z');
const pending=(status='code_required') => ({ status,requestId: ID,csrfToken: status==='code_required' ? CSRF : NEXT,
  expiresAt: new Date(NOW+300000).toISOString() });
const json=(value,status=200) => new Response(status===204 ? null : JSON.stringify(value),{
  status,headers: { 'Content-Type': 'application/json' } });
function fixture() {
  const calls=[]; let reply=json(pending(),202);
  const client=createCustomerEmailClient({ origin: 'https://customer.example',clock: () => NOW,
    async fetchImpl(url,init) { calls.push({ url: String(url),init }); return reply; } });
  return { client,calls,setReply: value => { reply=value; } };
}

test('fixed Customer email endpoints keep proof in memory, preserve zeroes and never accept independent Tenant or role authority',async () => {
  const f=fixture();
  assert.deepEqual(await f.client.request({ recipient: 'Invited@example.com',locale: 'de' }),{
    status: 'code_required',expiresAt: pending().expiresAt });
  assert.equal(f.calls[0].url,'https://customer.example/api/v1/auth/email/challenges');
  assert.equal(f.calls[0].init.headers['X-CSRF-Token'],undefined);
  f.setReply(json(pending('membership_required'))); await f.client.verify('00123456');
  assert.deepEqual(JSON.parse(f.calls[1].init.body),{ code: '00123456' });
  assert.equal(f.calls[1].init.headers['X-CSRF-Token'],CSRF);
  f.setReply(json({ status: 'membership_required',requestId: ID,items: [{ membershipId: ID,displayName: '<Synthetic organisation>' }] }));
  const items=await f.client.choices(); assert.equal(Object.isFrozen(items[0]),true);
  f.setReply(json(null,204)); await f.client.select(ID);
  assert.deepEqual(JSON.parse(f.calls[3].init.body),{ membershipId: ID });
  assert.equal(f.calls[3].init.headers['X-CSRF-Token'],NEXT);
  await assert.rejects(f.client.select(ID),/CSRF_TOKEN_REQUIRED/); assert.equal(f.calls.length,4);
  for (const { init } of f.calls) {
    assert.equal(init.credentials,'same-origin'); assert.equal(init.redirect,'error');
    assert.equal(init.cache,'no-store'); assert.equal(init.referrerPolicy,'no-referrer');
    assert.ok(init.signal instanceof AbortSignal);
    assert.doesNotMatch(init.body ?? '',/tenantId|userId|roles|provider|browserToken|challengeId/);
  }
});

test('preauthentication response and choice schemas reject leaked authority, ambiguity, excessive data and expired proof',async () => {
  for (const extra of [{ tenantId: ID },{ browserToken: 'private' },{ status: 'authenticated' },{ csrfToken: 'invalid' },
    { expiresAt: new Date(NOW-1).toISOString() },{ requestId: 'invalid' }]) {
    const f=fixture(); f.setReply(json({ ...pending(),...extra },202));
    await assert.rejects(f.client.request({ recipient: 'Invited@example.com',locale: 'de' }));
  }
  for (const items of [[{ membershipId: ID,displayName: 'Synthetic',roles: ['tenant_admin'] }],
    [{ membershipId: ID,displayName: 'Synthetic' },{ membershipId: ID,displayName: 'Duplicate' }],
    [{ membershipId: ID,displayName: 'unsafe\nlabel' }],Array.from({ length: 101 },() => ({ membershipId: ID,displayName: 'Synthetic' }))]) {
    const f=fixture(); f.setReply(json({ status: 'membership_required',requestId: ID,items }));
    await assert.rejects(f.client.choices(),/CUSTOMER_EMAIL_RESPONSE_INVALID/);
  }
  for (const value of ['1234567','123456789',12345678,'１２３４５６７８']) {
    const f=fixture(); await assert.rejects(f.client.verify(value)); assert.equal(f.calls.length,0);
  }
  const f=fixture(); f.setReply(new Response('private html',{ status: 200,headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(f.client.pending());
});

test('mailbox request, verification and selection perform one attempt on network, throttling or server errors',async () => {
  for (const status of [401,403,429,500,503]) {
    const f=fixture(); f.setReply(json({ error: { code: 'AUTHENTICATION_REJECTED' } },status));
    await assert.rejects(f.client.request({ recipient: 'Invited@example.com',locale: 'en' })); assert.equal(f.calls.length,1);
  }
  const calls=[];
  const client=createCustomerEmailClient({ origin: 'https://customer.example',clock: () => NOW,
    async fetchImpl(url,init) {
      calls.push({ url: String(url),init });
      if (String(url).endsWith('/pending')) return json(pending('membership_required'));
      throw new Error('synthetic ambiguous network result');
    } });
  await client.pending(); await assert.rejects(client.select(ID)); assert.equal(calls.length,2);
  client.clear(); await assert.rejects(client.select(ID)); assert.equal(calls.length,2);
});

test('bounded positive clock skew preserves a freshly issued code without extending server-owned choice authority',async () => {
  const f=fixture();f.setReply(json({ ...pending(),expiresAt: new Date(NOW+630000).toISOString() },202));
  assert.equal((await f.client.request({ recipient: 'Invited@example.com',locale: 'de' })).status,'code_required');
  f.setReply(json({ ...pending('membership_required'),expiresAt: new Date(NOW+330000).toISOString() }));
  assert.equal((await f.client.verify('00123456')).status,'membership_required');
  f.setReply(json({ ...pending('membership_required'),expiresAt: new Date(NOW+361000).toISOString() }));
  await assert.rejects(f.client.verify('00123456'),/CUSTOMER_EMAIL_RESPONSE_INVALID/);
});
