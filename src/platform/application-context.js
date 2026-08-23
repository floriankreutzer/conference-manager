import { loadCatalog, loadSiteInfo, localizedValue } from '../core/catalog.js';
import { language } from '../core/i18n.js';
import { KEYS, readJson, readString, requestRepository, writeString } from '../core/storage.js';

export function createApplicationContext() {
  const profile = readJson(KEYS.profile, { firstName: 'Florian', lastName: 'Kreutzer' });
  let catalog = loadCatalog();
  let siteInfo = loadSiteInfo();

  return {
    profile,
    getCatalog() {
      return catalog;
    },
    getSiteInfo() {
      return siteInfo;
    },
    reloadReferenceData() {
      catalog = loadCatalog();
      siteInfo = loadSiteInfo();
    },
    localized(value) {
      return localizedValue(value, language());
    },
    requests() {
      return requestRepository.all();
    },
    role() {
      return readString(KEYS.role, 'employee');
    },
    isManager() {
      return readString(KEYS.role, 'employee') === 'manager';
    },
    setRole(value) {
      return writeString(KEYS.role, value);
    },
    fullName() {
      return `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
    },
    initials() {
      return `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`.toUpperCase();
    },
    shouldReloadForStorageKey(key) {
      return [KEYS.requests, KEYS.catalog, KEYS.siteInfo, KEYS.role].includes(key);
    },
  };
}
