import { createCateringCataloguePublicationApi } from './catering-catalogue-publication-api.js';
import { authorityFailureCode } from '../shared/authority-failure.js';
import { createCateringProviderCatalogueApi } from './catering-provider-catalogue-api.js';
import { createCateringCatalogueAssignmentApi } from './catering-catalogue-assignment-api.js';
import { featureFlags } from './feature-flags.js';

export async function discoverCateringCatalogueAssignments({ context, authentication, timeoutMs = 5000 } = {}) {
  if (!authentication || context?.isDemoRuntime() || !context?.isManager()
    || !context.canManageTenantCatalogue()) return null;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('CATERING_DISCOVERY_TIMEOUT_INVALID');
  const api = createCateringCatalogueAssignmentApi({ apiClient: authentication.apiClient });
  const controller = new AbortController();
  let timeout;
  try {
    await Promise.race([
      api.loadAssignments({ signal: controller.signal }),
      new Promise((_, reject) => {
        timeout = globalThis.setTimeout(() => { controller.abort(); reject(new Error('CATERING_DISCOVERY_TIMEOUT')); }, timeoutMs);
      }),
    ]);
    return Object.freeze({ ...api,...createCateringCataloguePublicationApi({ apiClient: authentication.apiClient }), ...createCateringProviderCatalogueApi({ apiClient: authentication.apiClient }), featureFlags: featureFlags.forServerCateringCatalogue(true) });
  } catch (error) {
    if (authorityFailureCode(error)) throw error;
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
    controller.abort();
  }
}
