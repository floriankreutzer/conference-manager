import { DAY_MS, exactProductObject, productInstant, requireProductCondition as requireValid } from './product-delivery-contracts.js';
import { LIVE_METRICS, normalizeLiveMeasurements } from './live-metrics-contracts.js';

// Protected daily sources expose global provider measurements only. Retained
// Demo/seed activity cannot become protected Product usage through this adapter.
export function normalizeProtectedDailySource(value, state, { providers = false } = {}) {
  requireValid(['not_configured', 'unavailable', 'available', 'last_good'].includes(state));
  if (value === null) { requireValid(['not_configured', 'unavailable'].includes(state));return null; }
  exactProductObject(value, ['observedAt', 'evaluatedAt', 'sourceState', 'freshness', ...(providers ? ['measurements'] : [])]);
  const observed = productInstant(value.observedAt), evaluated = productInstant(value.evaluatedAt);
  requireValid(['available', 'last_good'].includes(state) && value.sourceState === state && observed <= evaluated
    && evaluated - observed < 30 * DAY_MS && value.freshness === (evaluated - observed >= DAY_MS ? 'stale' : 'fresh'));
  if (!providers) return Object.freeze({ ...value });
  const providerIds = Object.keys(LIVE_METRICS).filter(id => LIVE_METRICS[id][0] === 'providers');
  requireValid(Array.isArray(value.measurements) && value.measurements.length === providerIds.length
    && value.measurements.every((row, index) => row?.id === providerIds[index]));
  const measurements = normalizeLiveMeasurements([...value.measurements, ...Object.keys(LIVE_METRICS)
    .filter(id => LIVE_METRICS[id][0] === 'product').map(id => ({ id, value: null,
      observedAt: null, periodStart: null, periodEnd: null, sampleAt: null }))], value.observedAt);
  return Object.freeze({ ...value, measurements });
}

export function protectedDailyRetrieval(state) {
  return Object.freeze({ source: ['available', 'last_good'].includes(state) ? 'daily' : 'legacy_fallback',
    dailyState: state,
    dailyReason: state === 'unavailable' ? 'unavailable' : state === 'not_configured' ? 'not_configured' : null });
}
