import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformPasskeyBrowser } from '../src/platform-admin/production/passkey-browser.js';

const origin = 'https://ops-int.example.com';
const binary = (length, value = 1) => new Uint8Array(length).fill(value).buffer;
const encoded = (length, value = 1) => Buffer.from(binary(length, value)).toString('base64url');
const authentication = () => ({ challenge: encoded(32), rpId: 'ops-int.example.com', timeout: 120000,
  userVerification: 'required', allowCredentials: [{ id: encoded(32, 2), type: 'public-key' }] });
const registration = () => ({ challenge: encoded(32), rp: { id: 'ops-int.example.com', name: 'Conference Manager INT' },
  user: { id: encoded(32, 3), name: 'Operator', displayName: 'Operator' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  attestation: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'required', requireResidentKey: true },
  timeout: 120000, excludeCredentials: [], extensions: { credProps: true } });
function response(create = false) {
  return { id: encoded(32, 2), rawId: binary(32, 2), type: 'public-key', authenticatorAttachment: 'platform',
    getClientExtensionResults: () => create ? { credProps: { rk: true } } : {},
    response: { clientDataJSON: binary(64), ...(create ? { attestationObject: binary(128), getTransports: () => ['internal'] }
      : { authenticatorData: binary(37), signature: binary(72), userHandle: binary(32, 3) }) } };
}
function fixture() {
  const calls = []; let result = response();
  const credentials = { async get(value) { calls.push(value); return result; }, async create(value) { calls.push(value); return result; } };
  const browser = createPlatformPasskeyBrowser({ credentials, origin, secureContext: true });
  return { browser, calls, setResult: value => { result = value; } };
}

test('assertion options become bounded native buffers with required verification and only public response serialization', async () => {
  const f = fixture(); const result = await f.browser.authenticate(authentication());
  const options = f.calls[0].publicKey;
  assert.equal(options.rpId, 'ops-int.example.com'); assert.equal(options.userVerification, 'required');
  assert.equal(options.challenge.byteLength, 32); assert.equal(options.allowCredentials[0].id.byteLength, 32);
  assert.equal(result.rawId, encoded(32, 2)); assert.equal(result.response.signature, encoded(72));
  assert.equal(result.response.userHandle, encoded(32, 3));
  assert.deepEqual(Object.keys(result).sort(), ['authenticatorAttachment','clientExtensionResults','id','rawId','response','type']);
});

test('registration keeps no attestation, resident credentials, exact RP and one reviewed algorithm', async () => {
  const f = fixture(); f.setResult(response(true));
  const result = await f.browser.register(registration());
  assert.equal(f.calls[0].publicKey.attestation, 'none');
  assert.equal(f.calls[0].publicKey.user.id.byteLength, 32);
  assert.deepEqual(f.calls[0].publicKey.pubKeyCredParams, [{ type: 'public-key', alg: -7 }]);
  assert.equal(f.calls[0].publicKey.authenticatorSelection.userVerification, 'required');
  assert.deepEqual(result.clientExtensionResults, { credProps: { rk: true } });
  assert.deepEqual(result.response.transports, ['internal']);
});

test('foreign RP, malformed or excessive options, weakened UV and browser authority fail before native prompting', async () => {
  const f = fixture();
  for (const change of [{ rpId: 'example.com' }, { rpId: 'customer.example.com' }, { userVerification: 'preferred' },
    { challenge: `${encoded(32)}=` }, { challenge: encoded(31) }, { challenge: `${'a'.repeat(42)}B` },
    { allowCredentials: [] }, { allowCredentials: Array(6).fill(authentication().allowCredentials[0]) },
    { allowCredentials: Array(2).fill(authentication().allowCredentials[0]) }, { timeout: 120001 },
    { extensions: { appid: 'https://foreign.example.com' } }, { roles: ['platform_security_admin'] }]) {
    await assert.rejects(f.browser.authenticate({ ...authentication(), ...change }), /BROWSER_REJECTED/);
  }
  assert.equal(f.calls.length, 0);
});

test('registration cannot request direct attestation, weaker resident/UV policy or unreviewed algorithm/extension', async () => {
  const f = fixture();
  for (const change of [{ attestation: 'direct' }, { rp: { ...registration().rp, id: 'example.com' } },
    { pubKeyCredParams: [{ type: 'public-key', alg: -257 }] }, { extensions: { prf: {} } },
    { authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' } },
    { authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' } },
    { user: { ...registration().user, id: encoded(31) } }, { publicKey: {} }]) {
    await assert.rejects(f.browser.register({ ...registration(), ...change }), /BROWSER_REJECTED/);
  }
  assert.equal(f.calls.length, 0);
});

test('malformed native envelopes, overlength data and unexpected extensions are never returned to the caller', async () => {
  const f = fixture();
  for (const change of [value => { value.id = encoded(32, 3); }, value => { value.rawId = new Uint8Array(32); },
    value => { value.response.signature = binary(257); }, value => { value.response.clientDataJSON = binary(3073); },
    value => { value.response.userHandle = binary(31); }, value => { value.authenticatorAttachment = 'unknown'; },
    value => { value.getClientExtensionResults = () => ({ prf: { results: 'forbidden' } }); }]) {
    const value = response(); change(value); f.setResult(value);
    await assert.rejects(f.browser.authenticate(authentication()), /BROWSER_REJECTED/);
  }
  f.setResult(null);
  await assert.rejects(f.browser.authenticate(authentication()), /BROWSER_REJECTED/);
});

test('one prompt is active at a time, cancellation is bounded, and subsequent retries can use a fresh ceremony', async () => {
  let resolve; let calls = 0;
  const browser = createPlatformPasskeyBrowser({ origin, secureContext: true,
    credentials: { get() { calls++; return new Promise(done => { resolve = done; }); } } });
  const controller = new AbortController();
  const pending = browser.authenticate(authentication(), { signal: controller.signal });
  await assert.rejects(browser.authenticate(authentication()), /BROWSER_BUSY/);
  controller.abort(); resolve(response());
  await assert.rejects(pending, /BROWSER_CANCELLED/);
  await assert.rejects(browser.authenticate(authentication(), { signal: controller.signal }), /BROWSER_CANCELLED/);
  assert.equal(calls, 1);
  const retry = browser.authenticate(authentication()); resolve(response());
  assert.equal((await retry).type, 'public-key');
  assert.equal(calls, 2);
});

test('native errors reveal fixed user-facing classifications without raw error or cause', async () => {
  for (const [name, expected] of [['NotAllowedError','CANCELLED'], ['AbortError','CANCELLED'],
    ['InvalidStateError','ALREADY_REGISTERED'], ['UnknownError','REJECTED']]) {
    const browser = createPlatformPasskeyBrowser({ origin, secureContext: true, credentials: { async get() {
      const error = new Error('synthetic-private-native-payload'); error.name = name; throw error;
    } } });
    await assert.rejects(browser.authenticate(authentication()), error => {
      assert.equal(error.code, `PLATFORM_PASSKEY_BROWSER_${expected}`);
      assert.equal(error.cause, undefined); assert.doesNotMatch(String(error), /synthetic-private/); return true;
    });
  }
});

test('unsupported and insecure browser contexts cannot activate a passkey prompt', async () => {
  for (const change of [{ secureContext: false }, { origin: 'http://ops-int.example.com' }, { origin: 'https://127.0.0.1' },
    { origin: 'https://ops-int.example.com:4443' }, { origin: 'https://ops-int.example.com/path' }]) {
    assert.throws(() => createPlatformPasskeyBrowser({ origin, secureContext: true, ...change }), /BROWSER_UNAVAILABLE/);
  }
  await assert.rejects(createPlatformPasskeyBrowser({ origin, secureContext: true, credentials: {} })
    .authenticate(authentication()), /BROWSER_UNAVAILABLE/);
});
