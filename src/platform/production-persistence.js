import { isProductionTimeZone } from '../core/production-time.js';

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

export function createProductionPersistence({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') {
    throw new TypeError('PRODUCTION_API_CLIENT_REQUIRED');
  }

  return Object.freeze({
    async loadProfile() {
      return Object.freeze({
        ...assertPlainObject(assertVersionedEnvelope(
          await call(apiClient, DOMAIN_ENDPOINTS.profile),
          'profile',
        )),
      });
    },

    async loadCatalog() {
      return catalogPayload(assertExactVersionedEnvelope(
        await call(apiClient, DOMAIN_ENDPOINTS.catalog),
        'catalog',
        'PRODUCTION_CATALOG_INVALID',
      ));
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
      return requestCollection(assertExactVersionedEnvelope(
        await call(apiClient, DOMAIN_ENDPOINTS.requests),
        'requests',
        'PRODUCTION_REQUESTS_INVALID',
      ));
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
      const result = assertExactVersionedEnvelope(
        await call(apiClient, DOMAIN_ENDPOINTS.requests, { method: 'POST', body: requestDraft }),
        'request',
        'PRODUCTION_REQUEST_INVALID',
      );
      return requestPayload(result);
    },

    async transitionRequest(requestId, transition) {
      const id = assertRequestId(requestId);
      const result = assertExactVersionedEnvelope(
        await call(apiClient, `v1/requests/${encodeURIComponent(id)}/transitions`, {
          method: 'POST',
          body: assertPlainObject(transition, 'PRODUCTION_TRANSITION_INVALID'),
        }),
        'request',
        'PRODUCTION_REQUEST_INVALID',
      );
      return requestPayload(result);
    },

    async loadBookingChange(requestId) {
      const id = assertRequestId(requestId);
      const result = assertExactObject(
        bookingChangeEnvelope(await call(apiClient, `v1/requests/${encodeURIComponent(id)}/booking-change`)),
        ['change'],
        'PRODUCTION_BOOKING_CHANGE_INVALID',
      );
      return bookingChangePayload(result.change);
    },

    async proposeBookingChange(requestId, proposed) {
      const id = assertRequestId(requestId);
      const result = assertExactObject(
        bookingChangeEnvelope(await call(apiClient, `v1/requests/${encodeURIComponent(id)}/booking-change`, {
          method: 'POST',
          body: assertPlainObject(proposed, 'PRODUCTION_BOOKING_CHANGE_INVALID'),
        })),
        ['change', 'request'],
        'PRODUCTION_BOOKING_CHANGE_INVALID',
      );
      return Object.freeze({
        change: bookingChangePayload(result.change),
        request: requestPayload(result.request),
      });
    },

    async decideBookingChange(requestId, changeId, decision, reason = undefined) {
      const id = assertRequestId(requestId);
      const change = assertRequestId(changeId);
      if (decision !== 'approve' && decision !== 'reject') {
        throw new ProductionPersistenceError('PRODUCTION_BOOKING_CHANGE_INVALID');
      }
      const body = reason === undefined ? { decision } : { decision, reason };
      const result = bookingChangeEnvelope(await call(
        apiClient,
        `v1/requests/${encodeURIComponent(id)}/booking-change/${encodeURIComponent(change)}/decision`,
        { method: 'POST', body },
      ));
      if (decision === 'reject') {
        const rejected = assertExactObject(result, ['status', 'change'], 'PRODUCTION_BOOKING_CHANGE_INVALID');
        if (rejected.status !== 'rejected') throw new ProductionPersistenceError('PRODUCTION_BOOKING_CHANGE_INVALID');
        return Object.freeze({ status: 'rejected', change: bookingChangePayload(rejected.change) });
      }
      if (result?.status === 'blocked') {
        const blocked = assertExactObject(result, ['status', 'alternatives'], 'PRODUCTION_BOOKING_CHANGE_INVALID');
        if (!Array.isArray(blocked.alternatives) || blocked.alternatives.length > 5) {
          throw new ProductionPersistenceError('PRODUCTION_BOOKING_CHANGE_INVALID');
        }
        const alternatives = blocked.alternatives.map((entry) => (
          assertPublicId(entry, 'PRODUCTION_BOOKING_CHANGE_INVALID')
        ));
        if (new Set(alternatives).size !== alternatives.length) {
          throw new ProductionPersistenceError('PRODUCTION_BOOKING_CHANGE_INVALID');
        }
        return Object.freeze({
          status: 'blocked',
          alternatives: Object.freeze(alternatives),
        });
      }
      const applied = assertExactObject(result, ['status', 'request'], 'PRODUCTION_BOOKING_CHANGE_INVALID');
      if (applied.status !== 'applied') throw new ProductionPersistenceError('PRODUCTION_BOOKING_CHANGE_INVALID');
      return Object.freeze({ status: 'applied', request: requestPayload(applied.request) });
    },

    async updateProfile(profile) {
      return Object.freeze({
        ...assertPlainObject(assertVersionedEnvelope(
          await call(apiClient, DOMAIN_ENDPOINTS.profile, {
            method: 'PUT',
            body: assertPlainObject(profile, 'PRODUCTION_PROFILE_INVALID'),
          }),
          'profile',
        )),
      });
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
