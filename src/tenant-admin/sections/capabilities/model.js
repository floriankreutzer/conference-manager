const CAPABILITY_IDS = new Set([
  'tenant.user_administration',
  'tenant.audit_history',
  'tenant.configuration',
  'microsoft.directory',
  'microsoft.calendar',
  'microsoft.calendar.write',
]);
const REASON_CODES = new Set([
  'tenant_not_active',
  'tenant_state_unknown',
  'authority_missing',
  'rollout_state_unknown',
  'rollout_disabled',
  'entitlement_missing',
  'readiness_unknown',
  'tenant_identity_required',
  'microsoft_connection_required',
  'provider_permission_required',
  'verification_required',
  'provider_health_unknown',
  'provider_degraded',
  'provider_unavailable',
  'microsoft_reconnect_required',
  'readiness_stale',
]);

export function capabilityNameKey(id) {
  return CAPABILITY_IDS.has(id)
    ? `tenantAdmin.operations.capabilities.name.${id}`
    : 'tenantAdmin.operations.capabilities.name.unknown';
}

export function capabilityReasonKey(reason) {
  return REASON_CODES.has(reason)
    ? `tenantAdmin.operations.capabilities.reason.${reason}`
    : 'tenantAdmin.operations.capabilities.reason.unknown';
}

export function capabilityErrorKey(code) {
  if (code === 'HTTP_401') return 'tenantAdmin.operations.common.error.session';
  if (code === 'HTTP_403') return 'tenantAdmin.operations.common.error.forbidden';
  return 'tenantAdmin.operations.capabilities.error';
}
