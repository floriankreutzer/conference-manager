import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProtectedFrontendArtifacts,writeProtectedFrontendArtifacts } from '../scripts/protected-frontend-artifacts.mjs';
import { buildProtectedAcceptanceArtifacts,createQualifiedProtectedEdge,compactQualifiedStaticRequests }
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

test('deployable manifests bind exact profile and every captured byte and refuse a pre-existing artifact directory',async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),selected={ root,apiCommit: 'a'.repeat(40),frontendCommit: 'b'.repeat(40),
    customerOrigin: 'https://app-int.example.test',platformOrigin: 'https://ops-int.example.com',environment: 'int',syntheticEnabled: true };
  const built=await buildProtectedFrontendArtifacts(selected),directory=await mkdtemp(path.join(os.tmpdir(),'cm-artifact-build-'));
  t.after(()=>rm(directory,{ recursive: true,force: true }));const destination=path.join(directory,'artifacts');
  await writeProtectedFrontendArtifacts(built,destination);
  for (const surface of ['customer','platform']) {
    const raw=await readFile(path.join(destination,surface,'manifest.json')),manifest=JSON.parse(raw);
    assert.equal(createHash('sha256').update(raw).digest('hex'),built.manifestDigests[surface]);
    assert.equal(manifest.surface,surface);assert.equal(manifest.apiCommit,selected.apiCommit);
    assert.equal(manifest.frontendCommit,selected.frontendCommit);assert.equal(manifest.syntheticEnabled,true);
    assert.equal(manifest.ownerAccessEnabled,false);assert.equal(manifest.microsoftEnabled,false);assert.equal(manifest.invitationsEnabled,false);
    for (const entry of manifest.files) {
      const bytes=await readFile(path.join(destination,surface,entry.path));
      assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
      assert.doesNotMatch(entry.path,/^(?:tests|scripts|deployment)\//);assert.notEqual(entry.path,'assets/brand/README.md');
    }
  }
  await assert.rejects(writeProtectedFrontendArtifacts(built,destination),{ code: 'EEXIST' });
  const next=await buildProtectedFrontendArtifacts({ ...selected,apiCommit: 'c'.repeat(40) });
  assert.deepEqual(next.digests,built.digests);assert.notDeepEqual(next.manifestDigests,built.manifestDigests);
  for (const change of [{ apiCommit: 'main' },{ frontendCommit: 'latest' },{ environment: 'demo' },
    { environment: 'prod',syntheticEnabled: true },{ microsoftEnabled: 'true' },{ ownerAccessEnabled: true },{ ownerAccessEnabled: 'true' }]) {
    await assert.rejects(buildProtectedFrontendArtifacts({ ...selected,...change }),/PROTECTED_/);
  }
});


test('qualified phase compaction preserves every API, document, failure and unfinished event in order',()=>{
  const request=(path,method='GET',status=200,surface='customer')=>({ path,method,status,surface,fetchSite: 'same-origin',cookiePresent: true });
  const retained=[request('/api/v1/session'),request('/api/v1/auth/owner/complete','POST',303),request('/'),
    request('/platform-admin/'),request('/src/module.js','POST'),request('/src/module.js','GET',404),
    request('/assets/logo.svg','GET',null),request('/src/module.js?unsealed=true'),request('/src/module.js','GET',200,'foreign')];
  const input=[request('/src/main.js'),...retained.slice(0,4),request('/assets/logo.svg','HEAD',200,'platform'),
    ...retained.slice(4),request('/src/main.js')];
  const before=structuredClone(input),result=compactQualifiedStaticRequests(input);
  assert.deepEqual(result,{ requests: retained,completed: { customer: 2,platform: 1 } });
  assert.deepEqual(input,before);assert.equal(result.requests[0],retained[0]);
  assert.deepEqual(compactQualifiedStaticRequests(result.requests),{ requests: retained,completed: { customer: 0,platform: 0 } });
});
