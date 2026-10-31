import { readFileSync } from 'node:fs';

export function protectedDailyFixture(kind = 'providers', state = 'available') {
  const source = JSON.parse(readFileSync(new URL('./daily-live-metrics-fixture.json', import.meta.url), 'utf8'));
  const daily = { observedAt: source.observedAt, evaluatedAt: source.evaluatedAt,
    sourceState: state, freshness: source.freshness };
  if (kind === 'providers') return { schemaVersion: 2, dailyState: state, providerUsage: null,
    daily: { ...daily, measurements: source.measurements.slice(0, 11) } };
  return { schemaVersion: 3, dailyState: state, daily, runtimeProduct: null,
    storedReport: { ...source.productDelivery, environment: 'production', accessMode: 'application_passkey' } };
}
