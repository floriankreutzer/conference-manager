import { DAY_MS, exactProductObject as exact, productInstant as instant,
  normalizeProductDeliverySnapshot, requireProductCondition as requireCondition } from '../product-delivery-contracts.js';

export function normalizeOperationsSources(value) {
  exact(value, ['schemaVersion', 'environment', 'evaluatedAt', 'sources']);
  const evaluated = instant(value.evaluatedAt);
  requireCondition(value.schemaVersion === 1 && value.environment === 'demo'
    && Array.isArray(value.sources) && value.sources.length === 2);
  const sources = value.sources.map((row, index) => {
    exact(row, ['kind', 'observedAt', 'recordedAt', 'digest', 'sourceState', 'snapshot', 'freshness']);
    requireCondition(row.kind === ['manual', 'feedback'][index]);
    if (row.snapshot === null) {
      requireCondition(row.observedAt === null && row.recordedAt === null && row.digest === null
        && row.sourceState === 'unavailable' && row.freshness === 'unknown');
      return Object.freeze({ ...row });
    }
    const observed = instant(row.observedAt);
    const recorded = instant(row.recordedAt);
    requireCondition(observed <= recorded && recorded <= evaluated && recorded - observed < DAY_MS
      && evaluated - recorded < 30 * DAY_MS && evaluated - observed < 30 * DAY_MS
      && typeof row.digest === 'string' && /^[a-f0-9]{64}$/.test(row.digest)
      && ['available', 'last_good'].includes(row.sourceState)
      && row.freshness === (evaluated - observed >= DAY_MS ? 'stale' : 'fresh'));
    const snapshot = normalizeProductDeliverySnapshot(row.snapshot);
    requireCondition(snapshot.environment === 'demo' && snapshot.observedAt === row.observedAt
      && snapshot.provenance.mode === 'operator_extract');
    if (row.kind === 'manual') requireCondition(snapshot.feedback.source === 'not_configured');
    else requireCondition(snapshot.feedback.source === 'protected_operator_registry'
      && snapshot.product.every((metric) => metric.value === null)
      && snapshot.delivery.every((component) => component.buckets.every((bucket) =>
        bucket.metrics.every((metric) => metric.value === null))));
    return Object.freeze({ ...row, snapshot });
  });
  return Object.freeze({ ...value, sources: Object.freeze(sources) });
}

export async function loadOptionalOperationsSources(apiClient) {
  let value;
  try {
    value = await apiClient.request('demo/operations-sources', { method: 'GET', signal: AbortSignal.timeout(10_000) });
  } catch { return null; }
  return normalizeOperationsSources(value);
}
