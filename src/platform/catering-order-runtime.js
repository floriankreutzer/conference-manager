import { authorityFailureCode } from '../shared/authority-failure.js';
import { createCateringOrderApi } from './catering-order-api.js';
import { featureFlags } from './feature-flags.js';

export async function discoverCateringOrders({ context, authentication, timeoutMs = 5000 } = {}) {
  if (!authentication || context?.isDemoRuntime() || !context?.isManager()) return null;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('CATERING_DISCOVERY_TIMEOUT_INVALID');
  const api = createCateringOrderApi({ apiClient: authentication.apiClient });
  const controller = new AbortController();
  let timeout;
  try {
    await Promise.race([
      api.listOrders({ signal: controller.signal }),
      new Promise((_, reject) => {
        timeout = globalThis.setTimeout(() => { controller.abort(); reject(new Error('CATERING_DISCOVERY_TIMEOUT')); }, timeoutMs);
      }),
    ]);
    return Object.freeze({ ...api, featureFlags: featureFlags.forServerCateringOrders(true) });
  } catch (error) {
    if (authorityFailureCode(error)) throw error;
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
    controller.abort();
  }
}
