import {
  adapterError,
  booleanValue,
  boundedInteger,
  boundedStringList,
  boundedText,
  exactObject,
  immutable,
  internalUuid,
  positiveRevision,
  safeId,
  safeIdList,
  utcInstant,
} from './tenant-settings-wire.js';
import { createTenantBulkSettingsApi } from './tenant-bulk-settings-api.js';

const CURRENT_PATH = 'v1/tenant/settings/locations';
const HISTORY_PATH = `${CURRENT_PATH}/history`;
const ROLLBACK_PATH = `${CURRENT_PATH}/rollback`;
const PROVIDER_STATUSES = new Set(['active', 'missing']);
const ASSET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function timeZone(value, { nullable = true } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length > 128) invalid();
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value }).format();
  } catch {
    invalid();
  }
  return value;
}

export class TenantLocationSettingsApiError extends Error {
  constructor(code, { cause, serverCode = null, currentRevision = null } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'TenantLocationSettingsApiError';
    this.code = code;
    this.serverCode = serverCode;
    this.currentRevision = currentRevision;
  }
}

function invalid(code = 'TENANT_LOCATIONS_RESPONSE_INVALID') {
  throw new TenantLocationSettingsApiError(code);
}

function nullableText(value, maximum, code) {
  if (value === null) return null;
  return boundedText(value, { code, maximum });
}

function address(value) {
  if (value === null) return null;
  exactObject(value, ['line1', 'line2', 'postalCode', 'city', 'countryCode'], 'TENANT_LOCATIONS_RESPONSE_INVALID');
  if (!/^[A-Z]{2}$/.test(value.countryCode)) invalid();
  return Object.freeze({
    line1: boundedText(value.line1, { code: 'TENANT_LOCATIONS_RESPONSE_INVALID', maximum: 160 }),
    line2: nullableText(value.line2, 160, 'TENANT_LOCATIONS_RESPONSE_INVALID'),
    postalCode: boundedText(value.postalCode, { code: 'TENANT_LOCATIONS_RESPONSE_INVALID', maximum: 32 }),
    city: boundedText(value.city, { code: 'TENANT_LOCATIONS_RESPONSE_INVALID', maximum: 120 }),
    countryCode: value.countryCode,
  });
}

function site(value, options) {
  exactObject(value, ['id', 'name', 'active', 'timeZone', 'address'], 'TENANT_LOCATIONS_RESPONSE_INVALID');
  return Object.freeze({
    id: safeId(value.id, 'TENANT_LOCATIONS_RESPONSE_INVALID'),
    name: boundedText(value.name, { code: 'TENANT_LOCATIONS_RESPONSE_INVALID', maximum: 160 }),
    active: booleanValue(value.active, 'TENANT_LOCATIONS_RESPONSE_INVALID'),
    timeZone: timeZone(value.timeZone, options),
    address: address(value.address),
  });
}

function room(value) {
  exactObject(value, [
    'id', 'siteId', 'name', 'capacity', 'active', 'floor', 'equipment', 'accessibility',
    'serviceIds', 'cateringPackageIds', 'floorplanAssetId', 'mediaAssetIds',
  ], 'TENANT_LOCATIONS_RESPONSE_INVALID');
  if (
    value.floorplanAssetId !== null
    && (typeof value.floorplanAssetId !== 'string' || !ASSET_ID.test(value.floorplanAssetId))
  ) invalid();
  if (!Array.isArray(value.mediaAssetIds) || value.mediaAssetIds.length > 20
    || value.mediaAssetIds.some((assetId) => typeof assetId !== 'string' || !ASSET_ID.test(assetId))
    || new Set(value.mediaAssetIds).size !== value.mediaAssetIds.length) invalid();
  return Object.freeze({
    id: safeId(value.id, 'TENANT_LOCATIONS_RESPONSE_INVALID'),
    siteId: safeId(value.siteId, 'TENANT_LOCATIONS_RESPONSE_INVALID'),
    name: boundedText(value.name, { code: 'TENANT_LOCATIONS_RESPONSE_INVALID', maximum: 160 }),
    capacity: boundedInteger(value.capacity, 'TENANT_LOCATIONS_RESPONSE_INVALID', { minimum: 1, maximum: 100_000 }),
    active: booleanValue(value.active, 'TENANT_LOCATIONS_RESPONSE_INVALID'),
    floor: nullableText(value.floor, 80, 'TENANT_LOCATIONS_RESPONSE_INVALID'),
    equipment: boundedStringList(value.equipment, 'TENANT_LOCATIONS_RESPONSE_INVALID'),
    accessibility: boundedStringList(value.accessibility, 'TENANT_LOCATIONS_RESPONSE_INVALID', { count: 20, length: 80 }),
    serviceIds: safeIdList(value.serviceIds, 'TENANT_LOCATIONS_RESPONSE_INVALID', 200),
    cateringPackageIds: safeIdList(value.cateringPackageIds, 'TENANT_LOCATIONS_RESPONSE_INVALID', 200),
    floorplanAssetId: value.floorplanAssetId,
    mediaAssetIds: Object.freeze([...value.mediaAssetIds]),
  });
}

function configuration(value, options = { nullable: true }) {
  exactObject(value, ['sites', 'rooms'], 'TENANT_LOCATIONS_RESPONSE_INVALID');
  if (!Array.isArray(value.sites) || value.sites.length > 200 || !Array.isArray(value.rooms) || value.rooms.length > 2_000) invalid();
  const sites = value.sites.map((entry) => site(entry, options));
  const rooms = value.rooms.map(room);
  if (new Set(sites.map((entry) => entry.id)).size !== sites.length || new Set(rooms.map((entry) => entry.id)).size !== rooms.length) invalid();
  const siteIds = new Set(sites.map((entry) => entry.id));
  if (rooms.some((entry) => !siteIds.has(entry.siteId))) invalid();
  const siteById = new Map(sites.map((entry) => [entry.id, entry]));
  if (rooms.some((entry) => entry.active && !siteById.get(entry.siteId).active)) invalid();
  if (new Set(rooms.flatMap((entry) => entry.serviceIds)).size > 2_000
    || new Set(rooms.flatMap((entry) => entry.cateringPackageIds)).size > 2_000) invalid();
  return Object.freeze({ sites: Object.freeze(sites), rooms: Object.freeze(rooms) });
}

function provider(value) {
  exactObject(value, ['roomId', 'provider', 'status', 'displayName', 'capacity', 'lastSeenAt'], 'TENANT_LOCATIONS_RESPONSE_INVALID');
  if (value.provider !== 'microsoft365' || !PROVIDER_STATUSES.has(value.status)) invalid();
  return Object.freeze({
    roomId: safeId(value.roomId, 'TENANT_LOCATIONS_RESPONSE_INVALID'),
    provider: value.provider,
    status: value.status,
    displayName: boundedText(value.displayName, { code: 'TENANT_LOCATIONS_RESPONSE_INVALID', maximum: 512 }),
    capacity: value.capacity === null ? null : boundedInteger(value.capacity, 'TENANT_LOCATIONS_RESPONSE_INVALID', { maximum: 1_000_000 }),
    lastSeenAt: utcInstant(value.lastSeenAt, 'TENANT_LOCATIONS_RESPONSE_INVALID'),
  });
}

function envelope(value) {
  exactObject(value, ['schemaVersion', 'revision', 'configuration', 'providerContext'], 'TENANT_LOCATIONS_RESPONSE_INVALID');
  if (value.schemaVersion !== 1 || !Array.isArray(value.providerContext) || value.providerContext.length > 2_000) invalid();
  const normalizedConfiguration = configuration(value.configuration);
  const providerContext = value.providerContext.map(provider);
  if (new Set(providerContext.map((entry) => entry.roomId)).size !== providerContext.length) invalid();
  const roomIds = new Set(normalizedConfiguration.rooms.map((entry) => entry.id));
  if (providerContext.some((entry) => !roomIds.has(entry.roomId))) invalid();
  return Object.freeze({
    schemaVersion: 1,
    revision: positiveRevision(value.revision, 'TENANT_LOCATIONS_RESPONSE_INVALID'),
    configuration: normalizedConfiguration,
    providerContext: Object.freeze(providerContext),
  });
}

function wrapped(value) {
  exactObject(value, ['locations'], 'TENANT_LOCATIONS_RESPONSE_INVALID');
  return envelope(value.locations);
}

function history(value) {
  exactObject(value, ['history'], 'TENANT_LOCATIONS_HISTORY_RESPONSE_INVALID');
  if (!Array.isArray(value.history) || value.history.length > 100) invalid('TENANT_LOCATIONS_HISTORY_RESPONSE_INVALID');
  const entries = value.history.map((entry) => {
    exactObject(entry, ['revision', 'changedAt', 'actorUserId'], 'TENANT_LOCATIONS_HISTORY_RESPONSE_INVALID');
    return immutable({
      revision: positiveRevision(entry.revision, 'TENANT_LOCATIONS_HISTORY_RESPONSE_INVALID'),
      changedAt: utcInstant(entry.changedAt, 'TENANT_LOCATIONS_HISTORY_RESPONSE_INVALID'),
      actorUserId: internalUuid(entry.actorUserId, 'TENANT_LOCATIONS_HISTORY_RESPONSE_INVALID'),
    });
  });
  if (new Set(entries.map((entry) => entry.revision)).size !== entries.length) invalid('TENANT_LOCATIONS_HISTORY_RESPONSE_INVALID');
  return Object.freeze(entries);
}

export function createTenantLocationSettingsApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('TENANT_LOCATION_API_CLIENT_REQUIRED');
  const bulk = createTenantBulkSettingsApi({
    apiClient,
    basePath: CURRENT_PATH,
    types: ['sites', 'rooms'],
    normalizeApplied: wrapped,
  });
  return Object.freeze({
    ...bulk,
    async loadLocations() {
      try { return wrapped(await apiClient.request(CURRENT_PATH)); }
      catch (error) { throw adapterError(TenantLocationSettingsApiError, error, 'TENANT_LOCATIONS_UNAVAILABLE'); }
    },
    async saveLocations({ expectedRevision, configuration: value } = {}) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) invalid('TENANT_LOCATIONS_REVISION_INVALID');
      try {
        const normalized = configuration(value, { nullable: false });
        return wrapped(await apiClient.request(CURRENT_PATH, {
          method: 'PUT',
          body: { schemaVersion: 1, expectedRevision, configuration: normalized },
        }));
      } catch (error) {
        throw adapterError(TenantLocationSettingsApiError, error, 'TENANT_LOCATIONS_UPDATE_FAILED');
      }
    },
    async listLocationsHistory({ limit = 50 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) invalid('TENANT_LOCATIONS_HISTORY_QUERY_INVALID');
      try { return history(await apiClient.request(`${HISTORY_PATH}?limit=${limit}`)); }
      catch (error) { throw adapterError(TenantLocationSettingsApiError, error, 'TENANT_LOCATIONS_HISTORY_UNAVAILABLE'); }
    },
    async loadLocationRevision(revision) {
      if (!Number.isSafeInteger(revision) || revision < 1) invalid('TENANT_LOCATIONS_REVISION_INVALID');
      try {
        const payload = await apiClient.request(`${HISTORY_PATH}/${revision}`);
        exactObject(payload, ['revision'], 'TENANT_LOCATIONS_HISTORY_RESPONSE_INVALID');
        const snapshot = payload.revision;
        exactObject(snapshot, ['revision', 'configuration', 'changedAt', 'actorUserId'], 'TENANT_LOCATIONS_HISTORY_RESPONSE_INVALID');
        return immutable({
          revision: positiveRevision(snapshot.revision, 'TENANT_LOCATIONS_HISTORY_RESPONSE_INVALID'),
          configuration: configuration(snapshot.configuration),
          changedAt: utcInstant(snapshot.changedAt, 'TENANT_LOCATIONS_HISTORY_RESPONSE_INVALID'),
          actorUserId: internalUuid(snapshot.actorUserId, 'TENANT_LOCATIONS_HISTORY_RESPONSE_INVALID'),
        });
      } catch (error) {
        throw adapterError(TenantLocationSettingsApiError, error, 'TENANT_LOCATIONS_HISTORY_UNAVAILABLE');
      }
    },
    async rollbackLocations({ expectedRevision, sourceRevision } = {}) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !Number.isSafeInteger(sourceRevision) || sourceRevision < 1) {
        invalid('TENANT_LOCATIONS_REVISION_INVALID');
      }
      try {
        return wrapped(await apiClient.request(ROLLBACK_PATH, {
          method: 'POST',
          body: { schemaVersion: 1, expectedRevision, sourceRevision },
        }));
      } catch (error) {
        throw adapterError(TenantLocationSettingsApiError, error, 'TENANT_LOCATIONS_ROLLBACK_FAILED');
      }
    },
  });
}
