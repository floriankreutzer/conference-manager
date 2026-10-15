import { createObservedResourceClock, DAY_MS } from './observed-resource-clock.js';

// The provider wire contract becomes stale strictly after 24 hours or at its
// accounting-window end. This clock can only degrade a saved fresh label; it
// never collects provider data, changes amounts or promotes stale data to fresh.
function remainingFreshness(report) {
  if (report.liveMetrics) {
    const live = report.liveMetrics;
    if (live.freshness === 'stale') return 0;
    const daily = Date.parse(live.observedAt) + DAY_MS;
    const legacy = report.neon ? Math.min(Date.parse(report.observedAt) + DAY_MS + 1, Date.parse(report.periodEnd)) : daily;
    return Math.max(0, Math.min(daily, legacy) - Date.parse(live.evaluatedAt));
  }
  if (report.freshness === 'stale') return 0;
  const boundary = Math.min(Date.parse(report.observedAt) + DAY_MS + 1, Date.parse(report.periodEnd));
  return Math.max(0, boundary - Date.parse(report.evaluatedAt));
}

export function createProviderUsageFreshness(options = {}) {
  return createObservedResourceClock({ ...options, lifetimeOf: remainingFreshness });
}
