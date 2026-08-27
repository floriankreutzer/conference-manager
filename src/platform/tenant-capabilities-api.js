const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CAPABILITY_IDS = Object.freeze([
  'tenant.user_administration',
  'tenant.audit_history',
  'tenant.configuration',
  'microsoft.directory',
  'microsoft.calendar',
  'microsoft.calendar.write',
]);
const CAPABILITY_ID_SET = new Set(CAPABILITY_IDS);
const OPTIONAL_CAPABILITIES = new Set(['microsoft.calendar.write']);
const STATES = new Set(['operational', 'blocked', 'degraded', 'not_entitled', 'unavailable']);
const TENANT_STATUSES = new Set([
  'pending',
  'onboarding',
  'ready',
  'active',
  'suspended',
  'archived',
  'unavailable',
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
const MICROSOFT_ACTION = Object.freeze({
  id: 'manage_microsoft_connection',
  href: '/settings/integrations/microsoft365',
});

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!plain(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isUtcInstant(value) {
  return typeof value === 'string'
    && UTC_INSTANT_PATTERN.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function normalizedAction(value) {
  if (value === null) return null;
  if (
    !exactKeys(value, ['id', 'href'])
    || value.id !== MICROSOFT_ACTION.id
    || value.href !== MICROSOFT_ACTION.href
  ) return undefined;
  return MICROSOFT_ACTION;
}

function normalizedCapability(value) {
  if (!exactKeys(value, ['id', 'availability', 'state', 'reasonCodes', 'action', 'lastCheckedAt'])) {
    return null;
  }
  const expectedAvailability = OPTIONAL_CAPABILITIES.has(value.id) ? 'optional' : 'included';
  if (
    !CAPABILITY_ID_SET.has(value.id)
    || value.availability !== expectedAvailability
    || !STATES.has(value.state)
    || !Array.isArray(value.reasonCodes)
    || value.reasonCodes.length > REASON_CODES.size
    || new Set(value.reasonCodes).size !== value.reasonCodes.length
    || value.reasonCodes.some((reason) => !REASON_CODES.has(reason))
    || (value.lastCheckedAt !== null && !isUtcInstant(value.lastCheckedAt))
  ) return null;
  const action = normalizedAction(value.action);
  if (action === undefined) return null;
  if (
    (value.state === 'operational' && (value.reasonCodes.length !== 0 || action !== null))
    || (value.state === 'not_entitled' && action !== null)
    || (value.state !== 'operational' && value.reasonCodes.length === 0)
  ) return null;
  return Object.freeze({
    id: value.id,
    availability: value.availability,
    state: value.state,
    reasonCodes: Object.freeze([...value.reasonCodes]),
    action,
    lastCheckedAt: value.lastCheckedAt,
  });
}

function normalizedSnapshot(value) {
  if (
    !exactKeys(value, [
      'readOnly',
      'evaluatedAt',
      'tenantStatus',
      'capabilities',
      'requestId',
    ])
    || typeof value.requestId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value.requestId)
    || value.readOnly !== true
    || !isUtcInstant(value.evaluatedAt)
    || !TENANT_STATUSES.has(value.tenantStatus)
    || !Array.isArray(value.capabilities)
    || value.capabilities.length !== CAPABILITY_IDS.length
  ) return null;
  const capabilities = value.capabilities.map(normalizedCapability);
  if (capabilities.some((capability) => !capability)) return null;
  const ids = new Set(capabilities.map((capability) => capability.id));
  if (ids.size !== CAPABILITY_IDS.length || CAPABILITY_IDS.some((id) => !ids.has(id))) return null;
  if (
    value.tenantStatus !== 'active'
    && capabilities.some((capability) => capability.state === 'operational')
  ) return null;
  const byId = new Map(capabilities.map((capability) => [capability.id, capability]));
  return Object.freeze({
    readOnly: true,
    evaluatedAt: value.evaluatedAt,
    tenantStatus: value.tenantStatus,
    capabilities: Object.freeze(CAPABILITY_IDS.map((id) => byId.get(id))),
  });
}

export class TenantCapabilitiesApiError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'TenantCapabilitiesApiError';
    this.code = code;
  }
}

export function createTenantCapabilitiesApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') {
    throw new TypeError('TENANT_CAPABILITIES_API_CLIENT_REQUIRED');
  }
  return Object.freeze({
    async loadCapabilities() {
      let payload;
      try {
        payload = await apiClient.request('v1/tenant/capabilities');
      } catch (error) {
        throw new TenantCapabilitiesApiError(error?.code || 'TENANT_CAPABILITIES_UNAVAILABLE', {
          cause: error,
        });
      }
      const snapshot = normalizedSnapshot(payload);
      if (!snapshot) throw new TenantCapabilitiesApiError('TENANT_CAPABILITIES_RESPONSE_INVALID');
      return snapshot;
    },
  });
}
