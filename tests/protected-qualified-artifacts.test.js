import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildProtectedAcceptanceArtifacts,createQualifiedProtectedEdge }
  from './e2e-protected/support/qualified-edge.mjs';

test('qualified acceptance serves exact current production graphs and separate protected HTML at distinct fixed sites',async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),first=await buildProtectedAcceptanceArtifacts(root);
  const second=await buildProtectedAcceptanceArtifacts(root);assert.deepEqual(first.digests,second.digests);
  assert.match(first.digests.customer,/^[a-f0-9]{64}$/);assert.match(first.digests.platform,/^[a-f0-9]{64}$/);
  assert.notEqual(first.digests.customer,first.digests.platform);
  assert.equal([...first.sets.customer].some(name=>name.startsWith('src/platform-admin/')),false);
  assert.equal(first.sets.platform.has('src/employee/production-application.js'),false);
  for (const set of Object.values(first.sets)) {
    assert.equal([...set].some(name=>/^(?:tests|scripts|deployment)\//.test(name)),false);
  }
  const customer=first.content.get('customer:index.html').toString(),platform=first.content.get('platform:platform-admin/index.html').toString();
  assert.match(customer,/src\/platform\/production-bootstrap.js/);assert.doesNotMatch(customer,/src\/platform\/demo-bootstrap.js/);
  assert.match(customer,/form-action 'self' https:\/\/ops-int.example.com/);
  assert.match(platform,/form-action 'self' https:\/\/app-int.example.test/);
  assert.match(customer,/conference-protected-synthetic" content="enabled"/);
});

test('qualified edge refuses malformed ports and paths before binding or reading certificates',async()=>{
  for (const options of [{}, { root: '/tmp',certificateDirectory: '/tmp',ports: { customer: 443,platform: 1234 } },
    { root: '/tmp',certificateDirectory: '/tmp',ports: { customer: 1234,platform: 1234 } }]) {
    await assert.rejects(createQualifiedProtectedEdge(options),/PROTECTED_QUALIFIED_EDGE_INVALID/);
  }
});
