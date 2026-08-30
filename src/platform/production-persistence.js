import { isProductionTimeZone } from '../core/production-time.js';
import {
  PRODUCTION_CATALOG_SECTIONS,
  normalizeProductionBookingChangeEnvelope,
  normalizeProductionCatalog,
  normalizeProductionCatalogPage,
  normalizeProductionRequestDetailEnvelope,
  normalizeProductionRequestDraft,
  normalizeProductionRequestHistoryPage,
  normalizeProductionRequestListPage,
  normalizeProductionRequestMutationEnvelope,
  normalizeProductionRequestReportPage,
} from './production-request-wire.js';

const DOMAIN_ENDPOINTS = Object.freeze({
  profile: 'v1/application/profile',
  catalog: 'v1/application/catalog',
  siteInfo: 'v1/application/site-info',
  requests: 'v1/application/requests',
  roomAvailability: 'v1/application/room-availability',
  notifications: 'v1/application/notifications',
  configuration: 'v1/application/configuration',
});

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CURRENCY = /^[A-Z]{3}$/;
const REQUEST_STATUSES = new Set([
  'Submitted',
  'In Review',
  'Confirmed',
  'Rejected',
  'Change Requested',
  'Cancelled',
]);
const REASON_REQUEST_STATUSES = new Set(['Rejected', 'Change Requested']);
const MAX_COLLECTION = 2_000;
const MAX_TEXT = 160;
const MAX_PARTICIPANTS = 100_000;
const BOOKING_CHANGE_STATUSES = new Set(['pending', 'applying', 'applied', 'rejected']);

export class ProductionPersistenceError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'ProductionPersistenceError';
    this.code = code;
  }
}

function assertPlainObject(value, code = 'PRODUCTION_DATA_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProductionPersistenceError(code);
  return value;
}

function assertCollection(value, code) {
  if (!Array.isArray(value) || value.length > MAX_COLLECTION) throw new ProductionPersistenceError(code);
  return Object.freeze(value.map((entry) => Object.freeze({ ...assertPlainObject(entry, code) })));
}

function assertExactObject(value, keys, code) {
  const object = assertPlainObject(value, code);
  const actual = Object.keys(object);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new ProductionPersistenceError(code);
  }
  return object;
}

function assertText(value, code, { max = MAX_TEXT, nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > max
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/.test(value)
  ) throw new ProductionPersistenceError(code);
  return value;
}

function assertPublicId(value, code) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new ProductionPersistenceError(code);
  return value;
}

function assertCanonicalUtc(value, code) {
  if (typeof value !== 'string' || !UTC_INSTANT.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new ProductionPersistenceError(code);
  }
  const canonical = new Date(value).toISOString();
  if (value !== canonical && value !== canonical.replace(/\.000Z$/, 'Z')) {
    throw new ProductionPersistenceError(code);
  }
  return value;
}

function normalizedCollection(value, code, normalize) {
  if (!Array.isArray(value) || value.length > MAX_COLLECTION) throw new ProductionPersistenceError(code);
  const entries = value.map((entry) => normalize(entry, code));
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new ProductionPersistenceError(code);
  return Object.freeze(entries);
}

function catalogSite(value, code) {
  const site = assertExactObject(value, ['id', 'name', 'active', 'timeZone'], code);
  const timeZone = site.timeZone;
  if (
    typeof site.active !== 'boolean'
    || (timeZone !== null && !isProductionTimeZone(timeZone))
  ) throw new ProductionPersistenceError(code);
  return Object.freeze({
    id: assertPublicId(site.id, code),
    name: assertText(site.name, code),
    active: site.active,
    timeZone,
  });
}

function catalogRoom(value, code) {
  const room = assertExactObject(value, ['id', 'siteId', 'name', 'capacity', 'active'], code);
  if (!Number.isSafeInteger(room.capacity) || room.capacity < 1 || room.capacity > 100_000) {
    throw new ProductionPersistenceError(code);
  }
  if (typeof room.active !== 'boolean') throw new ProductionPersistenceError(code);
  return Object.freeze({
    id: assertPublicId(room.id, code),
    siteId: assertPublicId(room.siteId, code),
    name: assertText(room.name, code),
    capacity: room.capacity,
    active: room.active,
  });
}

function catalogPriced(value, code) {
  const entry = assertExactObject(value, ['id', 'name', 'active', 'priceMinor', 'currency'], code);
  if (
    typeof entry.active !== 'boolean'
    || !Number.isSafeInteger(entry.priceMinor)
    || entry.priceMinor < 0
    || typeof entry.currency !== 'string'
    || !CURRENCY.test(entry.currency)
  ) throw new ProductionPersistenceError(code);
  return Object.freeze({
    id: assertPublicId(entry.id, code),
    name: assertText(entry.name, code),
    active: entry.active,
    priceMinor: entry.priceMinor,
    currency: entry.currency,
  });
}

function catalogPayload(value) {
  const code = 'PRODUCTION_CATALOG_INVALID';
  const catalog = assertExactObject(
    value,
    ['sites', 'rooms', 'services', 'cateringPackages', 'cateringItems'],
    code,
  );
  const sites = normalizedCollection(catalog.sites, code, catalogSite);
  const rooms = normalizedCollection(catalog.rooms, code, catalogRoom);
  const siteIds = new Set(sites.map((site) => site.id));
  if (rooms.some((room) => !siteIds.has(room.siteId))) throw new ProductionPersistenceError(code);
  return Object.freeze({
    sites,
    rooms,
    services: normalizedCollection(catalog.services, code, catalogPriced),
    cateringPackages: normalizedCollection(catalog.cateringPackages, code, catalogPriced),
    cateringItems: normalizedCollection(catalog.cateringItems, code, catalogPriced),
  });
}

function requestPayload(value, code = 'PRODUCTION_REQUEST_INVALID') {
  const request = assertExactObject(value, [
    'id',
    'roomId',
    'status',
    'statusReason',
    'startsAt',
    'endsAt',
    'internalParticipants',
    'externalParticipants',
    'statusChangedAt',
    'updatedAt',
  ], code);
  if (!REQUEST_STATUSES.has(request.status)) throw new ProductionPersistenceError(code);
  const statusReason = request.statusReason === null
    ? null
    : assertText(request.statusReason, code, { max: 1_000 });
  if (REASON_REQUEST_STATUSES.has(request.status) !== (statusReason !== null)) {
    throw new ProductionPersistenceError(code);
  }
  const startsAt = assertCanonicalUtc(request.startsAt, code);
  const endsAt = assertCanonicalUtc(request.endsAt, code);
  const statusChangedAt = assertCanonicalUtc(request.statusChangedAt, code);
  const updatedAt = assertCanonicalUtc(request.updatedAt, code);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new ProductionPersistenceError(code);
  for (const count of [request.internalParticipants, request.externalParticipants]) {
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_PARTICIPANTS) {
      throw new ProductionPersistenceError(code);
    }
  }
  if (request.internalParticipants + request.externalParticipants < 1) {
    throw new ProductionPersistenceError(code);
  }
  return Object.freeze({
    id: assertPublicId(request.id, code),
    roomId: request.roomId === null ? null : assertPublicId(request.roomId, code),
    status: request.status,
    statusReason,
    startsAt,
    endsAt,
    internalParticipants: request.internalParticipants,
    externalParticipants: request.externalParticipants,
    statusChangedAt,
    updatedAt,
  });
}

function requestCollection(value) {
  return normalizedCollection(value, 'PRODUCTION_REQUESTS_INVALID', requestPayload);
}

function profilePayload(value) {
  const code = 'PRODUCTION_PROFILE_INVALID';
  const profile = assertExactObject(value, ['displayName'], code);
  return Object.freeze({ displayName: assertText(profile.displayName, code) });
}

function bookingChangePayload(value, code = 'PRODUCTION_BOOKING_CHANGE_INVALID') {
  if (value === null) return null;
  const change = assertExactObject(value, [
    'id', 'status', 'roomId', 'startsAt', 'endsAt', 'internalParticipants',
    'externalParticipants', 'rejectionReason', 'createdAt', 'updatedAt',
  ], code);
  if (!BOOKING_CHANGE_STATUSES.has(change.status)) throw new ProductionPersistenceError(code);
  const startsAt = assertCanonicalUtc(change.startsAt, code);
  const endsAt = assertCanonicalUtc(change.endsAt, code);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new ProductionPersistenceError(code);
  for (const count of [change.internalParticipants, change.externalParticipants]) {
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_PARTICIPANTS) {
      throw new ProductionPersistenceError(code);
    }
  }
  if (change.internalParticipants + change.externalParticipants < 1) {
    throw new ProductionPersistenceError(code);
  }
  const rejectionReason = change.rejectionReason === null
    ? null
    : assertText(change.rejectionReason, code, { max: 1_000 });
  if ((change.status === 'rejected') !== (rejectionReason !== null)) {
    throw new ProductionPersistenceError(code);
  }
  return Object.freeze({
    id: assertPublicId(change.id, code),
    status: change.status,
    roomId: assertPublicId(change.roomId, code),
    startsAt,
    endsAt,
    internalParticipants: change.internalParticipants,
    externalParticipants: change.externalParticipants,
    rejectionReason,
    createdAt: assertCanonicalUtc(change.createdAt, code),
    updatedAt: assertCanonicalUtc(change.updatedAt, code),
  });
}

function bookingChangeEnvelope(value) {
  return assertExactVersionedEnvelope(
    value,
    'result',
    'PRODUCTION_BOOKING_CHANGE_INVALID',
  );
}

function assertVersionedEnvelope(payload, field) {
  const envelope = assertPlainObject(payload);
  if (envelope.schemaVersion !== 1) throw new ProductionPersistenceError('PRODUCTION_SCHEMA_VERSION_UNSUPPORTED');
  if (!(field in envelope)) throw new ProductionPersistenceError('PRODUCTION_DATA_INVALID');
  return envelope[field];
}

function assertExactVersionedEnvelope(payload, field, code) {
  const envelope = assertPlainObject(payload, code);
  if (envelope.schemaVersion !== 1) {
    throw new ProductionPersistenceError('PRODUCTION_SCHEMA_VERSION_UNSUPPORTED');
  }
  assertExactObject(envelope, ['schemaVersion', field], code);
  return envelope[field];
}

function assertExactEnvelope(payload, field, code) {
  const envelope = assertExactObject(payload, [field], code);
  return envelope[field];
}

function assertRequestId(value) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new ProductionPersistenceError('REQUEST_ID_INVALID');
  }
  return value;
}

function assertUtcInstant(value) {
  return assertCanonicalUtc(value, 'AVAILABILITY_WINDOW_INVALID');
}

function availabilityRequest(value) {
  const request = assertPlainObject(value, 'AVAILABILITY_WINDOW_INVALID');
  const roomId = assertRequestId(request.roomId);
  const startsAt = assertUtcInstant(request.startsAt);
  const endsAt = assertUtcInstant(request.endsAt);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new ProductionPersistenceError('AVAILABILITY_WINDOW_INVALID');
  }
  return Object.freeze({ roomId, startsAt, endsAt });
}

function availabilityPayload(value) {
  const availability = assertPlainObject(value, 'PRODUCTION_AVAILABILITY_INVALID');
  const keys = Object.keys(availability);
  if (
    keys.length !== 2
    || !keys.includes('available')
    || !keys.includes('conflictCount')
    || typeof availability.available !== 'boolean'
    || ![0, 1].includes(availability.conflictCount)
    || availability.available !== (availability.conflictCount === 0)
  ) {
    throw new ProductionPersistenceError('PRODUCTION_AVAILABILITY_INVALID');
  }
  return Object.freeze({
    available: availability.available,
    conflictCount: availability.conflictCount,
  });
}

function availabilityEnvelope(value) {
  const envelope = assertPlainObject(value, 'PRODUCTION_AVAILABILITY_INVALID');
  const keys = Object.keys(envelope);
  if (envelope.schemaVersion !== 1) {
    throw new ProductionPersistenceError('PRODUCTION_SCHEMA_VERSION_UNSUPPORTED');
  }
  if (keys.length !== 2 || !keys.includes('schemaVersion') || !keys.includes('availability')) {
    throw new ProductionPersistenceError('PRODUCTION_AVAILABILITY_INVALID');
  }
  return availabilityPayload(envelope.availability);
}

function wrapApiError(error) {
  if (error instanceof ProductionPersistenceError) return error;
  return new ProductionPersistenceError('PRODUCTION_PERSISTENCE_UNAVAILABLE', { cause: error });
}

async function call(apiClient, path, options) {
  try {
    return await apiClient.request(path, options);
  } catch (error) {
    throw wrapApiError(error);
  }
}

function queryPath(path, values) {
  const query = new URLSearchParams(values);
  return `${path}?${query.toString()}`;
}

async function loadCatalogV2(apiClient) {
  const assembled = Object.fromEntries(PRODUCTION_CATALOG_SECTIONS.map((section) => [section, []]));
  let authority = null;
  for (const section of PRODUCTION_CATALOG_SECTIONS) {
    let cursor = null;
    do {
      const values = cursor
        ? { section, limit: '10', cursor }
        : { section, limit: '10', ...(authority ? { context: authority.context } : {}) };
      const page = normalizeProductionCatalogPage(await call(
        apiClient, queryPath(DOMAIN_ENDPOINTS.catalog, values),
      ));
      if (page.section !== section) throw new ProductionPersistenceError('PRODUCTION_CATALOG_INVALID');
      if (authority === null) {
        authority = page;
      } else if (
        page.context !== authority.context
        || JSON.stringify(page.configurationRevisions) !== JSON.stringify(authority.configurationRevisions)
        || JSON.stringify(page.bookingPolicy) !== JSON.stringify(authority.bookingPolicy)
        || JSON.stringify(page.organization) !== JSON.stringify(authority.organization)
        || JSON.stringify(page.costAllocation) !== JSON.stringify(authority.costAllocation)
      ) {
        throw new ProductionPersistenceError('PRODUCTION_CATALOG_INVALID');
      }
      assembled[section].push(...page.entries);
      cursor = page.page.nextCursor;
    } while (cursor !== null);
  }
  return normalizeProductionCatalog({
    configurationRevisions: authority.configurationRevisions,
    bookingPolicy: authority.bookingPolicy,
    organization: authority.organization,
    costAllocation: authority.costAllocation,
    ...assembled,
  });
}

async function loadAllRequestPages(apiClient, path, normalize) {
  const requests = [];
  let cursor = null;
  do {
    const page = normalize(await call(apiClient, queryPath(path, {
      limit: '10', ...(cursor ? { cursor } : {}),
    })));
    requests.push(...page.requests);
    cursor = page.page.nextCursor;
  } while (cursor !== null);
  return Object.freeze(requests);
}

export function createProductionPersistence({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') {
    throw new TypeError('PRODUCTION_API_CLIENT_REQUIRED');
  }

  return Object.freeze({
    async loadProfile() {
      return profilePayload(assertExactVersionedEnvelope(
        await call(apiClient, DOMAIN_ENDPOINTS.profile),
        'profile',
        'PRODUCTION_PROFILE_INVALID',
      ));
    },

    async loadCatalog() {
      return loadCatalogV2(apiClient);
    },

    async loadSiteInfo() {
      return Object.freeze({
        ...assertPlainObject(assertVersionedEnvelope(
          await call(apiClient, DOMAIN_ENDPOINTS.siteInfo),
          'siteInfo',
        )),
      });
    },

    async listRequests() {
      return loadAllRequestPages(apiClient, DOMAIN_ENDPOINTS.requests, normalizeProductionRequestListPage);
    },

    async listNotifications() {
      return assertCollection(
        assertVersionedEnvelope(await call(apiClient, DOMAIN_ENDPOINTS.notifications), 'notifications'),
        'PRODUCTION_NOTIFICATIONS_INVALID',
      );
    },

    async checkRoomAvailability(window) {
      const payload = availabilityRequest(window);
      return availabilityEnvelope(await call(apiClient, DOMAIN_ENDPOINTS.roomAvailability, {
        method: 'POST',
        body: payload,
      }));
    },

    async loadConfiguration() {
      return Object.freeze({
        ...assertPlainObject(assertVersionedEnvelope(
          await call(apiClient, DOMAIN_ENDPOINTS.configuration),
          'configuration',
        )),
      });
    },

    async createRequest(requestDraft) {
      const request = normalizeProductionRequestDraft(requestDraft);
      return normalizeProductionRequestMutationEnvelope(await call(
        apiClient,
        DOMAIN_ENDPOINTS.requests,
        { method: 'POST', body: { schemaVersion: 2, request } },
      ));
    },

    async resubmitRequest(requestId, expectedVersion, requestDraft) {
      const id = assertRequestId(requestId);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
        throw new ProductionPersistenceError('PRODUCTION_REQUEST_INVALID');
      }
      const request = normalizeProductionRequestDraft(requestDraft);
      return normalizeProductionRequestMutationEnvelope(await call(
        apiClient,
        `${DOMAIN_ENDPOINTS.requests}/${encodeURIComponent(id)}/resubmissions`,
        { method: 'POST', body: { schemaVersion: 2, expectedVersion, request } },
      ));
    },

    async loadRequest(requestId) {
      const id = assertRequestId(requestId);
      return normalizeProductionRequestDetailEnvelope(await call(
        apiClient, `v1/requests/${encodeURIComponent(id)}`,
      ));
    },

    async loadRequestHistory(requestId) {
      const id = assertRequestId(requestId);
      const history = [];
      let cursor = null;
      do {
        const page = normalizeProductionRequestHistoryPage(await call(
          apiClient,
          queryPath(`v1/requests/${encodeURIComponent(id)}/history`, {
            limit: '10', ...(cursor ? { cursor } : {}),
          }),
        ));
        history.push(...page.history);
        cursor = page.page.nextCursor;
      } while (cursor !== null);
      return Object.freeze(history);
    },

    async loadRequestReport(from, to) {
      const fromInclusive = assertCanonicalUtc(from, 'PRODUCTION_REQUEST_REPORT_INVALID');
      const toExclusive = assertCanonicalUtc(to, 'PRODUCTION_REQUEST_REPORT_INVALID');
      const requests = [];
      let cursor = null;
      do {
        const page = normalizeProductionRequestReportPage(await call(
          apiClient,
          queryPath('v1/application/reports/requests', {
            from: fromInclusive,
            to: toExclusive,
            limit: '10',
            ...(cursor ? { cursor } : {}),
          }),
        ));
        requests.push(...page.requests);
        cursor = page.page.nextCursor;
      } while (cursor !== null);
      return Object.freeze({ fromInclusive, toExclusive, requests: Object.freeze(requests) });
    },

    async transitionRequest(requestId, transition) {
      const id = assertRequestId(requestId);
      return normalizeProductionRequestDetailEnvelope(
        await call(apiClient, `v1/requests/${encodeURIComponent(id)}/transitions`, {
          method: 'POST',
          body: assertPlainObject(transition, 'PRODUCTION_TRANSITION_INVALID'),
        }),
      );
    },

    async loadBookingChange(requestId) {
      const id = assertRequestId(requestId);
      return normalizeProductionBookingChangeEnvelope(
        await call(apiClient, `v1/requests/${encodeURIComponent(id)}/booking-change`),
      ).change;
    },

    async proposeBookingChange(requestId, proposed) {
      const id = assertRequestId(requestId);
      const current = await this.loadRequest(id);
      const request = normalizeProductionRequestDraft(proposed);
      const result = normalizeProductionBookingChangeEnvelope(
        await call(apiClient, `v1/requests/${encodeURIComponent(id)}/booking-change`, {
          method: 'POST',
          body: { schemaVersion: 2, expectedVersion: current.version, request },
        }),
      );
      if (!result.change || !['pending', 'applied'].includes(result.change.status)) {
        throw new ProductionPersistenceError('PRODUCTION_BOOKING_CHANGE_INVALID');
      }
      return result;
    },

    async decideBookingChange(requestId, changeId, decision, reason = undefined) {
      const id = assertRequestId(requestId);
      const change = assertRequestId(changeId);
      if (decision !== 'approve' && decision !== 'reject') {
        throw new ProductionPersistenceError('PRODUCTION_BOOKING_CHANGE_INVALID');
      }
      const body = reason === undefined ? { decision } : { decision, reason };
      const result = normalizeProductionBookingChangeEnvelope(await call(
        apiClient,
        `v1/requests/${encodeURIComponent(id)}/booking-change/${encodeURIComponent(change)}/decision`,
        { method: 'POST', body },
      ));
      if (decision === 'reject') {
        if (result.change?.status !== 'rejected') {
          throw new ProductionPersistenceError('PRODUCTION_BOOKING_CHANGE_INVALID');
        }
        return result;
      }
      if (result.status === 'blocked') {
        return result;
      }
      if (result.change?.status !== 'applied') throw new ProductionPersistenceError('PRODUCTION_BOOKING_CHANGE_INVALID');
      return result;
    },

    async updateProfile(profile) {
      return profilePayload(assertExactEnvelope(
        await call(apiClient, DOMAIN_ENDPOINTS.profile, {
          method: 'PUT',
          body: profilePayload(profile),
        }),
        'profile',
        'PRODUCTION_PROFILE_INVALID',
      ));
    },

    async markNotificationRead(notificationId) {
      const id = assertRequestId(notificationId);
      await call(apiClient, `${DOMAIN_ENDPOINTS.notifications}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { read: true },
      });
      return true;
    },

    async updateConfiguration(configuration) {
      return Object.freeze({
        ...assertPlainObject(assertVersionedEnvelope(
          await call(apiClient, DOMAIN_ENDPOINTS.configuration, {
            method: 'PUT',
            body: assertPlainObject(configuration, 'PRODUCTION_CONFIGURATION_INVALID'),
          }),
          'configuration',
        )),
      });
    },
  });
}

export { DOMAIN_ENDPOINTS };
