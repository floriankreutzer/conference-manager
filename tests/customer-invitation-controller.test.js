import assert from 'node:assert/strict';
import test from 'node:test';
import { createInvitationAdministrationController } from '../src/tenant-admin/sections/users/invitations-controller.js';

const id=n => `c2000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const invitation=()=>({ recipient: 'Person@example.com',roles: ['tenant_admin'],locale: 'de' });
const item={ id: id(1),revision: 3,state: 'pending',...invitation() };
const error=code => Object.assign(new Error(code),{ code });
function fixture(overrides={}) {
  const calls=[];let identifiers=0;
  const client={ async list(value) { calls.push(['list',value]);return [item]; },
    async issueBatch(value) { calls.push(['issue',value]);return [item]; },
    async mutate(operation,value) { calls.push([operation,value]);return item; },...overrides };
  return { calls,controller: createInvitationAdministrationController({ client,idFactory: () => id(10+(identifiers++)) }) };
}

test('successful issue reloads current state and duplicate clicks cannot create another command',async () => {
  let release;const gate=new Promise(resolve => { release=resolve; });const batches=[];
  const f=fixture({ async issueBatch(value) { batches.push(value);await gate;return [item]; } });
  await f.controller.load();const first=f.controller.issue([invitation()]);
  assert.equal(f.controller.snapshot().status,'loading');await f.controller.issue([invitation()]);
  assert.equal(batches.length,1);release();await first;
  assert.equal(f.controller.snapshot().status,'ready');assert.equal(f.calls.filter(row=>row[0]==='list').length,2);
});

test('ambiguous issue keeps an immutable exact command for deliberate retry, including after a failed refresh',async () => {
  const batches=[];let failRead=false;
  const f=fixture({ async issueBatch(value) { batches.push(value);if (batches.length===1) throw error('HTTP_500');return [item]; },
    async list() { if (failRead) throw error('HTTP_503');return [item]; } });
  await f.controller.load();const draft=invitation();await f.controller.issue([draft]);draft.recipient='Changed@example.com';
  assert.equal(f.controller.snapshot().status,'retry_batch');await f.controller.issue([draft]);assert.equal(batches.length,1);
  failRead=true;await f.controller.load();assert.equal(f.controller.snapshot().status,'retry_batch');failRead=false;
  await f.controller.retryBatch();assert.equal(batches.length,2);assert.equal(batches[0],batches[1]);
  assert.equal(batches[1].invitations[0].recipient,'Person@example.com');assert.equal(f.controller.snapshot().status,'ready');
});

test('mutation binds the loaded object/revision and an uncertain result permits refresh without mutation replay',async () => {
  const mutations=[];const f=fixture({ async mutate(operation,value) { mutations.push({ operation,value });throw error('HTTP_500'); } });
  await f.controller.load();await f.controller.mutate('revoke',id(99));assert.equal(mutations.length,0);
  await f.controller.mutate('revoke',id(1));assert.equal(f.controller.snapshot().status,'refresh_required');
  assert.deepEqual(mutations,[{ operation: 'revoke',value: { invitationId: id(1),expectedRevision: 3 } }]);
  await f.controller.mutate('revoke',id(1));assert.equal(mutations.length,1);
  await f.controller.load();assert.equal(mutations.length,1);assert.equal(f.controller.snapshot().status,'ready');
});

test('known validation/conflict/authority/abuse errors permit correction without retaining an uncertain command',async () => {
  for (const [code,kind] of [['HTTP_400','input'],['CUSTOMER_INVITATION_INPUT_INVALID','input'],['HTTP_409','conflict'],
    ['HTTP_403','authority'],['HTTP_429','limited']]) {
    let attempts=0;const f=fixture({ async issueBatch() { attempts++;throw error(code); } });
    await f.controller.load();await f.controller.issue([invitation()]);assert.equal(f.controller.snapshot().error,kind);
    await f.controller.retryBatch();assert.equal(attempts,1);
  }
});

test('disposal fences late reads and prevents new commands or hidden recovery retries',async () => {
  let release;const gate=new Promise(resolve => { release=resolve; });let reads=0;
  const f=fixture({ async list() { reads++;return gate; } });let changes=0;
  f.controller.subscribe(()=>{ changes++; });const pending=f.controller.load();f.controller.clear();release([item]);await pending;
  assert.equal(f.controller.snapshot().status,'idle');assert.deepEqual(f.controller.snapshot().items,[]);
  await f.controller.issue([invitation()]);await f.controller.load();assert.equal(reads,1);assert.equal(changes,1);
});
