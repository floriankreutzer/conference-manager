import assert from 'node:assert/strict';
import test from 'node:test';

import { resetHostedDemoBaseline } from '../scripts/reset-hosted-demo-baseline.mjs';
import { verifyHostedDemoDeployment } from '../scripts/verify-hosted-demo-deployment.mjs';
import { hostedResetRequestIdPath } from '../scripts/hosted-demo-run-context.mjs';

const CUSTOMER_ORIGIN = 'https://conference-manager-demo.onrender.com';
const PLATFORM_ORIGIN = 'https://conference-manager-ops-demo.onrender.com';
const FRONTEND_REF = '07f2896d56e6f66a9f8daf96457ab12c763adf80';
const RUNTIME_REF = '8cdfc4468a8cfb421ceb42b0393e700c17c6bfaa';
const CHECKSUM = 'a'.repeat(64);

function jsonResponse(body, { status = 200, cookie = null } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
  if (cookie) headers.set('Set-Cookie', `${cookie}; Path=/; HttpOnly; Secure; SameSite=Strict`);
  return new Response(JSON.stringify(body), { status, headers });
}

function serviceNameFor(url) {
  const { origin } = new URL(url);
  if (origin === CUSTOMER_ORIGIN) return 'conference-manager-demo';
  if (origin === PLATFORM_ORIGIN) return 'conference-manager-ops-demo';
  throw new Error('TEST_HOSTED_DEMO_ORIGIN_INVALID');
}

function successfulCleanupResponses(secondChecksum = CHECKSUM) {
  return [
    jsonResponse(
      { csrfToken: 'a'.repeat(32) },
      { cookie: 'cm_platform_session=bootstrap_session_1234567890' },
    ),
    jsonResponse(
      { csrfToken: 'b'.repeat(32) },
      { cookie: 'cm_platform_session=security_admin_session_1234' },
    ),
    jsonResponse({ seedVersion: 'saas-3.5-shared-demo-v1', checksum: CHECKSUM }),
    jsonResponse(
      { csrfToken: 'c'.repeat(32) },
      { cookie: 'cm_platform_session=bootstrap_session_0987654321' },
    ),
    jsonResponse(
      { csrfToken: 'd'.repeat(32) },
      { cookie: 'cm_platform_session=security_admin_session_4321' },
    ),
    jsonResponse({ seedVersion: 'saas-3.5-shared-demo-v1', checksum: secondChecksum }),
  ];
}

test('hosted reset correlation path is isolated by GitHub run and attempt', () => {
  const first = hostedResetRequestIdPath({
    GITHUB_RUN_ID: '33406973636',
    GITHUB_RUN_ATTEMPT: '1',
  });
  const second = hostedResetRequestIdPath({
    GITHUB_RUN_ID: '33406973636',
    GITHUB_RUN_ATTEMPT: '2',
  });

  assert.match(first, /conference-manager-hosted-demo-reset-33406973636-1\.txt$/);
  assert.match(second, /conference-manager-hosted-demo-reset-33406973636-2\.txt$/);
  assert.notEqual(first, second);
  assert.equal(hostedResetRequestIdPath({}), null);
  assert.throws(
    () => hostedResetRequestIdPath({ GITHUB_RUN_ID: '../1', GITHUB_RUN_ATTEMPT: '1' }),
    /HOSTED_DEMO_RUN_CONTEXT_INVALID/,
  );
  assert.throws(
    () => hostedResetRequestIdPath({ GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: 'x' }),
    /HOSTED_DEMO_RUN_CONTEXT_INVALID/,
  );
});

test('hosted Demo failure cleanup proves a repeatable deterministic baseline with bounded requests', async () => {
  const calls = [];
  const responses = successfulCleanupResponses();
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return responses.shift();
  };

  const result = await resetHostedDemoBaseline({ fetchImpl, origin: PLATFORM_ORIGIN });

  assert.deepEqual(result, {
    seedVersion: 'saas-3.5-shared-demo-v1',
    checksum: CHECKSUM,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(calls.length, 6);
  assert.ok(calls.every(({ options }) => options.signal instanceof AbortSignal));
  assert.equal(calls[0].url, `${PLATFORM_ORIGIN}/api/v1/platform/demo/session`);
  assert.equal(calls[1].url, `${PLATFORM_ORIGIN}/api/v1/platform/demo/session/persona`);
  assert.equal(calls[2].url, `${PLATFORM_ORIGIN}/api/v1/platform/demo/reset`);
  assert.equal(calls[3].url, `${PLATFORM_ORIGIN}/api/v1/platform/demo/session`);
  assert.equal(calls[4].url, `${PLATFORM_ORIGIN}/api/v1/platform/demo/session/persona`);
  assert.equal(calls[5].url, `${PLATFORM_ORIGIN}/api/v1/platform/demo/reset`);
  assert.equal(calls[1].options.headers.Origin, PLATFORM_ORIGIN);
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'a'.repeat(32));
  assert.deepEqual(JSON.parse(calls[1].options.body), { persona: 'security_admin' });
  assert.equal(calls[2].options.headers.Cookie, 'cm_platform_session=security_admin_session_1234');
  assert.equal(calls[2].options.headers['X-CSRF-Token'], 'b'.repeat(32));
  assert.deepEqual(JSON.parse(calls[2].options.body), { confirm: true });
  assert.equal(calls[4].options.headers['X-CSRF-Token'], 'c'.repeat(32));
  assert.equal(calls[5].options.headers.Cookie, 'cm_platform_session=security_admin_session_4321');
  assert.equal(calls[5].options.headers['X-CSRF-Token'], 'd'.repeat(32));
});

test('hosted Demo cleanup rejects a non-repeatable baseline checksum', async () => {
  const responses = successfulCleanupResponses('b'.repeat(64));
  await assert.rejects(
    resetHostedDemoBaseline({ fetchImpl: async () => responses.shift(), origin: PLATFORM_ORIGIN }),
    /HOSTED_DEMO_RESET_REPEATABILITY_INVALID/,
  );
});

test('hosted Demo failure cleanup fails closed when reset cannot be proven', async () => {
  const responses = [
    jsonResponse(
      { csrfToken: 'a'.repeat(32) },
      { cookie: 'cm_platform_session=bootstrap_session_1234567890' },
    ),
    jsonResponse(
      { csrfToken: 'b'.repeat(32) },
      { cookie: 'cm_platform_session=security_admin_session_1234' },
    ),
    jsonResponse({ error: { code: 'PLATFORM_INTERNAL_ERROR' } }, { status: 500 }),
  ];
  await assert.rejects(
    resetHostedDemoBaseline({ fetchImpl: async () => responses.shift(), origin: PLATFORM_ORIGIN }),
    /HOSTED_DEMO_RESET_RESPONSE_INVALID/,
  );
  await assert.rejects(
    resetHostedDemoBaseline({ fetchImpl: async () => responses.shift(), origin: 'https://example.invalid' }),
    /HOSTED_DEMO_RESET_ORIGIN_INVALID/,
  );
});

function deploymentMetadata(serviceName, overrides = {}) {
  return {
    schemaVersion: 1,
    provider: 'render',
    repository: 'floriankreutzer/conference-manager-api',
    branch: 'main',
    serviceName,
    runtimeRef: RUNTIME_REF,
    frontendRef: FRONTEND_REF,
    ...overrides,
  };
}

test('hosted acceptance verifies build-bound metadata from both public services with bounded requests', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return jsonResponse(deploymentMetadata(serviceNameFor(url)));
  };

  const result = await verifyHostedDemoDeployment({
    fetchImpl,
    customerOrigin: CUSTOMER_ORIGIN,
    platformOrigin: PLATFORM_ORIGIN,
    expectedRuntimeRef: RUNTIME_REF,
    expectedFrontendRef: FRONTEND_REF,
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].serviceName, 'conference-manager-demo');
  assert.equal(result[1].serviceName, 'conference-manager-ops-demo');
  assert.deepEqual(calls.map(({ url }) => url), [
    `${CUSTOMER_ORIGIN}/assets/hosted-demo-deployment.json`,
    `${PLATFORM_ORIGIN}/assets/hosted-demo-deployment.json`,
  ]);
  assert.ok(calls.every(({ options }) => options.signal instanceof AbortSignal));
});

test('hosted acceptance rejects stale, mutable, unexpected or unbounded deployment evidence', async () => {
  const cases = [
    deploymentMetadata('conference-manager-demo', { runtimeRef: 'b'.repeat(40) }),
    deploymentMetadata('conference-manager-demo', { frontendRef: 'main' }),
    deploymentMetadata('conference-manager-demo', { repository: 'someone/other-repository' }),
    deploymentMetadata('conference-manager-demo', { unexpected: 'field' }),
  ];
  for (const metadata of cases) {
    await assert.rejects(
      verifyHostedDemoDeployment({
        fetchImpl: async () => jsonResponse(metadata),
        customerOrigin: CUSTOMER_ORIGIN,
        platformOrigin: PLATFORM_ORIGIN,
        expectedRuntimeRef: RUNTIME_REF,
        expectedFrontendRef: FRONTEND_REF,
      }),
      /HOSTED_DEMO_DEPLOYMENT_(?:IDENTITY_MISMATCH|METADATA_INVALID)/,
    );
  }

  await assert.rejects(
    verifyHostedDemoDeployment({
      fetchImpl: async () => jsonResponse(deploymentMetadata('conference-manager-demo')),
      customerOrigin: 'https://example.invalid',
      platformOrigin: PLATFORM_ORIGIN,
      expectedRuntimeRef: RUNTIME_REF,
      expectedFrontendRef: FRONTEND_REF,
    }),
    /HOSTED_DEMO_DEPLOYMENT_ORIGIN_INVALID/,
  );
});
