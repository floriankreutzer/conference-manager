import assert from 'node:assert/strict';
import test from 'node:test';
import { PLATFORM_INVITATION_MESSAGES } from '../src/core/i18n-platform-invitation-messages.js';
globalThis.document={ documentElement: {} };
const { tFor }=await import('../src/core/i18n.js');
const { createPlatformAdminApplication }=await import('../src/platform-admin/application.js');

test('Platform invitation copy is complete in DE/EN and resolves through the canonical translator',()=>{
  assert.deepEqual(Object.keys(PLATFORM_INVITATION_MESSAGES.de).sort(),Object.keys(PLATFORM_INVITATION_MESSAGES.en).sort());
  for (const [key,value] of Object.entries(PLATFORM_INVITATION_MESSAGES.de)) {
    const english=PLATFORM_INVITATION_MESSAGES.en[key];assert.ok(value.trim());assert.ok(english.trim());
    assert.deepEqual([...value.matchAll(/\{(\w+)\}/g)].map(match=>match[1]),[...english.matchAll(/\{(\w+)\}/g)].map(match=>match[1]));
    assert.notEqual(tFor('en',key,{ recipient: 'Synthetic',number: 1,time: 'Synthetic' }),key);
  }
});
test('closed Demo rejects injection of the real customer invitation presentation before DOM or network allocation',()=>{
  const port={ beginRender(){},renderCreateControl(){},renderTenantPanel(){},clear(){} };
  assert.throws(()=>createPlatformAdminApplication({ runtime: 'demo',customerInvitationPresentation: port }),
    /PLATFORM_ADMIN_CUSTOMER_INVITATION_PRESENTATION_INVALID/);
  assert.throws(()=>createPlatformAdminApplication({ runtime: 'production',customerInvitationPresentation: {} }),
    /PLATFORM_ADMIN_CUSTOMER_INVITATION_PRESENTATION_INVALID/);
});
