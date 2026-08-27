import {
  createMicrosoft365OperationsApi,
  normalizedMicrosoft365ConnectionPayload,
} from './microsoft365-operations-api.js';

const CONNECTION_PATH = 'v1/integrations/microsoft365';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PROVIDER_TENANT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Microsoft365ConnectionApiError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'Microsoft365ConnectionApiError';
    this.code = code;
  }
}

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

function result(payload) {
  const value = normalizedMicrosoft365ConnectionPayload(payload);
  if (!value) throw new Microsoft365ConnectionApiError('MICROSOFT365_RESPONSE_INVALID');
  return Object.freeze({
    state: value.state,
    reason: value.reason,
    permissions: value.permissions,
  });
}

function consentUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Microsoft365ConnectionApiError('MICROSOFT365_REDIRECT_INVALID');
  }
  const providerTenant = url.pathname.split('/')[1] || '';
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'login.microsoftonline.com'
    || url.username
    || url.password
    || url.hash
    || !PROVIDER_TENANT_PATTERN.test(providerTenant)
    || url.pathname !== `/${providerTenant}/v2.0/adminconsent`
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
      if (
        !exactKeys(payload, ['authorizationUrl', 'expiresAt', 'requestId'])
        || typeof payload.authorizationUrl !== 'string'
        || !isUtcInstant(payload.expiresAt)
        || !UUID_PATTERN.test(payload.requestId)
      ) {
        throw new Microsoft365ConnectionApiError('MICROSOFT365_RESPONSE_INVALID');
      }
      return Object.freeze({
        authorizationUrl: consentUrl(payload.authorizationUrl),
        expiresAt: payload.expiresAt,
      });
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
