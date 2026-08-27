import { createMicrosoft365OperationsApi } from './microsoft365-operations-api.js';

const CONNECTION_PATH = 'v1/integrations/microsoft365';
const STATES = new Set(['pending', 'connected', 'degraded', 'revoked', 'disconnected']);
const PLACES_PERMISSION_STATES = new Set(['granted', 'missing', 'unknown']);
const CALENDAR_PERMISSION_STATES = new Set(['granted', 'missing', 'unverified', 'unknown']);

export class Microsoft365ConnectionApiError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'Microsoft365ConnectionApiError';
    this.code = code;
  }
}

function plain(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function connection(value) {
  if (!plain(value) || !STATES.has(value.status)) {
    throw new Microsoft365ConnectionApiError('MICROSOFT365_RESPONSE_INVALID');
  }
  if (
    !PLACES_PERMISSION_STATES.has(value.placesPermission)
    || !CALENDAR_PERMISSION_STATES.has(value.calendarsPermission)
  ) {
    throw new Microsoft365ConnectionApiError('MICROSOFT365_RESPONSE_INVALID');
  }
  if (value.reason !== null && (typeof value.reason !== 'string' || value.reason.length > 128)) {
    throw new Microsoft365ConnectionApiError('MICROSOFT365_RESPONSE_INVALID');
  }
  return Object.freeze({
    state: value.status,
    reason: value.reason,
    permissions: Object.freeze({
      place: value.placesPermission,
      calendars: value.calendarsPermission,
    }),
  });
}

function result(payload) {
  if (!plain(payload) || !plain(payload.connection)) {
    throw new Microsoft365ConnectionApiError('MICROSOFT365_RESPONSE_INVALID');
  }
  return connection(payload.connection);
}

function consentUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Microsoft365ConnectionApiError('MICROSOFT365_REDIRECT_INVALID');
  }
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'login.microsoftonline.com'
    || url.username
    || url.password
  ) {
    throw new Microsoft365ConnectionApiError('MICROSOFT365_REDIRECT_INVALID');
  }
  return url.href;
}

export function createMicrosoft365ConnectionApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('API_CLIENT_REQUIRED');
  const lifecycle = Object.freeze({
    async getStatus() {
      return result(await apiClient.request(CONNECTION_PATH));
    },
    async connect() {
      const payload = await apiClient.request(`${CONNECTION_PATH}/connect`, { method: 'POST' });
      if (!plain(payload) || typeof payload.authorizationUrl !== 'string') {
        throw new Microsoft365ConnectionApiError('MICROSOFT365_RESPONSE_INVALID');
      }
      return Object.freeze({ authorizationUrl: consentUrl(payload.authorizationUrl) });
    },
    async verify() {
      return result(await apiClient.request(`${CONNECTION_PATH}/verify`, { method: 'POST' }));
    },
    async disconnect() {
      return result(await apiClient.request(CONNECTION_PATH, { method: 'DELETE' }));
    },
  });
  return Object.freeze({
    ...lifecycle,
    ...createMicrosoft365OperationsApi({ apiClient }),
  });
}
