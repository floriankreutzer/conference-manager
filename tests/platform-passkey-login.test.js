import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformPasskeyLogin } from '../src/platform-admin/production/passkey-login.js';

const state = btoa(String.fromCharCode(...new Uint8Array(32).fill(1))).replace(/=+$/, '');
const requestId = '11111111-1111-4111-8111-111111111111';
const options = { challenge: state };
const response = { id: 'native-response-port-fixture' };
const pending = (status, extra = {}) => ({ status, state, requestId,
  ...(status === 'enrollment_required' ? {} : { options }),
  ...(status === 'passkey_required' ? { setupRequired: false } : {}), ...extra });
const httpError = code => Object.assign(new Error(code), { code });
function fixture({ mode = 'passkey_setup', initial = 'enrollment_required', minimumPasskeys = 2 } = {}) {
  const calls = []; let phase = initial; let fail = null; let authenticated = 0; let nativeCalls = 0;
  const controller = createPlatformPasskeyLogin({
    apiClientFactory: token => ({ async request(path, init = {}) {
      calls.push({ token, path, init });
      if (fail) throw fail;
      if (path === 'configuration') return { mode, environment: 'int', minimumPasskeys, requestId };
      if (path === 'enrollment/pending') {
        if (!['registration_required','possession_required'].includes(phase)) throw httpError('HTTP_401');
        return pending(phase);
      }
      if (path === 'pending') {
        if (!phase) throw httpError('HTTP_401');
        return pending(phase, phase === 'passkey_required' ? { setupRequired: mode === 'passkey_setup' } : {});
      }
      if (path === 'enrollment/start') { phase = 'registration_required'; return pending(phase); }
      if (path === 'enrollment/register') { phase = 'possession_required'; return pending(phase); }
      if (path === 'enrollment/complete') return { status: 'credential_enrolled', requestId };
      if (path === 'authenticate') return mode === 'passkey_setup'
        ? minimumPasskeys === 1 ? { status: 'setup_complete', requestId } : pending('registration_required')
        : { status: 'authenticated', requestId };
      throw new Error('UNEXPECTED_PATH');
    } }),
    browser: { async register() { nativeCalls++; return response; }, async authenticate() { nativeCalls++; return response; } },
    onAuthenticated: () => { authenticated++; },
  });
  return { controller, calls, fail: value => { fail = value; }, nativeCalls: () => nativeCalls, authenticated: () => authenticated };
}

test('independent bootstrap, native registration and separate possession are memory-only presentation stages', async () => {
  const f = fixture();
  assert.equal((await f.controller.load()).phase, 'enrollment_required');
  const grant = { grantId: requestId, token: state };
  assert.equal((await f.controller.startEnrollment(grant)).phase, 'registration_required');
  assert.equal(f.nativeCalls(), 0, 'registration requires a deliberate user gesture');
  assert.equal((await f.controller.continue()).phase, 'possession_required');
  assert.equal((await f.controller.continue()).phase, 'credential_enrolled');
  assert.equal(f.nativeCalls(), 2); assert.equal(f.authenticated(), 0);
  const writes = f.calls.filter(call => call.init.method === 'POST');
  assert.deepEqual(writes.map(call => call.path), ['enrollment/start','enrollment/register','enrollment/complete']);
  assert.ok(writes.every(call => call.token === state && call.init.body.state === state));
  assert.deepEqual(Object.keys(f.controller.snapshot()).sort(), ['busy','environment','error','mode','phase','setupRequired']);
  assert.doesNotMatch(JSON.stringify(f.controller.snapshot()), new RegExp(state));
  const count = f.calls.length;
  await f.controller.continue(); assert.equal(f.calls.length, count, 'terminal stage cannot replay a consumed proof');
});

test('reload resumes the server ceremony and only active mode can signal authenticated', async () => {
  const resumed = fixture({ initial: 'possession_required' });
  assert.equal((await resumed.controller.load()).phase, 'possession_required');
  assert.equal((await resumed.controller.continue()).phase, 'credential_enrolled');
  const setup = fixture({ initial: 'passkey_required' });
  assert.equal((await setup.controller.load()).setupRequired, true);
  assert.equal((await setup.controller.continue()).phase, 'registration_required');
  assert.equal(setup.authenticated(), 0);
  const active = fixture({ mode: 'application_passkey', initial: 'passkey_required' });
  await active.controller.load(); assert.equal((await active.controller.continue()).phase, 'authenticated');
  assert.equal(active.authenticated(), 1);
});

test('missing cookies offer sign-in; only explicit missing configuration preserves the existing CA entry', async () => {
  const f = fixture({ initial: null }); assert.equal((await f.controller.load()).phase, 'sign_in');
  const legacy = fixture(); legacy.fail(httpError('HTTP_404'));
  assert.equal((await legacy.controller.load()).phase, 'legacy');
  const unavailable = fixture(); unavailable.fail(httpError('HTTP_503'));
  const failed = await unavailable.controller.load(); assert.equal(failed.error, 'failed'); assert.notEqual(failed.phase, 'legacy');
});

test('malformed grants do not reach API, errors are minimized and stop cancels outstanding native proof', async () => {
  const f = fixture(); await f.controller.load(); const count = f.calls.length;
  for (const grant of [{ grantId: requestId, token: 'bad' }, { grantId: requestId, token: state, operatorId: requestId }]) {
    assert.equal((await f.controller.startEnrollment(grant)).error, 'failed');
  }
  assert.equal(f.calls.length, count);
  f.fail(Object.assign(new Error('PRIVATE_PROVIDER_PAYLOAD'), { code: 'HTTP_429' }));
  assert.equal((await f.controller.startEnrollment({ grantId: requestId, token: state })).error, 'limited');
  assert.doesNotMatch(JSON.stringify(f.controller.snapshot()), /PRIVATE_PROVIDER_PAYLOAD/);
  let rejectNative; let signal;
  const queued = createPlatformPasskeyLogin({ apiClientFactory: () => ({ async request(path) {
    if (path === 'configuration') return { mode: 'application_passkey', environment: 'int', minimumPasskeys: 2, requestId };
    if (path === 'enrollment/pending') throw httpError('HTTP_401'); return pending('passkey_required');
  } }), browser: { authenticate(_options, input) {
    signal = input.signal; return new Promise((resolve, reject) => { rejectNative = reject; });
  } } });
  await queued.load(); const proof = queued.continue();
  await assert.rejects(queued.continue(), /BUSY/); queued.stop(); assert.equal(signal.aborted, true);
  rejectNative(httpError('PLATFORM_PASSKEY_BROWSER_CANCELLED')); await proof;
  assert.equal(queued.snapshot().phase, 'stopped'); assert.equal(queued.snapshot().error, null);
});


test('INT one-key setup accepts a completed server proof without prompting for a second registration or opening business access',async()=>{
  const f=fixture({ initial: 'passkey_required',minimumPasskeys: 1 });
  assert.equal((await f.controller.load()).phase,'passkey_required');
  assert.equal((await f.controller.continue()).phase,'setup_complete');
  assert.equal(f.nativeCalls(),1);assert.equal(f.authenticated(),0);
  assert.equal(f.calls.some(call=>call.path==='enrollment/start'),false);
  const active=fixture({ mode: 'application_passkey',initial: 'passkey_required',minimumPasskeys: 1 });
  await active.controller.load();assert.equal((await active.controller.continue()).phase,'authenticated');
  assert.equal(active.nativeCalls(),1);assert.equal(active.authenticated(),1);
});
