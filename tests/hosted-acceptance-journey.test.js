import assert from 'node:assert/strict';
import test from 'node:test';
import { requireJourneyReserve, runHostedAcceptanceJourney, waitHostedReadiness } from '../scripts/support/hosted-acceptance-journey.mjs';

function fixture(overrides = {}) {
  const current = Date.parse('2026-10-10T16:00:00.000Z');
  const events = [];
  const evidence = [];
  const env = { CM_DEMO_ACCEPTANCE_EXPIRES_AT: new Date(current + 5_400_000).toISOString(),
    HOSTED_JOB_STARTED_EPOCH: String(current / 1000), HOSTED_JOB_BUDGET_SECONDS: '4800',
    HOSTED_DESTRUCTIVE_RESERVE_SECONDS: '4200' };
  let identities = 0;
  const options = { env, now: () => current,
    validateAccess: (origin) => events.push(origin.includes('-ops-') ? 'bind-platform' : 'bind-customer'),
    readiness: async () => { events.push('readiness'); },
    diagnose: async () => { events.push('failure-audit'); return { available: false }; }, correlation: async () => null,
    recordEvidence: (value) => evidence.push(value),
    verify: async () => { events.push(++identities === 1 ? 'identity-before' : 'identity-after'); },
    reset: async () => { events.push('canonical-double-reset'); },
    runSuite: async ({ target, env: supplied }) => {
      assert.equal(supplied, env); events.push(target); return { status: 'passed' };
    }, ...overrides };
  return { events, env, current, options, evidence };
}

test('gated journey preserves both complete suite phases and proves independent cleanup and identity', async () => {
  const { events, options } = fixture();
  assert.deepEqual(await runHostedAcceptanceJourney(options),
    { journeyPassed: true, cleanupPassed: true, identityPassed: true });
  assert.deepEqual(events, ['bind-customer', 'bind-platform', 'readiness', 'identity-before',
    'shared', 'saas37', 'canonical-double-reset', 'identity-after']);
});

test('each suite failure still independently resets and checks identity without running later scenarios', async () => {
  for (const failing of ['shared', 'saas37']) {
    const { events, options } = fixture();
    options.runSuite = async ({ target }) => { events.push(target); return { status: target !== failing ? 'passed' : 'failed' }; };
    await assert.rejects(runHostedAcceptanceJourney(options), /CM_ACCEPTANCE_JOURNEY_FAILED/);
    assert.deepEqual(events.slice(-2), ['canonical-double-reset', 'identity-after']);
    assert.equal(events.includes('saas37'), failing === 'saas37');
  }
});

test('a runner exception and a cleanup failure cannot bypass the final identity attempt or produce success', async () => {
  const { events, options, evidence } = fixture();
  options.runSuite = async () => { events.push('shared'); throw new Error('untrusted runner failure'); };
  options.reset = async () => { events.push('cleanup-failed'); throw new Error('reset failed'); };
  await assert.rejects(runHostedAcceptanceJourney(options), /^Error: CM_ACCEPTANCE_JOURNEY_FAILED$/);
  assert.deepEqual(events.slice(-2), ['cleanup-failed', 'identity-after']);
  assert.equal(evidence[0].shared, 'failed');
  assert.equal(evidence[0].scenarios, 'not_started');
  assert.equal(evidence[0].cleanup, 'failed');
  assert.equal(evidence[0].finalIdentity, 'passed');
  assert.equal(evidence[0].resetAudit, 'unavailable');
});

test('failed post-journey identity remains a failure after successful suites and cleanup', async () => {
  const { events, options } = fixture();
  let identities = 0;
  options.verify = async () => { if (++identities === 2) throw new Error('changed deployment'); };
  await assert.rejects(runHostedAcceptanceJourney(options), /CM_ACCEPTANCE_JOURNEY_FAILED/);
  assert.equal(identities, 2);
  assert.ok(events.includes('canonical-double-reset'));
});

test('readiness, initial identity and insufficient reserve fail before destructive work', async () => {
  for (const stage of ['readiness', 'verify', 'reserve']) {
    const { events, options, current } = fixture();
    if (stage === 'reserve') options.env.CM_DEMO_ACCEPTANCE_EXPIRES_AT = new Date(current + 4_199_999).toISOString();
    else options[stage] = async () => { throw new Error('preparation failed'); };
    await assert.rejects(runHostedAcceptanceJourney(options));
    assert.ok(!events.includes('shared'));
    assert.ok(!events.includes('canonical-double-reset'));
  }
});

test('reserve requires 4200 seconds in both the unchanged job budget and absolute gate deadline', () => {
  const { env, current } = fixture();
  const now = () => current;
  assert.doesNotThrow(() => requireJourneyReserve({ env: { ...env,
    CM_DEMO_ACCEPTANCE_EXPIRES_AT: new Date(current + 4_200_000).toISOString(),
    HOSTED_JOB_STARTED_EPOCH: String((current - 600_000) / 1000) }, now }));
  for (const change of [
    { CM_DEMO_ACCEPTANCE_EXPIRES_AT: new Date(current + 4_199_999).toISOString() },
    { CM_DEMO_ACCEPTANCE_EXPIRES_AT: 'invalid' }, { HOSTED_JOB_STARTED_EPOCH: 'invalid' },
    { HOSTED_JOB_BUDGET_SECONDS: '5400' }, { HOSTED_DESTRUCTIVE_RESERVE_SECONDS: '3600' },
    { HOSTED_JOB_STARTED_EPOCH: String((current - 601_000) / 1000) },
    { HOSTED_JOB_STARTED_EPOCH: String((current + 1000) / 1000) },
  ]) assert.throws(() => requireJourneyReserve({ env: { ...env, ...change }, now }), /CM_ACCEPTANCE_RESERVE_REJECTED/);
});

test('expiry never receives an extension for cleanup and cannot produce a successful journey', async () => {
  const { events, options, current } = fixture();
  const originalDeadline = options.env.CM_DEMO_ACCEPTANCE_EXPIRES_AT;
  let expired = false;
  options.runSuite = async ({ target }) => { events.push(target); expired = true; return { status: 'failed' }; };
  options.reset = async ({ env }) => {
    events.push('cleanup-attempt'); assert.equal(env.CM_DEMO_ACCEPTANCE_EXPIRES_AT, originalDeadline);
    if (expired) throw new Error('CM_ACCEPTANCE_DEADLINE_EXPIRED');
  };
  options.now = () => expired ? current + 5_400_001 : current;
  await assert.rejects(runHostedAcceptanceJourney(options), /CM_ACCEPTANCE_JOURNEY_FAILED/);
  assert.deepEqual(events.slice(-2), ['cleanup-attempt', 'identity-after']);
  assert.equal(options.env.CM_DEMO_ACCEPTANCE_EXPIRES_AT, originalDeadline);
});

test('bounded readiness requires both actual statuses and keeps existing retry and timeout limits', async () => {
  let current = 0;
  const calls = [];
  const env = { CM_DEMO_ACCEPTANCE_EXPIRES_AT: new Date(1_000_000).toISOString() };
  await waitHostedReadiness({ env, now: () => current, sleep: async (ms) => { assert.equal(ms, 5000); current += ms; },
    fetchImpl: async (url, options) => {
      calls.push(url); assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
      return new Response('', { status: calls.length < 3 ? 503 : 200 });
    } });
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.slice(0, 2), [
    'https://conference-manager-demo.onrender.com/api/v1/health/ready',
    'https://conference-manager-ops-demo.onrender.com/api/v1/platform/health/ready',
  ]);
  current = 0;
  await assert.rejects(waitHostedReadiness({ env, now: () => current, sleep: async (ms) => { current += ms; },
    fetchImpl: async () => new Response('', { status: 503 }) }), /CM_ACCEPTANCE_READINESS_FAILED/);
  assert.equal(current, 360_000);
});
