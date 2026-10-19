import { authorityFailureCode } from '../shared/authority-failure.js';
import { createCateringConfigurationApi } from './catering-configuration-api.js';
import { createCateringOperationalHealthApi } from './catering-operational-health-api.js';
import { featureFlags } from './feature-flags.js';

export async function discoverCateringConfiguration({ context, authentication, timeoutMs = 5000 } = {}) {
  if (!authentication || context?.isDemoRuntime() || !context?.isTenantAdmin()
    || !context.hasTenantAdminPermission('tenant:integrations:manage')) return null;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('CATERING_DISCOVERY_TIMEOUT_INVALID');
  const api = createCateringConfigurationApi({ apiClient: authentication.apiClient });
  const controller = new AbortController();
  let timeout;
  try {
    await Promise.race([
      api.listConnections({ signal: controller.signal }),
      new Promise((_, reject) => {
        timeout = globalThis.setTimeout(() => { controller.abort(); reject(new Error('CATERING_DISCOVERY_TIMEOUT')); }, timeoutMs);
      }),
    ]);
    return Object.freeze({ ...api, ...createCateringOperationalHealthApi({ apiClient: authentication.apiClient }), featureFlags: featureFlags.forServerCateringConfiguration(true) });
  } catch (error) {
    if (authorityFailureCode(error)) throw error;
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
    controller.abort();
  }
}
