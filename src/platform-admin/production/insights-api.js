import { normalizeProviderUsage } from '../provider-usage-contracts.js';
import { normalizeProductDelivery } from '../product-delivery-contracts.js';

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
      const storedReport = normalizeProductDelivery(await read('insights/product-delivery'), {
        environment: 'production', expectedAccessMode: accessMode,
      });
      return Object.freeze({ storedReport, runtimeProduct: null, liveMetrics: null, operatorSources: null, retrieval: null });
    } }),
  });
}
