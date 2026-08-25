const TENANT_USERS_PATH = 'v1/tenant/users';
const INTERNAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DISPLAY_NAME_MAX_LENGTH = 200;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const ROLE_ORDER = Object.freeze(['employee', 'conference_manager', 'tenant_admin']);
const ELEVATED_ROLE_ORDER = Object.freeze(['conference_manager', 'tenant_admin']);
const KNOWN_ROLES = new Set(ROLE_ORDER);
const ALLOWED_USER_KEYS = new Set(['id', 'displayName', 'active', 'roles']);
const ALLOWED_LIST_KEYS = new Set(['users', 'nextAfterId', 'requestId']);
const ALLOWED_MUTATION_KEYS = new Set(['user', 'requestId']);

export class TenantUserAdministrationError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'TenantUserAdministrationError';
    this.code = code;
  }
}

function assertPlainObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TenantUserAdministrationError(code);
  }
  return value;
}

function assertAllowedKeys(value, allowedKeys, code) {
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new TenantUserAdministrationError(code);
  }
}

function assertInternalUuid(value, code = 'TENANT_USER_ID_INVALID') {
  if (typeof value !== 'string' || !INTERNAL_UUID.test(value)) {
    throw new TenantUserAdministrationError(code);
  }
  return value;
}

function canonicalRoles(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > ROLE_ORDER.length) {
    throw new TenantUserAdministrationError('TENANT_USER_ROLES_INVALID');
  }
  if (new Set(value).size !== value.length || value.some((role) => !KNOWN_ROLES.has(role))) {
    throw new TenantUserAdministrationError('TENANT_USER_ROLES_INVALID');
  }
  const roles = ROLE_ORDER.filter((role) => value.includes(role));
  if (roles.length !== value.length || roles.some((role, index) => role !== value[index])) {
    throw new TenantUserAdministrationError('TENANT_USER_ROLES_INVALID');
  }
  if (roles[0] !== 'employee') {
    throw new TenantUserAdministrationError('TENANT_USER_ROLES_INVALID');
  }
  return Object.freeze(roles);
}

export function canonicalElevatedRoles(value) {
  if (!Array.isArray(value) || value.length > ELEVATED_ROLE_ORDER.length) {
    throw new TenantUserAdministrationError('TENANT_USER_ROLES_INVALID');
  }
  if (new Set(value).size !== value.length || value.some((role) => !ELEVATED_ROLE_ORDER.includes(role))) {
    throw new TenantUserAdministrationError('TENANT_USER_ROLES_INVALID');
  }
  const roles = ELEVATED_ROLE_ORDER.filter((role) => value.includes(role));
  if (roles.length !== value.length || roles.some((role, index) => role !== value[index])) {
    throw new TenantUserAdministrationError('TENANT_USER_ROLES_INVALID');
  }
  return Object.freeze(roles);
}

export function validateTenantUser(value) {
  const user = assertPlainObject(value, 'TENANT_USER_INVALID');
  assertAllowedKeys(user, ALLOWED_USER_KEYS, 'TENANT_USER_INVALID');
  const displayName = typeof user.displayName === 'string' ? user.displayName.trim() : '';
  if (!displayName || displayName.length > DISPLAY_NAME_MAX_LENGTH || typeof user.active !== 'boolean') {
    throw new TenantUserAdministrationError('TENANT_USER_INVALID');
  }
  return Object.freeze({
    id: assertInternalUuid(user.id),
    displayName,
    active: user.active,
    roles: canonicalRoles(user.roles),
  });
}

export function validateTenantUserPage(value) {
  const page = assertPlainObject(value, 'TENANT_USER_PAGE_INVALID');
  assertAllowedKeys(page, ALLOWED_LIST_KEYS, 'TENANT_USER_PAGE_INVALID');
  if (!Array.isArray(page.users) || page.users.length > MAX_PAGE_LIMIT) {
    throw new TenantUserAdministrationError('TENANT_USER_PAGE_INVALID');
  }
  const users = Object.freeze(page.users.map(validateTenantUser));
  const nextAfterId = page.nextAfterId === null
    ? null
    : assertInternalUuid(page.nextAfterId, 'TENANT_USER_CURSOR_INVALID');
  if (nextAfterId !== null && users.at(-1)?.id !== nextAfterId) {
    throw new TenantUserAdministrationError('TENANT_USER_CURSOR_INVALID');
  }
  return Object.freeze({ users, nextAfterId });
}

function validateTenantUserMutation(value) {
  const result = assertPlainObject(value, 'TENANT_USER_MUTATION_INVALID');
  assertAllowedKeys(result, ALLOWED_MUTATION_KEYS, 'TENANT_USER_MUTATION_INVALID');
  return validateTenantUser(result.user);
}

function normalizedLimit(value) {
  const limit = value === undefined ? DEFAULT_PAGE_LIMIT : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    throw new TenantUserAdministrationError('TENANT_USER_PAGE_LIMIT_INVALID');
  }
  return limit;
}

function listPath({ limit, afterId }) {
  const parameters = new URLSearchParams({ limit: String(normalizedLimit(limit)) });
  if (afterId !== undefined && afterId !== null) {
    parameters.set('afterId', assertInternalUuid(afterId, 'TENANT_USER_CURSOR_INVALID'));
  }
  return `${TENANT_USERS_PATH}?${parameters.toString()}`;
}

export function createTenantUserAdministrationService({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') {
    throw new TypeError('API_CLIENT_REQUIRED');
  }

  return Object.freeze({
    async listUsers(page = {}) {
      try {
        return validateTenantUserPage(await apiClient.request(listPath(page)));
      } catch (error) {
        if (error instanceof TenantUserAdministrationError) throw error;
        throw new TenantUserAdministrationError('TENANT_USER_LIST_FAILED', { cause: error });
      }
    },
    async setElevatedRoles({ userId, roles }) {
      const targetUserId = assertInternalUuid(userId);
      const elevatedRoles = canonicalElevatedRoles(roles);
      try {
        return validateTenantUserMutation(await apiClient.request(
          `${TENANT_USERS_PATH}/${encodeURIComponent(targetUserId)}/roles`,
          {
            method: 'PUT',
            body: { roles: elevatedRoles },
          },
        ));
      } catch (error) {
        if (error instanceof TenantUserAdministrationError) throw error;
        throw new TenantUserAdministrationError('TENANT_USER_UPDATE_FAILED', { cause: error });
      }
    },
  });
}
