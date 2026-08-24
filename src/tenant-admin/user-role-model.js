export const TENANT_ELEVATED_ROLE = Object.freeze({
  CONFERENCE_MANAGER: 'conference_manager',
  TENANT_ADMIN: 'tenant_admin',
});

const ELEVATED_ROLE_ORDER = Object.freeze([
  TENANT_ELEVATED_ROLE.CONFERENCE_MANAGER,
  TENANT_ELEVATED_ROLE.TENANT_ADMIN,
]);
const ELEVATED_ROLE_SET = new Set(ELEVATED_ROLE_ORDER);

export function elevatedRolesFromUser(user) {
  if (!user || !Array.isArray(user.roles)) return Object.freeze([]);
  return Object.freeze(ELEVATED_ROLE_ORDER.filter((role) => user.roles.includes(role)));
}

export function normalizeElevatedRoleSelection(value) {
  if (!Array.isArray(value) || value.length > ELEVATED_ROLE_ORDER.length) return Object.freeze([]);
  if (new Set(value).size !== value.length || value.some((role) => !ELEVATED_ROLE_SET.has(role))) {
    return Object.freeze([]);
  }
  return Object.freeze(ELEVATED_ROLE_ORDER.filter((role) => value.includes(role)));
}

export function sameRoleSelection(left, right) {
  const normalizedLeft = normalizeElevatedRoleSelection(left);
  const normalizedRight = normalizeElevatedRoleSelection(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((role, index) => role === normalizedRight[index]);
}

export function canSelectRole(user, role) {
  if (!user || !ELEVATED_ROLE_SET.has(role)) return false;
  if (user.active) return true;
  return elevatedRolesFromUser(user).includes(role);
}

export function roleUpdateErrorKey(code) {
  if (code === 'HTTP_409') return 'tenantAdmin.users.errorConflict';
  if (code === 'HTTP_401') return 'tenantAdmin.users.errorSession';
  if (code === 'HTTP_403' || code === 'HTTP_404') return 'tenantAdmin.users.errorForbidden';
  return 'tenantAdmin.users.errorGeneric';
}
