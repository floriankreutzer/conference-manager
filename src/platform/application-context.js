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

export function createApplicationContext() {
  const runtimeMode = runtimeModeFromDocument(document);
  const isDemo = runtimeMode === RUNTIME_MODE.DEMO;
  const profile = isDemo
    ? readJson(KEYS.profile, { firstName: 'Florian', lastName: 'Kreutzer' })
    : EMPTY_PROFILE;
  let catalog = isDemo ? loadCatalog() : EMPTY_CATALOG;
  let siteInfo = isDemo ? loadSiteInfo() : EMPTY_SITE_INFO;

  return {
    profile,
    runtimeMode() {
      return runtimeMode;
    },
    isDemoRuntime() {
      return isDemo;
    },
    canSwitchRole() {
      return isDemo;
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
      return isDemo ? readString(KEYS.role, USER_ROLE.EMPLOYEE) : USER_ROLE.EMPLOYEE;
    },
    isManager() {
      return isDemo && readString(KEYS.role, USER_ROLE.EMPLOYEE) === USER_ROLE.MANAGER;
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
  };
}
