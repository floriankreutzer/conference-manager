import assert from 'node:assert/strict';
import test from 'node:test';

import { createMicrosoft365ConnectionApi } from '../src/platform/microsoft365-connection-api.js';
import {
  Microsoft365OperationsApiError,
  createMicrosoft365OperationsApi,
} from '../src/platform/microsoft365-operations-api.js';
import { createDemoMicrosoft365Operations } from '../src/tenant-admin/demo-microsoft365-operations.js';
import { createDemoOnboarding } from '../src/tenant-admin/demo-onboarding.js';

const ROOM_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const CHECKED_AT = '2026-08-27T10:00:00.000Z';

function health(capability, overrides = {}) {
  return {
    capability,
    status: 'healthy',
    reason: null,
    lastCheckedAt: CHECKED_AT,
    lastSuccessAt: CHECKED_AT,
    ...overrides,
  };
}

function connection(overrides = {}) {
  return {
    connection: {
      status: 'connected',
      placesPermission: 'granted',
      calendarsPermission: 'granted',
      reason: null,
      lastVerifiedAt: CHECKED_AT,
      requiredPermissions: ['Place.Read.All', 'Calendars.ReadBasic.All'],
      capabilities: {
        places: health('places'),
        freeBusy: health('free_busy'),
        calendarWrite: health('calendar_write', {
          status: 'permission_missing',
          reason: 'calendar_write_permission_missing',
          lastSuccessAt: null,
        }),
      },
      ...overrides,
    },
    requestId: REQUEST_ID,
  };
}

function mappings() {
  return {
    mappings: [{
      roomId: ROOM_ID,
      externalRoomId: 'provider-room-object-id',
      resourceAddress: 'room@example.invalid',
      providerDisplayName: 'Berlin Room 3.21',
      providerCapacity: 14,
      providerStatus: 'active',
      lastSeenAt: CHECKED_AT,
      localRoom: {
        id: ROOM_ID,
        siteId: 'berlin',
        name: 'Berlin · Room 3.21',
        capacity: 12,
        active: true,
      },
    }],
    requestId: REQUEST_ID,
  };
}

function readiness() {
  return {
    readiness: {
      tenantStatus: 'ready',
      ready: true,
      checks: {
        tenantIdentityClaimed: true,
        microsoft365Connected: true,
        placesPermissionGranted: true,
        calendarPermissionGranted: true,
        roomImported: true,
        freeBusyVerified: true,
        directoryEntitled: true,
        calendarEntitled: true,
      },
      entitlements: {
        microsoftDirectory: true,
        microsoftCalendar: true,
        microsoftCalendarWrite: false,
      },
    },
    requestId: REQUEST_ID,
  };
}

function client(responses) {
  const calls = [];
  return {
    calls,
    async request(path, options) {
      calls.push({ path, options });
      const response = responses.get(path);
      return typeof response === 'function' ? response(options) : response;
    },
  };
}

test('operations adapter reuses current endpoints and redacts provider identifiers from its view model', async () => {
  const apiClient = client(new Map([
    ['v1/integrations/microsoft365', connection()],
    ['v1/integrations/microsoft365/room-mappings', mappings()],
    ['v1/integrations/microsoft365/pilot-readiness', readiness()],
  ]));
  const api = createMicrosoft365OperationsApi({ apiClient });
  const result = await api.getOperations();
  assert.deepEqual(apiClient.calls.map(({ path }) => path), [
    'v1/integrations/microsoft365',
    'v1/integrations/microsoft365/room-mappings',
    'v1/integrations/microsoft365/pilot-readiness',
  ]);
  const mapping = result.mappings[0];
  assert.equal(mapping.roomId, ROOM_ID);
  assert.equal(Object.hasOwn(mapping, 'externalRoomId'), false);
  assert.equal(Object.hasOwn(mapping, 'resourceAddress'), false);
  assert.equal(JSON.stringify(result).includes('room@example.invalid'), false);
  assert.equal(result.connection.health.calendarWrite.status, 'permission_missing');
  assert.equal(result.readiness.entitlements.microsoftCalendarWrite, false);
});

test('operations adapter preserves the canonical revoked authorization state for recovery', async () => {
  const api = createMicrosoft365OperationsApi({
    apiClient: client(new Map([
      ['v1/integrations/microsoft365', connection({
        status: 'revoked',
        reason: 'provider_unauthorized',
        lastVerifiedAt: null,
        placesPermission: 'unknown',
        calendarsPermission: 'unknown',
        capabilities: {
          places: health('places', {
            status: 'revoked',
            reason: 'provider_unauthorized',
            lastSuccessAt: null,
          }),
          freeBusy: health('free_busy', {
            status: 'revoked',
            reason: 'provider_unauthorized',
            lastSuccessAt: null,
          }),
          calendarWrite: health('calendar_write', {
            status: 'revoked',
            reason: 'provider_unauthorized',
            lastSuccessAt: null,
          }),
        },
      })],
      ['v1/integrations/microsoft365/room-mappings', mappings()],
      ['v1/integrations/microsoft365/pilot-readiness', readiness()],
    ])),
  });

  const result = await api.getOperations();
  assert.equal(result.connection.state, 'revoked');
  assert.equal(result.connection.reason, 'provider_unauthorized');
  assert.equal(result.connection.health.places.reason, 'provider_unauthorized');
});

test('room synchronization sends no body or tenant selector and returns the redacted inventory', async () => {
  const apiClient = client(new Map([
    ['v1/integrations/microsoft365/room-mappings/sync', (options) => {
      assert.deepEqual(options, { method: 'POST' });
      return mappings();
    }],
  ]));
  const result = await createMicrosoft365OperationsApi({ apiClient }).synchronizeMappings();
  assert.equal(apiClient.calls[0].path, 'v1/integrations/microsoft365/room-mappings/sync');
  assert.equal(Object.hasOwn(apiClient.calls[0].options, 'body'), false);
  assert.equal(Object.hasOwn(result[0], 'externalRoomId'), false);
});

test('operations fail closed when health, permission, mapping, or readiness contracts are incomplete', async () => {
  const invalidSets = [
    [connection({ capabilities: undefined }), mappings(), readiness()],
    [connection({ requiredPermissions: ['Place.Read.All'] }), mappings(), readiness()],
    [connection(), { mappings: [{ ...mappings().mappings[0], providerTenantId: 'sensitive' }] }, readiness()],
    [connection(), mappings(), {
      readiness: { ...readiness().readiness, entitlements: { microsoftDirectory: true } },
    }],
  ];
  for (const [connectionValue, mappingValue, readinessValue] of invalidSets) {
    const api = createMicrosoft365OperationsApi({
      apiClient: client(new Map([
        ['v1/integrations/microsoft365', connectionValue],
        ['v1/integrations/microsoft365/room-mappings', mappingValue],
        ['v1/integrations/microsoft365/pilot-readiness', readinessValue],
      ])),
    });
    await assert.rejects(
      api.getOperations(),
      (error) => error instanceof Microsoft365OperationsApiError
        && error.code === 'MICROSOFT365_OPERATIONS_RESPONSE_INVALID',
    );
  }
});

test('connection adapter composes lifecycle and operational ports without production fallback', () => {
  const adapter = createMicrosoft365ConnectionApi({
    apiClient: { async request() { throw new Error('transport'); } },
  });
  assert.equal(typeof adapter.getStatus, 'function');
  assert.equal(typeof adapter.getOperations, 'function');
  assert.equal(typeof adapter.synchronizeMappings, 'function');
});

test('Microsoft 365 demo is canonical, deterministic, resettable, and never requires provider calls', async () => {
  assert.equal(createDemoOnboarding, createDemoMicrosoft365Operations);
  const demo = createDemoMicrosoft365Operations();
  const initial = await demo.getOperations();
  await demo.connect();
  await demo.verify();
  const rooms = await demo.discoverRooms();
  await demo.importRooms([{
    externalRoomId: rooms[0].id,
    siteId: 'berlin',
    name: 'Local Berlin Room',
    capacity: 12,
  }]);
  await demo.verifyFreeBusy();
  const ready = await demo.getOperations();
  assert.equal(ready.readiness.ready, true);
  assert.equal(Object.hasOwn(ready.mappings[0], 'externalRoomId'), false);
  await demo.synchronizeMappings();
  demo.reset();
  assert.deepEqual(await demo.getOperations(), initial);
});
