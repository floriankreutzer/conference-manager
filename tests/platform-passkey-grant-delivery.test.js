import assert from 'node:assert/strict';
import { webcrypto, publicEncrypt, createPublicKey, constants, randomUUID, createHash } from 'node:crypto';
import test from 'node:test';
import { createPlatformPasskeyGrantDelivery } from '../src/platform-admin/production/passkey-grant-delivery.js';

const ORIGIN = 'https://ops-int.example.com';
const FORMAT = 'cm-int-passkey-browser-delivery:v1';
const GRANT = { grantId: randomUUID(), token: Buffer.alloc(32, 1).toString('base64url') };
async function fixture() {
  let now = Date.now(); let pair; let hold = false; let paused; let release; let decrypted;
  const pause = new Promise(resolve => { paused = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const crypto = { randomUUID: () => randomUUID(), subtle: {
    async generateKey(...args) { pair = await webcrypto.subtle.generateKey(...args); return pair; },
    exportKey: (...args) => webcrypto.subtle.exportKey(...args), digest: (...args) => webcrypto.subtle.digest(...args),
    async decrypt(...args) {
      const result = await webcrypto.subtle.decrypt(...args); decrypted = new Uint8Array(result);
      if (hold) { paused(); await gate; } return result;
    },
  } };
  const delivery = createPlatformPasskeyGrantDelivery({ origin: ORIGIN, crypto, clock: () => now });
  const request = JSON.parse(await delivery.prepare());
  function envelope({ labelPatch = [], grant = GRANT, tamper = false } = {}) {
    const label = [FORMAT, 'a'.repeat(40), request.requestId, randomUUID(), 1, 'int', 2,
      randomUUID(), randomUUID(), request.recipientSha256];
    for (const [index, value] of labelPatch) label[index] = value;
    const bytes = createHash('sha256').update(Buffer.from(JSON.stringify(label))).digest();
    const ciphertext = publicEncrypt({ key: createPublicKey(request.recipientPublicKey),
      padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256', oaepLabel: bytes }, Buffer.from(JSON.stringify(grant)));
    if (tamper) ciphertext[0] ^= 1;
    return { format: FORMAT,requestId: request.requestId,recipientSha256: request.recipientSha256,
      labelHash: bytes.toString('hex'),ciphertext: ciphertext.toString('base64url') };
  }
  return { delivery, request, envelope, pair: () => pair, hold: () => { hold = true; return { pause, release }; }, decrypted: () => decrypted, advance: value => { now += value; } };
}

test('only a public recipient request leaves the browser; canonical issuer ciphertext reaches only the explicit enrollment callback',async()=>{
  const f = await fixture();
  assert.equal(f.request.format, 'cm-int-passkey-recipient:v1'); assert.equal(f.request.origin, ORIGIN);
  assert.equal(f.pair().privateKey.extractable, false);
  await assert.rejects(webcrypto.subtle.exportKey('pkcs8', f.pair().privateKey));
  assert.doesNotMatch(JSON.stringify(f.request), /PRIVATE KEY|grantId|token|privateKey/);
  assert.equal(Date.parse(f.request.expiresAt) - Date.parse(f.request.createdAt), 900000);
  let calls = 0;
  const result = await f.delivery.consume(JSON.stringify(f.envelope()), async grant => {
    calls++; assert.deepEqual(grant, GRANT); return { phase: 'registration_required' };
  });
  assert.deepEqual(result, { phase: 'registration_required' }); assert.equal(calls, 1);
  await assert.rejects(f.delivery.prepare(), /DELIVERY_REJECTED/);
});

test('wrong request, foreign recipient, modified ciphertext and malformed grant never reach enrollment',async()=>{
  const f = await fixture(); let calls = 0;
  const variants = [{ ...f.envelope(),requestId: randomUUID() },{ ...f.envelope(),labelHash: 'b'.repeat(64) },
    { ...f.envelope(),recipientSha256: 'b'.repeat(64) }, f.envelope({ tamper: true }),
    f.envelope({ grant: { ...GRANT, operatorId: randomUUID() } }), f.envelope({ grant: { ...GRANT, token: 'short' } }),
    { ...f.envelope(), unknown: true }, { ...f.envelope(), format: 'wrong' }];
  for (const value of variants) {
    await assert.rejects(f.delivery.consume(JSON.stringify(value), () => { calls++; }), /DELIVERY_REJECTED/);
  }
  for (const value of ['{', 'x'.repeat(8193)]) {
    await assert.rejects(f.delivery.consume(value, () => { calls++; }), /DELIVERY_REJECTED/);
  }
  assert.equal(calls, 0);
});

test('expiry, backward time and disposal destroy delivery custody without an enrollment fallback',async()=>{
  for (const mode of ['expire', 'backward', 'dispose']) {
    const f = await fixture(); const text = JSON.stringify(f.envelope());
    if (mode === 'expire') f.advance(900000);
    else if (mode === 'backward') f.advance(-1);
    else f.delivery.dispose();
    await assert.rejects(f.delivery.consume(text, () => assert.fail('NO_ENROLLMENT')), /DELIVERY_REJECTED/);
  }
});

test('concurrent import is rejected and a failed delivery exposes only a fixed error',async()=>{
  const f = await fixture(); let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const first = f.delivery.consume(JSON.stringify(f.envelope()), () => waiting);
  await assert.rejects(f.delivery.consume(JSON.stringify(f.envelope()), () => assert.fail()), /DELIVERY_REJECTED/);
  release({ phase: 'registration_required' }); await first;
  await assert.rejects(f.delivery.consume(JSON.stringify(f.envelope()), () => { throw new Error('PRIVATE_GRANT_OR_PROVIDER_DATA'); }),
    error => error.message === 'PLATFORM_PASSKEY_DELIVERY_REJECTED');
});


test('closing the recipient during native decryption withholds enrollment and wipes decrypted bytes',async()=>{
  const f=await fixture(),held=f.hold();let calls=0;
  const attempt=f.delivery.consume(JSON.stringify(f.envelope()),()=>{ calls++; });
  await held.pause;f.delivery.dispose();held.release();
  await assert.rejects(attempt,/DELIVERY_REJECTED/);assert.equal(calls,0);
  assert.ok(f.decrypted().every(value=>value===0));
});

test('late preparation cannot publish a request after its recipient lifetime elapsed',async()=>{
  let calls=0;const now=Date.now();
  const delivery=createPlatformPasskeyGrantDelivery({ origin: ORIGIN,crypto: webcrypto,
    clock: ()=>calls++===0 ? now : now+900001 });
  await assert.rejects(delivery.prepare(),/DELIVERY_REJECTED/);
  await assert.rejects(delivery.consume('{}',()=>assert.fail()),/DELIVERY_REJECTED/);
});
