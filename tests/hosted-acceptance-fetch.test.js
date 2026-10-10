import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createHostedAcceptanceFetch } from '../scripts/support/hosted-acceptance-fetch.mjs';

const CUSTOMER = 'https://conference-manager-demo.onrender.com';
const PLATFORM = 'https://conference-manager-ops-demo.onrender.com';
const ROOT = path.resolve('.');

async function guarded(t, body, changes = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cm-native-acceptance-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const child = path.join(root, 'child.mjs');
  const summary = path.join(root, 'summary.json');
  await writeFile(child, `import assert from 'node:assert/strict';
    import { createHostedAcceptanceFetch } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'scripts/support/hosted-acceptance-fetch.mjs')).href)};
    import { resetHostedDemoBaseline, CANONICAL_DEMO_CHECKSUM } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'scripts/reset-hosted-demo-baseline.mjs')).href)};
    import { verifyHostedDemoDeployment } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'scripts/verify-hosted-demo-deployment.mjs')).href)};
    import { readHostedDemoResetEvidence } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'scripts/read-hosted-demo-reset-evidence.mjs')).href)};
    const CUSTOMER = ${JSON.stringify(CUSTOMER)};
    const PLATFORM = ${JSON.stringify(PLATFORM)};
    ${body}
  `);
  const tokens = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')];
  const result = spawnSync(process.execPath, ['--import', './tests/support/hosted-transport/redaction-guard.mjs', child], {
    cwd: ROOT, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, CM_DEMO_ACCEPTANCE_MODE: 'gate',
      CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN: tokens[0], CM_DEMO_PLATFORM_ACCEPTANCE_TOKEN: tokens[1],
      CM_DEMO_ACCEPTANCE_EXPIRES_AT: new Date(Date.now() + 30_000).toISOString(),
      CM_ACCEPTANCE_ARTIFACT_ROOT: root, CM_ACCEPTANCE_SUMMARY_PATH: summary, ...changes },
  });
  assert.equal(result.status, 0, 'Guarded offline operation assertions must pass');
  const artifacts = `${result.stdout}${result.stderr}${await readFile(summary, 'utf8').catch(() => '')}`;
  for (const token of tokens) assert.ok(!artifacts.includes(token), 'No synthetic gate token reaches output');
  return { root, summary };
}

test('ordinary operational fetch retains its exact existing dependency', () => {
  const fetchImpl = async () => new Response();
  assert.equal(createHostedAcceptanceFetch({ origin: PLATFORM, fetchImpl, env: {} }), fetchImpl);
});

test('native gated operations bind the correct header without replacing session, CSRF or origin', async (t) => {
  await guarded(t, `
    for (const [origin, token] of [[CUSTOMER, process.env.CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN],
      [PLATFORM, process.env.CM_DEMO_PLATFORM_ACCEPTANCE_TOKEN]]) {
      let calls = 0;
      const request = createHostedAcceptanceFetch({ origin, fetchImpl: async (url, options) => {
        calls += 1;
        assert.equal(url, origin + '/api/v1/example');
        assert.equal(options.headers.get('x-cm-demo-acceptance'), token);
        assert.equal(options.headers.get('Cookie'), 'session=unchanged');
        assert.equal(options.headers.get('X-CSRF-Token'), 'csrf-unchanged');
        assert.equal(options.headers.get('Origin'), origin);
        assert.equal(options.method, 'PUT'); assert.equal(options.body, '{}');
        assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
        return new Response('{}');
      }});
      await request(origin + '/api/v1/example', { method: 'PUT', body: '{}',
        headers: { Cookie: 'session=unchanged', 'X-CSRF-Token': 'csrf-unchanged', Origin: origin } });
      assert.equal(calls, 1);
    }
  `);
});

test('native gated operations reject redirects, origin substitution, caller headers and expired captures before fetch', async (t) => {
  await guarded(t, `
    let calls = 0;
    const request = createHostedAcceptanceFetch({ origin: CUSTOMER, fetchImpl: async () => { calls += 1; } });
    for (const url of [PLATFORM + '/', 'https://example.invalid/', 'http://conference-manager-demo.onrender.com/',
      CUSTOMER + ':4443/', 'https://user@conference-manager-demo.onrender.com/', CUSTOMER + '/#fragment', new URL(CUSTOMER)]) {
      await assert.rejects(request(url), /CM_ACCEPTANCE_REQUEST_REJECTED/);
    }
    for (const options of [{ redirect: 'follow' }, { redirect: 'manual' }, { dispatcher: {} },
      { headers: { 'X-CM-DEMO-ACCEPTANCE': 'override' } }, { headers: { Host: 'example.invalid' } },
      { headers: { 'Proxy-Authorization': 'override' } }, { rejectUnauthorized: false }, { ignoreHTTPSErrors: true }]) {
      await assert.rejects(request(CUSTOMER + '/', options), /CM_ACCEPTANCE_REQUEST_REJECTED/);
    }
    const now = Date.now;
    try {
      Date.now = () => Date.parse(process.env.CM_DEMO_ACCEPTANCE_EXPIRES_AT) + 1;
      await assert.rejects(request(CUSTOMER + '/'), /CM_ACCEPTANCE_DEADLINE_EXPIRED/);
    } finally { Date.now = now; }
    assert.equal(calls, 0);
  `);
});

test('native request failures discard unsafe causes and an in-flight request observes the absolute deadline', async (t) => {
  await guarded(t, `
    const secret = process.env.CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN;
    const request = createHostedAcceptanceFetch({ origin: CUSTOMER, fetchImpl: async () => {
      throw new Error(secret, { cause: new Error(secret) });
    }});
    await assert.rejects(request(CUSTOMER + '/'), (error) =>
      error.message === 'CM_ACCEPTANCE_REQUEST_FAILED' && error.cause === undefined && !error.stack.includes(secret));
    const env = { ...process.env, CM_DEMO_ACCEPTANCE_EXPIRES_AT: new Date(Date.now() + 30).toISOString() };
    const timeout = createHostedAcceptanceFetch({ origin: CUSTOMER, env, fetchImpl: async (url, options) =>
      new Promise((resolve, reject) => {
        const keepAlive = setTimeout(() => reject(new Error('test deadline missed')), 2000);
        options.signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(new Error(secret)); }, { once: true });
      }) });
    await assert.rejects(timeout(CUSTOMER + '/'), /CM_ACCEPTANCE_REQUEST_FAILED/);
  `);
});

test('reset and identity operations preserve their existing checks behind origin-bound fetch', async (t) => {
  await guarded(t, `
    const runtimeRef = '356459004dbede11cc3cd17a93d4e6cf515d410b';
    const frontendRef = '5d5102b4f9842ec704ff26441ebe96719324ddb0';
    let calls = 0;
    const reset = await resetHostedDemoBaseline({ expectedRuntimeRef: runtimeRef, fetchImpl: async (url, options) => {
      calls += 1; assert.equal(new URL(url).origin, PLATFORM);
      assert.equal(options.headers.get('x-cm-demo-acceptance'), process.env.CM_DEMO_PLATFORM_ACCEPTANCE_TOKEN);
      const result = url.endsWith('/reset')
        ? { seedVersion: 'saas-3.7-three-demo-customers-v1', checksum: CANONICAL_DEMO_CHECKSUM }
        : { csrfToken: 'synthetic-csrf-value-at-least-thirty-two-characters' };
      return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json',
        'set-cookie': 'cm_platform_session=synthetic_session_1234567890; Secure; HttpOnly' } });
    }});
    assert.equal(calls, 6); assert.equal(reset.checksum, CANONICAL_DEMO_CHECKSUM);
    const evidence = await verifyHostedDemoDeployment({ expectedRuntimeRef: runtimeRef, expectedFrontendRef: frontendRef,
      fetchImpl: async (url, options) => {
        const customer = new URL(url).origin === CUSTOMER;
        assert.equal(options.headers.get('x-cm-demo-acceptance'), process.env[customer
          ? 'CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN' : 'CM_DEMO_PLATFORM_ACCEPTANCE_TOKEN']);
        return new Response(JSON.stringify({ schemaVersion: 1, provider: 'render',
          repository: 'floriankreutzer/conference-manager-api', branch: 'main', runtimeRef, frontendRef,
          serviceName: customer ? 'conference-manager-demo' : 'conference-manager-ops-demo' }),
          { headers: { 'content-type': 'application/json' } });
      }});
    assert.equal(evidence.length, 2);
    await assert.rejects(verifyHostedDemoDeployment({ expectedRuntimeRef: runtimeRef, expectedFrontendRef: frontendRef,
      fetchImpl: async () => new Response(JSON.stringify({ schemaVersion: 1, provider: 'render',
        repository: 'floriankreutzer/conference-manager-api', branch: 'main', runtimeRef: process.env.CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN,
        frontendRef, serviceName: 'conference-manager-demo' }), { headers: { 'content-type': 'application/json' } }) }),
      (error) => error.message === 'HOSTED_DEMO_DEPLOYMENT_IDENTITY_MISMATCH');
  `);
});

test('gated failure audit retains exact correlation and bounded reason evidence without raw output', async (t) => {
  const { root } = await guarded(t, `
    const requestId = '10000000-0000-4000-8000-000000000001';
    const occurredAt = new Date().toISOString();
    const env = { ...process.env, HOSTED_ACCEPTANCE_STARTED_AT: new Date(Date.now() - 1000).toISOString() };
    let calls = 0;
    await readHostedDemoResetEvidence({ env, requestId, fetchImpl: async (url, options) => {
      calls += 1; assert.equal(new URL(url).origin, PLATFORM);
      assert.equal(options.headers.get('x-cm-demo-acceptance'), process.env.CM_DEMO_PLATFORM_ACCEPTANCE_TOKEN);
      const body = url.includes('/audit/events') ? { items: [{ action: 'platform.recovery.executed', outcome: 'failure',
        metadata: { operation: 'reset', reasonCode: 'transaction_failed' }, correlationId: requestId, occurredAt }] }
        : { csrfToken: 'synthetic-csrf-value-at-least-thirty-two-characters' };
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json',
        'set-cookie': 'cm_platform_session=synthetic_session_1234567890; Secure; HttpOnly' } });
    }});
    assert.equal(calls, 3);
    await assert.rejects(readHostedDemoResetEvidence({ env, requestId: 'invalid', fetchImpl: async () => {
      throw new Error('network must not run');
    }}), /HOSTED_DEMO_DIAGNOSTIC_REQUEST_ID_INVALID/);
  `);
  const evidence = JSON.parse(await readFile(path.join(root, 'reset-audit.json'), 'utf8'));
  assert.deepEqual(Object.keys(evidence).sort(), ['correlationId', 'occurredAt', 'reasonCode']);
  assert.equal(evidence.reasonCode, 'transaction_failed');
  assert.equal(evidence.correlationId, '10000000-0000-4000-8000-000000000001');
  assert.equal(new Date(evidence.occurredAt).toISOString(), evidence.occurredAt);
});
