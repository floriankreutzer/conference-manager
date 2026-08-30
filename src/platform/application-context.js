import { language } from '../core/i18n.js';
import {
  RUNTIME_MODE,
  USER_ROLE,
  runtimeModeFromDocument,
} from '../core/security-policy.js';
import { createProductionPersistence } from './production-persistence.js';
import {
  PRODUCTION_AUTH_STATUS,
  PRODUCTION_PERMISSION,
  PRODUCTION_TENANT_ROLE,
} from './production-session.js';

const EMPTY_PROFILE = Object.freeze({ displayName: '', firstName: '', lastName: '' });
const EMPTY_CATALOG = Object.freeze({
  sites: Object.freeze([]),
  rooms: Object.freeze([]),
  services: Object.freeze([]),
  cateringPackages: Object.freeze([]),
  cateringItems: Object.freeze([]),
  costCenters: Object.freeze([]),
});
const EMPTY_SITE_INFO = Object.freeze({});
const EMPTY_REQUESTS = Object.freeze([]);
const EMPTY_NOTIFICATIONS = Object.freeze([]);
const PRODUCTION_AUTH_STATUSES = new Set(Object.values(PRODUCTION_AUTH_STATUS));
const TENANT_ADMIN_PERMISSIONS = new Set([
  PRODUCTION_PERMISSION.TENANT_CONFIGURE,
  PRODUCTION_PERMISSION.TENANT_USERS_MANAGE,
  PRODUCTION_PERMISSION.TENANT_INTEGRATIONS_MANAGE,
  PRODUCTION_PERMISSION.TENANT_AUDIT_READ,
]);

function normalizedAuthenticationStatus(value) {
  return PRODUCTION_AUTH_STATUSES.has(value) ? value : PRODUCTION_AUTH_STATUS.UNAVAILABLE;
}

function normalizedProfile(value) {
  const displayName = typeof value?.displayName === 'string' ? value.displayName.trim() : '';
  if (!displayName) return EMPTY_PROFILE;
  const [firstName = '', ...rest] = displayName.split(/\s+/);
  return Object.freeze({ displayName, firstName, lastName: rest.join(' ') });
}

function immutableArray(value, fallback) {
  return Array.isArray(value) ? Object.freeze([...value]) : fallback;
}

function localizedValue(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const selected = language();
  return String(value[selected] || value.de || value.en || '');
}

export function createApplicationContextFromState({
  runtimeMode = runtimeModeFromDocument(document),
  productionSession = null,
  productionAuthenticationStatus = PRODUCTION_AUTH_STATUS.UNAUTHENTICATED,
  authenticationRuntime = null,
  demoTenants = EMPTY_REQUESTS,
  serverProfile = EMPTY_PROFILE,
  serverCatalog = EMPTY_CATALOG,
  serverSiteInfo = EMPTY_SITE_INFO,
  serverRequests = EMPTY_REQUESTS,
  serverNotifications = EMPTY_NOTIFICATIONS,
} = {}) {
  const isDemo = runtimeMode === RUNTIME_MODE.DEMO;
  const authenticationStatus = normalizedAuthenticationStatus(productionAuthenticationStatus);
  const trustedSession = authenticationStatus === PRODUCTION_AUTH_STATUS.AUTHENTICATED
    ? productionSession
    : null;
  const roles = new Set(Array.isArray(trustedSession?.roles) ? trustedSession.roles : []);
  const permissions = new Set(Array.isArray(trustedSession?.permissions) ? trustedSession.permissions : []);
  const serverPersistence = trustedSession && authenticationRuntime?.apiClient?.request
    ? createProductionPersistence({ apiClient: authenticationRuntime.apiClient })
    : null;
  const profile = normalizedProfile(serverProfile);
  const catalog = serverCatalog && typeof serverCatalog === 'object' ? serverCatalog : EMPTY_CATALOG;
  const siteInfo = serverSiteInfo && typeof serverSiteInfo === 'object' ? serverSiteInfo : EMPTY_SITE_INFO;
  const requests = immutableArray(serverRequests, EMPTY_REQUESTS);
  const notifications = immutableArray(serverNotifications, EMPTY_NOTIFICATIONS);
  const tenants = immutableArray(demoTenants, EMPTY_REQUESTS);

  function hasCapability(role, permission) {
    return Boolean(trustedSession) && roles.has(role) && permissions.has(permission);
  }

  function presentationRole() {
    if (hasCapability(PRODUCTION_TENANT_ROLE.TENANT_ADMIN, PRODUCTION_PERMISSION.TENANT_USERS_MANAGE)) {
      return USER_ROLE.TENANT_ADMIN;
    }
    if (hasCapability(PRODUCTION_TENANT_ROLE.CONFERENCE_MANAGER, PRODUCTION_PERMISSION.REQUEST_MANAGE)) {
      return USER_ROLE.MANAGER;
    }
    return USER_ROLE.EMPLOYEE;
  }

  function canSwitchDemoContext() {
    return isDemo
      && Boolean(trustedSession)
      && typeof authenticationRuntime?.selectContext === 'function'
      && authenticationRuntime?.status?.() === PRODUCTION_AUTH_STATUS.AUTHENTICATED;
  }

  async function switchDemoContext({ tenantId, persona } = {}) {
    if (!canSwitchDemoContext()) return false;
    await authenticationRuntime.selectContext({ tenantId, persona });
    return true;
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
      return authenticationStatus;
    },
    authenticationRuntime() {
      return authenticationRuntime;
    },
    productionPersistence() {
      return serverPersistence;
    },
    serverPersistence() {
      return serverPersistence;
    },
    isAuthenticated() {
      return Boolean(trustedSession);
    },
    canSwitchRole() {
      return canSwitchDemoContext();
    },
    userId() {
      return trustedSession?.user?.id || '';
    },
    tenantId() {
      return trustedSession?.tenant?.id || '';
    },
    demoPersona() {
      return isDemo ? trustedSession?.demo?.persona || null : null;
    },
    demoTenants() {
      return tenants;
    },
    switchDemoContext,
    setRole(value) {
      if (!isDemo || !trustedSession) return false;
      const persona = value === USER_ROLE.MANAGER ? 'conference_manager' : value;
      return switchDemoContext({ tenantId: trustedSession.tenant.id, persona });
    },
    getCatalog() {
      return catalog;
    },
    getSiteInfo() {
      return siteInfo;
    },
    reloadReferenceData() {},
    localized(value) {
      return localizedValue(value);
    },
    requests() {
      return requests;
    },
    notifications(limit = 4) {
      return notifications.slice(0, Math.max(0, Number(limit) || 0));
    },
    role() {
      return presentationRole();
    },
    isManager() {
      return hasCapability(
        PRODUCTION_TENANT_ROLE.CONFERENCE_MANAGER,
        PRODUCTION_PERMISSION.REQUEST_MANAGE,
      );
    },
    hasTenantAdminPermission(permission) {
      return TENANT_ADMIN_PERMISSIONS.has(permission)
        && hasCapability(PRODUCTION_TENANT_ROLE.TENANT_ADMIN, permission);
    },
    canManageTenantUsers() {
      return hasCapability(
        PRODUCTION_TENANT_ROLE.TENANT_ADMIN,
        PRODUCTION_PERMISSION.TENANT_USERS_MANAGE,
      );
    },
    isTenantAdmin() {
      return hasCapability(
        PRODUCTION_TENANT_ROLE.TENANT_ADMIN,
        PRODUCTION_PERMISSION.TENANT_USERS_MANAGE,
      );
    },
    fullName() {
      return profile.displayName;
    },
    initials() {
      return profile.displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
    },
    shouldReloadForStorageKey() {
      return false;
    },
  });
}

export async function createApplicationContext({
  runtimeMode = runtimeModeFromDocument(document),
  authenticationBootstrap,
} = {}) {
  if (typeof authenticationBootstrap !== 'function') {
    throw new TypeError('AUTHENTICATION_BOOTSTRAP_REQUIRED');
  }
  const authentication = await authenticationBootstrap();
  let status = authentication?.status;
  let session = authentication?.session || null;
  let profile = EMPTY_PROFILE;
  let catalog = EMPTY_CATALOG;
  let siteInfo = EMPTY_SITE_INFO;
  let requests = EMPTY_REQUESTS;
  let notifications = EMPTY_NOTIFICATIONS;
  if (status === PRODUCTION_AUTH_STATUS.AUTHENTICATED && authentication?.runtime?.apiClient) {
    const persistence = createProductionPersistence({ apiClient: authentication.runtime.apiClient });
    const [profileResult, catalogResult, siteResult, requestResult, notificationResult] =
      await Promise.allSettled([
        persistence.loadProfile(),
        persistence.loadCatalog(),
        persistence.loadSiteInfo(),
        persistence.listRequests(),
        persistence.listNotifications(),
      ]);
    if (profileResult.status === 'fulfilled') profile = profileResult.value;
    if (catalogResult.status === 'fulfilled') catalog = catalogResult.value;
    if (siteResult.status === 'fulfilled') siteInfo = siteResult.value;
    if (requestResult.status === 'fulfilled') requests = requestResult.value;
    if (notificationResult.status === 'fulfilled') notifications = notificationResult.value;
  }
  return createApplicationContextFromState({
    runtimeMode,
    productionSession: session,
    productionAuthenticationStatus: status,
    authenticationRuntime: authentication?.runtime || null,
    demoTenants: authentication?.tenants || EMPTY_REQUESTS,
    serverProfile: profile,
    serverCatalog: catalog,
    serverSiteInfo: siteInfo,
    serverRequests: requests,
    serverNotifications: notifications,
  });
}
