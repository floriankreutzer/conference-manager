import { loadCatalog, loadSiteInfo } from '../core/catalog.js';
import { createApiClient } from '../core/api-client.js';
import { createProductionRepositories } from '../core/production-persistence.js';
import { RUNTIME_MODE, normalizeRuntimeMode, runtimeModeFromDocument } from '../core/security-policy.js';
import {
  KEYS,
  notificationRepository,
  readJson,
  requestRepository,
  writeJson,
} from '../core/storage.js';

function createDemoRepositories() {
  return Object.freeze({
    mode: RUNTIME_MODE.DEMO,
    requests: requestRepository,
    catalog: Object.freeze({
      get: () => loadCatalog(),
      save: (catalog) => {
        writeJson(KEYS.catalog, catalog);
        return catalog;
      },
    }),
    profile: Object.freeze({
      get: () => readJson(KEYS.profile, { firstName: '', lastName: '' }),
      save: (profile) => {
        writeJson(KEYS.profile, profile);
        return profile;
      },
    }),
    notifications: notificationRepository,
    configuration: Object.freeze({
      get: () => Object.freeze({ siteInfo: loadSiteInfo() }),
      save: (configuration) => {
        const siteInfo = configuration?.siteInfo;
        if (!siteInfo || typeof siteInfo !== 'object' || Array.isArray(siteInfo)) {
          throw new TypeError('DEMO_CONFIGURATION_INVALID');
        }
        writeJson(KEYS.siteInfo, siteInfo);
        return configuration;
      },
    }),
  });
}

export function createPersistenceRuntime({
  mode = runtimeModeFromDocument(),
  apiClient,
  origin = globalThis.location?.origin,
  fetchImpl = globalThis.fetch,
  csrfTokenProvider,
} = {}) {
  const normalizedMode = normalizeRuntimeMode(mode);
  if (normalizedMode === RUNTIME_MODE.DEMO) return createDemoRepositories();

  const client = apiClient || createApiClient({
    baseUrl: '/api/',
    origin,
    fetchImpl,
    csrfTokenProvider,
  });
  return createProductionRepositories({ apiClient: client });
}
