import { ApiSecurityError, createApiClient } from '../core/api-client.js';

const SESSION_PATH = 'v1/session';
const LOGIN_PATH = '/api/v1/auth/microsoft/login';
const APPLICATION_ROOT = '/';
const INTERNAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TENANT_STATUS = /^[a-z][a-z0-9_]{0,31}$/;

export const PRODUCTION_TENANT_ROLE = Object.freeze({
  EMPLOYEE: 'employee',
  CONFERENCE_MANAGER: 'conference_manager',
  TENANT_ADMIN: 'tenant_admin',
});

export const PRODUCTION_PERMISSION = Object.freeze({
  REQUEST_READ: 'request:read',
  REQUEST_CANCEL: 'request:cancel',
  REQUEST_MANAGE: 'request:manage',
  TENANT_CONFIGURE: 'tenant:configure',
  TENANT_USERS_MANAGE: 'tenant:users:manage',
  TENANT_INTEGRATIONS_MANAGE: 'tenant:integrations:manage',
  TENANT_AUDIT_READ: 'tenant:audit:read',
});

const ROLE_ORDER = Object.freeze([
  PRODUCTION_TENANT_ROLE.EMPLOYEE,
  PRODUCTION_TENANT_ROLE.CONFERENCE_MANAGER,
  PRODUCTION_TENANT_ROLE.TENANT_ADMIN,
]);
const ROLE_PERMISSIONS = Object.freeze({
  [PRODUCTION_TENANT_ROLE.EMPLOYEE]: Object.freeze([
    PRODUCTION_PERMISSION.REQUEST_READ,
    PRODUCTION_PERMISSION.REQUEST_CANCEL,
  ]),
  [PRODUCTION_TENANT_ROLE.CONFERENCE_MANAGER]: Object.freeze([
    PRODUCTION_PERMISSION.REQUEST_READ,
    PRODUCTION_PERMISSION.REQUEST_MANAGE,
  ]),
  [PRODUCTION_TENANT_ROLE.TENANT_ADMIN]: Object.freeze([
    PRODUCTION_PERMISSION.TENANT_CONFIGURE,
    PRODUCTION_PERMISSION.TENANT_USERS_MANAGE,
    PRODUCTION_PERMISSION.TENANT_INTEGRATIONS_MANAGE,
    PRODUCTION_PERMISSION.TENANT_AUDIT_READ,
  ]),
});
const KNOWN_ROLES = new Set(ROLE_ORDER);
const KNOWN_PERMISSIONS = new Set(Object.values(ROLE_PERMISSIONS).flat());

export const PRODUCTION_AUTH_STATUS = Object.freeze({
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  UNAVAILABLE: 'unavailable',
});

export class ProductionSessionError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'ProductionSessionError';
    this.code = code;
  }
}

function assertPlainObject(value, code = 'SESSION_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProductionSessionError(code);
  return value;
}

function assertInternalUuid(value) {
  if (typeof value !== 'string' || !INTERNAL_UUID.test(value)) throw new ProductionSessionError('SESSION_INVALID');
  return value;
}

function canonicalRoles(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > ROLE_ORDER.length) {
    throw new ProductionSessionError('SESSION_ROLES_INVALID');
  }
  if (new Set(value).size !== value.length || value.some((role) => !KNOWN_ROLES.has(role))) {
    throw new ProductionSessionError('SESSION_ROLES_INVALID');
  }
  const roles = ROLE_ORDER.filter((role) => value.includes(role));
  if (roles.length !== value.length || roles.some((role, index) => role !== value[index])) {
    throw new ProductionSessionError('SESSION_ROLES_INVALID');
  }
  if (roles[0] !== PRODUCTION_TENANT_ROLE.EMPLOYEE) {
    throw new ProductionSessionError('SESSION_ROLES_INVALID');
  }
  return Object.freeze(roles);
}

function expectedPermissions(roles) {
  const permissions = [];
  const seen = new Set();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      if (seen.has(permission)) continue;
      seen.add(permission);
      permissions.push(permission);
    }
  }
  return permissions;
}

function canonicalPermissions(value, roles) {
  if (!Array.isArray(value) || value.length > KNOWN_PERMISSIONS.size) {
    throw new ProductionSessionError('SESSION_PERMISSIONS_INVALID');
  }
  if (new Set(value).size !== value.length || value.some((permission) => !KNOWN_PERMISSIONS.has(permission))) {
    throw new ProductionSessionError('SESSION_PERMISSIONS_INVALID');
  }
  const expected = expectedPermissions(roles);
  if (expected.length !== value.length || expected.some((permission) => !value.includes(permission))) {
    throw new ProductionSessionError('SESSION_PERMISSIONS_INVALID');
  }
  return Object.freeze([...expected]);
}

function validFutureTimestamp(value, now) {
  if (typeof value !== 'string' || value.length > 64) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > now;
}

function validCsrfToken(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 4096;
}

export function validateProductionSession(payload, { clock = () => Date.now() } = {}) {
  const root = assertPlainObject(payload);
  const user = assertPlainObject(root.user);
  const tenant = assertPlainObject(root.tenant);
  const session = assertPlainObject(root.session);
  const roles = canonicalRoles(root.roles);
  const permissions = canonicalPermissions(root.permissions, roles);

  if (typeof tenant.status !== 'string' || !TENANT_STATUS.test(tenant.status)) {
    throw new ProductionSessionError('SESSION_TENANT_INVALID');
  }
  if (!validFutureTimestamp(session.expiresAt, clock())) {
    throw new ProductionSessionError('SESSION_EXPIRED');
  }
  if (!validCsrfToken(root.csrfToken)) throw new ProductionSessionError('SESSION_CSRF_INVALID');

  return Object.freeze({
    user: Object.freeze({ id: assertInternalUuid(user.id) }),
    tenant: Object.freeze({
      id: assertInternalUuid(tenant.id),
      status: tenant.status,
    }),
    roles,
    permissions,
    session: Object.freeze({ expiresAt: session.expiresAt }),
    csrfToken: root.csrfToken,
  });
}

function isUnauthenticated(error) {
  return error instanceof ApiSecurityError && error.code === 'HTTP_401';
}

function defaultNavigate(path) {
  globalThis.location.assign(path);
}

function defaultReplace(path) {
  globalThis.location.replace(path);
}

export function createProductionSessionRuntime({
  origin = globalThis.location?.origin,
  fetchImpl = globalThis.fetch,
  navigate = defaultNavigate,
  replace = defaultReplace,
  clock = () => Date.now(),
} = {}) {
  let currentSession = null;
  let status = PRODUCTION_AUTH_STATUS.UNAUTHENTICATED;
  const apiClient = createApiClient({
    baseUrl: '/api/',
    origin,
    fetchImpl,
    csrfTokenProvider: () => currentSession?.csrfToken || null,
  });

  return Object.freeze({
    apiClient,
    status() {
      return status;
    },
    currentSession() {
      return currentSession;
    },
    async bootstrap() {
      try {
        currentSession = validateProductionSession(
          await apiClient.request(SESSION_PATH),
          { clock },
        );
        status = PRODUCTION_AUTH_STATUS.AUTHENTICATED;
        return Object.freeze({ status, session: currentSession });
      } catch (error) {
        currentSession = null;
        if (isUnauthenticated(error)) {
          status = PRODUCTION_AUTH_STATUS.UNAUTHENTICATED;
          return Object.freeze({ status, session: null });
        }
        status = PRODUCTION_AUTH_STATUS.UNAVAILABLE;
        if (error instanceof ProductionSessionError) throw error;
        throw new ProductionSessionError('SESSION_BOOTSTRAP_FAILED', { cause: error });
      }
    },
    signIn() {
      navigate(LOGIN_PATH);
    },
    async signOut() {
      if (!currentSession) throw new ProductionSessionError('SESSION_REQUIRED');
      try {
        await apiClient.request(SESSION_PATH, { method: 'DELETE' });
      } catch (error) {
        if (!isUnauthenticated(error)) throw new ProductionSessionError('SESSION_LOGOUT_FAILED', { cause: error });
      }
      currentSession = null;
      status = PRODUCTION_AUTH_STATUS.UNAUTHENTICATED;
      replace(APPLICATION_ROOT);
    },
  });
}
