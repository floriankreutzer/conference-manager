const OPTIONAL_PATHS = Object.freeze([
  'demo/live-metrics', 'demo/product-delivery', 'demo/operations-sources',
]);

function unavailableReason(error) {
  if (error?.code === 'HTTP_404') return 'not_found';
  if (error?.code === 'HTTP_429') return 'throttled';
  if (['HTTP_408', 'HTTP_504'].includes(error?.code)) return 'timeout';
  if (['HTTP_500', 'HTTP_502', 'HTTP_503'].includes(error?.code)) return 'unavailable';
  if (!(error instanceof TypeError) && typeof error?.code !== 'string'
    && ['AbortError', 'TimeoutError'].includes(error?.name)) return 'timeout';
  return null;
}

// Only these private, bodyless report reads may be optional. Authority, response
// security and malformed-success failures never become a compatibility fallback.
export async function loadOptionalInsightSource(apiClient, path, normalize) {
  if (typeof apiClient?.request !== 'function' || !OPTIONAL_PATHS.includes(path)
    || typeof normalize !== 'function') throw new TypeError('PLATFORM_INSIGHT_SOURCE_INVALID');
  let raw;
  try {
    raw = await apiClient.request(path, { method: 'GET', signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    const reason = unavailableReason(error);
    if (reason) return Object.freeze({ data: null, reason });
    throw error;
  }
  return Object.freeze({ data: normalize(raw), reason: null });
}
