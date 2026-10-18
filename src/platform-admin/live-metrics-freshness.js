import { LIVE_METRICS } from './live-metrics-contracts.js';
import { DAY_MS } from './product-delivery-contracts.js';

// Presentation deadline for one known observation, never an inferred zero or a
// change to the stored source clock. Hourly samples can age before their query.
export function liveMetricFreshUntil(row) {
  if (row.value === null) return Infinity;
  const basis = LIVE_METRICS[row.id][2];
  return Math.min(Date.parse(row.observedAt) + DAY_MS,
    row.sampleAt === null ? Infinity : Date.parse(row.sampleAt) + DAY_MS,
    ['project_window', 'provider_window'].includes(basis) ? Date.parse(row.periodEnd) : Infinity);
}
