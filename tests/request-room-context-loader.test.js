import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coherentRequestRoomContext,
  loadCoherentRequestRoomContext,
  loadMissingRequestRoomContexts,
  matchingRequestRoomContext,
} from '../src/shared/request-room-context-loader.js';

function request(overrides = {}) {
  return Object.freeze({
    id: 'request-1',
    schemaVersion: 2,
    version: 7,
    status: 'Confirmed',
    roomId: 'room-retired',
    ...overrides,
  });
}

function catalog(locationsRevision = 12, roomIds = ['room-active']) {
  return Object.freeze({
    configurationRevisions: Object.freeze({ locations: locationsRevision }),
    rooms: Object.freeze(roomIds.map((id) => Object.freeze({ id }))),
  });
}

function envelope(overrides = {}) {
  return Object.freeze({
    requestRef: Object.freeze({
      id: 'request-1',
      schemaVersion: 2,
      version: 7,
      status: 'Confirmed',
    }),
    currentRoomContext: Object.freeze({
      locationsRevision: 12,
      room: Object.freeze({
        id: 'room-retired',
        siteId: 'site-retired',
        name: 'Retired Room',
        capacity: 20,
        active: false,
      }),
      site: Object.freeze({
        id: 'site-retired',
        name: 'Retired Site',
        active: false,
        timeZone: 'Europe/Berlin',
      }),
    }),
    ...overrides,
  });
}

test('Request Room context matching requires the exact Request reference and current Room', () => {
  const sourceRequest = request();
  const sourceEnvelope = envelope();
  assert.equal(
    matchingRequestRoomContext(sourceRequest, sourceEnvelope),
    sourceEnvelope.currentRoomContext,
  );
  assert.equal(
    coherentRequestRoomContext(sourceRequest, sourceEnvelope, catalog()),
    sourceEnvelope.currentRoomContext,
  );

  for (const mismatch of [
    envelope({ requestRef: { ...sourceEnvelope.requestRef, id: 'request-2' } }),
    envelope({ requestRef: { ...sourceEnvelope.requestRef, schemaVersion: 1 } }),
    envelope({ requestRef: { ...sourceEnvelope.requestRef, version: 8 } }),
    envelope({ requestRef: { ...sourceEnvelope.requestRef, status: 'Cancelled' } }),
    envelope({
      currentRoomContext: {
        ...sourceEnvelope.currentRoomContext,
        room: { ...sourceEnvelope.currentRoomContext.room, id: 'different-room' },
      },
    }),
    envelope({ currentRoomContext: null }),
  ]) assert.equal(matchingRequestRoomContext(sourceRequest, mismatch), null);

  assert.equal(coherentRequestRoomContext(sourceRequest, sourceEnvelope, catalog(11)), null);
});

test('a locations-revision mismatch reloads the catalogue and context as one coherent pair', async () => {
  const sourceRequest = request();
  const firstEnvelope = envelope({
    currentRoomContext: {
      ...envelope().currentRoomContext,
      locationsRevision: 13,
    },
  });
  const nextCatalog = catalog(13);
  const nextEnvelope = envelope({
    currentRoomContext: {
      ...envelope().currentRoomContext,
      locationsRevision: 13,
    },
  });
  const contextCalls = [];
  const persistence = {
    async loadRequestRoomContext(requestId, options) {
      contextCalls.push({ requestId, options });
      return contextCalls.length === 1 ? firstEnvelope : nextEnvelope;
    },
    async loadCatalog(options) {
      assert.equal(options.signal instanceof AbortSignal, true);
      return nextCatalog;
    },
  };

  const result = await loadCoherentRequestRoomContext(
    sourceRequest,
    catalog(12),
    persistence,
    { timeoutMs: 1_000 },
  );

  assert.equal(result.catalog, nextCatalog);
  assert.equal(result.currentRoomContext, nextEnvelope.currentRoomContext);
  assert.equal(contextCalls.length, 2);
  assert.deepEqual(contextCalls.map(({ requestId }) => requestId), ['request-1', 'request-1']);
  assert.equal(contextCalls.every(({ options }) => options.signal instanceof AbortSignal), true);
});

test('a coherent reload fails closed when its Request reference or context remains unavailable', async () => {
  const sourceRequest = request();
  let contextCalls = 0;
  const persistence = {
    async loadRequestRoomContext() {
      contextCalls += 1;
      return contextCalls === 1
        ? envelope({ requestRef: { ...envelope().requestRef, version: 8 } })
        : envelope({ currentRoomContext: null });
    },
    async loadCatalog() {
      return catalog();
    },
  };

  assert.equal(await loadCoherentRequestRoomContext(
    sourceRequest,
    catalog(),
    persistence,
    { timeoutMs: 1_000 },
  ), null);
  assert.equal(contextCalls, 2);
});

test('missing Request Room context lookups are bounded to eight concurrent requests', async () => {
  const requests = Array.from({ length: 12 }, (_, index) => request({
    id: `request-${index + 1}`,
    roomId: `retired-room-${index + 1}`,
  }));
  let active = 0;
  let maximumActive = 0;
  const persistence = {
    async loadRequestRoomContext(requestId, { signal }) {
      assert.equal(signal instanceof AbortSignal, true);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      const matchingRequest = requests.find((entry) => entry.id === requestId);
      return envelope({
        requestRef: {
          id: matchingRequest.id,
          schemaVersion: matchingRequest.schemaVersion,
          version: matchingRequest.version,
          status: matchingRequest.status,
        },
        currentRoomContext: {
          ...envelope().currentRoomContext,
          room: {
            ...envelope().currentRoomContext.room,
            id: matchingRequest.roomId,
          },
        },
      });
    },
  };

  const results = await loadMissingRequestRoomContexts(
    requests,
    catalog(),
    persistence,
    { timeoutMs: 1_000 },
  );

  assert.equal(maximumActive, 8);
  assert.deepEqual(
    results.map((context) => context?.room.id),
    requests.map(({ roomId }) => roomId),
  );
});

test('missing Request Room context lookups abort on timeout and fail closed per entry', async () => {
  let observedSignal = null;
  const persistence = {
    loadRequestRoomContext(_requestId, { signal }) {
      observedSignal = signal;
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    },
  };

  const results = await loadMissingRequestRoomContexts(
    [request()],
    catalog(),
    persistence,
    { timeoutMs: 10 },
  );

  assert.equal(observedSignal.aborted, true);
  assert.deepEqual(results, [undefined]);
});

test('missing context lookup skips active Rooms and rejects stale, null or mismatched evidence', async () => {
  const requests = [
    request({ id: 'active-request', roomId: 'room-active' }),
    request({ id: 'stale-request', roomId: 'room-stale' }),
    request({ id: 'null-request', roomId: 'room-null' }),
    request({ id: 'mismatch-request', roomId: 'room-mismatch' }),
  ];
  const lookedUp = [];
  const persistence = {
    async loadRequestRoomContext(requestId) {
      lookedUp.push(requestId);
      const sourceRequest = requests.find((entry) => entry.id === requestId);
      if (requestId === 'null-request') return envelope({
        requestRef: { ...envelope().requestRef, id: requestId },
        currentRoomContext: null,
      });
      return envelope({
        requestRef: {
          id: requestId,
          schemaVersion: sourceRequest.schemaVersion,
          version: requestId === 'mismatch-request' ? 8 : sourceRequest.version,
          status: sourceRequest.status,
        },
        currentRoomContext: {
          ...envelope().currentRoomContext,
          locationsRevision: requestId === 'stale-request' ? 11 : 12,
          room: {
            ...envelope().currentRoomContext.room,
            id: sourceRequest.roomId,
          },
        },
      });
    },
  };

  assert.deepEqual(
    await loadMissingRequestRoomContexts(requests, catalog(), persistence),
    [null, undefined, undefined, undefined],
  );
  assert.deepEqual(lookedUp, ['stale-request', 'null-request', 'mismatch-request']);
});
