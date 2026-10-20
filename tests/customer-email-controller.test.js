import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiSecurityError } from '../src/core/api-client.js';
import { createCustomerEmailController } from '../src/platform/customer-authentication/controller.js';

const ID='f3000000-0000-4000-8000-000000000001';
const proof={ status: 'membership_required',expiresAt: '2026-10-20T08:05:00.000Z' };
function fixture() {
  const calls=[];const outputs={ pending: new ApiSecurityError('HTTP_401'),request: { ...proof,status: 'code_required' },
    verify: proof,choices: Object.freeze([{ membershipId: ID,displayName: 'Synthetic organisation' }]),select: undefined,complete: undefined };
  const call=name => async (...args) => { calls.push({ name,args });
    if (outputs[name] instanceof Error) throw outputs[name];
    return typeof outputs[name]==='function' ? outputs[name](...args) : outputs[name];
  };
  const controller=createCustomerEmailController({ client: { pending: call('pending'),request: call('request'),verify: call('verify'),
    choices: call('choices'),select: call('select'),clear() { calls.push({ name: 'clear' }); } },completeSession: call('complete') });
  return { controller,calls,outputs };
}
test('current server choices require explicit selection; no mailbox, code, CSRF or roles enter observable UI state',async () => {
  const f=fixture(); await f.controller.load(); assert.equal(f.controller.snapshot().phase,'email');
  await f.controller.request('Invited@example.com','de'); assert.equal(f.controller.snapshot().phase,'code');
  await f.controller.verify('00123456'); assert.equal(f.controller.snapshot().phase,'choices');
  assert.equal(f.calls.some(call => call.name==='select'),false);
  await f.controller.select('foreign'); assert.equal(f.calls.some(call => call.name==='select'),false);
  await f.controller.select(ID); assert.equal(f.controller.snapshot().phase,'authenticated');
  assert.equal(f.calls.filter(call => call.name==='select').length,1); assert.equal(f.calls.filter(call => call.name==='complete').length,1);
  assert.doesNotMatch(JSON.stringify(f.controller.snapshot()),/Invited|00123456|csrf|roles|permissions|tenantId|browserToken/);
});
test('reload resumes proved choices, while wrong proofs and rate limits stay bounded without resending',async () => {
  const f=fixture(); f.outputs.pending=proof; await f.controller.load(); assert.equal(f.controller.snapshot().phase,'choices');
  assert.equal(f.calls.some(call => call.name==='request'),false);
  f.controller.restart(); await f.controller.request('Invited@example.com','en');
  for (const [code,error] of [['HTTP_401','rejected'],['HTTP_429','limited']]) {
    f.outputs.verify=new ApiSecurityError(code); await f.controller.verify('00123456');
    assert.equal(f.controller.snapshot().phase,'code'); assert.equal(f.controller.snapshot().error,error);
  }
  assert.equal(f.calls.filter(call => call.name==='request').length,1);
});
test('ambiguous code verification recovers pending state and never repeats an already consumed code',async () => {
  const f=fixture(); await f.controller.load(); await f.controller.request('Invited@example.com','de');
  f.outputs.verify=new Error('synthetic network ambiguity'); await f.controller.verify('00123456');
  assert.equal(f.controller.snapshot().phase,'resume_required');
  f.outputs.pending=proof; await f.controller.resume(); assert.equal(f.controller.snapshot().phase,'choices');
  assert.equal(f.calls.filter(call => call.name==='verify').length,1);
});
test('lost selection or failed session refresh rechecks the ordinary session without replaying acceptance',async () => {
  for (const failure of ['select','complete']) {
    const f=fixture();f.outputs.pending=proof;await f.controller.load();
    f.outputs[failure]=new Error('synthetic ambiguous completion');await f.controller.select(ID);
    assert.equal(f.controller.snapshot().phase,'refresh_required');
    f.outputs.complete=undefined;await f.controller.checkSession();assert.equal(f.controller.snapshot().phase,'authenticated');
    assert.equal(f.calls.filter(call => call.name==='select').length,1);
  }
});
test('busy operations are single-flight and disposed views cannot publish late results or start another command',async () => {
  const f=fixture();await f.controller.load();let release;
  f.outputs.request=() => new Promise(resolve => { release=() => resolve({ ...proof,status: 'code_required' }); });
  const pending=f.controller.request('Invited@example.com','de');
  await f.controller.request('another@example.com','en'); assert.equal(f.calls.filter(call => call.name==='request').length,1);
  let updates=0;f.controller.subscribe(() => { updates++; });f.controller.dispose();release();await pending;
  assert.equal(updates,0);await f.controller.verify('00123456');assert.equal(f.calls.some(call => call.name==='verify'),false);
});
