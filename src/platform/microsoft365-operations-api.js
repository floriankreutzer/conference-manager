const BASE_PATH = 'v1/integrations/microsoft365';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONNECTION_STATES = new Set(['pending', 'connected', 'degraded', 'revoked', 'disconnected']);
const PLACES_PERMISSION_STATES = new Set(['granted', 'missing', 'unknown']);
const CALENDAR_PERMISSION_STATES = new Set(['granted', 'missing', 'unverified', 'unknown']);
const HEALTH_STATES = new Set([
  'healthy',
  'degraded',
  'unavailable',
  'revoked',
  'permission_missing',
  'not_configured',
]);
const CONNECTION_REASONS = new Set([
  'calendars_permission_missing',
  'calendars_permission_unverified',
  'consent_denied',
  'consent_unavailable',
  'places_permission_missing',
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
const HEALTH_CAPABILITIES = Object.freeze({
  places: 'places',
  freeBusy: 'free_busy',
  calendarWrite: 'calendar_write',
});
const REQUIRED_PERMISSIONS = new Set(['Place.Read.All', 'Calendars.ReadBasic.All']);
const TENANT_STATUSES = new Set(['pending', 'onboarding', 'ready', 'active', 'suspended', 'archived']);
const MAX_ROOMS = 1_000;
const MAX_TEXT = 512;

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

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isUtcInstant(value) {
  return typeof value === 'string'
    && UTC_INSTANT_PATTERN.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function safeText(value, max = MAX_TEXT) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= max
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function optionalInstant(value) {
  return value === null || isUtcInstant(value);
}

function normalizedHealth(value, capability) {
  if (
    !exactKeys(value, ['capability', 'status', 'reason', 'lastCheckedAt', 'lastSuccessAt'])
    || value.capability !== capability
    || !HEALTH_STATES.has(value.status)
    || (value.reason !== null && !HEALTH_REASONS.has(value.reason))
    || !optionalInstant(value.lastCheckedAt)
    || !optionalInstant(value.lastSuccessAt)
  ) return null;
  return Object.freeze({
    capability,
    status: value.status,
    reason: value.reason,
    lastCheckedAt: value.lastCheckedAt,
    lastSuccessAt: value.lastSuccessAt,
  });
}

function normalizedConnectionPayload(payload) {
  if (!exactKeys(payload, ['connection', 'requestId']) || !isUuid(payload.requestId)) return null;
  const value = payload?.connection;
  if (
    !exactKeys(value, [
      'status',
      'placesPermission',
      'calendarsPermission',
      'reason',
      'lastVerifiedAt',
      'requiredPermissions',
      'capabilities',
    ])
    || !CONNECTION_STATES.has(value.status)
    || !PLACES_PERMISSION_STATES.has(value.placesPermission)
    || !CALENDAR_PERMISSION_STATES.has(value.calendarsPermission)
    || (value.reason !== null && !CONNECTION_REASONS.has(value.reason))
    || !optionalInstant(value.lastVerifiedAt)
    || !Array.isArray(value.requiredPermissions)
    || value.requiredPermissions.length !== REQUIRED_PERMISSIONS.size
    || new Set(value.requiredPermissions).size !== REQUIRED_PERMISSIONS.size
    || value.requiredPermissions.some((permission) => !REQUIRED_PERMISSIONS.has(permission))
    || !plain(value.capabilities)
    || Object.keys(value.capabilities).length !== Object.keys(HEALTH_CAPABILITIES).length
  ) return null;
  const health = {};
  for (const [key, capability] of Object.entries(HEALTH_CAPABILITIES)) {
    health[key] = normalizedHealth(value.capabilities[key], capability);
    if (!health[key]) return null;
  }
  return Object.freeze({
    state: value.status,
    reason: value.reason,
    lastVerifiedAt: value.lastVerifiedAt,
    permissions: Object.freeze({
      place: value.placesPermission,
      calendars: value.calendarsPermission,
    }),
    health: Object.freeze(health),
  });
}

function normalizedLocalRoom(value, roomId) {
  if (
    !exactKeys(value, ['id', 'siteId', 'name', 'capacity', 'active'])
    || !isUuid(value.id)
    || value.id.toLowerCase() !== roomId.toLowerCase()
    || !SAFE_LOCAL_ID.test(value.siteId || '')
    || !safeText(value.name, 160)
    || !Number.isSafeInteger(value.capacity)
    || value.capacity < 1
    || value.capacity > 100_000
    || typeof value.active !== 'boolean'
  ) return null;
  return Object.freeze({
    id: value.id.toLowerCase(),
    siteId: value.siteId,
    name: value.name,
    capacity: value.capacity,
    active: value.active,
  });
}

function normalizedMapping(value) {
  if (
    !exactKeys(value, [
      'roomId',
      'externalRoomId',
      'resourceAddress',
      'providerDisplayName',
      'providerCapacity',
      'providerStatus',
      'lastSeenAt',
      'localRoom',
    ])
    || !isUuid(value.roomId)
    || !safeText(value.externalRoomId)
    || !safeText(value.resourceAddress, 320)
    || !safeText(value.providerDisplayName, 160)
    || (
      value.providerCapacity !== null
      && (
        !Number.isSafeInteger(value.providerCapacity)
        || value.providerCapacity < 0
        || value.providerCapacity > 1_000_000
      )
    )
    || !['active', 'missing'].includes(value.providerStatus)
    || !isUtcInstant(value.lastSeenAt)
  ) return null;
  const localRoom = normalizedLocalRoom(value.localRoom, value.roomId);
  if (!localRoom) return null;
  return Object.freeze({
    roomId: value.roomId.toLowerCase(),
    providerName: value.providerDisplayName,
    providerCapacity: value.providerCapacity,
    providerStatus: value.providerStatus,
    lastSeenAt: value.lastSeenAt,
    localRoom,
  });
}

function normalizedMappingsPayload(payload) {
  if (
    !exactKeys(payload, ['mappings', 'requestId'])
    || !isUuid(payload.requestId)
    || !Array.isArray(payload.mappings)
    || payload.mappings.length > MAX_ROOMS
  ) return null;
  const mappings = payload.mappings.map(normalizedMapping);
  if (
    mappings.some((mapping) => !mapping)
    || new Set(mappings.map((mapping) => mapping.roomId)).size !== mappings.length
  ) return null;
  return Object.freeze(mappings);
}

const CHECK_KEYS = Object.freeze([
  'tenantIdentityClaimed',
  'microsoft365Connected',
  'placesPermissionGranted',
  'calendarPermissionGranted',
  'roomImported',
  'freeBusyVerified',
  'directoryEntitled',
  'calendarEntitled',
]);

function normalizedReadinessPayload(payload) {
  if (!exactKeys(payload, ['readiness', 'requestId']) || !isUuid(payload.requestId)) return null;
  const value = payload?.readiness;
  if (
    !exactKeys(value, ['tenantStatus', 'ready', 'checks', 'entitlements'])
    || !TENANT_STATUSES.has(value.tenantStatus)
    || typeof value.ready !== 'boolean'
    || !exactKeys(value.checks, CHECK_KEYS)
    || !CHECK_KEYS.every((key) => typeof value.checks[key] === 'boolean')
    || !exactKeys(value.entitlements, [
      'microsoftDirectory',
      'microsoftCalendar',
      'microsoftCalendarWrite',
    ])
    || !['microsoftDirectory', 'microsoftCalendar', 'microsoftCalendarWrite']
      .every((key) => typeof value.entitlements[key] === 'boolean')
    || value.ready !== CHECK_KEYS.every((key) => value.checks[key])
    || value.checks.directoryEntitled !== value.entitlements.microsoftDirectory
    || value.checks.calendarEntitled !== value.entitlements.microsoftCalendar
  ) return null;
  return Object.freeze({
    tenantStatus: value.tenantStatus,
    ready: value.ready,
    checks: Object.freeze(Object.fromEntries(CHECK_KEYS.map((key) => [key, value.checks[key]]))),
    entitlements: Object.freeze({
      microsoftDirectory: value.entitlements.microsoftDirectory,
      microsoftCalendar: value.entitlements.microsoftCalendar,
      microsoftCalendarWrite: value.entitlements.microsoftCalendarWrite,
    }),
  });
}

function apiError(error, fallback) {
  return new Microsoft365OperationsApiError(error?.serverCode || error?.code || fallback, { cause: error });
}

export class Microsoft365OperationsApiError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'Microsoft365OperationsApiError';
    this.code = code;
  }
}

export function createMicrosoft365OperationsApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('API_CLIENT_REQUIRED');

  async function connection() {
    let payload;
    try {
      payload = await apiClient.request(BASE_PATH);
    } catch (error) {
      throw apiError(error, 'MICROSOFT365_OPERATIONS_UNAVAILABLE');
    }
    const result = normalizedConnectionPayload(payload);
    if (!result) throw new Microsoft365OperationsApiError('MICROSOFT365_OPERATIONS_RESPONSE_INVALID');
    return result;
  }

  async function mappings() {
    let payload;
    try {
      payload = await apiClient.request(`${BASE_PATH}/room-mappings`);
    } catch (error) {
      throw apiError(error, 'MICROSOFT365_OPERATIONS_UNAVAILABLE');
    }
    const result = normalizedMappingsPayload(payload);
    if (!result) throw new Microsoft365OperationsApiError('MICROSOFT365_OPERATIONS_RESPONSE_INVALID');
    return result;
  }

  async function readiness() {
    let payload;
    try {
      payload = await apiClient.request(`${BASE_PATH}/pilot-readiness`);
    } catch (error) {
      throw apiError(error, 'MICROSOFT365_OPERATIONS_UNAVAILABLE');
    }
    const result = normalizedReadinessPayload(payload);
    if (!result) throw new Microsoft365OperationsApiError('MICROSOFT365_OPERATIONS_RESPONSE_INVALID');
    return result;
  }

  return Object.freeze({
    async getOperations() {
      const [connectionValue, mappingsValue, readinessValue] = await Promise.all([
        connection(),
        mappings(),
        readiness(),
      ]);
      return Object.freeze({
        connection: connectionValue,
        mappings: mappingsValue,
        readiness: readinessValue,
      });
    },

    async synchronizeMappings() {
      let payload;
      try {
        payload = await apiClient.request(`${BASE_PATH}/room-mappings/sync`, { method: 'POST' });
      } catch (error) {
        throw apiError(error, 'MICROSOFT365_RESYNC_FAILED');
      }
      const result = normalizedMappingsPayload(payload);
      if (!result) throw new Microsoft365OperationsApiError('MICROSOFT365_OPERATIONS_RESPONSE_INVALID');
      return result;
    },
  });
}
