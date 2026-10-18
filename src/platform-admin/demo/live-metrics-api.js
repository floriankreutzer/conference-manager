import { normalizeLiveMeasurements } from '../live-metrics-contracts.js';
import { normalizeProviderUsage } from '../provider-usage-contracts.js';
import { normalizeProductDelivery, exactProductObject, productInstant, DAY_MS,
  requireProductCondition } from '../product-delivery-contracts.js';

export function normalizeLiveMetrics(value) {
  exactProductObject(value, ['schemaVersion', 'environment', 'collectionMode', 'observedAt',
    'evaluatedAt', 'sourceState', 'freshness', 'measurements', 'providerUsage', 'productDelivery']);
  const observed = productInstant(value.observedAt);
  const evaluated = productInstant(value.evaluatedAt);
  requireProductCondition(value.schemaVersion === 1 && value.environment === 'demo'
    && value.collectionMode === 'daily_connector_snapshot'
    && ['available', 'last_good'].includes(value.sourceState)
    && observed <= evaluated && evaluated - observed < 30 * DAY_MS
    && value.freshness === (evaluated - observed >= DAY_MS ? 'stale' : 'fresh'));
  const measurements = normalizeLiveMeasurements(value.measurements, value.observedAt);
  const providerUsage = value.providerUsage === null ? null : normalizeProviderUsage(value.providerUsage);
  const productDelivery = normalizeProductDelivery(value.productDelivery);
  requireProductCondition((providerUsage === null || productInstant(providerUsage.observedAt) <= observed)
    && (productDelivery.observedAt === null || productInstant(productDelivery.observedAt) <= observed)
    && productDelivery.evaluatedAt === value.evaluatedAt
    && (providerUsage === null || providerUsage.evaluatedAt === value.evaluatedAt));
  return Object.freeze({ ...value, measurements, providerUsage, productDelivery });
}

export async function loadOptionalLiveMetrics(apiClient) {
  let raw;
  try { raw = await apiClient.request('demo/live-metrics', {
    method: 'GET', signal: AbortSignal.timeout(10_000),
  }); } catch (error) {
    const unavailable = ['HTTP_404', 'HTTP_408', 'HTTP_429', 'HTTP_500', 'HTTP_502', 'HTTP_503', 'HTTP_504'].includes(error?.code);
    const canceled = !(error instanceof TypeError) && typeof error?.code !== 'string'
      && ['AbortError', 'TimeoutError'].includes(error?.name);
    if (unavailable || canceled) return null;
    throw error;
  }
  // A malformed successful response is an error, never a silent downgrade to old data.
  return normalizeLiveMetrics(raw);
}
