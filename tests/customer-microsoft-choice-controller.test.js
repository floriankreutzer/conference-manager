import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiSecurityError } from '../src/core/api-client.js';
import { createCustomerEmailController } from '../src/platform/customer-authentication/controller.js';
const ID='b9000000-0000-4000-8000-000000000001';
function fixture({ denied=false,selectionLost=false }={}) {
  const calls=[];let complete=0;
  const client={ async request() { calls.push('email-request');return { expiresAt: null }; },
    async pending() { calls.push('email-pending');throw new ApiSecurityError('HTTP_401'); },
    async verify() { throw new Error('UNEXPECTED_EMAIL_VERIFY'); },async choices() { throw new Error('UNEXPECTED_EMAIL_CHOICE'); },
    async select() { throw new Error('UNEXPECTED_EMAIL_SELECTION'); },clear() { calls.push('email-clear'); } };
  const microsoftClient={ async choices() {
    calls.push('microsoft-choices');if (denied) throw new ApiSecurityError('HTTP_401');return Object.freeze([{ membershipId: ID,displayName: 'Invited' }]);
  },async select(value) {
    calls.push(`microsoft-select:${value}`);if (selectionLost) throw new Error('SYNTHETIC_AMBIGUOUS_COMMIT');
  },clear() { calls.push('microsoft-clear'); } };
  const controller=createCustomerEmailController({ client,microsoftClient,initialMicrosoftChoice: true,
    async completeSession() { complete+=1; } });return { controller,calls,completed: ()=>complete };
}
test('Microsoft callback requires explicit captured organization choice and never requests an email challenge implicitly',async()=>{
  const f=fixture();await f.controller.load();assert.equal(f.controller.snapshot().phase,'choices');
  assert.equal(f.controller.snapshot().expiresAt,null);assert.deepEqual(f.calls,['microsoft-choices']);
  await f.controller.select('foreign');assert.equal(f.calls.length,1);assert.equal(f.completed(),0);
  await f.controller.select(ID);assert.equal(f.controller.snapshot().phase,'authenticated');assert.equal(f.completed(),1);
  assert.deepEqual(f.calls,['microsoft-choices',`microsoft-select:${ID}`]);
});
test('unknown or no-longer-eligible Microsoft identity offers invited email recovery without claiming an automatic account link',async()=>{
  const f=fixture({ denied: true });await f.controller.load();const state=f.controller.snapshot();
  assert.equal(state.phase,'choices');assert.equal(state.error,'microsoftUnlinked');assert.deepEqual(state.items,[]);
  assert.equal(f.calls.includes('email-request'),false);assert.equal(f.completed(),0);
  f.controller.restart();assert.equal(f.controller.snapshot().phase,'email');
  await f.controller.request('Invited@example.test','de');assert.equal(f.controller.snapshot().phase,'code');
  assert.equal(f.calls.filter(value=>value==='email-request').length,1);
});
test('lost Microsoft selection response only offers ordinary session verification and cannot blindly replay acceptance',async()=>{
  const f=fixture({ selectionLost: true });await f.controller.load();await f.controller.select(ID);
  assert.equal(f.controller.snapshot().phase,'refresh_required');assert.equal(f.completed(),0);
  await f.controller.select(ID);assert.equal(f.calls.filter(value=>value.startsWith('microsoft-select')).length,1);
  await f.controller.checkSession();assert.equal(f.completed(),1);assert.equal(f.controller.snapshot().phase,'authenticated');
  f.controller.dispose();await f.controller.select(ID);assert.equal(f.completed(),1);
});
