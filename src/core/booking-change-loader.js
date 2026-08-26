const MAX_CONCURRENT_LOOKUPS = 8;

export async function loadOpenBookingChanges(requests, persistence) {
  if (!Array.isArray(requests) || typeof persistence?.loadBookingChange !== 'function') {
    throw new TypeError('BOOKING_CHANGE_LOADER_INPUT_REQUIRED');
  }
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
        results[index] = await persistence.loadBookingChange(requests[index].id);
      } catch {
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
