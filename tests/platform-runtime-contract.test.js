import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
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
