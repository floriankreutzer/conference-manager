import { normalizePlatformOperatorSession, PlatformAdminContractError } from '../contracts.js';

export const PLATFORM_ADMIN_DEMO_PERSONAS = Object.freeze([
  'support_reader',
  'tenant_operator',
  'security_auditor',
  'security_admin',
]);

const PERSONA_SET = new Set(PLATFORM_ADMIN_DEMO_PERSONAS);
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

export class PlatformDemoSessionError extends Error {
  constructor(code, options = {}) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PlatformDemoSessionError';
    this.code = code;
  }
}

function normalizeRequestTimeout(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 30_000
    ? value
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

async function boundedRequest(apiClient, path, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await apiClient.request(path, { ...(options || {}), signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function normalizeSessionPayload(value) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',')
      !== 'assurance,csrfToken,demo,expiresAt,operatorId,permissions,requestId,roles,stepUpExpiresAt'
    || !value.demo
    || Object.keys(value.demo).join(',') !== 'persona'
    || !PERSONA_SET.has(value.demo.persona)
    || !REQUEST_ID_PATTERN.test(value.requestId || '')
  ) throw new PlatformDemoSessionError('PLATFORM_DEMO_SESSION_RESPONSE_INVALID');
  let normalized;
  try {
    normalized = normalizePlatformOperatorSession({
      operatorId: value.operatorId,
      roles: value.roles,
      permissions: value.permissions,
      assurance: value.assurance,
      expiresAt: value.expiresAt,
      stepUpExpiresAt: value.stepUpExpiresAt,
      csrfToken: value.csrfToken,
    });
  } catch (error) {
    const code = error instanceof PlatformAdminContractError
      ? 'PLATFORM_DEMO_SESSION_RESPONSE_INVALID'
      : 'PLATFORM_DEMO_SESSION_UNAVAILABLE';
    throw new PlatformDemoSessionError(code, { cause: error });
  }
  return Object.freeze({ ...normalized, persona: value.demo.persona });
}

function normalizeResetPayload(value) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'checksum,requestId,seedVersion'
    || typeof value.seedVersion !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/.test(value.seedVersion)
    || !CHECKSUM_PATTERN.test(value.checksum || '')
    || !REQUEST_ID_PATTERN.test(value.requestId || '')
  ) throw new PlatformDemoSessionError('PLATFORM_DEMO_RESET_RESPONSE_INVALID');
  return Object.freeze({ seedVersion: value.seedVersion, checksum: value.checksum });
}

export function createPlatformDemoSessionApi({
  apiClient,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
} = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') {
    throw new TypeError('PLATFORM_DEMO_SESSION_API_CLIENT_REQUIRED');
  }
  const timeoutMs = normalizeRequestTimeout(requestTimeoutMs);

  return Object.freeze({
    async loadSession() {
      try {
        return normalizeSessionPayload(await boundedRequest(
          apiClient,
          'demo/session',
          undefined,
          timeoutMs,
        ));
      } catch (error) {
        if (error instanceof PlatformDemoSessionError) throw error;
        throw new PlatformDemoSessionError('PLATFORM_DEMO_SESSION_UNAVAILABLE', { cause: error });
      }
    },

    async selectPersona(persona) {
      if (!PERSONA_SET.has(persona)) {
        throw new PlatformDemoSessionError('PLATFORM_DEMO_PERSONA_INVALID');
      }
      try {
        const session = normalizeSessionPayload(await boundedRequest(
          apiClient,
          'demo/session/persona',
          {
            method: 'PUT',
            body: { persona },
          },
          timeoutMs,
        ));
        if (session.persona !== persona) {
          throw new PlatformDemoSessionError('PLATFORM_DEMO_PERSONA_RESPONSE_MISMATCH');
        }
        return session;
      } catch (error) {
        if (error instanceof PlatformDemoSessionError) throw error;
        throw new PlatformDemoSessionError('PLATFORM_DEMO_PERSONA_CHANGE_FAILED', { cause: error });
      }
    },

    async reset() {
      try {
        return normalizeResetPayload(await boundedRequest(
          apiClient,
          'demo/reset',
          {
            method: 'POST',
            body: { confirm: true },
          },
          timeoutMs,
        ));
      } catch (error) {
        if (error instanceof PlatformDemoSessionError) throw error;
        throw new PlatformDemoSessionError('PLATFORM_DEMO_RESET_FAILED', { cause: error });
      }
    },
  });
}
