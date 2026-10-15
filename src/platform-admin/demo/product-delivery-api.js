import { normalizeProductDelivery } from '../product-delivery-contracts.js';
import { loadOptionalLiveMetrics } from './live-metrics-api.js';
import { loadOptionalOperationsSources } from './operations-sources-api.js';

export function createProductDeliveryApi({ apiClient }) {
  if (typeof apiClient?.request !== 'function') throw new TypeError('PLATFORM_PRODUCT_DELIVERY_CLIENT_REQUIRED');
  return Object.freeze({ async load() {
    const liveMetrics = await loadOptionalLiveMetrics(apiClient);
    const report = liveMetrics?.productDelivery || normalizeProductDelivery(await apiClient.request('demo/product-delivery', {
      method: 'GET', signal: AbortSignal.timeout(10_000),
    }));
    const operatorSources = await loadOptionalOperationsSources(apiClient);
    return Object.freeze({ ...report, liveMetrics, operatorSources });
  } });
}
