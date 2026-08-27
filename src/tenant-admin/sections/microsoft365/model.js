const CONNECTION_REASONS = new Set([
  'calendars_permission_missing',
  'calendars_permission_unverified',
  'consent_denied',
  'consent_unavailable',
  'places_permission_missing',
  'provider_authorization_failed',
  'provider_binding_changed',
  'provider_response_invalid',
  'provider_tenant_mismatch',
  'provider_unauthorized',
  'provider_unavailable',
]);
const HEALTH_REASONS = new Set([
  'calendar_write_permission_missing',
  'free_busy_permission_missing',
  'places_permission_missing',
  'provider_authorization_failed',
  'provider_operation_failed',
  'provider_permission_missing',
  'provider_throttled',
  'provider_unavailable',
  'resource_mapping_invalid',
]);
const SESSION_CODES = new Set(['HTTP_401', 'SESSION_EXPIRED', 'SESSION_REVOKED']);
const FORBIDDEN_CODES = new Set(['HTTP_403', 'AUTHORIZATION_DENIED']);

export function microsoftConnectionReasonKey(reason) {
  return CONNECTION_REASONS.has(reason)
    ? `tenantAdmin.operations.microsoft365.reason.${reason}`
    : 'tenantAdmin.operations.microsoft365.reason.unknown';
}

export function microsoftHealthReasonKey(reason) {
  return HEALTH_REASONS.has(reason)
    ? `tenantAdmin.operations.microsoft365.reason.${reason}`
    : 'tenantAdmin.operations.microsoft365.reason.unknown';
}

export function microsoftOperationsErrorKey(code, operation = 'load') {
  if (SESSION_CODES.has(code)) return 'tenantAdmin.operations.common.error.session';
  if (FORBIDDEN_CODES.has(code)) return 'tenantAdmin.operations.common.error.forbidden';
  if (code === 'MICROSOFT365_GRAPH_THROTTLED') {
    return 'tenantAdmin.operations.microsoft365.error.throttled';
  }
  if (
    code === 'MICROSOFT365_CONNECTION_REVOKED'
    || code === 'MICROSOFT365_CONNECTION_REQUIRED'
  ) return 'tenantAdmin.operations.microsoft365.error.reconnect';
  return operation === 'sync'
    ? 'tenantAdmin.operations.microsoft365.error.sync'
    : 'tenantAdmin.operations.microsoft365.error.load';
}

export function mappingDrift(mapping) {
  return Object.freeze({
    missing: mapping.providerStatus === 'missing',
    name: mapping.providerStatus === 'active' && mapping.providerName !== mapping.localRoom.name,
    capacity: mapping.providerStatus === 'active'
      && mapping.providerCapacity !== null
      && mapping.providerCapacity !== mapping.localRoom.capacity,
  });
}
