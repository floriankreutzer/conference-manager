const DEMO_SITES = Object.freeze([
  Object.freeze({ id: 'berlin', name: 'Berlin' }),
  Object.freeze({ id: 'stuttgart', name: 'Stuttgart' }),
]);
const DEMO_ROOMS = Object.freeze([
  Object.freeze({
    id: 'demo-room-321',
    name: 'Berlin · Room 3.21',
    address: 'room321@example.invalid',
    capacity: 12,
    building: 'Berlin',
    floorLabel: '3',
  }),
  Object.freeze({
    id: 'demo-room-412',
    name: 'Berlin · Conference Room 4.12',
    address: 'room412@example.invalid',
    capacity: 20,
    building: 'Berlin',
    floorLabel: '4',
  }),
  Object.freeze({
    id: 'demo-room-aud',
    name: 'Berlin · Auditorium',
    address: 'auditorium@example.invalid',
    capacity: 80,
    building: 'Berlin',
    floorLabel: 'Ground',
  }),
]);
const CHECKED_AT = '2026-08-26T06:00:00.000Z';

function health(capability, status, reason, { lastCheckedAt = null, lastSuccessAt = null } = {}) {
  return Object.freeze({ capability, status, reason, lastCheckedAt, lastSuccessAt });
}

export function createDemoMicrosoft365Operations() {
  let connected;
  let verified;
  let freeBusyVerified;
  let mappings;
  let synchronizationCount;

  function reset() {
    connected = false;
    verified = false;
    freeBusyVerified = false;
    mappings = [];
    synchronizationCount = 0;
  }

  function readiness() {
    const roomImported = mappings.length > 0;
    return Object.freeze({
      tenantStatus: roomImported && freeBusyVerified ? 'ready' : 'onboarding',
      ready: connected && verified && roomImported && freeBusyVerified,
      checks: Object.freeze({
        tenantIdentityClaimed: true,
        microsoft365Connected: connected,
        placesPermissionGranted: verified,
        calendarPermissionGranted: verified,
        roomImported,
        freeBusyVerified,
        directoryEntitled: true,
        calendarEntitled: true,
      }),
      entitlements: Object.freeze({
        microsoftDirectory: true,
        microsoftCalendar: true,
        microsoftCalendarWrite: false,
      }),
    });
  }

  function onboardingConnection() {
    return Object.freeze({
      state: connected ? (verified ? 'connected' : 'pending') : 'disconnected',
      permissions: Object.freeze({
        place: verified ? 'granted' : 'unverified',
        calendars: verified ? 'granted' : 'unverified',
      }),
    });
  }

  function publicMapping(mapping) {
    return Object.freeze({
      roomId: mapping.roomId,
      externalRoomId: mapping.externalRoomId,
      providerStatus: mapping.providerStatus,
    });
  }

  function operationalMapping(mapping) {
    return Object.freeze({
      roomId: mapping.roomId,
      providerName: mapping.providerName,
      providerCapacity: mapping.providerCapacity,
      providerStatus: mapping.providerStatus,
      lastSeenAt: mapping.lastSeenAt,
      localRoom: Object.freeze({ ...mapping.localRoom }),
    });
  }

  function operationsConnection() {
    const state = connected ? (verified ? 'connected' : 'pending') : 'disconnected';
    const places = verified
      ? health('places', 'healthy', null, { lastCheckedAt: CHECKED_AT, lastSuccessAt: CHECKED_AT })
      : health('places', 'not_configured', null);
    const freeBusy = freeBusyVerified
      ? health('free_busy', 'healthy', null, { lastCheckedAt: CHECKED_AT, lastSuccessAt: CHECKED_AT })
      : health('free_busy', 'not_configured', null);
    return Object.freeze({
      state,
      reason: null,
      lastVerifiedAt: verified ? CHECKED_AT : null,
      permissions: Object.freeze({
        place: verified ? 'granted' : 'unknown',
        calendars: verified ? 'granted' : 'unknown',
      }),
      health: Object.freeze({
        places,
        freeBusy,
        calendarWrite: health('calendar_write', 'not_configured', null),
      }),
    });
  }

  reset();

  return Object.freeze({
    isDemo: true,
    async listSites() {
      return DEMO_SITES;
    },
    async getConnection() {
      return onboardingConnection();
    },
    async connect() {
      connected = true;
      return onboardingConnection();
    },
    async verify() {
      connected = true;
      verified = true;
      return onboardingConnection();
    },
    async disconnect() {
      connected = false;
      verified = false;
      freeBusyVerified = false;
      return onboardingConnection();
    },
    async discoverRooms() {
      if (!verified) throw new Error('DEMO_CONNECTION_NOT_VERIFIED');
      return DEMO_ROOMS;
    },
    async listMappings() {
      return Object.freeze(mappings.map(publicMapping));
    },
    async importRooms(selections) {
      const merged = new Map(mappings.map((entry) => [entry.externalRoomId, entry]));
      selections.forEach((selection, index) => {
        const provider = DEMO_ROOMS.find((room) => room.id === selection.externalRoomId);
        if (!provider) throw new Error('DEMO_ROOM_NOT_DISCOVERED');
        const existing = merged.get(selection.externalRoomId);
        merged.set(selection.externalRoomId, {
          roomId: existing?.roomId || `demo-import-${mappings.length + index + 1}`,
          externalRoomId: selection.externalRoomId,
          providerName: provider.name,
          providerCapacity: provider.capacity,
          providerStatus: 'active',
          lastSeenAt: CHECKED_AT,
          localRoom: {
            id: existing?.roomId || `demo-import-${mappings.length + index + 1}`,
            siteId: selection.siteId,
            name: selection.name,
            capacity: selection.capacity,
            active: true,
          },
        });
      });
      mappings = [...merged.values()];
      freeBusyVerified = false;
      return Object.freeze(mappings.map(publicMapping));
    },
    async verifyFreeBusy() {
      if (!verified || mappings.length < 1) throw new Error('DEMO_FREE_BUSY_NOT_READY');
      freeBusyVerified = true;
      return Object.freeze({ verified: true, checkedAt: CHECKED_AT });
    },
    async getReadiness() {
      return readiness();
    },
    async getOperations() {
      return Object.freeze({
        connection: operationsConnection(),
        mappings: Object.freeze(mappings.map(operationalMapping)),
        readiness: readiness(),
      });
    },
    async synchronizeMappings() {
      if (!verified) throw new Error('MICROSOFT365_CONNECTION_REQUIRED');
      synchronizationCount += 1;
      mappings = mappings.map((mapping, index) => ({
        ...mapping,
        providerName: synchronizationCount === 1 && index === 0
          ? `${mapping.providerName} · Microsoft`
          : mapping.providerName,
        providerCapacity: synchronizationCount === 1 && index === 0
          ? mapping.providerCapacity + 2
          : mapping.providerCapacity,
        providerStatus: 'active',
        lastSeenAt: '2026-08-27T10:00:00.000Z',
      }));
      return Object.freeze(mappings.map(operationalMapping));
    },
    reset,
  });
}
