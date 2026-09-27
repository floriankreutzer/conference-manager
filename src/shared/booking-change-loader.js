import { authorityFailureCode } from './authority-failure.js';

const MAX_CONCURRENT_LOOKUPS = 8;
const LOOKUP_TIMEOUT_MS = 5_000;

function normalizedLookupTimeout(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 30_000) {
    throw new TypeError('BOOKING_CHANGE_LOOKUP_TIMEOUT_INVALID');
  }
  return value;
}

async function loadBoundedBookingChange(persistence, request, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await persistence.loadBookingChange(request.id, {
      signal: controller.signal,
      expectedRequest: request,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function loadOpenBookingChanges(
  requests,
  persistence,
  { timeoutMs = LOOKUP_TIMEOUT_MS } = {},
) {
  if (!Array.isArray(requests) || typeof persistence?.loadBookingChange !== 'function') {
    throw new TypeError('BOOKING_CHANGE_LOADER_INPUT_REQUIRED');
  }
  const lookupTimeout = normalizedLookupTimeout(timeoutMs);
  const results = new Array(requests.length).fill(null);
  const confirmed = [];
  requests.forEach((request, index) => {
    if (request?.status === 'Confirmed') {
      results[index] = undefined;
      confirmed.push(index);
    }
  });
  let cursor = 0;
  async function worker() {
    while (cursor < confirmed.length) {
      const index = confirmed[cursor];
      cursor += 1;
      try {
        results[index] = await loadBoundedBookingChange(
          persistence,
          requests[index],
          lookupTimeout,
        );
      } catch (error) {
        if (authorityFailureCode(error)) throw error;
        results[index] = undefined;
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(MAX_CONCURRENT_LOOKUPS, confirmed.length) },
    () => worker(),
  ));
  return Object.freeze(results);
}
