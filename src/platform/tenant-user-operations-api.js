const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ROLE_ORDER = Object.freeze(['employee', 'conference_manager', 'tenant_admin']);
const ROLE_SET = new Set(ROLE_ORDER);
const ELEVATED_ROLE_ORDER = Object.freeze(['conference_manager', 'tenant_admin']);
const ELEVATED_ROLE_SET = new Set(ELEVATED_ROLE_ORDER);
const STATUS_FILTERS = new Set(['all', 'active', 'disabled']);
const ROLE_FILTERS = new Set(['all', 'employee_only', 'conference_manager', 'tenant_admin']);
const PROVIDER_FILTERS = new Set(['all', 'linked', 'unlinked']);
const SERVER_OPERATION_CODES = new Set([
  'LAST_TENANT_ADMIN_REQUIRED',
  'TENANT_USER_LIFECYCLE_VERSION_CONFLICT',
]);
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 80;

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

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isUtcInstant(value) {
  return typeof value === 'string'
    && UTC_INSTANT_PATTERN.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function normalizedRoles(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > ROLE_ORDER.length) return null;
  if (new Set(value).size !== value.length || value.some((role) => !ROLE_SET.has(role))) return null;
  if (!value.includes('employee')) return null;
  return Object.freeze(ROLE_ORDER.filter((role) => value.includes(role)));
}

function displayName(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 160
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function normalizedLifecycle(value, active) {
  if (
    !exactKeys(value, ['status', 'version'])
    || !['active', 'disabled'].includes(value.status)
    || value.status !== (active ? 'active' : 'disabled')
    || !Number.isSafeInteger(value.version)
    || value.version < 1
  ) return null;
  return Object.freeze({ status: value.status, version: value.version });
}

function normalizedIdentityProvider(value) {
  if (
    !exactKeys(value, ['linked', 'linkedAt'])
    || typeof value.linked !== 'boolean'
    || (value.linkedAt !== null && !isUtcInstant(value.linkedAt))
    || (!value.linked && value.linkedAt !== null)
  ) return null;
  return Object.freeze({ linked: value.linked, linkedAt: value.linkedAt });
}

function normalizedRequestOwnership(value) {
  if (
    !exactKeys(value, ['openRequestCount', 'ownershipPreservedOnDisable'])
    || !Number.isSafeInteger(value.openRequestCount)
    || value.openRequestCount < 0
    || value.ownershipPreservedOnDisable !== true
  ) return null;
  return Object.freeze({
    openRequestCount: value.openRequestCount,
    ownershipPreservedOnDisable: true,
  });
}

function normalizedOperationalUser(value) {
  if (!exactKeys(value, [
    'id',
    'displayName',
    'active',
    'roles',
    'lifecycle',
    'identityProvider',
    'lastSignInAt',
    'requestOwnership',
  ])) return null;
  const roles = normalizedRoles(value.roles);
  const lifecycle = normalizedLifecycle(value.lifecycle, value.active);
  const identityProvider = normalizedIdentityProvider(value.identityProvider);
  const requestOwnership = normalizedRequestOwnership(value.requestOwnership);
  if (
    !isUuid(value.id)
    || !displayName(value.displayName)
    || typeof value.active !== 'boolean'
    || !roles
    || !lifecycle
    || !identityProvider
    || (value.lastSignInAt !== null && !isUtcInstant(value.lastSignInAt))
    || !requestOwnership
  ) return null;
  return Object.freeze({
    id: value.id.toLowerCase(),
    displayName: value.displayName,
    active: value.active,
    roles,
    lifecycle,
    identityProvider,
    lastSignInAt: value.lastSignInAt,
    requestOwnership,
  });
}

function normalizedRoleUser(value) {
  if (!exactKeys(value, ['id', 'displayName', 'active', 'roles'])) return null;
  const roles = normalizedRoles(value.roles);
  if (!isUuid(value.id) || !displayName(value.displayName) || typeof value.active !== 'boolean' || !roles) {
    return null;
  }
  return Object.freeze({
    id: value.id.toLowerCase(),
    displayName: value.displayName,
    active: value.active,
    roles,
  });
}

function normalizedPage(value) {
  if (
    !exactKeys(value, ['users', 'nextAfterId', 'requestId'])
    || !isUuid(value.requestId)
    || !Array.isArray(value.users)
    || value.users.length > MAX_PAGE_SIZE
  ) return null;
  const users = value.users.map(normalizedOperationalUser);
  if (users.some((user) => !user) || new Set(users.map((user) => user.id)).size !== users.length) return null;
  if (value.nextAfterId !== null && !isUuid(value.nextAfterId)) return null;
  if (value.nextAfterId !== null && (users.length === 0 || users.at(-1)?.id !== value.nextAfterId.toLowerCase())) {
    return null;
  }
  return Object.freeze({
    users: Object.freeze(users),
    nextAfterId: value.nextAfterId === null ? null : value.nextAfterId.toLowerCase(),
  });
}

function normalizedSearch(value) {
  if (value === null || value === undefined || value === '') return null;
  if (
    typeof value !== 'string'
    || value.length > MAX_SEARCH_LENGTH
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/.test(value)
  ) throw new TenantUserOperationsApiError('TENANT_USER_SEARCH_INVALID');
  return value;
}

function normalizedFilter(value, allowed, code) {
  const candidate = value ?? 'all';
  if (!allowed.has(candidate)) throw new TenantUserOperationsApiError(code);
  return candidate;
}

function normalizedQuery({
  limit = DEFAULT_PAGE_SIZE,
  afterId = null,
  search = null,
  status = 'all',
  role = 'all',
  providerLink = 'all',
} = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new TenantUserOperationsApiError('TENANT_USER_LIMIT_INVALID');
  }
  if (afterId !== null && !isUuid(afterId)) {
    throw new TenantUserOperationsApiError('TENANT_USER_CURSOR_INVALID');
  }
  return Object.freeze({
    limit,
    afterId: afterId === null ? null : afterId.toLowerCase(),
    search: normalizedSearch(search),
    status: normalizedFilter(status, STATUS_FILTERS, 'TENANT_USER_STATUS_FILTER_INVALID'),
    role: normalizedFilter(role, ROLE_FILTERS, 'TENANT_USER_ROLE_FILTER_INVALID'),
    providerLink: normalizedFilter(
      providerLink,
      PROVIDER_FILTERS,
      'TENANT_USER_PROVIDER_FILTER_INVALID',
    ),
  });
}

function queryPath(query) {
  const parameters = new URLSearchParams({ limit: String(query.limit) });
  if (query.afterId !== null) parameters.set('afterId', query.afterId);
  if (query.search !== null) parameters.set('search', query.search);
  if (query.status !== 'all') parameters.set('status', query.status);
  if (query.role !== 'all') parameters.set('role', query.role);
  if (query.providerLink !== 'all') parameters.set('providerLink', query.providerLink);
  return `v1/tenant/users?${parameters}`;
}

function elevatedRoles(value) {
  if (!Array.isArray(value) || value.length > ELEVATED_ROLE_ORDER.length) {
    throw new TenantUserOperationsApiError('TENANT_USER_ROLES_INVALID');
  }
  if (new Set(value).size !== value.length || value.some((role) => !ELEVATED_ROLE_SET.has(role))) {
    throw new TenantUserOperationsApiError('TENANT_USER_ROLES_INVALID');
  }
  return ELEVATED_ROLE_ORDER.filter((role) => value.includes(role));
}

function operationError(error, fallback) {
  const serverCode = typeof error?.serverCode === 'string' && SERVER_OPERATION_CODES.has(error.serverCode)
    ? error.serverCode
    : null;
  return new TenantUserOperationsApiError(serverCode || error?.code || fallback, { cause: error });
}

export class TenantUserOperationsApiError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'TenantUserOperationsApiError';
    this.code = code;
  }
}

export function createTenantUserOperationsApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') {
    throw new TypeError('TENANT_USER_API_CLIENT_REQUIRED');
  }

  return Object.freeze({
    async listUsers(filters = {}) {
      let payload;
      try {
        payload = await apiClient.request(queryPath(normalizedQuery(filters)));
      } catch (error) {
        throw operationError(error, 'TENANT_USERS_UNAVAILABLE');
      }
      const page = normalizedPage(payload);
      if (!page) throw new TenantUserOperationsApiError('TENANT_USERS_RESPONSE_INVALID');
      return page;
    },

    async setRoles(userId, roles) {
      if (!isUuid(userId)) throw new TenantUserOperationsApiError('TENANT_USER_ID_INVALID');
      const normalized = elevatedRoles(roles);
      let payload;
      try {
        payload = await apiClient.request(`v1/tenant/users/${userId.toLowerCase()}/roles`, {
          method: 'PUT',
          body: { roles: normalized },
        });
      } catch (error) {
        throw operationError(error, 'TENANT_USER_UPDATE_FAILED');
      }
      const user = exactKeys(payload, ['user', 'requestId']) && isUuid(payload.requestId)
        ? normalizedRoleUser(payload.user)
        : null;
      if (!user || user.id !== userId.toLowerCase()) {
        throw new TenantUserOperationsApiError('TENANT_USER_RESPONSE_INVALID');
      }
      return user;
    },

    async setAccess(userId, active, expectedVersion) {
      if (!isUuid(userId)) throw new TenantUserOperationsApiError('TENANT_USER_ID_INVALID');
      if (typeof active !== 'boolean' || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
        throw new TenantUserOperationsApiError('TENANT_USER_LIFECYCLE_INPUT_INVALID');
      }
      let payload;
      try {
        payload = await apiClient.request(`v1/tenant/users/${userId.toLowerCase()}/access`, {
          method: 'PUT',
          body: { active, expectedVersion },
        });
      } catch (error) {
        throw operationError(error, 'TENANT_USER_LIFECYCLE_UPDATE_FAILED');
      }
      const user = exactKeys(payload, ['user', 'requestId']) && isUuid(payload.requestId)
        ? normalizedOperationalUser(payload.user)
        : null;
      if (!user || user.id !== userId.toLowerCase() || user.active !== active) {
        throw new TenantUserOperationsApiError('TENANT_USER_RESPONSE_INVALID');
      }
      return user;
    },
  });
}
