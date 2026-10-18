import { createObservedResourceClock, DAY_MS } from './observed-resource-clock.js';

function observationLifetime(source, evaluatedAt) {
  return Date.parse(source.observedAt) + (source.freshness === 'fresh' ? DAY_MS : 30 * DAY_MS)
    - Date.parse(evaluatedAt);
}

function remainingLifetime(model) {
  const reports = [model.storedReport, model.runtimeProduct].filter(Boolean);
  const reportLifetimes = reports.map((report) => report.observedAt === null
    ? Date.parse(report.periodEnd) + DAY_MS - Date.parse(report.evaluatedAt)
    : observationLifetime(report, report.evaluatedAt));
  const sourceLifetimes = (model.operatorSources?.sources || []).filter((row) => row.observedAt !== null)
    .map((row) => observationLifetime(row, model.operatorSources.evaluatedAt));
  // The daily feed ages independently of its embedded Product report. Already
  // stale data expires at retention, not immediately on every successful reload.
  const dailyLifetime = model.liveMetrics
    ? observationLifetime(model.liveMetrics, model.liveMetrics.evaluatedAt) : Infinity;
  const lifetime = Math.min(...reportLifetimes, dailyLifetime, ...sourceLifetimes);
  if (!Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 30 * DAY_MS) {
    throw new TypeError('PLATFORM_PRODUCT_CACHE_INVALID');
  }
  return lifetime;
}

export function createProductDeliveryCache(options = {}) {
  return createObservedResourceClock({ ...options, lifetimeOf: remainingLifetime });
}
