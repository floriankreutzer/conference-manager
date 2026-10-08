import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_DEMO_CHECKSUM,
  resetHostedDemoBaseline,
} from '../scripts/reset-hosted-demo-baseline.mjs';
import { verifyHostedDemoDeployment } from '../scripts/verify-hosted-demo-deployment.mjs';
import { hostedResetRequestIdPath } from '../scripts/hosted-demo-run-context.mjs';

const CUSTOMER_ORIGIN = 'https://conference-manager-demo.onrender.com';
const PLATFORM_ORIGIN = 'https://conference-manager-ops-demo.onrender.com';
const FRONTEND_REF = '5d5102b4f9842ec704ff26441ebe96719324ddb0';
const RUNTIME_REF = 'c9f1e45565c268768c1b814b610bf5cab6b8650a';
const PREVIOUS_RUNTIME_REF = '9c0f75c3d414968c18df9117214f3dc62be52c13';
const ORIGINAL_RUNTIME_REF = '4c75825d10082cb3860c07485cf7c98c3b608233';
const ORIGINAL_CHECKSUM = '2a15426e761f6efb78409394888d6799e3f00c7e13500d8b937d1d0cece579f6';
const SEED_VERSION = 'saas-3.7-three-demo-customers-v1';
const CHECKSUM = CANONICAL_DEMO_CHECKSUM;
const LEGACY_RUNTIME_REF = 'e52c4c23227deb8a48af0070c255a80431ed3c6e';
const LEGACY_SEED_VERSION = 'saas-3.6-shared-demo-v5';
const LEGACY_CHECKSUM = '9ca1e544799627b72e64b0e3420fb342e35214e14c3506cf508eb22b56e27605';

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

function successfulCleanupResponses(firstChecksum = CHECKSUM, secondChecksum = firstChecksum, seedVersion = SEED_VERSION) {
  return [
    jsonResponse(
      { csrfToken: 'a'.repeat(32) },
      { cookie: 'cm_platform_session=bootstrap_session_1234567890' },
    ),
    jsonResponse(
      { csrfToken: 'b'.repeat(32) },
      { cookie: 'cm_platform_session=security_admin_session_1234' },
    ),
    jsonResponse({ seedVersion, checksum: firstChecksum }),
    jsonResponse(
      { csrfToken: 'c'.repeat(32) },
      { cookie: 'cm_platform_session=bootstrap_session_0987654321' },
    ),
    jsonResponse(
      { csrfToken: 'd'.repeat(32) },
      { cookie: 'cm_platform_session=security_admin_session_4321' },
    ),
    jsonResponse({ seedVersion, checksum: secondChecksum }),
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
    seedVersion: SEED_VERSION,
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

test('hosted Demo cleanup retains the original SaaS 3.7 runtime binding', async () => {
  const responses = successfulCleanupResponses(ORIGINAL_CHECKSUM);
  const result = await resetHostedDemoBaseline({
    fetchImpl: async () => responses.shift(), origin: PLATFORM_ORIGIN,
    expectedRuntimeRef: ORIGINAL_RUNTIME_REF,
  });
  assert.deepEqual(result, { seedVersion: SEED_VERSION, checksum: ORIGINAL_CHECKSUM });
  assert.equal(responses.length, 0);
});

test('corrected and original SaaS 3.7 runtimes reject each other\'s checksum', async () => {
  for (const [expectedRuntimeRef, checksum] of [
    [RUNTIME_REF, ORIGINAL_CHECKSUM], [ORIGINAL_RUNTIME_REF, CHECKSUM],
  ]) {
    const responses = successfulCleanupResponses(checksum);
    await assert.rejects(resetHostedDemoBaseline({
      fetchImpl: async () => responses.shift(), origin: PLATFORM_ORIGIN, expectedRuntimeRef,
    }), /HOSTED_DEMO_RESET_CANONICAL_CHECKSUM_INVALID/);
    assert.equal(responses.length, 0);
  }
});

test('hosted Demo cleanup retains the previous promoted SaaS 3.7 runtime binding', async () => {
  const responses = successfulCleanupResponses(CHECKSUM);
  const result = await resetHostedDemoBaseline({
    fetchImpl: async () => responses.shift(), origin: PLATFORM_ORIGIN,
    expectedRuntimeRef: PREVIOUS_RUNTIME_REF,
  });
  assert.deepEqual(result, { seedVersion: SEED_VERSION, checksum: CHECKSUM });
  assert.equal(responses.length, 0);
});

test('hosted Demo cleanup retains the exact accepted role/media and private Gitlink bindings', async () => {
  for (const expectedRuntimeRef of [
    '62ad13bce72d3d99e02a39b5f96f1078fecc7e2f',
    '96294cc4d65536b8b374177e293c74f5bc19dd69',
  ]) {
    const responses = successfulCleanupResponses(CHECKSUM);
    const result = await resetHostedDemoBaseline({
      fetchImpl: async () => responses.shift(), origin: PLATFORM_ORIGIN, expectedRuntimeRef,
    });
    assert.deepEqual(result, { seedVersion: SEED_VERSION, checksum: CHECKSUM });
    assert.equal(responses.length, 0);
  }
});

test('hosted Demo cleanup retains the explicit historical SaaS 3.6 runtime binding', async () => {
  const responses = successfulCleanupResponses(LEGACY_CHECKSUM, LEGACY_CHECKSUM, LEGACY_SEED_VERSION);
  const result = await resetHostedDemoBaseline({
    fetchImpl: async () => responses.shift(),
    origin: PLATFORM_ORIGIN,
    expectedRuntimeRef: LEGACY_RUNTIME_REF,
  });
  assert.deepEqual(result, { seedVersion: LEGACY_SEED_VERSION, checksum: LEGACY_CHECKSUM });
  assert.equal(responses.length, 0);
});

test('hosted Demo cleanup rejects cross-version seed substitution in either direction', async () => {
  for (const [runtimeRef, seedVersion, checksum] of [
    [RUNTIME_REF, LEGACY_SEED_VERSION, LEGACY_CHECKSUM],
    [LEGACY_RUNTIME_REF, SEED_VERSION, CHECKSUM],
  ]) {
    const responses = successfulCleanupResponses(checksum, checksum, seedVersion);
    await assert.rejects(
      resetHostedDemoBaseline({
        fetchImpl: async () => responses.shift(),
        origin: PLATFORM_ORIGIN,
        expectedRuntimeRef: runtimeRef,
      }),
      /HOSTED_DEMO_RESET_RESULT_INVALID/,
    );
    assert.equal(responses.length, 3, 'Reject wrong seed before attempting a second reset');
  }
});

test('hosted Demo cleanup rejects a historical checksum even with the current seed label', async () => {
  const responses = successfulCleanupResponses(LEGACY_CHECKSUM);
  await assert.rejects(
    resetHostedDemoBaseline({ fetchImpl: async () => responses.shift(), origin: PLATFORM_ORIGIN }),
    /HOSTED_DEMO_RESET_CANONICAL_CHECKSUM_INVALID/,
  );
});

test('hosted Demo cleanup rejects a non-repeatable baseline checksum', async () => {
  const responses = successfulCleanupResponses(CHECKSUM, 'b'.repeat(64));
  await assert.rejects(
    resetHostedDemoBaseline({ fetchImpl: async () => responses.shift(), origin: PLATFORM_ORIGIN }),
    /HOSTED_DEMO_RESET_REPEATABILITY_INVALID/,
  );
});

test('hosted Demo cleanup rejects a repeatable but non-canonical checksum', async () => {
  const responses = successfulCleanupResponses('a'.repeat(64));
  await assert.rejects(
    resetHostedDemoBaseline({ fetchImpl: async () => responses.shift(), origin: PLATFORM_ORIGIN }),
    /HOSTED_DEMO_RESET_CANONICAL_CHECKSUM_INVALID/,
  );
});

test('hosted Demo cleanup rejects unregistered runtime refs before network access', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error('UNEXPECTED_FETCH');
  };

  await assert.rejects(
    resetHostedDemoBaseline({
      fetchImpl,
      origin: PLATFORM_ORIGIN,
      expectedRuntimeRef: 'main',
    }),
    /HOSTED_DEMO_RESET_RUNTIME_REF_INVALID/,
  );
  await assert.rejects(
    resetHostedDemoBaseline({
      fetchImpl,
      origin: PLATFORM_ORIGIN,
      expectedRuntimeRef: 'b'.repeat(40),
    }),
    /HOSTED_DEMO_RESET_RUNTIME_REF_UNSUPPORTED/,
  );
  assert.equal(calls, 0);
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

test('hosted acceptance retries a bounded transient deployment-metadata outage', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (calls.length === 1) throw new TypeError('fetch failed', { cause: new Error('ECONNRESET') });
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
  assert.deepEqual(calls.map(({ url }) => url), [
    `${CUSTOMER_ORIGIN}/assets/hosted-demo-deployment.json`,
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
