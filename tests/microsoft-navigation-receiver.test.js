import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { handleAuthenticationNavigationFixture } from './e2e/fixtures/authentication-navigation-server.mjs';

const state=Buffer.alloc(32,1).toString('base64url'),tenantId='22222222-2222-4222-8222-222222222222';
const callback='/api/v1/platform/auth/microsoft/operation/callback?state='+state+'&code=synthetic-provider-code';
const operation=`/api/v1/platform/tenants/${tenantId}/lifecycle/transitions`;
const body={ targetStatus: 'suspended',expectedRevision: 3,reason: 'Synthetic Microsoft operation approval',
  confirmation: { action: 'tenant.lifecycle.transition',tenantId } };
async function receive({ method='POST',url=operation,headers={},payload=body }={}) {
  const request=Readable.from([Buffer.from(typeof payload==='string' ? payload : JSON.stringify(payload))]);
  Object.assign(request,{ method,url,headers: { host: '127.0.0.1:4173',origin: 'https://127.0.0.1:4173',
    'content-type': 'application/json','x-platform-microsoft-proof': state,'x-csrf-token': 'C'.repeat(43),
    cookie: `cm_platform_session=synthetic-normal-session; cm_platform_ms_operation=${state}.${state}`,...headers } });
  const result={ status: null,headers: {},body: '' },response={
    writeHead(status,fields={}) { result.status=status;result.headers=Object.fromEntries(Object.entries(fields)
      .map(([key,value])=>[key.toLowerCase(),value])); },
    end(value='') { result.body=value; },
  };
  assert.equal(await handleAuthenticationNavigationFixture(request,response),true);return result;
}

test('native Microsoft callback receiver attests Lax custody only when neither Strict cookie was transmitted',async()=>{
  const cookie=`cm_platform_ms_operation_tx=${state}.${state}`;
  const accepted=await receive({ method: 'GET',url: callback,headers: { cookie } });
  assert.equal(accepted.status,303);assert.equal(accepted.headers['x-cm-fixture-microsoft-custody'],'lax-without-strict');
  for (const changed of ['',`cm_platform_ms_operation_tx=${state}.wrong`,cookie+'; cm_platform_session=unexpected',
    cookie+'; cm_platform_ms_operation=unexpected']) {
    const rejected=await receive({ method: 'GET',url: callback,headers: { cookie: changed } });
    assert.equal(rejected.status,400);assert.equal(rejected.headers['x-cm-fixture-microsoft-custody'],undefined);
  }
});

test('native final receiver requires both Strict cookies, exact source CSRF/proof and unchanged bounded command',async()=>{
  const accepted=await receive();assert.equal(accepted.status,200);
  assert.equal(accepted.headers['x-cm-fixture-microsoft-custody'],'strict-source-and-operation');
  for (const headers of [{ cookie: '' },{ cookie: 'cm_platform_session=synthetic-normal-session' },
    { cookie: `cm_platform_ms_operation=${state}.${state}` },{ 'x-csrf-token': 'wrong' },
    { 'x-platform-microsoft-proof': 'wrong' },{ origin: 'https://other.example.test' },{ 'content-type': 'text/plain' }]) {
    const rejected=await receive({ headers });assert.equal(rejected.status,400);
    assert.equal(rejected.headers['x-cm-fixture-microsoft-custody'],undefined);
  }
  for (const payload of [{ ...body,expectedRevision: 4 },{ ...body,reason: 'changed' },{ ...body,userId: tenantId },'invalid']) {
    assert.equal((await receive({ payload })).status,400);
  }
  assert.equal((await receive({ payload: 'x'.repeat(2049) })).status,413);
});
