import assert from 'node:assert/strict';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPlatformPasskeyBrowser } from '../src/platform-admin/production/passkey-browser.js';

// Trusted, immutable API checkout supplied by CI; never a browser/runtime import.
const apiRoot = process.argv[2];
if (process.argv.length !== 3 || !isAbsolute(apiRoot ?? '')) throw new Error('PASSKEY_WIRE_API_ROOT_REQUIRED');
const { createPlatformPasskeyVerifier } = await import(pathToFileURL(join(apiRoot, 'src/platform/identity/passkey-verifier.js')));
const origin = 'https://ops-int.example.com';
const verifier = createPlatformPasskeyVerifier({ publicOrigin: origin, environment: 'int' });
const challenge = Buffer.alloc(32, 1).toString('base64url');
const userHandle = Buffer.alloc(32, 2).toString('base64url');
let creates = 0, gets = 0;
const browser = createPlatformPasskeyBrowser({ origin, secureContext: true, credentials: {
  async create({ publicKey }) {
    creates++;
    assert.equal(publicKey.rp.id, 'ops-int.example.com');
    assert.equal(publicKey.authenticatorSelection.userVerification, 'required');
    assert.equal(publicKey.authenticatorSelection.residentKey, 'required');
    assert.equal(publicKey.attestation, 'none');
    assert.deepEqual(publicKey.pubKeyCredParams, [{ type: 'public-key', alg: -7 }]);
    throw new DOMException('', 'NotAllowedError');
  },
  async get({ publicKey }) {
    gets++;
    assert.equal(publicKey.rpId, 'ops-int.example.com');
    assert.equal(publicKey.userVerification, 'required');
    throw new DOMException('', 'NotAllowedError');
  },
} });
// JSON round-trip reproduces the HTTP wire rather than passing SDK-only values.
const registration = JSON.parse(JSON.stringify(await verifier.registrationOptions({
  challenge, userHandle, userName: 'Conference Manager operator', excludeCredentialIds: [],
})));
await assert.rejects(browser.register(registration), { code: 'PLATFORM_PASSKEY_BROWSER_CANCELLED' });
assert.equal(creates, 1);
const authentication = JSON.parse(JSON.stringify(await verifier.authenticationOptions({
  challenge, allowedCredentialIds: [userHandle],
})));
await assert.rejects(browser.authenticate(authentication), { code: 'PLATFORM_PASSKEY_BROWSER_CANCELLED' });
assert.equal(gets, 1);
console.log('PLATFORM_PASSKEY_API_WIRE_VERIFIED');
