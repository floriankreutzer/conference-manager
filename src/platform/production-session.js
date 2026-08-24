import { createApiClient } from '../core/api-client.js';
import { RUNTIME_MODE, runtimeModeFromDocument } from '../core/security-policy.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TENANT_ROLES = new Set(['employee', 'conference_manager', 'tenant_admin']);
const TENANT_PERMISSIONS = new Set([
  'request:read',
  'request:cancel',
  'request:manage',
  'tenant:configure',
  'tenant:users:manage',
  'tenant:integrations:manage',
  'tenant:audit:read',
]);
const TENANT_STATUSES = new Set(['pending', 'onboarding', 'ready', 'active', 'suspended', 'archived']);

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function uniqueKnownStrings(value, allowed, { min = 0, max }) {
  if (!Array.isArray(value) || value.length < min || value.length > max) return null;
  if (new Set(value).size !== value.length) return null;
  if (value.some((entry) => typeof entry !== 'string' || !allowed.has(entry))) return null;
  return Object.freeze([...value]);
}

function normalizeSessionPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const userId = value.user?.id;
  const tenantId = value.tenant?.id;
  const tenantStatus = value.tenant?.status;
  const roles = uniqueKnownStrings(value.roles, TENANT_ROLES, { min: 1, max: 3 });
  const permissions = uniqueKnownStrings(value.permissions, TENANT_PERMISSIONS, { max: TENANT_PERMISSIONS.size });
  const expiresAt = value.session?.expiresAt;
  const csrfToken = value.csrfToken;
  if (
    !isUuid(userId)
    || !isUuid(tenantId)
    || !TENANT_STATUSES.has(tenantStatus)
    || !roles
    || !permissions
    || typeof expiresAt !== 'string'
    || !expiresAt.endsWith('Z')
    || !Number.isFinite(Date.parse(expiresAt))
    || typeof csrfToken !== 'string'
    || csrfToken.length < 16
    || csrfToken.length > 4096
  ) {
    return null;
  }
  return Object.freeze({
    userId,
    tenantId,
    tenantStatus,
    roles,
    permissions,
    expiresAt,
    csrfToken,
  });
}

export class ProductionSessionError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'ProductionSessionError';
    this.code = code;
  }
}

export async function createProductionSessionRuntime({
  documentLike = globalThis.document,
  origin = globalThis.location?.origin,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (runtimeModeFromDocument(documentLike) === RUNTIME_MODE.DEMO) return null;

  let csrfToken = null;
  const apiClient = createApiClient({
    origin,
    fetchImpl,
    csrfTokenProvider: () => csrfToken,
  });
  let payload;
  try {
    payload = await apiClient.request('v1/session');
  } catch (error) {
    throw new ProductionSessionError('PRODUCTION_SESSION_UNAVAILABLE', { cause: error });
  }
  const session = normalizeSessionPayload(payload);
  if (!session) throw new ProductionSessionError('PRODUCTION_SESSION_INVALID');
  csrfToken = session.csrfToken;
  return Object.freeze({ apiClient, session });
}
