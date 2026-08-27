import {
  adapterError,
  boundedInteger,
  exactObject,
  immutable,
  internalUuid,
  positiveRevision,
  safeId,
  safeIdList,
  utcInstant,
} from './tenant-settings-wire.js';

const CURRENT_PATH = 'v1/tenant/settings/booking-policies';
const HISTORY_PATH = `${CURRENT_PATH}/history`;

export class TenantBookingPolicySettingsApiError extends Error {
  constructor(code, { cause, serverCode = null, currentRevision = null } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'TenantBookingPolicySettingsApiError';
    this.code = code;
    this.serverCode = serverCode;
    this.currentRevision = currentRevision;
  }
}

function invalid(code = 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID') {
  throw new TenantBookingPolicySettingsApiError(code);
}

function rules(value) {
  exactObject(value, [
    'minimumLeadTimeMinutes', 'maximumAdvanceMinutes', 'cancellationWindowMinutes',
    'changeWindowMinutes', 'maximumParticipants', 'allowedSiteIds', 'allowedRoomIds',
    'allowedServiceIds',
  ], 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID');
  const normalized = Object.freeze({
    minimumLeadTimeMinutes: boundedInteger(value.minimumLeadTimeMinutes, 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID', { maximum: 43_200 }),
    maximumAdvanceMinutes: boundedInteger(value.maximumAdvanceMinutes, 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID', { minimum: 1, maximum: 1_054_080 }),
    cancellationWindowMinutes: boundedInteger(value.cancellationWindowMinutes, 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID', { maximum: 43_200 }),
    changeWindowMinutes: boundedInteger(value.changeWindowMinutes, 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID', { maximum: 43_200 }),
    maximumParticipants: boundedInteger(value.maximumParticipants, 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID', { minimum: 1, maximum: 100_000 }),
    allowedSiteIds: safeIdList(value.allowedSiteIds, 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID'),
    allowedRoomIds: safeIdList(value.allowedRoomIds, 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID'),
    allowedServiceIds: safeIdList(value.allowedServiceIds, 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID'),
  });
  if (normalized.minimumLeadTimeMinutes > normalized.maximumAdvanceMinutes
    || normalized.cancellationWindowMinutes > normalized.maximumAdvanceMinutes
    || normalized.changeWindowMinutes > normalized.maximumAdvanceMinutes) invalid();
  return normalized;
}

function version(value) {
  exactObject(value, ['id', 'effectiveFrom', 'rules'], 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID');
  return Object.freeze({
    id: safeId(value.id, 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID'),
    effectiveFrom: utcInstant(value.effectiveFrom, 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID'),
    rules: rules(value.rules),
  });
}

function configuration(value) {
  exactObject(value, ['versions'], 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID');
  if (!Array.isArray(value.versions) || value.versions.length < 1 || value.versions.length > 128) invalid();
  const versions = value.versions.map(version);
  if (new Set(versions.map((entry) => entry.id)).size !== versions.length
    || new Set(versions.map((entry) => entry.effectiveFrom)).size !== versions.length) invalid();
  if (versions.some((entry, index) => index > 0 && entry.effectiveFrom <= versions[index - 1].effectiveFrom)) invalid();
  for (const key of ['allowedSiteIds', 'allowedRoomIds', 'allowedServiceIds']) {
    if (new Set(versions.flatMap((entry) => entry.rules[key])).size > 2_000) invalid();
  }
  return Object.freeze({ versions: Object.freeze(versions) });
}

function envelope(value) {
  exactObject(value, ['schemaVersion', 'revision', 'configuration'], 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID');
  if (value.schemaVersion !== 1) invalid();
  return Object.freeze({
    schemaVersion: 1,
    revision: positiveRevision(value.revision, 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID'),
    configuration: configuration(value.configuration),
  });
}

function wrapped(value) {
  exactObject(value, ['bookingPolicies'], 'TENANT_BOOKING_POLICIES_RESPONSE_INVALID');
  return envelope(value.bookingPolicies);
}

function history(value) {
  exactObject(value, ['history'], 'TENANT_BOOKING_POLICIES_HISTORY_RESPONSE_INVALID');
  if (!Array.isArray(value.history) || value.history.length > 100) invalid('TENANT_BOOKING_POLICIES_HISTORY_RESPONSE_INVALID');
  const entries = value.history.map((entry) => {
    exactObject(entry, ['revision', 'changedAt', 'actorUserId'], 'TENANT_BOOKING_POLICIES_HISTORY_RESPONSE_INVALID');
    return immutable({
      revision: positiveRevision(entry.revision, 'TENANT_BOOKING_POLICIES_HISTORY_RESPONSE_INVALID'),
      changedAt: utcInstant(entry.changedAt, 'TENANT_BOOKING_POLICIES_HISTORY_RESPONSE_INVALID'),
      actorUserId: internalUuid(entry.actorUserId, 'TENANT_BOOKING_POLICIES_HISTORY_RESPONSE_INVALID'),
    });
  });
  if (new Set(entries.map((entry) => entry.revision)).size !== entries.length) invalid('TENANT_BOOKING_POLICIES_HISTORY_RESPONSE_INVALID');
  return Object.freeze(entries);
}

export function createTenantBookingPolicySettingsApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('TENANT_BOOKING_POLICY_API_CLIENT_REQUIRED');
  return Object.freeze({
    async loadBookingPolicies() {
      try { return wrapped(await apiClient.request(CURRENT_PATH)); }
      catch (error) { throw adapterError(TenantBookingPolicySettingsApiError, error, 'TENANT_BOOKING_POLICIES_UNAVAILABLE'); }
    },
    async saveBookingPolicies({ expectedRevision, configuration: value } = {}) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) invalid('TENANT_BOOKING_POLICIES_REVISION_INVALID');
      try {
        const normalized = configuration(value);
        return wrapped(await apiClient.request(CURRENT_PATH, {
          method: 'PUT', body: { schemaVersion: 1, expectedRevision, configuration: normalized },
        }));
      } catch (error) {
        throw adapterError(TenantBookingPolicySettingsApiError, error, 'TENANT_BOOKING_POLICIES_UPDATE_FAILED');
      }
    },
    async listBookingPoliciesHistory({ limit = 50 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) invalid('TENANT_BOOKING_POLICIES_HISTORY_QUERY_INVALID');
      try { return history(await apiClient.request(`${HISTORY_PATH}?limit=${limit}`)); }
      catch (error) { throw adapterError(TenantBookingPolicySettingsApiError, error, 'TENANT_BOOKING_POLICIES_HISTORY_UNAVAILABLE'); }
    },
    async loadBookingPoliciesRevision(revision) {
      if (!Number.isSafeInteger(revision) || revision < 1) invalid('TENANT_BOOKING_POLICIES_REVISION_INVALID');
      try {
        const payload = await apiClient.request(`${HISTORY_PATH}/${revision}`);
        exactObject(payload, ['revision'], 'TENANT_BOOKING_POLICIES_HISTORY_RESPONSE_INVALID');
        const snapshot = payload.revision;
        exactObject(snapshot, ['revision', 'configuration', 'changedAt', 'actorUserId'], 'TENANT_BOOKING_POLICIES_HISTORY_RESPONSE_INVALID');
        return immutable({
          revision: positiveRevision(snapshot.revision, 'TENANT_BOOKING_POLICIES_HISTORY_RESPONSE_INVALID'),
          configuration: configuration(snapshot.configuration),
          changedAt: utcInstant(snapshot.changedAt, 'TENANT_BOOKING_POLICIES_HISTORY_RESPONSE_INVALID'),
          actorUserId: internalUuid(snapshot.actorUserId, 'TENANT_BOOKING_POLICIES_HISTORY_RESPONSE_INVALID'),
        });
      } catch (error) {
        throw adapterError(TenantBookingPolicySettingsApiError, error, 'TENANT_BOOKING_POLICIES_HISTORY_UNAVAILABLE');
      }
    },
  });
}
