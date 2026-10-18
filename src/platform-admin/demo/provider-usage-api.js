import { normalizeProviderUsage } from '../provider-usage-contracts.js';
import { loadLiveMetricsSource } from './live-metrics-api.js';

export function createProviderUsageApi({ apiClient }) {
  if (typeof apiClient?.request !== 'function') throw new TypeError('PLATFORM_PROVIDER_USAGE_CLIENT_REQUIRED');
  return Object.freeze({ async load() {
    const source = await loadLiveMetricsSource(apiClient);
    const liveMetrics = source.data;
    const report = liveMetrics ? liveMetrics.providerUsage : normalizeProviderUsage(await apiClient.request('demo/provider-usage', {
      method: 'GET', signal: AbortSignal.timeout(10_000),
    }));
    return Object.freeze({ ...report, liveMetrics,
      retrieval: Object.freeze({ source: liveMetrics ? 'daily' : 'legacy_fallback', dailyReason: source.reason }),
    });
  } });
}

