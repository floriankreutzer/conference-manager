function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError('PLATFORM_PROVIDER_USAGE_INVALID');
  }
}

function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError('PLATFORM_PROVIDER_USAGE_INVALID');
  }
}

export function normalizeProviderUsage(value, { accessMode = 'shared_owner_password' } = {}) {
  if (!['shared_owner_password', 'application_passkey'].includes(accessMode)) {
    throw new TypeError('PLATFORM_PROVIDER_USAGE_INVALID');
  }
  exact(value, ['schemaVersion', 'collectionMode', 'accessMode', 'evaluatedAt', 'observedAt',
    'periodStart', 'periodEnd', 'freshness', 'alertDelivery', 'costState', 'neon', 'render', 'github']);
  [value.evaluatedAt, value.observedAt, value.periodStart, value.periodEnd].forEach(instant);
  if (value.schemaVersion !== 1 || value.collectionMode !== 'operator_snapshot'
    || value.accessMode !== accessMode || !['fresh', 'stale'].includes(value.freshness)
    || value.alertDelivery !== 'not_configured' || value.costState !== 'unknown'
    || Date.parse(value.periodStart) >= Date.parse(value.observedAt)
    || Date.parse(value.observedAt) > Date.parse(value.periodEnd)
    || Date.parse(value.observedAt) > Date.parse(value.evaluatedAt)) throw new TypeError('PLATFORM_PROVIDER_USAGE_INVALID');
  const stale = Date.parse(value.evaluatedAt) - Date.parse(value.observedAt) > 86_400_000
    || Date.parse(value.evaluatedAt) >= Date.parse(value.periodEnd);
  if (value.freshness !== (stale ? 'stale' : 'fresh')) throw new TypeError('PLATFORM_PROVIDER_USAGE_INVALID');
  const n = value.neon;
  exact(n, ['plan', 'source', 'referenceBasis', 'referenceObservedAt', 'usedBytes', 'referenceBytes',
    'projectedBytes', 'utilizationPercent', 'projectedUtilizationPercent', 'crossedThresholds',
    'projectedExhaustion', 'anomalyState']);
  instant(n.referenceObservedAt);
  if (n.plan !== 'launch_v3' || n.source !== 'neon_control_plane'
    || n.referenceBasis !== 'published_launch_model' || n.referenceBytes !== 500_000_000_000
    || Date.parse(n.referenceObservedAt) > Date.parse(value.observedAt)
    || [n.usedBytes, n.projectedBytes].some((amount) => !Number.isSafeInteger(amount) || amount < 0)
    || n.projectedBytes < n.usedBytes
    || [n.utilizationPercent, n.projectedUtilizationPercent].some((amount) => !Number.isFinite(amount)
      || amount < 0 || amount > Number.MAX_SAFE_INTEGER)
    || typeof n.projectedExhaustion !== 'boolean'
    || !['insufficient_baseline', 'anomaly', 'within_candidate_baseline'].includes(n.anomalyState)
    || !Array.isArray(n.crossedThresholds) || n.crossedThresholds.length > 4
    || n.crossedThresholds.some((threshold, index) => ![50, 70, 85, 95].includes(threshold)
      || (index > 0 && threshold <= n.crossedThresholds[index - 1]))) throw new TypeError('PLATFORM_PROVIDER_USAGE_INVALID');
  exact(value.render, ['usageState']); exact(value.github, ['usageState']);
  if (value.render.usageState !== 'unknown_monthly_usage' || value.github.usageState !== 'unknown_billing_usage') {
    throw new TypeError('PLATFORM_PROVIDER_USAGE_INVALID');
  }
  return Object.freeze({ ...value, neon: Object.freeze({ ...n, crossedThresholds: Object.freeze([...n.crossedThresholds]) }),
    render: Object.freeze({ ...value.render }), github: Object.freeze({ ...value.github }) });
}


