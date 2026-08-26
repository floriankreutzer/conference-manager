const BASE_PATH = 'v1/integrations/microsoft365';
const MAX_ROOMS = 1_000;
const MAX_TEXT = 512;
const SAFE_LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const TENANT_STATUSES = new Set(['pending', 'onboarding', 'ready', 'active', 'suspended']);

export class Microsoft365OnboardingApiError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'Microsoft365OnboardingApiError';
    this.code = code;
  }
}

function plain(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function text(value, { required = false } = {}) {
  if (value === null || value === undefined) {
    if (required) throw new Microsoft365OnboardingApiError('ONBOARDING_RESPONSE_INVALID');
    return null;
  }
  if (typeof value !== 'string' || value.length < (required ? 1 : 0) || value.length > MAX_TEXT) {
    throw new Microsoft365OnboardingApiError('ONBOARDING_RESPONSE_INVALID');
  }
  return value;
}

function room(value) {
  if (!plain(value)) throw new Microsoft365OnboardingApiError('ONBOARDING_RESPONSE_INVALID');
  const capacity = value.capacity === null || value.capacity === undefined
    ? null
    : value.capacity;
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 0 || capacity > 1_000_000)) {
    throw new Microsoft365OnboardingApiError('ONBOARDING_RESPONSE_INVALID');
  }
  return Object.freeze({
    id: text(value.externalRoomId, { required: true }),
    name: text(value.displayName, { required: true }),
    address: text(value.resourceAddress, { required: true }),
    capacity,
    building: text(value.building),
    floorLabel: text(value.floorLabel),
  });
}

function roomsPayload(payload) {
  if (!plain(payload) || !Array.isArray(payload.rooms) || payload.rooms.length > MAX_ROOMS) {
    throw new Microsoft365OnboardingApiError('ONBOARDING_RESPONSE_INVALID');
  }
  return Object.freeze(payload.rooms.map(room));
}

function mapping(value) {
  if (!plain(value)) throw new Microsoft365OnboardingApiError('ONBOARDING_RESPONSE_INVALID');
  return Object.freeze({
    roomId: text(value.roomId, { required: true }),
    externalRoomId: text(value.externalRoomId, { required: true }),
    providerStatus: text(value.providerStatus, { required: true }),
  });
}

function mappingsPayload(payload) {
  if (!plain(payload) || !Array.isArray(payload.mappings) || payload.mappings.length > MAX_ROOMS) {
    throw new Microsoft365OnboardingApiError('ONBOARDING_RESPONSE_INVALID');
  }
  return Object.freeze(payload.mappings.map(mapping));
}

function availabilityVerificationPayload(payload) {
  const value = payload?.verification;
  if (!plain(value) || value.verified !== true || typeof value.checkedAt !== 'string' || !UTC_ISO.test(value.checkedAt)) {
    throw new Microsoft365OnboardingApiError('ONBOARDING_RESPONSE_INVALID');
  }
  return Object.freeze({ verified: true, checkedAt: value.checkedAt });
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

function readinessPayload(payload) {
  const value = payload?.readiness;
  if (!plain(value) || !TENANT_STATUSES.has(value.tenantStatus) || typeof value.ready !== 'boolean') {
    throw new Microsoft365OnboardingApiError('ONBOARDING_RESPONSE_INVALID');
  }
  if (!plain(value.checks) || !CHECK_KEYS.every((key) => typeof value.checks[key] === 'boolean')) {
    throw new Microsoft365OnboardingApiError('ONBOARDING_RESPONSE_INVALID');
  }
  if (!plain(value.entitlements)) {
    throw new Microsoft365OnboardingApiError('ONBOARDING_RESPONSE_INVALID');
  }
  const entitlements = ['microsoftDirectory', 'microsoftCalendar', 'microsoftCalendarWrite'];
  if (!entitlements.every((key) => typeof value.entitlements[key] === 'boolean')) {
    throw new Microsoft365OnboardingApiError('ONBOARDING_RESPONSE_INVALID');
  }
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

function requireLocalId(value) {
  if (typeof value !== 'string' || !SAFE_LOCAL_ID.test(value)) throw new TypeError('ROOM_SELECTION_INVALID');
  return value;
}

function selection(value) {
  if (!plain(value)) throw new TypeError('ROOM_SELECTION_INVALID');
  const externalRoomId = text(value.externalRoomId, { required: true });
  const siteId = requireLocalId(value.siteId);
  const name = text(value.name, { required: true });
  const capacity = value.capacity;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100_000) {
    throw new TypeError('ROOM_SELECTION_INVALID');
  }
  return Object.freeze({ externalRoomId, siteId, name, capacity });
}

export function createMicrosoft365OnboardingApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('API_CLIENT_REQUIRED');
  return Object.freeze({
    async discoverRooms() {
      return roomsPayload(await apiClient.request(`${BASE_PATH}/rooms`));
    },
    async listMappings() {
      return mappingsPayload(await apiClient.request(`${BASE_PATH}/room-mappings`));
    },
    async importRooms(selections) {
      if (!Array.isArray(selections) || selections.length < 1 || selections.length > MAX_ROOMS) {
        throw new TypeError('ROOM_SELECTION_INVALID');
      }
      const payload = { selections: selections.map(selection) };
      return mappingsPayload(await apiClient.request(`${BASE_PATH}/room-mappings/import`, {
        method: 'POST',
        body: payload,
      }));
    },
    async verifyFreeBusy() {
      return availabilityVerificationPayload(await apiClient.request(`${BASE_PATH}/free-busy/verify`, {
        method: 'POST',
      }));
    },
    async getReadiness() {
      return readinessPayload(await apiClient.request(`${BASE_PATH}/pilot-readiness`));
    },
  });
}
