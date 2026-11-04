import { normalizeProviderUsage } from '../provider-usage-contracts.js';
import { normalizeRuntimeProductReport } from '../product-runtime-contract.js';
import { normalizeProductDelivery, exactProductObject, productInstant, requireProductCondition } from '../product-delivery-contracts.js';
import { normalizeProtectedDailySource, protectedDailyRetrieval } from '../protected-daily-contracts.js';

// Deliberate protected ports: no Demo route, fallback, provider URL or browser
// storage. Session/authorization failures and malformed successes propagate.
export function createProtectedPlatformInsights({ apiClient, accessMode = 'application_passkey' } = {}) {
  if (typeof apiClient?.request !== 'function' || !['application_passkey','microsoft_mfa'].includes(accessMode)) throw new TypeError('PLATFORM_INSIGHT_CLIENT_REQUIRED');
  const read = path => apiClient.request(path, { method: 'GET', signal: AbortSignal.timeout(10000) });
  return Object.freeze({
    providerUsage: Object.freeze({ async load() {
      const payload = await read('insights/providers?schemaVersion=2');
      if (payload?.schemaVersion !== 2) return Object.freeze({ ...normalizeProviderUsage(payload, { accessMode }),
        liveMetrics: null, retrieval: null });
      exactProductObject(payload, ['schemaVersion', 'dailyState', 'providerUsage', 'daily']);
      const daily = normalizeProtectedDailySource(payload.daily, payload.dailyState, { providers: true });
      const report = payload.providerUsage === null ? null : normalizeProviderUsage(payload.providerUsage, { accessMode });
      requireProductCondition(!daily || !report || (productInstant(report.observedAt) <= productInstant(daily.observedAt)
        && report.evaluatedAt === daily.evaluatedAt));
      if (!daily && !report) throw new TypeError('PLATFORM_INSIGHT_SOURCE_UNAVAILABLE');
      return Object.freeze({ ...report, liveMetrics: daily ? Object.freeze({ ...daily, providerUsage: report }) : null,
        retrieval: protectedDailyRetrieval(payload.dailyState) });
    } }),
    productDelivery: Object.freeze({ async load() {
      const payload = await read('insights/product-delivery?schemaVersion=3');
      let runtimeProduct = null, dailySource = null, retrieval = null;
      const bundle = [2, 3].includes(payload?.schemaVersion);
      if (bundle) {
        exactProductObject(payload,['schemaVersion','storedReport','runtimeProduct', ...(payload.schemaVersion === 3 ? ['dailyState', 'daily'] : [])]);
        if (payload.schemaVersion === 3) {
          dailySource = normalizeProtectedDailySource(payload.daily, payload.dailyState);
          retrieval = protectedDailyRetrieval(payload.dailyState);
        }
        if (payload.runtimeProduct !== null) runtimeProduct = normalizeRuntimeProductReport(payload.runtimeProduct,
          { environment: 'production',accessMode });
      }
      const storedReport = normalizeProductDelivery(bundle ? payload.storedReport : payload, {
        environment: 'production', expectedAccessMode: accessMode,
      });
      requireProductCondition(!dailySource || (storedReport.evaluatedAt === dailySource.evaluatedAt
        && (storedReport.observedAt === null || productInstant(storedReport.observedAt) <= productInstant(dailySource.observedAt))));
      return Object.freeze({ storedReport, runtimeProduct, liveMetrics: null, dailySource, operatorSources: null, retrieval });
    } }),
  });
}
