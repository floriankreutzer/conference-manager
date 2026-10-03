import { pathToFileURL } from 'node:url';

const PLATFORM_ORIGIN = 'https://conference-manager-ops-demo.onrender.com';
const SESSION_PATH = '/api/v1/platform/demo/session';
const PERSONA_PATH = '/api/v1/platform/demo/session/persona';
const RESET_PATH = '/api/v1/platform/demo/reset';
const PINNED_RUNTIME_REF = 'f35603ab459f4df03ec0dbf3ee32a7452d53cfda';
const COMMIT_REF_PATTERN = /^[0-9a-f]{40}$/;
const SESSION_TIMEOUT_MS = 20_000;
const RESET_TIMEOUT_MS = 75_000;
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;
// Corrected source fixture validated by API CI 36631986215 and scenario CI.
export const CANONICAL_DEMO_CHECKSUM = '7e22005f1e9689fbea4ccfc75084f5f3d224fe10e60a6af23c1cb600f2b70014';
const HOSTED_BASELINES = Object.freeze({
  [PINNED_RUNTIME_REF]: Object.freeze({
    seedVersion: 'saas-3.7-three-demo-customers-v1',
    checksum: CANONICAL_DEMO_CHECKSUM,
  }),
  // Accepted role/media runtime and private-Gitlink successor retain their exact canonical binding.
  '62ad13bce72d3d99e02a39b5f96f1078fecc7e2f': Object.freeze({
    seedVersion: 'saas-3.7-three-demo-customers-v1',
    checksum: CANONICAL_DEMO_CHECKSUM,
  }),
  '96294cc4d65536b8b374177e293c74f5bc19dd69': Object.freeze({
    seedVersion: 'saas-3.7-three-demo-customers-v1',
    checksum: CANONICAL_DEMO_CHECKSUM,
  }),
  // Previous guest-projection runtime retained only for bounded historical cleanup evidence.
  '9c0f75c3d414968c18df9117214f3dc62be52c13': Object.freeze({
    seedVersion: 'saas-3.7-three-demo-customers-v1',
    checksum: CANONICAL_DEMO_CHECKSUM,
  }),
  // Previous corrected SaaS 3.7 runtime before the guest Room projection fix.
  '8e4dedd1a676a2dab26bc4ec812876eac98fc282': Object.freeze({
    seedVersion: 'saas-3.7-three-demo-customers-v1',
    checksum: CANONICAL_DEMO_CHECKSUM,
  }),
  // Original SaaS 3.7 initialization/readback: API run 36534239500.
  '4c75825d10082cb3860c07485cf7c98c3b608233': Object.freeze({
    seedVersion: 'saas-3.7-three-demo-customers-v1',
    checksum: '2a15426e761f6efb78409394888d6799e3f00c7e13500d8b937d1d0cece579f6',
  }),
  // Historical binding is explicit; neither runtime accepts the other seed/checksum.
  e52c4c23227deb8a48af0070c255a80431ed3c6e: Object.freeze({
    seedVersion: 'saas-3.6-shared-demo-v5',
    checksum: '9ca1e544799627b72e64b0e3420fb342e35214e14c3506cf508eb22b56e27605',
  }),
});

function requireOrigin(value) {
  if (value !== PLATFORM_ORIGIN) throw new Error('HOSTED_DEMO_RESET_ORIGIN_INVALID');
  return value;
}

function requireBaseline(runtimeRef) {
  if (typeof runtimeRef !== 'string' || !COMMIT_REF_PATTERN.test(runtimeRef)) {
    throw new Error('HOSTED_DEMO_RESET_RUNTIME_REF_INVALID');
  }
  const baseline = HOSTED_BASELINES[runtimeRef];
  if (!baseline) throw new Error('HOSTED_DEMO_RESET_RUNTIME_REF_UNSUPPORTED');
  return baseline;
}

function requireCsrf(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 512) {
    throw new Error('HOSTED_DEMO_RESET_CSRF_INVALID');
  }
  return value;
}

function sessionCookie(response) {
  const value = response.headers.get('set-cookie');
  const pair = value?.split(';', 1)[0] || '';
  if (!/^cm_platform_session=[A-Za-z0-9_-]{16,512}$/.test(pair)) {
    throw new Error('HOSTED_DEMO_RESET_SESSION_COOKIE_INVALID');
  }
  return pair;
}

async function jsonResponse(response, expectedStatus) {
  const contentType = response.headers.get('content-type') || '';
  if (response.status !== expectedStatus || !contentType.startsWith('application/json')) {
    throw new Error('HOSTED_DEMO_RESET_RESPONSE_INVALID');
  }
  return response.json();
}

function requestOptions(options, timeoutMs) {
  return {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  };
}

async function performReset(fetchImpl, targetOrigin, baseline) {
  const establishedResponse = await fetchImpl(
    `${targetOrigin}${SESSION_PATH}`,
    requestOptions({ redirect: 'error' }, SESSION_TIMEOUT_MS),
  );
  const established = await jsonResponse(establishedResponse, 200);
  let cookie = sessionCookie(establishedResponse);

  const switchedResponse = await fetchImpl(`${targetOrigin}${PERSONA_PATH}`, requestOptions({
    method: 'PUT',
    redirect: 'error',
    headers: {
      Cookie: cookie,
      Origin: targetOrigin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': requireCsrf(established.csrfToken),
    },
    body: JSON.stringify({ persona: 'security_admin' }),
  }, SESSION_TIMEOUT_MS));
  const switched = await jsonResponse(switchedResponse, 200);
  cookie = sessionCookie(switchedResponse);

  const resetResponse = await fetchImpl(`${targetOrigin}${RESET_PATH}`, requestOptions({
    method: 'POST',
    redirect: 'error',
    headers: {
      Cookie: cookie,
      Origin: targetOrigin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': requireCsrf(switched.csrfToken),
    },
    body: JSON.stringify({ confirm: true }),
  }, RESET_TIMEOUT_MS));
  const reset = await jsonResponse(resetResponse, 200);
  if (reset.seedVersion !== baseline.seedVersion || !CHECKSUM_PATTERN.test(reset.checksum || '')) {
    throw new Error('HOSTED_DEMO_RESET_RESULT_INVALID');
  }
  return reset.checksum;
}

export async function resetHostedDemoBaseline({
  fetchImpl = fetch,
  origin = process.env.SHARED_DEMO_PLATFORM_ORIGIN || PLATFORM_ORIGIN,
  expectedRuntimeRef = process.env.EXPECTED_RUNTIME_REF || PINNED_RUNTIME_REF,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('HOSTED_DEMO_RESET_FETCH_REQUIRED');
  const baseline = requireBaseline(expectedRuntimeRef);
  const targetOrigin = requireOrigin(origin);

  const firstChecksum = await performReset(fetchImpl, targetOrigin, baseline);
  const secondChecksum = await performReset(fetchImpl, targetOrigin, baseline);
  if (secondChecksum !== firstChecksum) {
    throw new Error('HOSTED_DEMO_RESET_REPEATABILITY_INVALID');
  }
  if (secondChecksum !== baseline.checksum) {
    throw new Error('HOSTED_DEMO_RESET_CANONICAL_CHECKSUM_INVALID');
  }

  return Object.freeze({ seedVersion: baseline.seedVersion, checksum: secondChecksum });
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  const result = await resetHostedDemoBaseline();
  process.stdout.write(`cleanup_seed_version=${result.seedVersion}\n`);
  process.stdout.write(`cleanup_checksum=${result.checksum}\n`);
  process.stdout.write('cleanup_repeatable=true\n');
}
