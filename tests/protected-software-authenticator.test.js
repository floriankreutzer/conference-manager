import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import { installQualifiedAuthenticator } from './e2e-protected/support/browser-authenticator.mjs';

async function fixture() {
  const origin='https://ops-int.example.com',id=Buffer.alloc(32,2).toString('base64url');let bridge,signed=0;
  const keys=[{ credential: { id },response() {
    signed++;return { id,rawId: id,response: {
      clientDataJSON: Buffer.alloc(64).toString('base64url'),authenticatorData: Buffer.alloc(37).toString('base64url'),
      signature: Buffer.alloc(70).toString('base64url'),userHandle: Buffer.alloc(32).toString('base64url') } };
  } },{ credential: { id: Buffer.alloc(32,3).toString('base64url') } }];
  const globals={ navigator: {},location: { origin },isSecureContext: true,Uint8Array,ArrayBuffer,atob,btoa,DOMException };
  const context={ async exposeBinding(name,callback) {
    bridge=callback;globals[name]=input=>callback({ frame: { url: ()=>origin+'/platform-admin/' } },input);
  },async addInitScript(script,input) {
    vm.runInNewContext(`(${script.toString()})(${JSON.stringify(input)})`,globals);
  } };
  const mode=await installQualifiedAuthenticator({ context,browserName: 'webkit',keys });
  return { globals,bridge,mode,signed: ()=>signed,id,origin };
}

test('explicit WebKit software test bridge works when navigator credentials are absent without exposing a private key',async()=>{
  const f=await fixture();assert.equal(f.mode.mode,'webkit-origin-bound-software-test-bridge');
  const value=await f.globals.navigator.credentials.get({ publicKey: { rpId: 'ops-int.example.com',
    challenge: Uint8Array.from(Buffer.alloc(32,1)).buffer,userVerification: 'required',
    allowCredentials: [{ id: Uint8Array.from(Buffer.from(f.id,'base64url')) }] } });
  assert.equal(value.id,f.id);assert.equal(value.rawId.byteLength,32);assert.equal(value.response.signature.byteLength,70);
  assert.equal(f.signed(),1);assert.equal(Object.keys(f.globals).some(key=>/privatekey/i.test(key)),false);
});

test('WebKit bridge refuses a foreign actual frame, foreign RP, malformed challenge and reduced UV before signing',async()=>{
  const f=await fixture(),input={ rpId: 'ops-int.example.com',challenge: Buffer.alloc(32,1).toString('base64url'),
    userVerification: 'required',allowed: [f.id] };
  assert.throws(()=>f.bridge({ frame: { url: ()=> 'https://app-int.example.test/' } },input),/ORIGIN_DENIED/);
  for (const change of [{ rpId: 'foreign.example' },{ challenge: 'bad' },{ userVerification: 'preferred' },{ allowed: [] }]) {
    assert.throws(()=>f.bridge({ frame: { url: ()=>f.origin+'/' } },{ ...input,...change }),/ORIGIN_DENIED/);
  }
  assert.equal(f.signed(),0);
});
