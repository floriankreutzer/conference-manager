import { normalizeProductDelivery } from '../product-delivery-contracts.js';
import { normalizeRuntimeProductReport } from '../product-runtime-contract.js';
import { loadOptionalInsightSource } from './insight-source-api.js';
import { loadLiveMetricsSource } from './live-metrics-api.js';
import { loadOperationsSources } from './operations-sources-api.js';

function normalizeProductSource(value) {
  return value?.schemaVersion === 2 ? normalizeRuntimeProductReport(value) : normalizeProductDelivery(value);
}

export function createProductDeliveryApi({ apiClient }) {
  if (typeof apiClient?.request !== 'function') throw new TypeError('PLATFORM_PRODUCT_DELIVERY_CLIENT_REQUIRED');
  return Object.freeze({ async load() {
    const source = await loadLiveMetricsSource(apiClient);
    const liveMetrics = source.data;
    const product = await loadOptionalInsightSource(apiClient, 'demo/product-delivery', normalizeProductSource);
    const runtimeProduct = product.data?.schemaVersion === 2 ? product.data : null;
    const storedReport = liveMetrics?.productDelivery || (product.data?.schemaVersion === 1 ? product.data : null);
    if (!runtimeProduct && !storedReport) throw new TypeError('PLATFORM_PRODUCT_DELIVERY_SOURCE_UNAVAILABLE');
    const operations = await loadOperationsSources(apiClient);
    // Runtime Product, daily delivery and operator facts have independent clocks.
    // A successful runtime read must never rewrite a stored report's observation.
    return Object.freeze({ storedReport, runtimeProduct, liveMetrics, operatorSources: operations.data,
      retrieval: Object.freeze({ source: liveMetrics ? 'daily' : storedReport ? 'legacy_fallback' : 'runtime',
        dailyReason: source.reason, runtimeReason: product.reason || (runtimeProduct ? null : 'legacy_only'),
        operationsReason: operations.reason }),
    });
  } });
}
