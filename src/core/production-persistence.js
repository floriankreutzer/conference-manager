import { REQUEST_STATUS } from './domain.js';

const REQUEST_STATUSES = new Set(Object.values(REQUEST_STATUS));
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_LIST_ITEMS = 2_000;
const MAX_OBJECT_KEYS = 500;
const MAX_DEPTH = 20;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const REQUEST_AUTHORITY_FIELDS = new Set([
  'tenantId',
  'tenant_id',
  'requesterUserId',
  'requester_user_id',
  'status',
  'statusReason',
  'status_reason',
  'roles',
  'permissions',
  'owner',
]);

export const PRODUCTION_DATA_VERSION = 1;

export const PRODUCTION_API_PATH = Object.freeze({
  requests: 'v1/requests',
  catalog: 'v1/catalog',
  profile: 'v1/profile',
  notifications: 'v1/notifications',
  configuration: 'v1/configuration',
});

export class ProductionPersistenceError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'ProductionPersistenceError';
    this.code = code;
  }
}

function assertApiClient(apiClient) {
  if (!apiClient || typeof apiClient.request !== 'function') {
    throw new ProductionPersistenceError('PRODUCTION_API_CLIENT_REQUIRED');
  }
  return apiClient;
}

function assertPlainObject(value, code = 'PRODUCTION_DATA_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProductionPersistenceError(code);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ProductionPersistenceError(code);
  }
  return value;
}

function sanitize(value, depth = 0) {
  if (depth > MAX_DEPTH) throw new ProductionPersistenceError('PRODUCTION_DATA_TOO_DEEP');
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) {
    if (value.length > MAX_LIST_ITEMS) throw new ProductionPersistenceError('PRODUCTION_DATA_TOO_LARGE');
    return value.map((entry) => sanitize(entry, depth + 1));
  }
  assertPlainObject(value);
  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) throw new ProductionPersistenceError('PRODUCTION_DATA_TOO_LARGE');
  const clean = {};
  for (const [key, entry] of entries) {
    if (BLOCKED_KEYS.has(key)) throw new ProductionPersistenceError('PRODUCTION_DATA_KEY_BLOCKED');
    clean[key] = sanitize(entry, depth + 1);
  }
  return clean;
}

function assertResourceId(value, code = 'PRODUCTION_RESOURCE_ID_INVALID') {
  if (typeof value !== 'string' || !RESOURCE_ID.test(value)) throw new ProductionPersistenceError(code);
  return value;
}

function assertDataVersion(payload) {
  if (payload.schemaVersion !== PRODUCTION_DATA_VERSION) {
    throw new ProductionPersistenceError('PRODUCTION_SCHEMA_VERSION_UNSUPPORTED');
  }
}

function normalizeRequestRecord(value) {
  const record = sanitize(assertPlainObject(value, 'PRODUCTION_REQUEST_INVALID'));
  assertResourceId(record.id, 'PRODUCTION_REQUEST_ID_INVALID');
  if (!REQUEST_STATUSES.has(record.status)) throw new ProductionPersistenceError('PRODUCTION_REQUEST_STATUS_INVALID');
  if ('tenantId' in record || 'tenant_id' in record) {
    throw new ProductionPersistenceError('PRODUCTION_REQUEST_TENANT_EXPOSED');
  }
  return Object.freeze(record);
}

function normalizeRequestResponse(payload) {
  const envelope = assertPlainObject(payload, 'PRODUCTION_REQUEST_RESPONSE_INVALID');
  return normalizeRequestRecord(envelope.request);
}

function normalizeRequestList(payload) {
  const envelope = assertPlainObject(payload, 'PRODUCTION_REQUEST_LIST_INVALID');
  assertDataVersion(envelope);
  if (!Array.isArray(envelope.requests) || envelope.requests.length > MAX_LIST_ITEMS) {
    throw new ProductionPersistenceError('PRODUCTION_REQUEST_LIST_INVALID');
  }
  return Object.freeze(envelope.requests.map(normalizeRequestRecord));
}

function normalizeVersionedObject(payload, field) {
  const envelope = assertPlainObject(payload, 'PRODUCTION_RESPONSE_INVALID');
  assertDataVersion(envelope);
  return Object.freeze(sanitize(assertPlainObject(envelope[field], 'PRODUCTION_RESPONSE_INVALID')));
}

function normalizeVersionedList(payload, field) {
  const envelope = assertPlainObject(payload, 'PRODUCTION_RESPONSE_INVALID');
  assertDataVersion(envelope);
  if (!Array.isArray(envelope[field]) || envelope[field].length > MAX_LIST_ITEMS) {
    throw new ProductionPersistenceError('PRODUCTION_RESPONSE_INVALID');
  }
  return Object.freeze(sanitize(envelope[field]));
}

function requestCommand(command) {
  const clean = sanitize(assertPlainObject(command, 'PRODUCTION_REQUEST_COMMAND_INVALID'));
  for (const field of REQUEST_AUTHORITY_FIELDS) {
    if (field in clean) throw new ProductionPersistenceError('PRODUCTION_REQUEST_AUTHORITY_FIELD_REJECTED');
  }
  return Object.freeze(clean);
}

function transitionCommand(transition, reason) {
  if (typeof transition !== 'string' || !/^[a-z][a-z_]{0,31}$/.test(transition)) {
    throw new ProductionPersistenceError('PRODUCTION_TRANSITION_INVALID');
  }
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > 1_000)) {
    throw new ProductionPersistenceError('PRODUCTION_TRANSITION_REASON_INVALID');
  }
  return Object.freeze({ transition, ...(reason === undefined ? {} : { reason }) });
}

function versionedBody(field, value) {
  return Object.freeze({ schemaVersion: PRODUCTION_DATA_VERSION, [field]: sanitize(value) });
}

export function createProductionRepositories({ apiClient } = {}) {
  const api = assertApiClient(apiClient);

  return Object.freeze({
    mode: 'production',
    requests: Object.freeze({
      async list() {
        return normalizeRequestList(await api.request(PRODUCTION_API_PATH.requests));
      },
      async get(requestId) {
        const id = assertResourceId(requestId, 'PRODUCTION_REQUEST_ID_INVALID');
        return normalizeRequestResponse(await api.request(`${PRODUCTION_API_PATH.requests}/${encodeURIComponent(id)}`));
      },
      async create(command) {
        return normalizeRequestResponse(await api.request(PRODUCTION_API_PATH.requests, {
          method: 'POST',
          body: requestCommand(command),
        }));
      },
      async update(requestId, command) {
        const id = assertResourceId(requestId, 'PRODUCTION_REQUEST_ID_INVALID');
        return normalizeRequestResponse(await api.request(`${PRODUCTION_API_PATH.requests}/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: requestCommand(command),
        }));
      },
      async transition(requestId, transition, reason) {
        const id = assertResourceId(requestId, 'PRODUCTION_REQUEST_ID_INVALID');
        return normalizeRequestResponse(await api.request(`${PRODUCTION_API_PATH.requests}/${encodeURIComponent(id)}/transitions`, {
          method: 'POST',
          body: transitionCommand(transition, reason),
        }));
      },
    }),
    catalog: Object.freeze({
      async get() {
        return normalizeVersionedObject(await api.request(PRODUCTION_API_PATH.catalog), 'catalog');
      },
      async save(catalog) {
        return normalizeVersionedObject(await api.request(PRODUCTION_API_PATH.catalog, {
          method: 'PUT',
          body: versionedBody('catalog', catalog),
        }), 'catalog');
      },
    }),
    profile: Object.freeze({
      async get() {
        return normalizeVersionedObject(await api.request(PRODUCTION_API_PATH.profile), 'profile');
      },
      async save(profile) {
        return normalizeVersionedObject(await api.request(PRODUCTION_API_PATH.profile, {
          method: 'PATCH',
          body: versionedBody('profile', profile),
        }), 'profile');
      },
    }),
    notifications: Object.freeze({
      async list() {
        return normalizeVersionedList(await api.request(PRODUCTION_API_PATH.notifications), 'notifications');
      },
      async markRead(notificationId) {
        const id = assertResourceId(notificationId, 'PRODUCTION_NOTIFICATION_ID_INVALID');
        return normalizeVersionedList(await api.request(`${PRODUCTION_API_PATH.notifications}/${encodeURIComponent(id)}/read`, {
          method: 'POST',
          body: { schemaVersion: PRODUCTION_DATA_VERSION },
        }), 'notifications');
      },
    }),
    configuration: Object.freeze({
      async get() {
        return normalizeVersionedObject(await api.request(PRODUCTION_API_PATH.configuration), 'configuration');
      },
      async save(configuration) {
        return normalizeVersionedObject(await api.request(PRODUCTION_API_PATH.configuration, {
          method: 'PUT',
          body: versionedBody('configuration', configuration),
        }), 'configuration');
      },
    }),
  });
}
