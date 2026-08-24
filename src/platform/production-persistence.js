const DOMAIN_ENDPOINTS = Object.freeze({
  profile: 'v1/application/profile',
  catalog: 'v1/application/catalog',
  siteInfo: 'v1/application/site-info',
  requests: 'v1/application/requests',
  notifications: 'v1/application/notifications',
  configuration: 'v1/application/configuration',
});

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_COLLECTION = 2_000;

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

function assertVersionedEnvelope(payload, field) {
  const envelope = assertPlainObject(payload);
  if (envelope.schemaVersion !== 1) throw new ProductionPersistenceError('PRODUCTION_SCHEMA_VERSION_UNSUPPORTED');
  if (!(field in envelope)) throw new ProductionPersistenceError('PRODUCTION_DATA_INVALID');
  return envelope[field];
}

function assertRequestId(value) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new ProductionPersistenceError('REQUEST_ID_INVALID');
  }
  return value;
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
      const catalog = assertPlainObject(assertVersionedEnvelope(
        await call(apiClient, DOMAIN_ENDPOINTS.catalog),
        'catalog',
      ));
      return Object.freeze({
        rooms: assertCollection(catalog.rooms, 'PRODUCTION_CATALOG_INVALID'),
        services: assertCollection(catalog.services, 'PRODUCTION_CATALOG_INVALID'),
        cateringPackages: assertCollection(catalog.cateringPackages, 'PRODUCTION_CATALOG_INVALID'),
        cateringItems: assertCollection(catalog.cateringItems, 'PRODUCTION_CATALOG_INVALID'),
      });
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
      return assertCollection(
        assertVersionedEnvelope(await call(apiClient, DOMAIN_ENDPOINTS.requests), 'requests'),
        'PRODUCTION_REQUESTS_INVALID',
      );
    },

    async listNotifications() {
      return assertCollection(
        assertVersionedEnvelope(await call(apiClient, DOMAIN_ENDPOINTS.notifications), 'notifications'),
        'PRODUCTION_NOTIFICATIONS_INVALID',
      );
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
      const result = assertVersionedEnvelope(
        await call(apiClient, DOMAIN_ENDPOINTS.requests, { method: 'POST', body: requestDraft }),
        'request',
      );
      return Object.freeze({ ...assertPlainObject(result, 'PRODUCTION_REQUEST_INVALID') });
    },

    async transitionRequest(requestId, transition) {
      const id = assertRequestId(requestId);
      const result = assertVersionedEnvelope(
        await call(apiClient, `v1/requests/${encodeURIComponent(id)}/transitions`, {
          method: 'POST',
          body: assertPlainObject(transition, 'PRODUCTION_TRANSITION_INVALID'),
        }),
        'request',
      );
      return Object.freeze({ ...assertPlainObject(result, 'PRODUCTION_REQUEST_INVALID') });
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
