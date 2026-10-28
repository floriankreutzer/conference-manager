import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformOperationPresentation } from '../src/platform-admin/production/operation-presentation.js';
import { createPlatformMicrosoftOperationsClient } from '../src/platform-admin/production/microsoft-operations-client.js';
import { MICROSOFT_OPERATION_ORIGIN as origin,MICROSOFT_OPERATION_ID as id,
  microsoftOperationChallenge } from './support/platform-microsoft-operation-fixture.js';

const describe=(port,path,method='GET',body)=>port.describe(new URL('/api/v1/platform/'+path,origin),{
  method,...(body===undefined ? {} : { body: JSON.stringify(body) }),
});
test('operation presentation names the exact request category and retains only minimal display context',()=>{
  const port=createPlatformOperationPresentation();port.rememberTenants([{ id,displayName: 'Current customer' }]);
  for (const [suffix,method,body,action] of [
    ['lifecycle/transitions','POST',{ targetStatus: 'suspended',reason: 'Private reason' },'customerSuspend'],
    ['invitations','GET',undefined,'invitationRead'],['invitations','POST',{},'invitationCreate'],
    [`invitations/${id}`,'DELETE',{},'invitationRevoke'],[`invitations/${id}/reissue`,'POST',{},'invitationReissue'],
    ['entitlement-previews','POST',{},'entitlementPreview'],['package-previews/standard','GET',undefined,'entitlementPreview'],
    ['entitlement-applications','POST',{},'entitlementApply'],['package-applications/standard','POST',{},'entitlementApply'],
    ['quotas/rooms','POST',{},'quotaUpdate'],[`diagnostics/correlations/${id}`,'GET',undefined,'correlationRead'],
    ['recovery/last-tenant-admin/targets','GET',undefined,'recoveryTargets'],['recovery/last-tenant-admin/previews','POST',{},'recoveryPreview'],
    ['recovery/last-tenant-admin/executions','POST',{},'recoveryExecute'],
  ]) {
    const result=describe(port,`tenants/${id}/${suffix}`,method,body);
    assert.equal(result.action,action);assert.equal(result.tenantId,id);assert.equal(result.displayName,'Current customer');
    assert.ok(Object.isFrozen(result));assert.equal(JSON.stringify(result).includes('Private reason'),false);
    assert.deepEqual(Object.keys(result).sort(),['action','displayName','recoveryId','role','slot','target','tenantId']);
  }
  assert.equal(describe(port,'audit/exports?limit=100').action,'auditExport');
  assert.equal(describe(port,`tenants/${id}/lifecycle/transitions`,'POST',{ targetStatus: '__proto__' }).action,'operation');
  assert.equal(describe(port,`tenants/${id}/entitlement-applications`,'GET').action,'operation');
  const create=describe(port,'tenants','POST',{ displayName: '<script>Plain customer text</script>',recipient: 'Private@example.test' });
  assert.equal(create.displayName,'<script>Plain customer text</script>');assert.equal('recipient' in create,false);
});
test('presentation uses bounded current names without assigning identity, roles or backend authority',()=>{
  const port=createPlatformOperationPresentation();
  const ids=Array.from({ length: 201 },(_,n)=>`ba000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
  port.rememberTenants(ids.map((tenantId,n)=>({ tenantId,displayName: `Customer ${n}` })));
  assert.equal(describe(port,`tenants/${ids[0]}/invitations`).displayName,null);
  const snapshot=describe(port,`tenants/${ids[1]}/invitations`);
  port.rememberTenants([{ id: ids[1],displayName: 'Changed name' }]);
  assert.equal(snapshot.displayName,'Customer 1');
  for (const displayName of ['', ' leading', 'bad\nname', 'x'.repeat(201)]) {
    port.rememberTenants([{ id,displayName }]);assert.equal(describe(port,`tenants/${id}/invitations`).displayName,null);
  }
  port.clear();assert.equal(describe(port,`tenants/${ids[1]}/invitations`).displayName,null);
  assert.equal(describe(port,'unknown','POST',{}).action,'operation');
});
test('workspace presentation distinguishes replacement, real customer role and exact synthetic slot',()=>{
  const port=createPlatformOperationPresentation();port.rememberTenants([{ tenantId: id,displayName: 'Chosen customer' }]);
  const real=describe(port,'auth/owner/options','POST',{ tenantId: id,role: 'tenant_admin' });
  assert.equal(real.action,'customerAccess');assert.equal(real.displayName,'Chosen customer');assert.equal(real.role,'tenant_admin');
  const demo=describe(port,'auth/delegation/options','POST',{ slot: 'contoso',role: 'conference_manager' });
  assert.equal(demo.slot,'contoso');assert.equal(demo.target,'demo');assert.equal(demo.role,'conference_manager');
  assert.equal(describe(port,'synthetic/generation/options','POST',{}).action,'demoReplace');
  assert.equal(describe(port,'auth/owner/options','POST',{ tenantId: id,role: 'platform_security_admin' }).action,'operation');
});
test('queued Microsoft prompts keep their captured target despite later directory changes and retry the exact original request',async()=>{
  const port=createPlatformOperationPresentation(),contexts=[],calls=[];
  port.rememberTenants([{ id,displayName: 'Original customer' }]);
  const json=(value,status=200)=>new Response(JSON.stringify(value),{ status,headers: { 'content-type': 'application/json' } });
  const client=createPlatformMicrosoftOperationsClient({ origin,csrfTokenProvider: ()=>'C'.repeat(43),
    refreshSession: async()=>true,describeOperation: port.describe,
    confirmation: async(pending,{ context })=>{ contexts.push(context);assert.equal(pending.state,microsoftOperationChallenge().state); },
    fetchImpl: async(url,init)=>{ calls.push({ url: String(url),init });
      return init.headers['X-Platform-Microsoft-Proof'] ? json({ ok: true }) : json(microsoftOperationChallenge(),428); },
  });
  const path=`tenants/${id}/invitations`;
  const first=client.request(path),second=client.request(path);
  port.rememberTenants([{ id,displayName: 'Later customer name' }]);
  await Promise.all([first,second]);assert.equal(contexts.length,2);
  assert.equal(contexts.every(context=>context.displayName==='Original customer'),true);
  assert.equal(calls.length,4);
  for (const index of [0,2]) {
    assert.equal(calls[index].url,calls[index+1].url);assert.equal(calls[index].init.body,calls[index+1].init.body);
    assert.equal(calls[index].init.method,calls[index+1].init.method);
  }
});
