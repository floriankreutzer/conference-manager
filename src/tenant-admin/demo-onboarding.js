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

export function createDemoOnboarding() {
  let connected = false;
  let verified = false;
  let mappings = [];

  function readiness() {
    const roomImported = mappings.length > 0;
    return Object.freeze({
      tenantStatus: roomImported && verified ? 'ready' : 'onboarding',
      ready: connected && verified && roomImported,
      checks: Object.freeze({
        tenantIdentityClaimed: true,
        microsoft365Connected: connected,
        placesPermissionGranted: verified,
        calendarPermissionGranted: verified,
        roomImported,
        freeBusyVerified: verified,
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

  return Object.freeze({
    isDemo: true,
    async listSites() {
      return DEMO_SITES;
    },
    async getConnection() {
      return Object.freeze({
        state: connected ? (verified ? 'connected' : 'pending') : 'disconnected',
        permissions: Object.freeze({
          place: verified ? 'granted' : 'unverified',
          calendars: verified ? 'granted' : 'unverified',
        }),
      });
    },
    async connect() {
      connected = true;
      return this.getConnection();
    },
    async verify() {
      connected = true;
      verified = true;
      return this.getConnection();
    },
    async discoverRooms() {
      if (!verified) throw new Error('DEMO_CONNECTION_NOT_VERIFIED');
      return DEMO_ROOMS;
    },
    async listMappings() {
      return Object.freeze([...mappings]);
    },
    async importRooms(selections) {
      mappings = selections.map((selection, index) => Object.freeze({
        roomId: `demo-import-${index + 1}`,
        externalRoomId: selection.externalRoomId,
        providerStatus: 'active',
      }));
      return Object.freeze([...mappings]);
    },
    async getReadiness() {
      return readiness();
    },
  });
}
