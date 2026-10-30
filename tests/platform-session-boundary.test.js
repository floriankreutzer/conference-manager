import assert from 'node:assert/strict';
import test from 'node:test';
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
