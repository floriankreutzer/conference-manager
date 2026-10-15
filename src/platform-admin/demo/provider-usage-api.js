import { normalizeProviderUsage } from '../provider-usage-contracts.js';
import { loadOptionalLiveMetrics } from './live-metrics-api.js';

export function createProviderUsageApi({ apiClient }) {
  if (typeof apiClient?.request !== 'function') throw new TypeError('PLATFORM_PROVIDER_USAGE_CLIENT_REQUIRED');
  return Object.freeze({ async load() {
    const liveMetrics = await loadOptionalLiveMetrics(apiClient);
    const report = liveMetrics?.providerUsage || normalizeProviderUsage(await apiClient.request('demo/provider-usage', {
      method: 'GET', signal: AbortSignal.timeout(10_000),
    }));
    return Object.freeze({ ...report, liveMetrics });
  } });
}

