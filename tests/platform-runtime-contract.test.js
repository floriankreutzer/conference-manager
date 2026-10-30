import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { groupRuntimeObservations } from '../src/platform-admin/runtime-groups.js';
import { normalizePlatformRuntimeDeployments } from '../src/platform-admin/resource-contracts.js';
const fixture=()=>JSON.parse(readFileSync(new URL('./support/platform-runtime-output-fixture.json',import.meta.url),'utf8'));

test('actual API runtime output accepts scoped repeated references, bounded component IDs and support evidence paths',()=>{
  const value=fixture();assert.deepEqual(normalizePlatformRuntimeDeployments(value),value);
  assert.equal(value.deployments[0].deployment.reference.length,128);
  assert.equal(value.deployments[0].evidence.release.length,255);
});
test('runtime accepts the canonical50 records and null references in distinct environments, but rejects true duplicates',()=>{
  const first=fixture().deployments[0];
  const deployments=Array.from({ length: 50 },(_,index)=>({ ...first,deployment: { ...first.deployment,reference: `int:${index}` } }));
  assert.equal(normalizePlatformRuntimeDeployments({ schemaVersion: 1,deployments }).deployments.length,50);
  assert.throws(()=>normalizePlatformRuntimeDeployments({ schemaVersion: 1,deployments: [...deployments,deployments[0]] }));
  const nullable={ schemaVersion: 1,deployments: fixture().deployments.filter(item=>item.deployment.reference===null) };
  assert.equal(normalizePlatformRuntimeDeployments(nullable).deployments.length,2);
  nullable.deployments[1].environment=nullable.deployments[0].environment;
  assert.throws(()=>normalizePlatformRuntimeDeployments(nullable));
});
test('runtime refuses URL-shaped, unsafe, oversized and out-of-contract metadata',()=>{
  for (const change of [
    value=>{ value.deployment.reference='https://example.invalid/release'; },
    value=>{ value.deployment.reference='a'.repeat(129); },
    value=>{ value.evidence.runbook='https://example.invalid/runbook'; },
    value=>{ value.evidence.runbook='docs:<script>'; },
    value=>{ value.evidence.release='a'.repeat(256); },
    value=>{ value.components.api.version='a'.repeat(65); },
    value=>{ value.databaseSchema.expectedVersion=0; },
    value=>{ value.databaseSchema.currentVersion=100001; },
  ]) { const payload=fixture();change(payload.deployments[0]);assert.throws(()=>normalizePlatformRuntimeDeployments(payload)); }
});

function v2() {
  return { schemaVersion: 2,deployments: fixture().deployments.map(entry=>({ ...entry,schemaVersion: 2,
    serviceInstance: { key: 'protected-int-customer',surface: 'customer' } })) };
}
test('runtime v2 preserves proven instance identity and refuses mixed versions or conflicting attribution',()=>{
  assert.deepEqual(normalizePlatformRuntimeDeployments(v2()),v2());
  const legacy=v2();legacy.deployments[0].serviceInstance=null;
  assert.equal(normalizePlatformRuntimeDeployments(legacy).deployments[0].serviceInstance,null);
  for (const change of [
    value=>{ value.deployments[0].schemaVersion=1; },
    value=>{ delete value.deployments[0].serviceInstance; },
    value=>{ value.deployments[0].serviceInstance.key='https://evil.invalid'; },
    value=>{ value.deployments[0].serviceInstance.surface='owner'; },
    value=>{ value.deployments[0].serviceInstance.extra=true; },
    value=>{ const copy=structuredClone(value.deployments[0]);copy.deployment.reference='other';
      copy.serviceInstance.surface='platform';value.deployments.push(copy); },
  ]) { const value=v2();change(value);assert.throws(()=>normalizePlatformRuntimeDeployments(value)); }
});
test('runtime groups latest observations per service and retains separate unattributed history without mutating input',()=>{
  const template=v2().deployments[0];
  const entry=(reference,key,observedAt)=>({ ...template,serviceInstance:key ? { key,surface:'customer' } : null,
    deployment:{ ...template.deployment,reference },freshness:{ ...template.freshness,observedAt } });
  const rows=[entry('old','a','2026-10-29T10:00:00.000Z'),entry('new','a','2026-10-30T10:00:00.000Z'),
    entry('second','b','2026-10-28T10:00:00.000Z'),entry('unassigned',null,null)];
  const before=structuredClone(rows),result=groupRuntimeObservations(rows);
  assert.equal(result.instances.length,2);assert.equal(result.instances[0].latest.deployment.reference,'new');
  assert.deepEqual(result.instances[0].history.map(row=>row.deployment.reference),['old']);
  assert.deepEqual(result.unassigned.map(row=>row.deployment.reference),['unassigned']);assert.deepEqual(rows,before);
});
