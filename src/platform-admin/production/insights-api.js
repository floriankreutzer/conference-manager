import { normalizeProviderUsage } from '../provider-usage-contracts.js';
import { normalizeRuntimeProductReport } from '../product-runtime-contract.js';
import { normalizeProductDelivery, exactProductObject } from '../product-delivery-contracts.js';

// Deliberate protected ports: no Demo route, fallback, provider URL or browser
// storage. Session/authorization failures and malformed successes propagate.
export function createProtectedPlatformInsights({ apiClient, accessMode = 'application_passkey' } = {}) {
  if (typeof apiClient?.request !== 'function' || !['application_passkey','microsoft_mfa'].includes(accessMode)) throw new TypeError('PLATFORM_INSIGHT_CLIENT_REQUIRED');
  const read = path => apiClient.request(path, { method: 'GET', signal: AbortSignal.timeout(10000) });
  return Object.freeze({
    providerUsage: Object.freeze({ async load() {
      const report = normalizeProviderUsage(await read('insights/providers'), { accessMode });
      return Object.freeze({ ...report, liveMetrics: null, retrieval: null });
    } }),
    productDelivery: Object.freeze({ async load() {
      const payload = await read('insights/product-delivery?schemaVersion=2');
      let runtimeProduct = null;
      if (payload?.schemaVersion === 2) {
        exactProductObject(payload,['schemaVersion','storedReport','runtimeProduct']);
        if (payload.runtimeProduct !== null) runtimeProduct = normalizeRuntimeProductReport(payload.runtimeProduct,
          { environment: 'production',accessMode });
      }
      const storedReport = normalizeProductDelivery(payload?.schemaVersion === 2 ? payload.storedReport : payload, {
        environment: 'production', expectedAccessMode: accessMode,
      });
      return Object.freeze({ storedReport, runtimeProduct, liveMetrics: null, operatorSources: null, retrieval: null });
    } }),
  });
}
