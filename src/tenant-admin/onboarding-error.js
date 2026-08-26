const SESSION_CODES = new Set(['UNAUTHENTICATED', 'AUTHENTICATION_FAILED']);
const ADMIN_CODES = new Set(['FORBIDDEN', 'ONBOARDING_UNAVAILABLE']);
const CONSENT_CODES = new Set(['CONSENT_DENIED', 'MICROSOFT365_CONSENT_DENIED']);
const REVOKED_CODES = new Set([
  'MICROSOFT365_CONNECTION_REVOKED',
  'MICROSOFT365_GRAPH_UNAUTHORIZED',
  'MICROSOFT365_TOKEN_INVALID',
]);
const PERMISSION_CODES = new Set([
  'MICROSOFT365_PLACES_PERMISSION_MISSING',
  'MICROSOFT365_GRAPH_PERMISSION_MISSING',
  'MICROSOFT365_FREE_BUSY_VERIFICATION_BLOCKED',
]);
const THROTTLED_CODES = new Set(['RATE_LIMITED', 'MICROSOFT365_GRAPH_THROTTLED']);
const UNAVAILABLE_CODES = new Set([
  'MICROSOFT365_CONNECTION_UNAVAILABLE',
  'MICROSOFT365_CONNECTION_SERVICE_UNAVAILABLE',
  'MICROSOFT365_GRAPH_UNAVAILABLE',
  'MICROSOFT365_ROOM_DISCOVERY_UNAVAILABLE',
  'MICROSOFT365_ROOM_MAPPING_UNAVAILABLE',
  'MICROSOFT365_FREE_BUSY_VERIFICATION_UNAVAILABLE',
]);
const CONFLICT_CODES = new Set([
  'HTTP_409',
  'ONBOARDING_CONFLICT',
  'MICROSOFT365_CONNECTION_REQUIRED',
  'MICROSOFT365_CONNECTION_STALE',
  'MICROSOFT365_PROVIDER_TENANT_MISMATCH',
]);

const GENERIC_KEYS = Object.freeze({
  connect: 'tenantAdmin.onboarding.connectionError',
  disconnect: 'tenantAdmin.onboarding.disconnectError',
  verify: 'tenantAdmin.onboarding.verificationError',
  discover: 'tenantAdmin.onboarding.roomDiscoveryError',
  import: 'tenantAdmin.onboarding.importError',
  availability: 'tenantAdmin.onboarding.availabilityError',
});

function errorCodes(error) {
  const codes = new Set();
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    if (typeof current.code === 'string') codes.add(current.code);
    if (typeof current.serverCode === 'string') codes.add(current.serverCode);
    current = current.cause;
  }
  return codes;
}

function containsAny(codes, candidates) {
  return [...candidates].some((code) => codes.has(code));
}

export function onboardingErrorKey(error, operation) {
  const codes = errorCodes(error);
  if (containsAny(codes, CONSENT_CODES)) return 'tenantAdmin.onboarding.error.consentDenied';
  if (containsAny(codes, REVOKED_CODES)) return 'tenantAdmin.onboarding.error.revoked';
  if (containsAny(codes, PERMISSION_CODES)) return 'tenantAdmin.onboarding.error.permissionMissing';
  if (containsAny(codes, THROTTLED_CODES)) return 'tenantAdmin.onboarding.error.throttled';
  if (containsAny(codes, UNAVAILABLE_CODES)) return 'tenantAdmin.onboarding.error.providerUnavailable';
  if (containsAny(codes, CONFLICT_CODES)) return 'tenantAdmin.onboarding.error.reconnect';
  if (containsAny(codes, SESSION_CODES) || codes.has('HTTP_401')) {
    return 'tenantAdmin.onboarding.error.session';
  }
  if (containsAny(codes, ADMIN_CODES) || codes.has('HTTP_403')) {
    return 'tenantAdmin.onboarding.error.adminRights';
  }
  if (codes.has('HTTP_429')) return 'tenantAdmin.onboarding.error.throttled';
  if (['HTTP_500', 'HTTP_502', 'HTTP_503', 'HTTP_504'].some((code) => codes.has(code))) {
    return 'tenantAdmin.onboarding.error.providerUnavailable';
  }
  if (codes.has('HTTP_400') || codes.has('VALIDATION_FAILED')) {
    return 'tenantAdmin.onboarding.error.validation';
  }
  return GENERIC_KEYS[operation] || 'tenantAdmin.onboarding.error';
}

export function connectionRecoveryKey(connection) {
  if (!connection || connection.state === 'connected') return null;
  if (connection.reason === 'consent_denied') return 'tenantAdmin.onboarding.error.consentDenied';
  if (connection.state === 'disconnected' && connection.reason === null) return null;
  if (
    connection.state === 'revoked'
    || connection.reason === 'provider_authorization_failed'
    || connection.reason === 'provider_binding_changed'
  ) return 'tenantAdmin.onboarding.error.revoked';
  if (
    connection.reason === 'places_permission_missing'
    || connection.reason === 'calendars_permission_missing'
    || connection.reason === 'calendars_permission_unverified'
  ) return 'tenantAdmin.onboarding.error.permissionMissing';
  if (connection.reason === 'provider_throttled') return 'tenantAdmin.onboarding.error.throttled';
  if (connection.state === 'degraded') return 'tenantAdmin.onboarding.error.providerUnavailable';
  return 'tenantAdmin.onboarding.error.reconnect';
}
