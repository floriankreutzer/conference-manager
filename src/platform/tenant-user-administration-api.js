const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_ORDER = Object.freeze(['employee', 'conference_manager', 'tenant_admin']);
const ROLE_SET = new Set(ROLE_ORDER);
const ELEVATED_ROLE_ORDER = Object.freeze(['conference_manager', 'tenant_admin']);
const ELEVATED_ROLE_SET = new Set(ELEVATED_ROLE_ORDER);
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

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
  if (!Array.isArray(value) || value.length > PAGE_SIZE) return null;
  const users = value.map(normalizedUser);
  if (users.some((user) => !user)) return null;
  if (new Set(users.map((user) => user.id)).size !== users.length) return null;
  return Object.freeze(users);
}

function normalizedPage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const users = normalizedUsers(value.users);
  const nextAfterId = value.nextAfterId;
  if (!users || (nextAfterId !== null && !isUuid(nextAfterId))) return null;
  if (nextAfterId !== null && (users.length !== PAGE_SIZE || users.at(-1)?.id !== nextAfterId)) return null;
  return Object.freeze({ users, nextAfterId });
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
      const users = [];
      const seenUserIds = new Set();
      const seenCursors = new Set();
      let afterId = null;

      for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
        const cursor = afterId === null ? '' : `&afterId=${encodeURIComponent(afterId)}`;
        let payload;
        try {
          payload = await apiClient.request(`v1/tenant/users?limit=${PAGE_SIZE}${cursor}`);
        } catch (error) {
          throw new TenantUserAdministrationApiError(error?.code || 'TENANT_USERS_UNAVAILABLE', { cause: error });
        }
        const page = normalizedPage(payload);
        if (!page) throw new TenantUserAdministrationApiError('TENANT_USERS_RESPONSE_INVALID');
        for (const user of page.users) {
          if (seenUserIds.has(user.id)) throw new TenantUserAdministrationApiError('TENANT_USERS_RESPONSE_INVALID');
          seenUserIds.add(user.id);
          users.push(user);
        }
        if (page.nextAfterId === null) return Object.freeze(users);
        if (seenCursors.has(page.nextAfterId)) {
          throw new TenantUserAdministrationApiError('TENANT_USERS_RESPONSE_INVALID');
        }
        seenCursors.add(page.nextAfterId);
        afterId = page.nextAfterId;
      }

      throw new TenantUserAdministrationApiError('TENANT_USERS_LIMIT_EXCEEDED');
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
