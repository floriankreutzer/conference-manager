import { loadCatalog, loadSiteInfo, localizedValue } from '../core/catalog.js';
import { language } from '../core/i18n.js';
import {
  RUNTIME_MODE,
  USER_ROLE,
  runtimeModeFromDocument,
} from '../core/security-policy.js';
import {
  KEYS,
  notificationRepository,
  readJson,
  readString,
  requestRepository,
  writeString,
} from '../core/storage.js';
import { createProductionPersistence } from './production-persistence.js';
import {
  PRODUCTION_AUTH_STATUS,
  PRODUCTION_PERMISSION,
  PRODUCTION_TENANT_ROLE,
  bootstrapProductionAuthentication,
} from './production-session.js';

const EMPTY_PROFILE = Object.freeze({ firstName: '', lastName: '' });
const EMPTY_CATALOG = Object.freeze({
  rooms: Object.freeze([]),
  services: Object.freeze([]),
  cateringPackages: Object.freeze([]),
  cateringItems: Object.freeze([]),
});
const EMPTY_SITE_INFO = Object.freeze({});
const EMPTY_REQUESTS = Object.freeze([]);
const EMPTY_NOTIFICATIONS = Object.freeze([]);
const DEMO_CURRENT_USER_ID = 'demo-current-user';
const PRODUCTION_AUTH_STATUSES = new Set(Object.values(PRODUCTION_AUTH_STATUS));
const TENANT_ADMIN_PERMISSIONS = new Set([
  PRODUCTION_PERMISSION.TENANT_CONFIGURE,
  PRODUCTION_PERMISSION.TENANT_USERS_MANAGE,
  PRODUCTION_PERMISSION.TENANT_INTEGRATIONS_MANAGE,
  PRODUCTION_PERMISSION.TENANT_AUDIT_READ,
]);

function normalizedProductionAuthenticationStatus(value) {
  return PRODUCTION_AUTH_STATUSES.has(value) ? value : PRODUCTION_AUTH_STATUS.UNAVAILABLE;
}

export function createApplicationContextFromState({
  productionSession = null,
  productionAuthenticationStatus = PRODUCTION_AUTH_STATUS.UNAUTHENTICATED,
  authenticationRuntime = null,
} = {}) {
  const runtimeMode = runtimeModeFromDocument(document);
  const isDemo = runtimeMode === RUNTIME_MODE.DEMO;
  const authenticationStatus = normalizedProductionAuthenticationStatus(productionAuthenticationStatus);
  const trustedProductionSession = !isDemo
    && authenticationStatus === PRODUCTION_AUTH_STATUS.AUTHENTICATED
    ? productionSession
    : null;
  const productionRoles = new Set(
    Array.isArray(trustedProductionSession?.roles) ? trustedProductionSession.roles : [],
  );
  const productionPermissions = new Set(
    Array.isArray(trustedProductionSession?.permissions) ? trustedProductionSession.permissions : [],
  );
  const productionPersistence = !isDemo && authenticationRuntime?.apiClient?.request
    ? createProductionPersistence({ apiClient: authenticationRuntime.apiClient })
    : null;
  const profile = isDemo
    ? readJson(KEYS.profile, { firstName: 'Florian', lastName: 'Kreutzer' })
    : EMPTY_PROFILE;
  let catalog = isDemo ? loadCatalog() : EMPTY_CATALOG;
  let siteInfo = isDemo ? loadSiteInfo() : EMPTY_SITE_INFO;

  function hasProductionCapability(role, permission) {
    return Boolean(trustedProductionSession)
      && productionRoles.has(role)
      && productionPermissions.has(permission);
  }

  function isDemoTenantAdmin() {
    return isDemo && readString(KEYS.role, USER_ROLE.EMPLOYEE) === USER_ROLE.TENANT_ADMIN;
  }

  return Object.freeze({
    profile,
    runtimeMode() {
      return runtimeMode;
    },
    isDemoRuntime() {
      return isDemo;
    },
    authenticationStatus() {
      return isDemo ? null : authenticationStatus;
    },
    authenticationRuntime() {
      return isDemo ? null : authenticationRuntime;
    },
    productionPersistence() {
      return isDemo ? null : productionPersistence;
    },
    isAuthenticated() {
      return isDemo || Boolean(trustedProductionSession);
    },
    canSwitchRole() {
      return isDemo;
    },
    userId() {
      return isDemo ? DEMO_CURRENT_USER_ID : (trustedProductionSession?.user?.id || '');
    },
    getCatalog() {
      return catalog;
    },
    getSiteInfo() {
      return siteInfo;
    },
    reloadReferenceData() {
      if (!isDemo) return;
      catalog = loadCatalog();
      siteInfo = loadSiteInfo();
    },
    localized(value) {
      return localizedValue(value, language());
    },
    requests() {
      return isDemo ? requestRepository.all() : EMPTY_REQUESTS;
    },
    notifications(limit = 4) {
      if (!isDemo) return EMPTY_NOTIFICATIONS;
      return notificationRepository.all().slice(0, Math.max(0, Number(limit) || 0));
    },
    role() {
      if (isDemo) return readString(KEYS.role, USER_ROLE.EMPLOYEE);
      return hasProductionCapability(
        PRODUCTION_TENANT_ROLE.CONFERENCE_MANAGER,
        PRODUCTION_PERMISSION.REQUEST_MANAGE,
      ) ? USER_ROLE.MANAGER : USER_ROLE.EMPLOYEE;
    },
    isManager() {
      if (isDemo) return readString(KEYS.role, USER_ROLE.EMPLOYEE) === USER_ROLE.MANAGER;
      return hasProductionCapability(
        PRODUCTION_TENANT_ROLE.CONFERENCE_MANAGER,
        PRODUCTION_PERMISSION.REQUEST_MANAGE,
      );
    },
    hasTenantAdminPermission(permission) {
      if (!TENANT_ADMIN_PERMISSIONS.has(permission)) return false;
      if (isDemo) return isDemoTenantAdmin();
      return hasProductionCapability(PRODUCTION_TENANT_ROLE.TENANT_ADMIN, permission);
    },
    canManageTenantUsers() {
      if (isDemo) return false;
      return hasProductionCapability(
        PRODUCTION_TENANT_ROLE.TENANT_ADMIN,
        PRODUCTION_PERMISSION.TENANT_USERS_MANAGE,
      );
    },
    isTenantAdmin() {
      if (isDemo) return isDemoTenantAdmin();
      return hasProductionCapability(
        PRODUCTION_TENANT_ROLE.TENANT_ADMIN,
        PRODUCTION_PERMISSION.TENANT_USERS_MANAGE,
      );
    },
    setRole(value) {
      return isDemo ? writeString(KEYS.role, value) : false;
    },
    fullName() {
      return `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
    },
    initials() {
      return `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`.toUpperCase();
    },
    shouldReloadForStorageKey(key) {
      return isDemo && [KEYS.requests, KEYS.catalog, KEYS.siteInfo, KEYS.role].includes(key);
    },
  });
}

export async function createApplicationContext() {
  const runtimeMode = runtimeModeFromDocument(document);
  if (runtimeMode === RUNTIME_MODE.DEMO) return createApplicationContextFromState();

  const productionAuthentication = await bootstrapProductionAuthentication();
  return createApplicationContextFromState({
    productionSession: productionAuthentication.session,
    productionAuthenticationStatus: productionAuthentication.status,
    authenticationRuntime: productionAuthentication.runtime,
  });
}
