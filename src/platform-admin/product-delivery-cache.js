import { createObservedResourceClock, DAY_MS } from './observed-resource-clock.js';

function remainingLifetime(report) {
  const observed = report.observedAt === null ? null : Date.parse(report.observedAt);
  const boundary = observed === null ? Date.parse(report.periodEnd) + DAY_MS
    : observed + (report.freshness === 'fresh' ? DAY_MS : 30 * DAY_MS);
  const sourceLifetimes = (report.operatorSources?.sources || []).filter((row) => row.observedAt !== null)
    .map((row) => Date.parse(row.observedAt) + (row.freshness === 'fresh' ? DAY_MS : 30 * DAY_MS)
      - Date.parse(report.operatorSources.evaluatedAt));
  const lifetime = Math.min(boundary - Date.parse(report.evaluatedAt), ...sourceLifetimes);
  if (!Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 30 * DAY_MS) {
    throw new TypeError('PLATFORM_PRODUCT_CACHE_INVALID');
  }
  return lifetime;
}

export function createProductDeliveryCache(options = {}) {
  return createObservedResourceClock({ ...options, lifetimeOf: remainingLifetime });
}
