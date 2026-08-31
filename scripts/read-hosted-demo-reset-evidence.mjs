const PLATFORM_ORIGIN = 'https://conference-manager-ops-demo.onrender.com';
const SESSION_PATH = '/api/v1/platform/demo/session';
const PERSONA_PATH = '/api/v1/platform/demo/session/persona';
const AUDIT_PATH = '/api/v1/platform/audit/events?limit=100';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REASON_PATTERN = /^[a-z][a-z0-9_]{2,31}$/;

function sessionCookie(response) {
  const value = response.headers.get('set-cookie');
  const pair = value?.split(';', 1)[0] || '';
  if (!/^cm_platform_session=[A-Za-z0-9_-]{16,512}$/.test(pair)) {
    throw new Error('HOSTED_DEMO_DIAGNOSTIC_SESSION_COOKIE_INVALID');
  }
  return pair;
}

async function jsonResponse(response, expectedStatus) {
  const contentType = response.headers.get('content-type') || '';
  if (response.status !== expectedStatus || !contentType.startsWith('application/json')) {
    throw new Error('HOSTED_DEMO_DIAGNOSTIC_RESPONSE_INVALID');
  }
  return response.json();
}

function requireCsrf(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 512) {
    throw new Error('HOSTED_DEMO_DIAGNOSTIC_CSRF_INVALID');
  }
  return value;
}

function acceptanceStartedAt() {
  const value = process.env.HOSTED_ACCEPTANCE_STARTED_AT;
  const epoch = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    throw new Error('HOSTED_DEMO_DIAGNOSTIC_START_INVALID');
  }
  return epoch;
}

const establishedResponse = await fetch(`${PLATFORM_ORIGIN}${SESSION_PATH}`, {
  redirect: 'error',
});
const established = await jsonResponse(establishedResponse, 200);
let cookie = sessionCookie(establishedResponse);

const switchedResponse = await fetch(`${PLATFORM_ORIGIN}${PERSONA_PATH}`, {
  method: 'PUT',
  redirect: 'error',
  headers: {
    Cookie: cookie,
    Origin: PLATFORM_ORIGIN,
    'Content-Type': 'application/json',
    'X-CSRF-Token': requireCsrf(established.csrfToken),
  },
  body: JSON.stringify({ persona: 'security_admin' }),
});
await jsonResponse(switchedResponse, 200);
cookie = sessionCookie(switchedResponse);

const auditResponse = await fetch(`${PLATFORM_ORIGIN}${AUDIT_PATH}`, {
  redirect: 'error',
  headers: { Cookie: cookie },
});
const audit = await jsonResponse(auditResponse, 200);
if (!Array.isArray(audit.items) || audit.items.length > 100) {
  throw new Error('HOSTED_DEMO_DIAGNOSTIC_AUDIT_INVALID');
}

const startedAt = acceptanceStartedAt();
const failure = audit.items.find((item) => (
  item?.action === 'platform.recovery.executed'
  && item?.outcome === 'failure'
  && item?.metadata?.operation === 'reset'
  && Number.isFinite(Date.parse(item.occurredAt))
  && Date.parse(item.occurredAt) >= startedAt
));

if (!failure) {
  process.stdout.write('reset_failure_reason=not_available\n');
  process.stdout.write('reset_failure_correlation_id=not_available\n');
  process.stdout.write('reset_failure_occurred_at=not_available\n');
  process.exit(0);
}

const reasonCode = failure.metadata?.reasonCode;
if (!REASON_PATTERN.test(reasonCode || '') || !UUID_PATTERN.test(failure.correlationId || '')) {
  throw new Error('HOSTED_DEMO_DIAGNOSTIC_AUDIT_EVIDENCE_INVALID');
}
const occurredAt = new Date(failure.occurredAt).toISOString();
process.stdout.write(`reset_failure_reason=${reasonCode}\n`);
process.stdout.write(`reset_failure_correlation_id=${failure.correlationId}\n`);
process.stdout.write(`reset_failure_occurred_at=${occurredAt}\n`);
