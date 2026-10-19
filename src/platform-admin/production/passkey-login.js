import { createApiClient } from '../../core/api-client.js';
import { createPlatformPasskeyBrowser } from './passkey-browser.js';

const PHASES = new Set(['enrollment_required','registration_required','possession_required','passkey_required']);
const STATE = /^[A-Za-z0-9_-]{43}$/;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class PlatformPasskeyLoginError extends Error {
  constructor(code = 'PLATFORM_PASSKEY_LOGIN_FAILED') { super(code); this.name = 'PlatformPasskeyLoginError'; this.code = code; }
}
function reject() { throw new PlatformPasskeyLoginError(); }
function exact(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(value, key))) reject();
}
function pending(value, allowed) {
  const options = value?.status !== 'enrollment_required';
  const setup = value?.status === 'passkey_required';
  exact(value, ['status','state','requestId', ...(options ? ['options'] : []), ...(setup ? ['setupRequired'] : [])]);
  if (!allowed.includes(value.status) || !PHASES.has(value.status) || !STATE.test(value.state || '')
    || !ID.test(value.requestId || '') || (options && (!value.options || typeof value.options !== 'object'
      || Array.isArray(value.options))) || (setup && typeof value.setupRequired !== 'boolean')) reject();
  return value;
}

// Presentation orchestration only. Cookies, identity, grants, possession and key
// policy remain authoritative in the API. No browser storage or authority cache.
export function createPlatformPasskeyLogin({ browser,
  apiClientFactory = token => createApiClient({ baseUrl: '/api/v1/platform/auth/passkey/', csrfTokenProvider: () => token }),
  onChange = () => {}, onAuthenticated = () => globalThis.location.reload() } = {}) {
  if (typeof apiClientFactory !== 'function' || typeof onChange !== 'function' || typeof onAuthenticated !== 'function') {
    throw new TypeError('PLATFORM_PASSKEY_LOGIN_PORTS_REQUIRED');
  }
  let current = null; let configuration = null; let busy = false; let stopped = false; let error = null; let abort = null;
  let phase = 'loading';
  function snapshot() {
    return Object.freeze({ phase, busy, error, mode: configuration?.mode ?? null,
      setupRequired: current?.setupRequired === true, environment: configuration?.environment ?? null });
  }
  function emit() { if (!stopped) onChange(snapshot()); }
  function setPending(value, allowed) { if (stopped) reject(); current = pending(value, allowed); phase = value.status; }
  function code(value) {
    if (value?.code === 'PLATFORM_PASSKEY_BROWSER_CANCELLED') return 'cancelled';
    if (value?.code === 'PLATFORM_PASSKEY_BROWSER_ALREADY_REGISTERED') return 'duplicate';
    if (value?.code === 'PLATFORM_PASSKEY_BROWSER_UNAVAILABLE') return 'unsupported';
    if (['HTTP_401','HTTP_403'].includes(value?.code)) return 'expired';
    if (value?.code === 'HTTP_429') return 'limited';
    return 'failed';
  }
  async function run(work) {
    if (stopped || busy) throw new PlatformPasskeyLoginError('PLATFORM_PASSKEY_LOGIN_BUSY');
    busy = true; error = null; abort = new AbortController(); emit();
    try { await work(abort.signal); }
    catch (failure) { if (!stopped) error = code(failure); }
    finally { busy = false; abort = null; emit(); }
    return snapshot();
  }
  function client(token = null) {
    const result = apiClientFactory(token);
    if (typeof result?.request !== 'function') reject();
    return result;
  }
  function credentials() { return browser ??= createPlatformPasskeyBrowser(); }
  async function post(path, body, signal) {
    if (!current || !STATE.test(current.state)) reject();
    return client(current.state).request(path, { method: 'POST', body: { state: current.state, ...body }, signal });
  }
  function terminal(value, expected) {
    if (stopped) reject();
    exact(value, ['status','requestId']); if (value.status !== expected || !ID.test(value.requestId || '')) reject();
    current = null; phase = expected;
  }
  return Object.freeze({
    snapshot,
    async load() {
      return run(async signal => {
        current = null; phase = 'loading';
        let value;
        try { value = await client().request('configuration', { signal }); }
        catch (failure) {
          if (failure?.code !== 'HTTP_404') throw failure;
          configuration = null; phase = 'legacy'; return;
        }
        exact(value, ['mode','environment','minimumPasskeys','requestId']);
        if (!['passkey_setup','application_passkey'].includes(value.mode) || !['dev','int','prod'].includes(value.environment)
          || value.minimumPasskeys !== 2 || !ID.test(value.requestId || '')) reject();
        if (stopped) reject();
        configuration = value;
        try {
          setPending(await client().request('enrollment/pending', { signal }), ['registration_required','possession_required']);
        } catch (failure) {
          if (failure?.code !== 'HTTP_401') throw failure;
          try { setPending(await client().request('pending', { signal }), ['enrollment_required','passkey_required']); }
          catch (failure) { if (failure?.code !== 'HTTP_401') throw failure; phase = 'sign_in'; }
        }
      });
    },
    async startEnrollment(grant) {
      return run(async signal => {
        if (phase !== 'enrollment_required') reject();
        exact(grant, ['grantId','token']);
        if (!ID.test(grant.grantId || '') || !STATE.test(grant.token || '')
          || btoa(atob(grant.token.replaceAll('-', '+').replaceAll('_', '/')))
            .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== grant.token) reject();
        setPending(await post('enrollment/start', grant, signal), ['registration_required']);
      });
    },
    async continue() {
      return run(async signal => {
        if (!current) reject();
        if (phase === 'registration_required') {
          const response = await credentials().register(current.options, { signal });
          setPending(await post('enrollment/register', { response }, signal), ['possession_required']);
        } else if (phase === 'possession_required') {
          const response = await credentials().authenticate(current.options, { signal });
          terminal(await post('enrollment/complete', { response }, signal), 'credential_enrolled');
        } else if (phase === 'passkey_required') {
          const response = await credentials().authenticate(current.options, { signal });
          const value = await post('authenticate', { response }, signal);
          if (value?.status === 'registration_required') setPending(value, ['registration_required']);
          else if (value?.status === 'setup_complete') terminal(value, 'setup_complete');
          else {
            if (configuration?.mode !== 'application_passkey' || current.setupRequired) reject();
            terminal(value, 'authenticated'); onAuthenticated();
          }
        } else reject();
      });
    },
    cancel() { abort?.abort(); },
    stop() { stopped = true; abort?.abort(); current = null; configuration = null; phase = 'stopped'; error = null; },
  });
}
