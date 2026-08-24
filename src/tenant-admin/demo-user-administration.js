import {
  TENANT_ELEVATED_ROLE,
  elevatedRolesFromUser,
  normalizeElevatedRoleSelection,
} from './user-role-model.js';

const BASELINE_ROLE = 'employee';
const ELEVATED_ROLE_SET = new Set(Object.values(TENANT_ELEVATED_ROLE));

function demoError(code) {
  const error = new Error(code);
  error.name = 'DemoTenantUserAdministrationError';
  error.code = code;
  return error;
}

function publicUser(user) {
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

export function createDemoTenantUserAdministration({ currentUserId, currentDisplayName } = {}) {
  if (typeof currentUserId !== 'string' || !currentUserId.trim()) {
    throw new TypeError('DEMO_TENANT_ADMIN_USER_ID_REQUIRED');
  }

  const users = [
    {
      id: currentUserId,
      displayName: String(currentDisplayName || 'Demo User').trim().slice(0, 160) || 'Demo User',
      active: true,
      roles: [BASELINE_ROLE, TENANT_ELEVATED_ROLE.TENANT_ADMIN],
    },
    {
      id: 'demo-conference-manager',
      displayName: 'Anna Weber',
      active: true,
      roles: [BASELINE_ROLE, TENANT_ELEVATED_ROLE.CONFERENCE_MANAGER],
    },
    {
      id: 'demo-employee',
      displayName: 'David Chen',
      active: true,
      roles: [BASELINE_ROLE],
    },
    {
      id: 'demo-inactive-manager',
      displayName: 'Mina Patel',
      active: false,
      roles: [BASELINE_ROLE, TENANT_ELEVATED_ROLE.CONFERENCE_MANAGER],
    },
  ];

  return Object.freeze({
    async listUsers() {
      return Object.freeze(users.map(publicUser));
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
        if (!otherActiveTenantAdmin) throw demoError('HTTP_409');
      }

      user.roles = [BASELINE_ROLE, ...nextElevatedRoles];
      return publicUser(user);
    },
  });
}
