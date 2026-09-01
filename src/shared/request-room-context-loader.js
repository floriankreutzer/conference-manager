const MAX_CONCURRENT_LOOKUPS = 8;
const LOOKUP_TIMEOUT_MS = 5_000;

export function productionRequestRoomTimeZone(room, catalog, currentRoomContext = null) {
  const site = catalog?.sites?.find((entry) => entry.id === room?.siteId);
  return site?.timeZone || (
    room && currentRoomContext?.site?.id === room.siteId
      ? currentRoomContext.site.timeZone
      : null
  );
}

function normalizedLookupTimeout(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 30_000) {
    throw new TypeError('REQUEST_ROOM_CONTEXT_LOOKUP_TIMEOUT_INVALID');
  }
  return value;
}

async function loadBoundedRequestRoomContext(persistence, requestId, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await persistence.loadRequestRoomContext(requestId, { signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function loadBoundedCatalogAndContext(persistence, requestId, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.all([
      persistence.loadCatalog({ signal: controller.signal }),
      persistence.loadRequestRoomContext(requestId, { signal: controller.signal }),
    ]);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function matchingRequestRoomContext(request, envelope) {
  if (
    !request
    || !envelope
    || envelope.requestRef?.id !== request.id
    || envelope.requestRef?.schemaVersion !== request.schemaVersion
    || envelope.requestRef?.version !== request.version
    || envelope.requestRef?.status !== request.status
    || envelope.currentRoomContext?.room?.id !== request.roomId
  ) return null;
  return envelope.currentRoomContext;
}

export function coherentRequestRoomContext(request, envelope, catalog) {
  const context = matchingRequestRoomContext(request, envelope);
  return context
    && context.locationsRevision === catalog?.configurationRevisions?.locations
    ? context
    : null;
}

export async function loadCoherentRequestRoomContext(
  request,
  catalog,
  persistence,
  { timeoutMs = LOOKUP_TIMEOUT_MS } = {},
) {
  if (
    !request
    || !catalog
    || typeof persistence?.loadCatalog !== 'function'
    || typeof persistence?.loadRequestRoomContext !== 'function'
  ) throw new TypeError('PRODUCTION_REQUEST_ROOM_CONTEXT_LOADER_REQUIRED');
  const lookupTimeout = normalizedLookupTimeout(timeoutMs);
  const firstEnvelope = await loadBoundedRequestRoomContext(
    persistence,
    request.id,
    lookupTimeout,
  );
  const firstContext = coherentRequestRoomContext(request, firstEnvelope, catalog);
  if (firstContext) return Object.freeze({ catalog, currentRoomContext: firstContext });

  const [nextCatalog, nextEnvelope] = await loadBoundedCatalogAndContext(
    persistence,
    request.id,
    lookupTimeout,
  );
  const nextContext = coherentRequestRoomContext(request, nextEnvelope, nextCatalog);
  return nextContext
    ? Object.freeze({ catalog: nextCatalog, currentRoomContext: nextContext })
    : null;
}

export async function loadMissingRequestRoomContexts(
  requests,
  catalog,
  persistence,
  { timeoutMs = LOOKUP_TIMEOUT_MS } = {},
) {
  if (
    !Array.isArray(requests)
    || !Array.isArray(catalog?.rooms)
    || typeof persistence?.loadRequestRoomContext !== 'function'
  ) throw new TypeError('PRODUCTION_REQUEST_ROOM_CONTEXT_LOADER_REQUIRED');
  const lookupTimeout = normalizedLookupTimeout(timeoutMs);
  const activeRoomIds = new Set(catalog.rooms.map((room) => room.id));
  const results = new Array(requests.length).fill(null);
  const missing = [];
  requests.forEach((request, index) => {
    if (request?.roomId && !activeRoomIds.has(request.roomId)) {
      results[index] = undefined;
      missing.push(index);
    }
  });
  let cursor = 0;
  async function worker() {
    while (cursor < missing.length) {
      const index = missing[cursor];
      cursor += 1;
      try {
        const envelope = await loadBoundedRequestRoomContext(
          persistence,
          requests[index].id,
          lookupTimeout,
        );
        results[index] = coherentRequestRoomContext(
          requests[index],
          envelope,
          catalog,
        ) || undefined;
      } catch {
        results[index] = undefined;
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(MAX_CONCURRENT_LOOKUPS, missing.length) },
    () => worker(),
  ));
  return Object.freeze(results);
}
