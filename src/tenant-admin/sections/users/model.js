const SESSION_CODES = new Set(['HTTP_401', 'SESSION_EXPIRED', 'SESSION_REVOKED']);
const FORBIDDEN_CODES = new Set(['HTTP_403', 'AUTHORIZATION_DENIED']);
const TRANSIENT_LIST_CODES = new Set(['TENANT_USERS_UNAVAILABLE', 'HTTP_429', 'HTTP_500', 'HTTP_502', 'HTTP_503', 'HTTP_504']);
const LIST_QUERY_KEYS = ['limit', 'afterId', 'search', 'status', 'role', 'providerLink'];

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

export function canRetainUserList(code) {
  return TRANSIENT_LIST_CODES.has(code);
}

// One already validated page may remain visible only in the same active scope
// and query. It is presentation state, never mutation or authorization authority.
export function retainedUserPage(snapshot, scope) {
  if (!snapshot || !scope?.owner || !scope?.userId
    || snapshot.owner !== scope.owner || snapshot.userId !== scope.userId
    || !LIST_QUERY_KEYS.every(key => snapshot.query[key] === scope.query[key])) return null;
  return snapshot.page;
}
