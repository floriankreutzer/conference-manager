const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_ORDER = Object.freeze(['employee', 'conference_manager', 'tenant_admin']);
const ROLE_SET = new Set(ROLE_ORDER);
const ELEVATED_ROLE_ORDER = Object.freeze(['conference_manager', 'tenant_admin']);
const ELEVATED_ROLE_SET = new Set(ELEVATED_ROLE_ORDER);

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function normalizedRoles(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > ROLE_ORDER.length) return null;
  if (new Set(value).size !== value.length || value.some((role) => !ROLE_SET.has(role))) return null;
  if (!value.includes('employee')) return null;
  return Object.freeze(ROLE_ORDER.filter((role) => value.includes(role)));
}

function normalizedUser(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const roles = normalizedRoles(value.roles);
  if (
    !isUuid(value.id)
    || typeof value.displayName !== 'string'
    || value.displayName.length < 1
    || value.displayName.length > 160
    || value.displayName.trim() !== value.displayName
    || /[\u0000-\u001f\u007f]/.test(value.displayName)
    || typeof value.active !== 'boolean'
    || !roles
  ) {
    return null;
  }
  return Object.freeze({
    id: value.id,
    displayName: value.displayName,
    active: value.active,
    roles,
  });
}

function normalizedUsers(value) {
  if (!Array.isArray(value) || value.length > 100) return null;
  const users = value.map(normalizedUser);
  if (users.some((user) => !user)) return null;
  if (new Set(users.map((user) => user.id)).size !== users.length) return null;
  return Object.freeze(users);
}

function elevatedRoles(value) {
  if (!Array.isArray(value) || value.length > ELEVATED_ROLE_ORDER.length) {
    throw new TenantUserAdministrationApiError('TENANT_USER_ROLES_INVALID');
  }
  if (new Set(value).size !== value.length || value.some((role) => !ELEVATED_ROLE_SET.has(role))) {
    throw new TenantUserAdministrationApiError('TENANT_USER_ROLES_INVALID');
  }
  return ELEVATED_ROLE_ORDER.filter((role) => value.includes(role));
}

export class TenantUserAdministrationApiError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'TenantUserAdministrationApiError';
    this.code = code;
  }
}

export function createTenantUserAdministrationApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') {
    throw new TypeError('TENANT_USER_API_CLIENT_REQUIRED');
  }

  return Object.freeze({
    async listUsers() {
      let payload;
      try {
        payload = await apiClient.request('v1/tenant/users?limit=100');
      } catch (error) {
        throw new TenantUserAdministrationApiError(error?.code || 'TENANT_USERS_UNAVAILABLE', { cause: error });
      }
      const users = normalizedUsers(payload?.users);
      if (!users) throw new TenantUserAdministrationApiError('TENANT_USERS_RESPONSE_INVALID');
      return users;
    },

    async setRoles(userId, roles) {
      if (!isUuid(userId)) throw new TenantUserAdministrationApiError('TENANT_USER_ID_INVALID');
      const normalized = elevatedRoles(roles);
      let payload;
      try {
        payload = await apiClient.request(`v1/tenant/users/${userId}/roles`, {
          method: 'PUT',
          body: { roles: normalized },
        });
      } catch (error) {
        throw new TenantUserAdministrationApiError(error?.code || 'TENANT_USER_UPDATE_FAILED', { cause: error });
      }
      const user = normalizedUser(payload?.user);
      if (!user || user.id !== userId) {
        throw new TenantUserAdministrationApiError('TENANT_USER_RESPONSE_INVALID');
      }
      return user;
    },
  });
}
