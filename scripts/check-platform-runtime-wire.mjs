import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { isAbsolute,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { normalizePlatformRuntimeDeployments } from '../src/platform-admin/resource-contracts.js';
import { createPlatformAdminApi } from '../src/platform-admin/platform-api.js';
import { platformRuntimeContractRecords,RUNTIME_CONTRACT_NOW } from '../tests/support/platform-runtime-contract-fixture.js';

const apiRoot=process.argv[2],writeFixture=process.argv[3]==='--write-fixture';
if (![3,4].includes(process.argv.length) || process.argv.length===4 && !writeFixture || !isAbsolute(apiRoot ?? '')) {
  throw new Error('RUNTIME_WIRE_API_ROOT_REQUIRED');
}
const { createPlatformRuntimeStatusService }=await import(pathToFileURL(join(apiRoot,'src/platform/application/runtime-status-service.js')));
const { platformRuntimeRoutes }=await import(pathToFileURL(join(apiRoot,'src/platform/http/runtime-routes.js')));
const records=platformRuntimeContractRecords();
records[0].serviceInstance={ key:'protected-int-customer',surface:'customer' };
const service=createPlatformRuntimeStatusService({ repository: {
  async listApprovedDeployments() { return records; },
  async findServingDeploymentByTenantId() { return null; },
},authorizationPolicy: { async authorize() { return true; } },tenantTargetPolicy: { async authorize() { return true; } },
  auditService: { createEvent() { return {}; } },clock: ()=>RUNTIME_CONTRACT_NOW });
const response=JSON.parse(JSON.stringify(await service.listApprovedDeployments({ operatorContext: {} })));
assert.deepEqual(normalizePlatformRuntimeDeployments(response),response);
const fixture=new URL('../tests/support/platform-runtime-output-fixture.json',import.meta.url);
if (writeFixture) writeFileSync(fixture,JSON.stringify(response,null,2)+'\n');
else assert.deepEqual(response,JSON.parse(readFileSync(fixture,'utf8')));
const handler=platformRuntimeRoutes.createHandler({ platformRuntimeStatusService:service,
  platformPrincipalGuard:{ async require() { return {}; } },maxResponseBytes:100000 });
const adapter=createPlatformAdminApi({ apiClient:{ async request(path) {
  assert.equal(path,'runtime/deployments?schemaVersion=2');
  const parsedUrl=new URL(`/api/v1/platform/${path}`,'https://ops.example.test');
  const request=Readable.from([]);request.method='GET';request.headers={};let payload;
  assert.equal(await handler({ path:parsedUrl.pathname,parsedUrl,request,
    response:{ setHeader() {},end(value) { payload=JSON.parse(value); } },
    requestId:'33333333-3333-4333-8333-333333333333' }),200);
  return payload;
} } });
const current=await adapter.loadRuntimeDeployments();
assert.equal(current.schemaVersion,2);
assert.deepEqual(current.deployments[0].serviceInstance,records[0].serviceInstance);
assert.equal(current.deployments[1].serviceInstance,null);
assert.equal(Object.hasOwn(response.deployments[0],'serviceInstance'),false);
console.log('PLATFORM_RUNTIME_API_WIRE_VERIFIED');
