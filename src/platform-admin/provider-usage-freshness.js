import { createObservedResourceClock, DAY_MS } from './observed-resource-clock.js';
import { LIVE_METRICS } from './live-metrics-contracts.js';
import { liveMetricFreshUntil } from './live-metrics-freshness.js';

// The provider wire contract becomes stale strictly after 24 hours or at its
// accounting-window end. This clock can only degrade a saved fresh label; it
// never collects provider data, changes amounts or promotes stale data to fresh.
function legacyFreshness(report) {
  if (report.freshness === 'stale') return 0;
  const boundary = Math.min(Date.parse(report.observedAt) + DAY_MS + 1, Date.parse(report.periodEnd));
  return Math.max(0, boundary - Date.parse(report.evaluatedAt));
}

function freshnessBoundaries(report) {
  if (!report.liveMetrics) return [legacyFreshness(report)];
  const live = report.liveMetrics;
  const evaluatedAt = Date.parse(live.evaluatedAt);
  const daily = live.freshness === 'stale' ? 0 : Date.parse(live.observedAt) + DAY_MS - evaluatedAt;
  const rows = live.measurements.filter((row) => LIVE_METRICS[row.id][0] === 'providers'
    && (row.id !== 'neon_transfer' || live.providerUsage === null))
    .map((row) => liveMetricFreshUntil(row) - evaluatedAt);
  return [...new Set([daily, ...(report.neon ? [legacyFreshness(report)] : []), ...rows]
    .filter((value) => value !== Infinity).map((value) => Math.max(0, value)))].sort((left, right) => left - right);
}

export function createProviderUsageFreshness({ onExpire, ...options } = {}) {
  if (typeof onExpire !== 'function') throw new TypeError('PLATFORM_OBSERVED_RESOURCE_CLOCK_INVALID');
  let entry = null;
  const observed = createObservedResourceClock({ ...options, lifetimeOf: (data) => data.lifetime,
    onExpire(wake) {
      const state = wake.state;
      if (entry !== state || state.wake !== wake) return;
      state.stale = true;
      state.next += 1;
      onExpire(state.resource);
      // Refresh/disposal in the callback must win over the old report's next boundary.
      if (entry === state && state.wake === wake) arm(state);
    },
  });
  function arm(state) {
    // An already old source degrades the whole report, but cannot cancel the
    // remaining fresh sources' one-time deadlines. Keep the original request clock.
    for (; entry === state && state.next < state.boundaries.length; state.next += 1) {
      state.wake = { data: { lifetime: state.boundaries[state.next] }, state };
      if (observed.retain(state.wake, state.clock)) return;
      state.stale = true;
    }
  }
  function forget() {
    entry = null;
    observed.forget();
  }
  function isReusable(resource) {
    if (!entry || entry.resource !== resource || entry.stale) return false;
    if (!observed.isReusable(entry.wake)) entry.stale = true;
    return !entry.stale;
  }
  return Object.freeze({
    capture: observed.capture,
    retain(resource, clock = observed.capture()) {
      forget();
      const boundaries = freshnessBoundaries(resource.data);
      if (boundaries.some((value) => !Number.isSafeInteger(value) || value < 0)) {
        throw new TypeError('PLATFORM_OBSERVED_RESOURCE_CLOCK_INVALID');
      }
      entry = { resource, clock, boundaries, next: 0, stale: false, wake: null };
      arm(entry);
      return isReusable(resource);
    },
    isReusable,
    check: observed.check,
    forget,
  });
}
