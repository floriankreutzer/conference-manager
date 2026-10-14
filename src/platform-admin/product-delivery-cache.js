const DAY_MS = 86_400_000;

function remainingLifetime(report) {
  const observed = report.observedAt === null ? null : Date.parse(report.observedAt);
  const boundary = observed === null ? Date.parse(report.periodEnd) + DAY_MS
    : observed + (report.freshness === 'fresh' ? DAY_MS : 30 * DAY_MS);
  const lifetime = boundary - Date.parse(report.evaluatedAt);
  if (!Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 30 * DAY_MS) {
    throw new TypeError('PLATFORM_PRODUCT_CACHE_INVALID');
  }
  return lifetime;
}

// Presentation cache only. Source freshness/authority remains server-owned. Both
// clocks contribute elapsed age; resumed tabs also check the retained entry.
export function createProductDeliveryCache({ onExpire, wallNow = Date.now,
  monotonicNow = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if ([onExpire, wallNow, monotonicNow, setTimer, clearTimer].some((value) => typeof value !== 'function')) {
    throw new TypeError('PLATFORM_PRODUCT_CACHE_INVALID');
  }
  let entry = null;
  let timer = null;
  function capture() {
    const clock = { wall: wallNow(), monotonic: monotonicNow() };
    if (!Number.isFinite(clock.wall) || !Number.isFinite(clock.monotonic)) {
      throw new TypeError('PLATFORM_PRODUCT_CACHE_CLOCK_INVALID');
    }
    return Object.freeze(clock);
  }
  function age(state) {
    const elapsed = Math.max(wallNow() - state.clock.wall, monotonicNow() - state.clock.monotonic);
    return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : Infinity;
  }
  function forget() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    entry = null;
  }
  function arm(state) {
    if (entry !== state) return;
    const remaining = state.lifetime - age(state);
    if (remaining <= 0) {
      forget();
      onExpire(state.resource);
      return;
    }
    // Stay below browser timer overflow; daily wake-ups do not fetch providers.
    timer = setTimer(() => {
      if (entry !== state) return;
      timer = null;
      arm(state);
    }, Math.max(1, Math.min(DAY_MS, Math.ceil(remaining))));
  }
  return Object.freeze({
    capture,
    retain(resource, clock = capture()) {
      forget();
      const state = { resource, clock, lifetime: remainingLifetime(resource.data) };
      // Include request flight time conservatively instead of extending the
      // source's remaining lifetime by the time spent waiting for its response.
      if (age(state) >= state.lifetime) return false;
      entry = state;
      arm(state);
      return true;
    },
    isReusable(resource) { return entry !== null && entry.resource === resource && age(entry) < entry.lifetime; },
    check() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      if (entry) arm(entry);
    },
    forget,
  });
}
