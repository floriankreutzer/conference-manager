import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformPasskeyOperationsClient, loadPlatformPasskeyConfiguration }
  from '../src/platform-admin/production/passkey-operations-client.js';

const ID = '11111111-1111-4111-8111-111111111111';
const state = Buffer.alloc(32, 1).toString('base64url');
const pending = { status: 'passkey_required', state, requestId: ID, options: { challenge: state } };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const cancelled = () => Object.assign(new Error('PRIVATE_NATIVE_DETAILS'), { code: 'PLATFORM_PASSKEY_BROWSER_CANCELLED' });
function fixture({ fetchImpl, authenticate = async () => ({ id: state }), refreshSession, onSessionRefreshRequired } = {}) {
  const requests = []; let csrf = 'C'.repeat(43); let refreshes = 0;
  const client = createPlatformPasskeyOperationsClient({ origin: 'https://ops-int.example.com',
    csrfTokenProvider: () => csrf, browser: { authenticate }, onSessionRefreshRequired,
    refreshSession: refreshSession || (async () => { refreshes++; csrf = 'N'.repeat(43); return true; }),
    fetchImpl: async (url, init) => { requests.push({ url: String(url), init });
      return fetchImpl ? fetchImpl(url, init, requests.length) : requests.length % 2 ? json(pending, 428) : json({ changed: true }); },
  });
  return { client, requests, refreshes: () => refreshes };
}

test('an explicit428 signs and retries only the exact request once, with CSRF and ordinary session refresh', async () => {
  const f = fixture();
  const result = await f.client.request('tenants', { method: 'POST', body: { displayName: 'Synthetic customer' }, idempotencyKey: ID });
  assert.deepEqual(result, { changed: true }); assert.equal(f.requests.length, 2); assert.equal(f.refreshes(), 1);
  const [initial,retried] = f.requests;
  assert.equal(initial.url, retried.url); assert.equal(initial.init.method, retried.init.method);
  assert.equal(initial.init.body, retried.init.body);
  assert.equal(initial.init.headers['Idempotency-Key'], retried.init.headers['Idempotency-Key']);
  assert.equal(initial.init.headers['X-CSRF-Token'], 'C'.repeat(43));
  assert.equal(retried.init.credentials, 'same-origin'); assert.equal(retried.init.redirect, 'error');
  assert.equal(retried.init.cache, 'no-store'); assert.equal(retried.init.referrerPolicy, 'no-referrer');
  const proof = JSON.parse(Buffer.from(retried.init.headers['X-Platform-Passkey-Proof'], 'base64url').toString());
  assert.deepEqual(proof, { state, response: { id: state } });
});

test('network errors, cancellation, validation/conflict errors and repeated challenges cannot retry a mutation blindly', async () => {
  for (const status of [400,401,403,409,429,503]) {
    const f = fixture({ fetchImpl: () => json({ error: { code: 'PLATFORM_OPERATION_REJECTED' } }, status) });
    await assert.rejects(f.client.request('tenants', { method: 'POST', body: {}, idempotencyKey: ID }));
    assert.equal(f.requests.length, 1); assert.equal(f.refreshes(), 0);
  }
  const network = fixture({ fetchImpl() { throw new Error('PRIVATE_NETWORK_DETAILS'); } });
  await assert.rejects(network.client.request('tenants', { method: 'POST', body: {} }), /PLATFORM_PASSKEY_OPERATION_FAILED/);
  assert.equal(network.requests.length, 1);
  const cancel = fixture({ authenticate: async () => { throw cancelled(); } });
  await assert.rejects(cancel.client.request('tenants', { method: 'POST', body: {} }), error => {
    assert.equal(error.code, 'PLATFORM_PASSKEY_OPERATION_CANCELLED'); assert.equal(error.cause, undefined); return true;
  });
  assert.equal(cancel.requests.length, 1);
  const repeat = fixture({ fetchImpl: () => json(pending, 428) });
  await assert.rejects(repeat.client.request('tenants', { method: 'POST', body: {} })); assert.equal(repeat.requests.length, 2);
});

test('challenge bounds, closed schemas, request IDs and content types fail before any native proof or second request', async () => {
  let native = 0;
  for (const invalid of [{ ...pending, operatorId: ID }, { ...pending, state: 'invalid' }, { ...pending, requestId: 'x'.repeat(36) },
    { ...pending, options: [] }]) {
    const f = fixture({ authenticate: async () => { native++; }, fetchImpl: () => json(invalid, 428) });
    await assert.rejects(f.client.request('tenants', { method: 'POST', body: {} })); assert.equal(f.requests.length, 1);
  }
  for (const response of [new Response('x'.repeat(16385), { status: 428, headers: { 'Content-Type': 'application/json' } }),
    new Response('private-html', { status: 428, headers: { 'Content-Type': 'text/html' } })]) {
    const f = fixture({ authenticate: async () => { native++; }, fetchImpl: () => response });
    await assert.rejects(f.client.request('tenants', { method: 'POST', body: {} })); assert.equal(f.requests.length, 1);
  }
  assert.equal(native, 0);
});

test('proof-capable requests queue before cookies change and use the refreshed CSRF; ordinary reads stay parallel', async () => {
  let release; let prompts = 0;
  const f = fixture({ authenticate() {
    prompts++;
    return prompts === 1 ? new Promise(resolve => { release = () => resolve({ id: state }); }) : Promise.resolve({ id: state });
  } });
  const first = f.client.request('tenants', { method: 'POST', body: { displayName: 'One' }, idempotencyKey: ID });
  const second = f.client.request('tenants', { method: 'POST', body: { displayName: 'Two' }, idempotencyKey: ID });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.requests.length, 1); release();
  await Promise.all([first,second]); assert.equal(f.requests.length, 4); assert.equal(f.refreshes(), 2);
  assert.equal(f.requests[2].init.headers['X-CSRF-Token'], 'N'.repeat(43));
});

test('sensitive GET proof includes CSRF and refresh failure never repeats the committed operation', async () => {
  let reloads = 0;
  const f = fixture({ refreshSession: async () => false, onSessionRefreshRequired: () => { reloads++; } });
  await assert.rejects(f.client.request('audit/exports?limit=10'), /PLATFORM_PASSKEY_SESSION_REFRESH_REQUIRED/);
  assert.equal(f.requests.length, 2); assert.equal(reloads, 1);
  assert.ok(f.requests.every(value => value.init.headers['X-CSRF-Token']));
  const unavailable = fixture({ refreshSession: async () => { throw new Error('PRIVATE_REFRESH_FAILURE'); },
    onSessionRefreshRequired: () => { reloads++; } });
  await assert.rejects(unavailable.client.request('audit/exports'), /PLATFORM_PASSKEY_SESSION_REFRESH_REQUIRED/);
  assert.equal(unavailable.requests.length, 2); assert.equal(reloads, 2);
  const stopped = fixture(); stopped.client.stop();
  await assert.rejects(stopped.client.request('tenants', { method: 'POST', body: {} }), /CANCELLED/);
  assert.equal(stopped.requests.length, 0);
});

test('recovery-target GET proofs share the mutation queue in both navigation orders', async () => {
  for (const readFirst of [true,false]) {
    let release,prompts=0;
    const f=fixture({ authenticate() {
      prompts++;
      return prompts===1 ? new Promise(resolve => { release=() => resolve({ id: state }); }) : Promise.resolve({ id: state });
    } });
    const read=() => f.client.request(`tenants/${ID}/recovery/user-session-revocation/targets?limit=50`);
    const write=() => f.client.request('tenants',{ method: 'POST',body: { displayName: 'Synthetic' },idempotencyKey: ID });
    const first=readFirst ? read() : write(),second=readFirst ? write() : read();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.requests.length,1,'neither initial request may replace the in-flight operation cookie');
    assert.equal(prompts,1); release();
    await Promise.all([first,second]); assert.equal(f.requests.length,4); assert.equal(f.refreshes(),2);
    assert.equal(f.requests[2].init.headers['X-CSRF-Token'],'N'.repeat(43));
    assert.equal(f.requests[0].url,f.requests[1].url); assert.equal(f.requests[2].url,f.requests[3].url);
    assert.equal(f.requests[0].init.body,f.requests[1].init.body);
    assert.equal(f.requests[2].init.body,f.requests[3].init.body);
  }
});

test('configuration loader preserves only an explicit missing endpoint as legacy and rejects unknown modes', async () => {
  const client = { async request() { return { mode: 'application_passkey', environment: 'int', minimumPasskeys: 2, requestId: ID }; } };
  assert.equal((await loadPlatformPasskeyConfiguration(client)).mode, 'application_passkey');
  assert.equal(await loadPlatformPasskeyConfiguration({ async request() { throw Object.assign(new Error(), { code: 'HTTP_404' }); } }), null);
  await assert.rejects(loadPlatformPasskeyConfiguration({ async request() { return { mode: 'unknown' }; } }));
});

test('read requests remain parallel, queued proof requests stay bounded and oversized native JSON cannot be resent', async () => {
  let release; const blocked = new Promise(resolve => { release = resolve; }); let reads = 0;
  const parallel = fixture({ fetchImpl: async () => { reads++; await blocked; return json({ items: [] }); } });
  const firstRead = parallel.client.request('capabilities'); const secondRead = parallel.client.request('packages');
  await new Promise(resolve => setImmediate(resolve)); assert.equal(reads, 2); release(); await Promise.all([firstRead,secondRead]);
  let releaseMutation;
  const queued = fixture({ authenticate: () => new Promise(resolve => { releaseMutation = resolve; }) });
  const tasks = Array.from({ length: 5 }, () => queued.client.request('tenants', { method: 'POST', body: {} }).catch(error => error.code));
  await assert.rejects(queued.client.request('tenants', { method: 'POST', body: {} }), /BUSY/);
  await new Promise(resolve => setImmediate(resolve)); queued.client.stop(); releaseMutation({ id: state }); await Promise.all(tasks);
  assert.equal(queued.requests.length, 1, 'stop prevents both native replay and queued network requests');
  const oversized = fixture({ authenticate: async () => ({ signature: 'x'.repeat(9001) }) });
  await assert.rejects(oversized.client.request('tenants', { method: 'POST', body: {} })); assert.equal(oversized.requests.length, 1);
});

test('individual invitation listing queues its exact query with fresh mutations in both navigation orders',async()=>{
  for (const readFirst of [true,false]) {
    let release,prompts=0;
    const f=fixture({ authenticate() {
      prompts++;return prompts===1 ? new Promise(resolve=>{ release=()=>resolve({ id: state }); }) : Promise.resolve({ id: state });
    } });
    const read=()=>f.client.request(`tenants/${ID}/invitations?limit=100&afterId=${ID}`);
    const write=()=>f.client.request(`tenants/${ID}/invitations`,{ method: 'POST',body: { invitations: [] },idempotencyKey: ID });
    const first=readFirst ? read() : write(),second=readFirst ? write() : read();
    await new Promise(resolve=>setImmediate(resolve));assert.equal(f.requests.length,1);assert.equal(prompts,1);release();
    await Promise.all([first,second]);assert.equal(f.requests.length,4);assert.equal(f.refreshes(),2);
    assert.equal(f.requests[0].url,f.requests[1].url);assert.equal(f.requests[2].url,f.requests[3].url);
    assert.equal(f.requests[2].init.headers['X-CSRF-Token'],'N'.repeat(43));
  }
});
