import assert from 'node:assert/strict';
import test from 'node:test';
import { createMicrosoftRoleMappingApi } from '../src/platform/microsoft-role-mapping-api.js';

const DIRECTORY='71000000-0000-4000-8000-000000000001',GROUP='71000000-0000-4000-8000-000000000002';
const REQUEST='71000000-0000-4000-8000-000000000003';
const command={ directoryId: DIRECTORY,mappings: [{ groupId: GROUP,roles: ['tenant_admin','conference_manager'] }],expectedRevision: 0 };
test('group mapping transport preserves exact scope-free command, revision, immutable result and abort bound',async()=>{
  const calls=[],client=createMicrosoftRoleMappingApi({ apiClient: { async request(path,options) {
    calls.push({ path,options });return { requestId: REQUEST,settings: options.method ? {
      revision: 1,directoryId: DIRECTORY,mappings: [{ groupId: GROUP,roles: ['conference_manager','tenant_admin'] }],
    } : { revision: 0,directoryId: null,mappings: [] } };
  } } });
  assert.deepEqual(await client.get(),{ revision: 0,directoryId: null,mappings: [] });
  const result=await client.replace(command);
  assert.equal(calls[1].path,'v1/tenant/microsoft-role-mappings');assert.equal(calls[1].options.method,'PUT');
  assert.deepEqual(calls[1].options.body,{ ...command,mappings: [{ groupId: GROUP,roles: ['conference_manager','tenant_admin'] }] });
  assert.ok(calls[1].options.signal instanceof AbortSignal);assert.equal(Object.isFrozen(result.mappings[0].roles),true);
});
test('unknown scope, empty/duplicate/Platform grants, sparse data and accessors fail before transport',async()=>{
  let calls=0;const client=createMicrosoftRoleMappingApi({ apiClient: { async request() { calls++; } } });
  let invoked=false;const accessor=Object.defineProperty({},'directoryId',{ get() { invoked=true;return DIRECTORY; } });
  for (const value of [null,accessor,{ ...command,tenantId: DIRECTORY },{ ...command,expectedRevision: -1 },
    { ...command,mappings: Array(1) },{ ...command,mappings: Array(101).fill(command.mappings[0]) },
    { ...command,mappings: [command.mappings[0],command.mappings[0]] },
    ...[[],['employee'],['platform_security_admin'],['tenant_admin','tenant_admin']].map(roles=>({
      ...command,mappings: [{ groupId: GROUP,roles }],
    }))]) await assert.rejects(client.replace(value),{ code: 'MICROSOFT_ROLE_MAPPING_INPUT_INVALID' });
  assert.equal(calls,0);assert.equal(invoked,false);
});
test('malformed or overexposed configuration responses fail closed; server conflicts are never retried',async()=>{
  for (const settings of [{ revision: 0,directoryId: DIRECTORY,mappings: [] },
    { revision: 1,directoryId: DIRECTORY,mappings: [{ groupId: GROUP,roles: ['employee'] }] },
    { revision: 1,directoryId: DIRECTORY,mappings: [],approvedBy: GROUP }]) {
    const client=createMicrosoftRoleMappingApi({ apiClient: { async request() { return { requestId: REQUEST,settings }; } } });
    await assert.rejects(client.get(),{ code: 'MICROSOFT_ROLE_MAPPING_RESPONSE_INVALID' });
  }
  let calls=0;const error=Object.assign(new Error('conflict'),{ code: 'HTTP_409' });
  const client=createMicrosoftRoleMappingApi({ apiClient: { async request() { calls++;throw error; } } });
  await assert.rejects(client.replace(command),candidate=>candidate===error);assert.equal(calls,1);
});
