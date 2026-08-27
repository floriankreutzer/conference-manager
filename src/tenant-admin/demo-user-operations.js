import {
  TENANT_ELEVATED_ROLE,
  elevatedRolesFromUser,
  normalizeElevatedRoleSelection,
} from './user-role-model.js';

const BASELINE_ROLE = 'employee';
const ELEVATED_ROLE_SET = new Set(Object.values(TENANT_ELEVATED_ROLE));
const STATUS_FILTERS = new Set(['all', 'active', 'disabled']);
const ROLE_FILTERS = new Set(['all', 'employee_only', 'conference_manager', 'tenant_admin']);
const PROVIDER_FILTERS = new Set(['all', 'linked', 'unlinked']);
const MAX_SEARCH_LENGTH = 80;
const MAX_PAGE_SIZE = 100;
const DEMO_LINKED_AT = '2026-08-20T08:00:00.000Z';

function demoError(code) {
  const error = new Error(code);
  error.name = 'DemoTenantUserOperationsError';
  error.code = code;
  return error;
}

function fixtureUsers(currentUserId, currentDisplayName) {
  return [
    {
      id: currentUserId,
      displayName: String(currentDisplayName || 'Demo User').trim().slice(0, 160) || 'Demo User',
      active: true,
      roles: [BASELINE_ROLE, TENANT_ELEVATED_ROLE.TENANT_ADMIN],
      lifecycleVersion: 1,
      linked: true,
      linkedAt: DEMO_LINKED_AT,
      lastSignInAt: '2026-08-27T07:45:00.000Z',
      openRequestCount: 1,
    },
    {
      id: 'demo-conference-manager',
      displayName: 'Anna Weber',
      active: true,
      roles: [BASELINE_ROLE, TENANT_ELEVATED_ROLE.CONFERENCE_MANAGER],
      lifecycleVersion: 2,
      linked: true,
      linkedAt: '2026-08-21T09:15:00.000Z',
      lastSignInAt: '2026-08-26T15:30:00.000Z',
      openRequestCount: 3,
    },
    {
      id: 'demo-employee',
      displayName: 'David Chen',
      active: true,
      roles: [BASELINE_ROLE],
      lifecycleVersion: 1,
      linked: false,
      linkedAt: null,
      lastSignInAt: null,
      openRequestCount: 0,
    },
    {
      id: 'demo-inactive-manager',
      displayName: 'Mina Patel',
      active: false,
      roles: [BASELINE_ROLE, TENANT_ELEVATED_ROLE.CONFERENCE_MANAGER],
      lifecycleVersion: 4,
      linked: true,
      linkedAt: '2026-08-19T13:00:00.000Z',
      lastSignInAt: '2026-08-23T11:20:00.000Z',
      openRequestCount: 2,
    },
  ];
}

function publicUser(user) {
  return Object.freeze({
    id: user.id,
    displayName: user.displayName,
    active: user.active,
    roles: Object.freeze([...user.roles]),
    lifecycle: Object.freeze({
      status: user.active ? 'active' : 'disabled',
      version: user.lifecycleVersion,
    }),
    identityProvider: Object.freeze({
      linked: user.linked,
      linkedAt: user.linkedAt,
    }),
    lastSignInAt: user.lastSignInAt,
    requestOwnership: Object.freeze({
      openRequestCount: user.openRequestCount,
      ownershipPreservedOnDisable: true,
    }),
  });
}

function publicRoleUser(user) {
  return Object.freeze({
    id: user.id,
    displayName: user.displayName,
    active: user.active,
    roles: Object.freeze([...user.roles]),
  });
}

function validRoleSelection(value) {
  return Array.isArray(value)
    && value.length <= ELEVATED_ROLE_SET.size
    && new Set(value).size === value.length
    && value.every((role) => ELEVATED_ROLE_SET.has(role));
}

function normalizedFilters({
  limit = 25,
  afterId = null,
  search = null,
  status = 'all',
  role = 'all',
  providerLink = 'all',
} = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) throw demoError('HTTP_400');
  if (afterId !== null && typeof afterId !== 'string') throw demoError('HTTP_400');
  if (
    search !== null
    && (
      typeof search !== 'string'
      || search.length < 1
      || search.length > MAX_SEARCH_LENGTH
      || search.trim() !== search
      || /[\u0000-\u001f\u007f]/.test(search)
    )
  ) throw demoError('HTTP_400');
  if (!STATUS_FILTERS.has(status) || !ROLE_FILTERS.has(role) || !PROVIDER_FILTERS.has(providerLink)) {
    throw demoError('HTTP_400');
  }
  return Object.freeze({ limit, afterId, search, status, role, providerLink });
}

function matches(user, filters) {
  if (filters.search !== null && !user.displayName.toLocaleLowerCase('en-US').includes(
    filters.search.toLocaleLowerCase('en-US'),
  )) return false;
  if (filters.status !== 'all' && filters.status !== (user.active ? 'active' : 'disabled')) return false;
  if (filters.role === 'employee_only' && user.roles.length !== 1) return false;
  if (
    filters.role !== 'all'
    && filters.role !== 'employee_only'
    && !user.roles.includes(filters.role)
  ) return false;
  if (filters.providerLink !== 'all' && filters.providerLink !== (user.linked ? 'linked' : 'unlinked')) {
    return false;
  }
  return true;
}

export function createDemoTenantUserOperations({ currentUserId, currentDisplayName } = {}) {
  if (typeof currentUserId !== 'string' || !currentUserId.trim()) {
    throw new TypeError('DEMO_TENANT_ADMIN_USER_ID_REQUIRED');
  }

  let users = fixtureUsers(currentUserId, currentDisplayName);

  return Object.freeze({
    isDemo: true,

    async listUsers(values = {}) {
      const filters = normalizedFilters(values);
      const visible = users.filter((user) => matches(user, filters));
      const afterIndex = filters.afterId === null
        ? -1
        : visible.findIndex((user) => user.id === filters.afterId);
      if (filters.afterId !== null && afterIndex < 0) throw demoError('HTTP_400');
      const page = visible.slice(afterIndex + 1, afterIndex + 1 + filters.limit);
      const hasMore = visible.length > afterIndex + 1 + page.length;
      return Object.freeze({
        users: Object.freeze(page.map(publicUser)),
        nextAfterId: hasMore ? page.at(-1)?.id || null : null,
      });
    },

    async setRoles(userId, roles) {
      if (userId === currentUserId) throw demoError('HTTP_403');
      if (!validRoleSelection(roles)) throw demoError('HTTP_400');

      const user = users.find((entry) => entry.id === userId);
      if (!user) throw demoError('HTTP_404');

      const nextElevatedRoles = normalizeElevatedRoleSelection(roles);
      const previousElevatedRoles = elevatedRolesFromUser(user);
      if (!user.active && nextElevatedRoles.some((role) => !previousElevatedRoles.includes(role))) {
        throw demoError('HTTP_409');
      }

      const removingTenantAdmin = previousElevatedRoles.includes(TENANT_ELEVATED_ROLE.TENANT_ADMIN)
        && !nextElevatedRoles.includes(TENANT_ELEVATED_ROLE.TENANT_ADMIN);
      if (removingTenantAdmin) {
        const otherActiveTenantAdmin = users.some((entry) => (
          entry.id !== user.id
          && entry.active
          && elevatedRolesFromUser(entry).includes(TENANT_ELEVATED_ROLE.TENANT_ADMIN)
        ));
        if (!otherActiveTenantAdmin) throw demoError('LAST_TENANT_ADMIN_REQUIRED');
      }

      user.roles = [BASELINE_ROLE, ...nextElevatedRoles];
      return publicRoleUser(user);
    },

    async setAccess(userId, active, expectedVersion) {
      if (userId === currentUserId) throw demoError('HTTP_403');
      if (typeof active !== 'boolean' || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
        throw demoError('HTTP_400');
      }
      const user = users.find((entry) => entry.id === userId);
      if (!user) throw demoError('HTTP_404');
      if (user.lifecycleVersion !== expectedVersion) {
        throw demoError('TENANT_USER_LIFECYCLE_VERSION_CONFLICT');
      }
      if (
        !active
        && user.roles.includes(TENANT_ELEVATED_ROLE.TENANT_ADMIN)
        && !users.some((entry) => (
          entry.id !== user.id
          && entry.active
          && entry.roles.includes(TENANT_ELEVATED_ROLE.TENANT_ADMIN)
        ))
      ) throw demoError('LAST_TENANT_ADMIN_REQUIRED');
      if (user.active !== active) {
        user.active = active;
        user.lifecycleVersion += 1;
      }
      return publicUser(user);
    },

    reset() {
      users = fixtureUsers(currentUserId, currentDisplayName);
    },
  });
}
