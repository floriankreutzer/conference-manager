import assert from 'node:assert/strict';
import test from 'node:test';
import { requirePlatformPasskeyConfiguration } from '../src/platform-admin/production/passkey-contracts.js';

const base={ mode: 'passkey_setup',environment: 'int',minimumPasskeys: 2,
  requestId: '11111111-1111-4111-8111-111111111111' };

test('one-key configuration is accepted only for INT; other environments retain the strict two-key contract',()=>{
  for (const environment of ['dev','int','prod']) {
    assert.equal(requirePlatformPasskeyConfiguration({ ...base,environment }).minimumPasskeys,2);
    const value={ ...base,environment,minimumPasskeys: 1 };
    if (environment==='int') assert.equal(requirePlatformPasskeyConfiguration(value).minimumPasskeys,1);
    else assert.throws(()=>requirePlatformPasskeyConfiguration(value),/CONFIGURATION_RESPONSE_INVALID/);
  }
  for (const minimumPasskeys of [undefined,null,'1',true,0,3,1.5]) {
    assert.throws(()=>requirePlatformPasskeyConfiguration({ ...base,minimumPasskeys }),/CONFIGURATION_RESPONSE_INVALID/);
  }
});
