import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformSyntheticWorkspaceController } from '../src/platform-admin/production/synthetic-workspace/controller.js';
const ID='ba000000-0000-4000-8000-000000000001';
function fixture({ pending=true,available=true,replaceFailure=null,refreshFailure=false }={}) {
  const calls=[];let done;
  const state={ directory: { generation: { generationId: ID,revision: 3,available,tenants: [] },
    canReplace: true,retainedGenerations: 2,replaceAfter: null } };
  const api={ async currentGeneration() { calls.push('read');return state.directory; },
    async pendingIntent() { calls.push('intent');return pending; },async refresh() {
      calls.push('session');if (refreshFailure) throw Object.assign(new Error('UNCONFIRMED'),{ code: 'HTTP_401' });
    },async replace(value) { calls.push(['replace',value]);if (replaceFailure) throw replaceFailure; },
    async approve(value,{ onNavigation }) { calls.push(['approve',value]);onNavigation();await new Promise(resolve=>{ done=resolve; });
      calls.push('session'); },cancelNavigation() { calls.push('cancel-navigation');done?.(); },
    stop() { calls.push('stop');done?.(); } };
  const controller=createPlatformSyntheticWorkspaceController({ api,reauthenticate: ()=>calls.push('reauthenticate') });
  return { controller,calls,state };
}
test('own workspace read does not mutate and replacement requires two explicit actions with the exact read revision',async()=>{
  const f=fixture();await f.controller.replace();assert.deepEqual(f.calls,[]);await f.controller.load();
  assert.deepEqual(f.calls,['read','intent']);await f.controller.load();assert.equal(f.calls.length,2);
  f.controller.prepareReplacement();assert.equal(f.controller.snapshot().phase,'replacement_confirmation');
  f.controller.cancelReplacement();assert.equal(f.controller.snapshot().phase,'ready');assert.equal(f.calls.length,2);
  f.controller.prepareReplacement();await f.controller.replace();
  assert.deepEqual(f.calls[2],['replace',{ expectedGenerationId: ID,expectedRevision: 3 }]);
  assert.deepEqual(f.calls.slice(-2),['read','intent']);
});
test('handoff needs a real pending intent and available own generation, with explicit bounded Customer selection',async()=>{
  for (const options of [{ pending: false },{ available: false }]) {
    const f=fixture(options);await f.controller.load();await f.controller.approve({ slot: 'northwind',role: 'employee' });
    assert.deepEqual(f.calls,['read','intent']);
  }
  const f=fixture();await f.controller.load();await f.controller.approve({ slot: 'foreign',role: 'tenant_admin' });
  await f.controller.approve({ slot: 'northwind',role: 'platform_admin' });assert.equal(f.calls.length,2);
  const approval=f.controller.approve({ slot: 'fabrikam',role: 'tenant_admin' });
  await Promise.resolve();assert.equal(f.controller.snapshot().phase,'continuing');
  assert.deepEqual(f.calls[2],['approve',{ generationId: ID,slot: 'fabrikam',role: 'tenant_admin' }]);
  await f.controller.approve({ slot: 'northwind',role: 'employee' });assert.equal(f.calls.length,3);
  await f.controller.check();await approval;assert.equal(f.controller.snapshot().phase,'ready');
  assert.deepEqual(f.calls.slice(-4),['cancel-navigation','session','read','intent']);
});
test('uncertain mutation cannot retry or approve until an independent fresh-session and directory check',async()=>{
  const f=fixture({ replaceFailure: new Error('SYNTHETIC_LOST_RESPONSE') });await f.controller.load();
  f.controller.prepareReplacement();await f.controller.replace();assert.equal(f.controller.snapshot().phase,'check_required');
  await f.controller.replace();await f.controller.approve({ slot: 'northwind',role: 'employee' });
  assert.equal(f.calls.filter(x=>Array.isArray(x)).length,1);await f.controller.check();
  assert.deepEqual(f.calls.slice(-3),['session','read','intent']);assert.equal(f.controller.snapshot().phase,'ready');
});
test('expired ordinary MFA requires explicit reauthentication and stopped work cannot navigate or recreate mutations',async()=>{
  const f=fixture({ refreshFailure: true });await f.controller.load();await f.controller.check();
  assert.equal(f.controller.snapshot().phase,'reauthentication_required');await f.controller.replace();
  f.controller.prepareReplacement();assert.equal(f.calls.filter(x=>Array.isArray(x)).length,0);
  f.controller.reauthenticate();assert.equal(f.calls.at(-1),'reauthenticate');f.controller.stop();
  await f.controller.check();f.controller.reauthenticate();assert.equal(f.calls.at(-1),'stop');
});
