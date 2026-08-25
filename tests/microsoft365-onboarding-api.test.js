import assert from 'node:assert/strict';
import test from 'node:test';
import { createMicrosoft365OnboardingApi } from '../src/platform/microsoft365-onboarding-api.js';

function client(responses) {
  const calls = [];
  return {
    calls,
    request: async (path, options = {}) => {
      calls.push({ path, options });
      return responses.shift();
    },
  };
}

function readiness(overrides = {}) {
  return {
    readiness: {
      tenantStatus: 'onboarding',
      ready: false,
      checks: {
        tenantIdentityClaimed: true,
        microsoft365Connected: true,
        placesPermissionGranted: true,
        calendarPermissionGranted: true,
        roomImported: false,
        freeBusyVerified: true,
        directoryEntitled: true,
        calendarEntitled: true,
        ...overrides,
      },
      entitlements: {
        microsoftDirectory: true,
        microsoftCalendar: true,
        microsoftCalendarWrite: false,
      },
    },
  };
}

test('onboarding API validates and maps room discovery without exposing extra provider data', async () => {
  const apiClient = client([{
    rooms: [{
      externalRoomId: 'provider-room-1',
      displayName: 'Room One',
      resourceAddress: 'room-one@example.invalid',
      capacity: 12,
      building: 'Berlin',
      floorLabel: '3',
      phone: 'not-exposed',
    }],
  }]);
  const api = createMicrosoft365OnboardingApi({ apiClient });
  assert.deepEqual(await api.discoverRooms(), [{
    id: 'provider-room-1',
    name: 'Room One',
    address: 'room-one@example.invalid',
    capacity: 12,
    building: 'Berlin',
    floorLabel: '3',
  }]);
  assert.equal(apiClient.calls[0].path, 'v1/integrations/microsoft365/rooms');
});

test('onboarding room import preserves mandatory local site and capacity contract', async () => {
  const apiClient = client([{ mappings: [{
    roomId: 'local-room-1',
    externalRoomId: 'provider-room-1',
    providerStatus: 'active',
  }] }]);
  const api = createMicrosoft365OnboardingApi({ apiClient });
  await api.importRooms([{
    externalRoomId: 'provider-room-1',
    siteId: 'site-berlin',
    name: 'Room One',
    capacity: 12,
  }]);
  assert.deepEqual(apiClient.calls[0], {
    path: 'v1/integrations/microsoft365/room-mappings/import',
    options: {
      method: 'POST',
      body: { selections: [{
        externalRoomId: 'provider-room-1',
        siteId: 'site-berlin',
        name: 'Room One',
        capacity: 12,
      }] },
    },
  });
});

test('onboarding readiness remains server authoritative and treats calendar write as optional', async () => {
  const api = createMicrosoft365OnboardingApi({ apiClient: client([readiness()]) });
  const result = await api.getReadiness();
  assert.equal(result.ready, false);
  assert.equal(result.checks.tenantIdentityClaimed, true);
  assert.equal(result.entitlements.microsoftCalendarWrite, false);
});

test('onboarding API rejects malformed readiness and unsafe room selections', async () => {
  const invalidReadiness = createMicrosoft365OnboardingApi({
    apiClient: client([{ readiness: { ready: true, checks: {}, entitlements: {} } }]),
  });
  await assert.rejects(
    () => invalidReadiness.getReadiness(),
    (error) => error.code === 'ONBOARDING_RESPONSE_INVALID',
  );

  const api = createMicrosoft365OnboardingApi({ apiClient: client([]) });
  await assert.rejects(
    () => api.importRooms([{ externalRoomId: 'room', siteId: '../escape', name: 'Room', capacity: 12 }]),
    /ROOM_SELECTION_INVALID/,
  );
  await assert.rejects(
    () => api.importRooms([{ externalRoomId: 'room', siteId: 'site', name: 'Room', capacity: 0 }]),
    /ROOM_SELECTION_INVALID/,
  );
});
