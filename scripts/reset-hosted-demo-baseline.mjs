import { pathToFileURL } from 'node:url';

const PLATFORM_ORIGIN = 'https://conference-manager-ops-demo.onrender.com';
const SESSION_PATH = '/api/v1/platform/demo/session';
const PERSONA_PATH = '/api/v1/platform/demo/session/persona';
const RESET_PATH = '/api/v1/platform/demo/reset';
const SEED_VERSION = 'saas-3.5-shared-demo-v1';
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;

function requireOrigin(value) {
  if (value !== PLATFORM_ORIGIN) throw new Error('HOSTED_DEMO_RESET_ORIGIN_INVALID');
  return value;
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

export async function resetHostedDemoBaseline({
  fetchImpl = fetch,
  origin = process.env.SHARED_DEMO_PLATFORM_ORIGIN || PLATFORM_ORIGIN,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('HOSTED_DEMO_RESET_FETCH_REQUIRED');
  const targetOrigin = requireOrigin(origin);

  const establishedResponse = await fetchImpl(`${targetOrigin}${SESSION_PATH}`, {
    redirect: 'error',
  });
  const established = await jsonResponse(establishedResponse, 200);
  let cookie = sessionCookie(establishedResponse);

  const switchedResponse = await fetchImpl(`${targetOrigin}${PERSONA_PATH}`, {
    method: 'PUT',
    redirect: 'error',
    headers: {
      Cookie: cookie,
      Origin: targetOrigin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': requireCsrf(established.csrfToken),
    },
    body: JSON.stringify({ persona: 'security_admin' }),
  });
  const switched = await jsonResponse(switchedResponse, 200);
  cookie = sessionCookie(switchedResponse);

  const resetResponse = await fetchImpl(`${targetOrigin}${RESET_PATH}`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      Cookie: cookie,
      Origin: targetOrigin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': requireCsrf(switched.csrfToken),
    },
    body: JSON.stringify({ confirm: true }),
  });
  const reset = await jsonResponse(resetResponse, 200);
  if (reset.seedVersion !== SEED_VERSION || !CHECKSUM_PATTERN.test(reset.checksum || '')) {
    throw new Error('HOSTED_DEMO_RESET_RESULT_INVALID');
  }
  return Object.freeze({ seedVersion: reset.seedVersion, checksum: reset.checksum });
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  const result = await resetHostedDemoBaseline();
  process.stdout.write(`cleanup_seed_version=${result.seedVersion}\n`);
  process.stdout.write(`cleanup_checksum=${result.checksum}\n`);
}
