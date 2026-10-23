const REQUEST_FORMAT = 'cm-int-passkey-recipient:v1';
const DELIVERY_FORMAT = 'cm-int-passkey-browser-delivery:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX = /^[a-f0-9]{64}$/;
const LIFETIME_MS = 15 * 60 * 1000;
const decoder = new TextDecoder('utf-8', { fatal: true });
function reject() { throw new Error('PLATFORM_PASSKEY_DELIVERY_REJECTED'); }
function exact(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) reject();
}
function base64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function bytes(value, length) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 2048) reject();
  const result = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  if ((length !== undefined && result.length !== length)
    || base64(result).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== value) reject();
  return result;
}

// Confidential transport only. No identity, grant issuance or registration
// authority lives here. The independent canonical issuer and enrollment API
// still validate their exact operator, primary proof, deployment and expiry.
// The private recipient key is non-exportable and exists only in this instance.
export function createPlatformPasskeyGrantDelivery({ crypto = globalThis.crypto, clock = () => Date.now(), origin } = {}) {
  let parsed;
  try { parsed = new URL(origin); } catch { reject(); }
  if (parsed.origin !== origin || parsed.protocol !== 'https:' || typeof clock !== 'function'
    || typeof crypto?.subtle?.generateKey !== 'function' || typeof crypto?.randomUUID !== 'function') reject();
  let recipient = null; let busy = false; let disposed = false;
  function current() {
    const now = clock();
    if (disposed || !recipient || !Number.isSafeInteger(now) || now < recipient.createdAt || now >= recipient.expiresAt) {
      recipient = null; reject();
    }
    return recipient;
  }
  return Object.freeze({
    async prepare() {
      if (busy || disposed || recipient) reject();
      busy = true;
      try {
        const createdAt = clock(); if (!Number.isSafeInteger(createdAt) || createdAt < 0) reject();
        const pair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 4096,
          publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['encrypt', 'decrypt']);
        if (disposed || pair.privateKey.extractable !== false) reject();
        const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', spki));
        const fingerprint = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
        const requestId = crypto.randomUUID(); if (!UUID.test(requestId) || !HEX.test(fingerprint)) reject();
        const pem = `-----BEGIN PUBLIC KEY-----\n${base64(spki).match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;
        const readyAt = clock();
        if (disposed || !Number.isSafeInteger(readyAt) || readyAt < createdAt || readyAt >= createdAt + LIFETIME_MS) reject();
        recipient = { key: pair.privateKey, requestId, fingerprint, createdAt, expiresAt: createdAt + LIFETIME_MS };
        const request = { format: REQUEST_FORMAT, origin, requestId, recipientPublicKey: pem, recipientSha256: fingerprint,
          createdAt: new Date(createdAt).toISOString(), expiresAt: new Date(recipient.expiresAt).toISOString() };
        return JSON.stringify(request, null, 2);
      } catch { recipient = null; reject(); }
      finally { busy = false; }
    },
    async consume(text, onGrant) {
      if (busy || typeof text !== 'string' || text.length > 8192 || typeof onGrant !== 'function') reject();
      const selected = current(); busy = true; let plaintext = null;
      try {
        const bundle = JSON.parse(text);
        exact(bundle, ['format', 'requestId', 'recipientSha256', 'labelHash', 'ciphertext']);
        if (bundle.format !== DELIVERY_FORMAT || bundle.requestId !== selected.requestId
          || bundle.recipientSha256 !== selected.fingerprint || !HEX.test(bundle.labelHash)) reject();
        const labelBytes = Uint8Array.from(bundle.labelHash.match(/../g), value => Number.parseInt(value, 16));
        const ciphertext = bytes(bundle.ciphertext, 512);
        plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP', label: labelBytes }, selected.key, ciphertext));
        if (plaintext.length > 256 || current() !== selected) reject();
        const grant = JSON.parse(decoder.decode(plaintext)); exact(grant, ['grantId', 'token']);
        if (!UUID.test(grant.grantId) || bytes(grant.token, 32).length !== 32) reject();
        // Only this explicit user action forwards the claim to the existing API.
        // Neither the claim nor private key becomes a UI value, download or store.
        return await onGrant(grant);
      } catch { reject(); }
      finally { plaintext?.fill(0); busy = false; }
    },
    dispose() { disposed = true; recipient = null; },
  });
}
