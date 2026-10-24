import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePlatformAuditPage } from '../src/platform-admin/resource-contracts.js';
import { downloadPlatformAuditExport } from '../src/platform-admin/audit-export.js';
import { assertPlatformAuditContinuation } from '../src/platform-admin/audit-page-continuation.js';

const id='11111111-1111-4111-8111-111111111111';
function payload() {
  return { schemaVersion: 2,audit: { segmentId: id,verification: 'verified',
    legacy: { eventCount: 124,verification: 'unavailable' } },items: [{ sequence: 125,operatorId: null,roles: [],permissions: [],
    assuranceLevel: 'offline_owner',targetTenantId: null,action: 'platform.operator.changed',targetType: 'platform_audit_segment',
    targetId: id,previousState: null,newState: { integrityVersion: 2 },occurredAt: '2026-10-21T12:00:00.000Z',correlationId: id,
    outcome: 'success',metadata: { operation: 'audit_segment_genesis',legacyVerification: 'unavailable' },retentionClass: 'recovery' }] };
}

test('audit continuation retains its exact segment, legacy boundary and schema context',()=>{
  assert.doesNotThrow(()=>assertPlatformAuditContinuation(payload(),payload()));
  assert.doesNotThrow(()=>assertPlatformAuditContinuation({ schemaVersion: 1 },{ schemaVersion: 1 }));
  for (const mutate of [value=>{ value.audit.segmentId='22222222-2222-4222-8222-222222222222'; },
    value=>{ value.audit.legacy.eventCount=123; },value=>{ value.audit.verification='unavailable'; },
    value=>{ value.audit.legacy.verification='verified'; },value=>{ value.schemaVersion=1; }]) {
    const changed=payload();mutate(changed);
    assert.throws(()=>assertPlatformAuditContinuation(payload(),changed),/CONTEXT_CHANGED/);
  }
  assert.throws(()=>assertPlatformAuditContinuation({ schemaVersion: 1 },payload()),/CONTEXT_CHANGED/);
});

test('existing audit contract consumes v2 without claiming the preserved legacy prefix is verified',()=>{
  const input=payload(),normalized=normalizePlatformAuditPage(input);
  assert.deepEqual(normalized,input);assert.equal(normalized.audit.legacy.verification,'unavailable');
  assert.ok(Object.isFrozen(normalized.audit.legacy));assert.ok(Object.isFrozen(normalized.items));
  assert.deepEqual(normalizePlatformAuditPage({ schemaVersion: 1,items: [] }),{ schemaVersion: 1,items: [] });
  assert.throws(()=>normalizePlatformAuditPage({ schemaVersion: 1,items: input.items }));
});

test('unknown verification, prefix events, forged offline authority, duplicate order and accessors fail closed',()=>{
  for (const mutate of [value=>{ value.audit.legacy.verification='verified'; },value=>{ value.audit.verification='unavailable'; },
    value=>{ value.audit.extra=true; },value=>{ value.audit.legacy.eventCount=3201; },value=>{ value.items[0].sequence=124; },
    value=>{ value.items[0].roles=['platform_security_admin']; },value=>{ value.items[0].metadata.secret='private'; },
    value=>{ value.items.push({ ...value.items[0] }); },value=>{ value.items[0].eventHash='a'.repeat(64); }]) {
    const value=payload();mutate(value);assert.throws(()=>normalizePlatformAuditPage(value));
  }
  let accessed=false;const value=payload();
  Object.defineProperty(value.audit,'verification',{ enumerable: true,get() { accessed=true;throw new Error('private'); } });
  assert.throws(()=>normalizePlatformAuditPage(value));assert.equal(accessed,false);
});

test('verified owner all-role receipt remains readable without accepting offline browser authority',()=>{
  const input=payload(),event=input.items[0];
  Object.assign(event,{ targetType: 'platform_owner_roles',previousState: { roleCount: 2,securityVersion: 6 },
    newState: { roleCount: 4,securityVersion: 7,scopeMode: 'all' },metadata: { operation: 'owner_all_platform_roles',
      environment: 'int',deploymentEpoch: id,approvalReference: 'owner-role-test',sessionsRevoked: 1,transactionsRevoked: 0 } });
  assert.deepEqual(normalizePlatformAuditPage(input),input);
  for (const patch of [{ operatorId: id },{ targetTenantId: id },{ roles: ['platform_security_admin'] },
    { permissions: ['platform:operator:manage'] },{ outcome: 'denied' },{ targetType: 'arbitrary_owner_grant' }]) {
    assert.throws(()=>normalizePlatformAuditPage({ ...input,items: [{ ...event,...patch }] }));
  }
  assert.throws(()=>normalizePlatformAuditPage({ schemaVersion: 1,items: [event] }));
});

test('bounded download retains v2 verification context, uses the existing export port and revokes its object URL',async()=>{
  const documentBefore=globalThis.document,createBefore=URL.createObjectURL,revokeBefore=URL.revokeObjectURL;
  let clicked=false,removed=false,appended=false,blob,revoked=false;
  const link={ click() { clicked=true; },remove() { removed=true; } };
  globalThis.document={ createElement() { return link; },body: { append() { appended=true; } } };
  URL.createObjectURL=value=>{ blob=value;return 'blob:local-audit'; };
  URL.revokeObjectURL=value=>{ assert.equal(value,'blob:local-audit');revoked=true; };
  try {
    await downloadPlatformAuditExport({ async loadAudit(input) {
      assert.deepEqual(input,{ limit: 100,exportView: true });return payload();
    } });
    assert.equal(clicked && removed && appended,true);assert.equal(link.download,'platform-audit-current-segment.json');
    assert.deepEqual(JSON.parse(await blob.text()),payload());
    await new Promise(resolve=>setTimeout(resolve,5));assert.equal(revoked,true);
    clicked=false;
    await assert.rejects(downloadPlatformAuditExport({ async loadAudit() { return { schemaVersion: 1,items: [] }; } }));
    assert.equal(clicked,false);
  } finally {
    globalThis.document=documentBefore;URL.createObjectURL=createBefore;URL.revokeObjectURL=revokeBefore;
  }
});
