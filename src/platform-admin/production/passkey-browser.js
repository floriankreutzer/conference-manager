const TRANSPORTS = new Set(['ble', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']);

export class PlatformPasskeyBrowserError extends Error {
  constructor(code = 'PLATFORM_PASSKEY_BROWSER_REJECTED') {
    super(code);
    this.name = 'PlatformPasskeyBrowserError';
    this.code = code;
  }
}
function reject() { throw new PlatformPasskeyBrowserError(); }
function exact(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) reject();
}
function encoded(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function decoded(value, min, max = min) {
  if (typeof value !== 'string' || value.length > Math.ceil(max * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(value)) reject();
  const raw = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
  if (bytes.length < min || bytes.length > max || encoded(bytes) !== value) reject();
  return bytes;
}
function buffer(value, min, max) {
  if (!(value instanceof ArrayBuffer) || value.byteLength < min || value.byteLength > max) reject();
  return encoded(new Uint8Array(value));
}
function text(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 80
    || /[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/.test(value)) reject();
  return value;
}
function descriptors(value, required = false) {
  if (!Array.isArray(value) || value.length > 5 || (required && value.length === 0)) reject();
  const seen = new Set();
  return value.map(item => {
    exact(item, ['id','type'], ['transports']);
    if (item.type !== 'public-key' || seen.has(item.id)) reject();
    seen.add(item.id);
    if (item.transports !== undefined && (!Array.isArray(item.transports) || item.transports.length > 6
      || new Set(item.transports).size !== item.transports.length || item.transports.some(value => !TRANSPORTS.has(value)))) reject();
    return { id: decoded(item.id, 1, 1024), type: 'public-key',
      ...(item.transports ? { transports: [...item.transports] } : {}) };
  });
}
function timeout(value) {
  if (value !== undefined && (!Number.isInteger(value) || value < 1000 || value > 120000)) reject();
  return value ?? 120000;
}
function extensions(value) {
  exact(value, [], ['credProps']);
  if (value.credProps !== undefined) {
    exact(value.credProps, ['rk']);
    if (typeof value.credProps.rk !== 'boolean') reject();
    return { credProps: { rk: value.credProps.rk } };
  }
  return {};
}
function serialize(credential, registration) {
  if (!credential || credential.type !== 'public-key') reject();
  const rawId = buffer(credential.rawId, 1, 1024);
  if (credential.id !== rawId || typeof credential.getClientExtensionResults !== 'function') reject();
  const response = credential.response;
  if (!response) reject();
  const clientDataJSON = buffer(response.clientDataJSON, 1, 3072);
  let serialized;
  if (registration) {
    const transports = typeof response.getTransports === 'function' ? response.getTransports() : [];
    if (!Array.isArray(transports) || transports.length > 6 || transports.some(value => !TRANSPORTS.has(value))) reject();
    serialized = { clientDataJSON, attestationObject: buffer(response.attestationObject, 1, 12288), transports };
  } else {
    serialized = { clientDataJSON, authenticatorData: buffer(response.authenticatorData, 37, 1024),
      signature: buffer(response.signature, 8, 256), userHandle: response.userHandle == null ? null : buffer(response.userHandle, 32, 32) };
  }
  const attachment = credential.authenticatorAttachment;
  if (attachment != null && !['platform', 'cross-platform'].includes(attachment)) reject();
  return { id: rawId, rawId, type: 'public-key', response: serialized,
    clientExtensionResults: extensions(credential.getClientExtensionResults()),
    ...(attachment == null ? {} : { authenticatorAttachment: attachment }) };
}

// Browser serialization only. It cannot verify possession, redeem a ceremony,
// establish identity/roles or issue a session; those remain trusted API duties.
export function createPlatformPasskeyBrowser({ credentials = globalThis.navigator?.credentials,
  origin = globalThis.location?.origin, secureContext = globalThis.isSecureContext } = {}) {
  let hostname;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.protocol !== 'https:' || url.port || secureContext !== true) reject();
    hostname = url.hostname;
    if (!hostname.includes('.') || /^[\d.]+$/.test(hostname)
      || hostname.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) reject();
  } catch { throw new PlatformPasskeyBrowserError('PLATFORM_PASSKEY_BROWSER_UNAVAILABLE'); }
  let pending = false;
  async function perform(options, signal, registration) {
    if (pending) throw new PlatformPasskeyBrowserError('PLATFORM_PASSKEY_BROWSER_BUSY');
    if (typeof credentials?.[registration ? 'create' : 'get'] !== 'function') {
      throw new PlatformPasskeyBrowserError('PLATFORM_PASSKEY_BROWSER_UNAVAILABLE');
    }
    pending = true;
    try {
      if (signal !== undefined && !(signal instanceof AbortSignal)) reject();
      if (signal?.aborted) throw new PlatformPasskeyBrowserError('PLATFORM_PASSKEY_BROWSER_CANCELLED');
      let publicKey;
      if (registration) {
        exact(options, ['challenge','rp','user','pubKeyCredParams','attestation','authenticatorSelection'],
          ['timeout','excludeCredentials','extensions','hints']);
        // The pinned API SDK emits an empty hints array by default. It is not
        // an instruction to select a different authenticator or relax policy.
        if (options.hints !== undefined && (!Array.isArray(options.hints) || options.hints.length !== 0)) reject();
        exact(options.rp, ['id','name']); exact(options.user, ['id','name','displayName']);
        if (options.rp.id !== hostname || options.attestation !== 'none') reject();
        if (!Array.isArray(options.pubKeyCredParams) || options.pubKeyCredParams.length !== 1) reject();
        exact(options.pubKeyCredParams[0], ['type','alg']);
        if (options.pubKeyCredParams[0].type !== 'public-key' || options.pubKeyCredParams[0].alg !== -7) reject();
        exact(options.authenticatorSelection, ['residentKey','userVerification'], ['requireResidentKey']);
        if (options.authenticatorSelection.residentKey !== 'required' || options.authenticatorSelection.userVerification !== 'required'
          || (options.authenticatorSelection.requireResidentKey !== undefined
            && options.authenticatorSelection.requireResidentKey !== true)) reject();
        if (options.extensions !== undefined) {
          exact(options.extensions, ['credProps']); if (options.extensions.credProps !== true) reject();
        }
        publicKey = { challenge: decoded(options.challenge, 32), rp: { id: hostname, name: text(options.rp.name) },
          user: { id: decoded(options.user.id, 32), name: text(options.user.name), displayName: text(options.user.displayName) },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }], attestation: 'none',
          authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
          timeout: timeout(options.timeout), excludeCredentials: descriptors(options.excludeCredentials ?? []),
          extensions: { credProps: true } };
      } else {
        exact(options, ['challenge','rpId','allowCredentials','userVerification'], ['timeout','extensions']);
        if (options.rpId !== hostname || options.userVerification !== 'required') reject();
        if (options.extensions !== undefined) exact(options.extensions, []);
        publicKey = { challenge: decoded(options.challenge, 32), rpId: hostname,
          allowCredentials: descriptors(options.allowCredentials, true), userVerification: 'required', timeout: timeout(options.timeout) };
      }
      const result = await credentials[registration ? 'create' : 'get']({ publicKey, ...(signal ? { signal } : {}) });
      if (signal?.aborted) throw new PlatformPasskeyBrowserError('PLATFORM_PASSKEY_BROWSER_CANCELLED');
      return serialize(result, registration);
    } catch (error) {
      if (error instanceof PlatformPasskeyBrowserError) throw error;
      if (['AbortError', 'NotAllowedError'].includes(error?.name)) {
        throw new PlatformPasskeyBrowserError('PLATFORM_PASSKEY_BROWSER_CANCELLED');
      }
      if (error?.name === 'InvalidStateError') throw new PlatformPasskeyBrowserError('PLATFORM_PASSKEY_BROWSER_ALREADY_REGISTERED');
      throw new PlatformPasskeyBrowserError();
    } finally { pending = false; }
  }
  return Object.freeze({
    async register(options, { signal } = {}) { return perform(options, signal, true); },
    async authenticate(options, { signal } = {}) { return perform(options, signal, false); },
  });
}
