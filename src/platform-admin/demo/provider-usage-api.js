import { normalizeProviderUsage } from '../provider-usage-contracts.js';

export function createProviderUsageApi({ apiClient }) {
  if (typeof apiClient?.request !== 'function') throw new TypeError('PLATFORM_PROVIDER_USAGE_CLIENT_REQUIRED');
  return Object.freeze({ async load() {
    return normalizeProviderUsage(await apiClient.request('demo/provider-usage', {
      method: 'GET', signal: AbortSignal.timeout(10_000),
    }));
  } });
}

