import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { isAbsolute,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizePlatformRuntimeDeployments } from '../src/platform-admin/resource-contracts.js';
import { platformRuntimeContractRecords,RUNTIME_CONTRACT_NOW } from '../tests/support/platform-runtime-contract-fixture.js';

const apiRoot=process.argv[2],writeFixture=process.argv[3]==='--write-fixture';
if (![3,4].includes(process.argv.length) || process.argv.length===4 && !writeFixture || !isAbsolute(apiRoot ?? '')) {
  throw new Error('RUNTIME_WIRE_API_ROOT_REQUIRED');
}
const { createPlatformRuntimeStatusService }=await import(pathToFileURL(join(apiRoot,'src/platform/application/runtime-status-service.js')));
const service=createPlatformRuntimeStatusService({ repository: {
  async listApprovedDeployments() { return platformRuntimeContractRecords(); },
  async findServingDeploymentByTenantId() { return null; },
},authorizationPolicy: { async authorize() { return true; } },tenantTargetPolicy: { async authorize() { return true; } },
  auditService: { createEvent() { return {}; } },clock: ()=>RUNTIME_CONTRACT_NOW });
const response=JSON.parse(JSON.stringify(await service.listApprovedDeployments({ operatorContext: {} })));
assert.deepEqual(normalizePlatformRuntimeDeployments(response),response);
const fixture=new URL('../tests/support/platform-runtime-output-fixture.json',import.meta.url);
if (writeFixture) writeFileSync(fixture,JSON.stringify(response,null,2)+'\n');
else assert.deepEqual(response,JSON.parse(readFileSync(fixture,'utf8')));
console.log('PLATFORM_RUNTIME_API_WIRE_VERIFIED');
