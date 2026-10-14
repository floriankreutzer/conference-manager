import { normalizeProductDelivery } from '../product-delivery-contracts.js';

export function createProductDeliveryApi({ apiClient }) {
  if (typeof apiClient?.request !== 'function') throw new TypeError('PLATFORM_PRODUCT_DELIVERY_CLIENT_REQUIRED');
  return Object.freeze({ async load() {
    return normalizeProductDelivery(await apiClient.request('demo/product-delivery', {
      method: 'GET', signal: AbortSignal.timeout(10_000),
    }));
  } });
}
