const SESSION_CODES = new Set(['HTTP_401', 'SESSION_EXPIRED', 'SESSION_REVOKED']);
const FORBIDDEN_CODES = new Set(['HTTP_403', 'AUTHORIZATION_DENIED']);

export const USER_FILTER_DEFAULTS = Object.freeze({
  search: null,
  status: 'all',
  role: 'all',
  providerLink: 'all',
});

export function userOperationErrorKey(code, operation) {
  if (code === 'LAST_TENANT_ADMIN_REQUIRED') {
    return 'tenantAdmin.operations.users.error.lastAdmin';
  }
  if (code === 'TENANT_USER_LIFECYCLE_VERSION_CONFLICT') {
    return 'tenantAdmin.operations.users.error.concurrent';
  }
  if (SESSION_CODES.has(code)) return 'tenantAdmin.users.errorSession';
  if (FORBIDDEN_CODES.has(code)) return 'tenantAdmin.users.errorForbidden';
  if (code === 'HTTP_409' && operation === 'roles') return 'tenantAdmin.users.errorConflict';
  if (operation === 'load') return 'tenantAdmin.operations.users.error.load';
  return operation === 'roles'
    ? 'tenantAdmin.users.errorGeneric'
    : 'tenantAdmin.operations.users.error.lifecycle';
}

export function normalizedUserFilters({ search, status, role, providerLink }) {
  const normalizedSearch = String(search || '').trim();
  return Object.freeze({
    search: normalizedSearch || null,
    status,
    role,
    providerLink,
  });
}
