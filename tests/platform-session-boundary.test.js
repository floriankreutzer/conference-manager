import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createApiClient } from '../src/core/api-client.js';
import { createPlatformSessionBoundary } from '../src/platform-admin/production/operator-session.js';

const response=status=>new Response('{}',{ status,headers: { 'content-type': 'application/json' } });

test('initial unauthenticated reads and authorization failures do not expire an established session',async()=>{
  let expired=0,status=401;
  const boundary=createPlatformSessionBoundary({ fetchImpl: async()=>response(status),onExpired: ()=>expired++ });
  assert.equal((await boundary.fetch('/session')).status,401);
  assert.equal(expired,0);
  boundary.activate();
  for (status of [200,403,404,409,428,429,503]) assert.equal((await boundary.fetch('/resource')).status,status);
  assert.equal(expired,0);
  assert.equal(boundary.expired,false);
});

test('one 401 ends the document session, discards late results and prevents a queued mutation replay',async()=>{
  let expired=0,release,requests=0,pendingSignal;
  const boundary=createPlatformSessionBoundary({ onExpired: ()=>expired++,fetchImpl: async(url,options)=>{
    requests++;
    if (url==='/slow') { pendingSignal=options.signal;return new Promise(resolve=>{ release=()=>resolve(response(200)); }); }
    return response(401);
  } });
  boundary.activate();
  const pending=boundary.fetch('/slow');
  const pendingRejected=assert.rejects(pending,{ code: 'HTTP_401' });
  await assert.rejects(boundary.fetch('/runtime'),{ code: 'HTTP_401' });
  assert.equal(pendingSignal.aborted,true);
  release();await pendingRejected;
  boundary.activate();boundary.expire();
  await assert.rejects(boundary.fetch('/mutation',{ method: 'POST',body: '{}' }),{ code: 'HTTP_401' });
  assert.equal(requests,2);
  assert.equal(expired,1);
  assert.equal(boundary.expired,true);
});

test('network failures preserve the session and caller cancellation reaches the owned fetch',async()=>{
  let signal,expired=0;
  const failure=new TypeError('NETWORK_UNAVAILABLE');
  const boundary=createPlatformSessionBoundary({ onExpired: ()=>expired++,fetchImpl: async(_url,options)=>{
    signal=options.signal;throw failure;
  } });
  boundary.activate();
  const controller=new AbortController();controller.abort();
  await assert.rejects(boundary.fetch('/read',{ signal: controller.signal }),error=>error===failure);
  assert.equal(signal.aborted,true);
  assert.equal(expired,0);
});

test('absence of a pending passkey ceremony preserves the session but protected own-key denial ends it',async()=>{
  let expired=0;
  const boundary=createPlatformSessionBoundary({ fetchImpl: async()=>response(401),onExpired: ()=>expired++ });
  boundary.activate();
  for (const path of ['pending','enrollment/pending']) {
    assert.equal((await boundary.fetch(`/api/v1/platform/auth/passkey/${path}`)).status,401);
  }
  const api=createApiClient({ origin: 'https://platform-session.invalid',baseUrl: '/api/v1/platform/',fetchImpl: boundary.fetch });
  await assert.rejects(api.request('auth/passkey/enrollment/pending'),{ code: 'HTTP_401' });
  assert.equal(expired,0);
  await assert.rejects(boundary.fetch('/api/v1/platform/auth/passkey/manage/keys'),{ code: 'HTTP_401' });
  assert.equal(expired,1);
});

for (const source of ['caller','session','document']) test(`a stalled response body remains cancellable by ${source} after headers`,
{ timeout: 5000 },async()=>{
  const server=createServer((_request,res)=>{
    res.writeHead(200,{ 'content-type': 'application/json' });res.write('{"pending":');
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    const caller=new AbortController();
    const boundary=createPlatformSessionBoundary({ onExpired() {} });boundary.activate();
    const result=await boundary.fetch(`http://127.0.0.1:${server.address().port}/stream`,{ signal: caller.signal });
    const rejected=assert.rejects(result.json(),error=>error.name==='AbortError');
    if (source==='caller') caller.abort();else if (source==='session') boundary.expire();else boundary.stop();
    await rejected;
  } finally {
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});

test('the ceremony exception applies only to exact same-origin GET paths',async()=>{
  for (const [url,options] of [
    ['/api/v1/platform/auth/passkey/pending',{ method: 'POST' }],
    ['/api/v1/platform/auth/passkey/pending?unexpected=1',{}],
    ['/api/v1/platform/auth/passkey/pending/other',{}],
    ['https://other.example/api/v1/platform/auth/passkey/pending',{}],
  ]) {
    const boundary=createPlatformSessionBoundary({ fetchImpl: async()=>response(401),onExpired() {} });
    boundary.activate();
    await assert.rejects(boundary.fetch(url,options),{ code: 'HTTP_401' });
    assert.equal(boundary.expired,true);
  }
});
