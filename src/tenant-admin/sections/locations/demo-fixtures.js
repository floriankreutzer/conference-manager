export const LOCATIONS_DEMO_SCENARIO = Object.freeze({
  NORMAL: 'normal', EMPTY: 'empty', CONFLICT: 'conflict', HISTORY: 'history', RECOVERY: 'recovery',
});
export const LOCATIONS_DEMO_SCENARIOS = Object.freeze(Object.values(LOCATIONS_DEMO_SCENARIO));

const CONFIGURATION = Object.freeze({
  sites: Object.freeze([
    Object.freeze({
      id: 'berlin', name: 'Berlin', active: true, timeZone: 'Europe/Berlin',
      address: Object.freeze({ line1: 'Alexanderplatz 1', line2: null, postalCode: '10178', city: 'Berlin', countryCode: 'DE' }),
    }),
  ]),
  rooms: Object.freeze([
    Object.freeze({
      id: 'room-atlas', siteId: 'berlin', name: 'Atlas', capacity: 12, active: true, floor: '3',
      equipment: Object.freeze(['Display']), accessibility: Object.freeze(['Step-free access']),
      serviceIds: Object.freeze(['service-av']), cateringPackageIds: Object.freeze(['package-coffee']),
      floorplanAssetId: null, mediaAssetIds: Object.freeze([]),
    }),
  ]),
});

const PROVIDER_CONTEXT = Object.freeze([
  Object.freeze({
    roomId: 'room-atlas', provider: 'microsoft365', status: 'active', displayName: 'Atlas',
    capacity: 12, lastSeenAt: '2026-08-27T09:30:00.000Z',
  }),
]);

export function locationsDemoFixture(scenario = LOCATIONS_DEMO_SCENARIO.NORMAL) {
  if (!LOCATIONS_DEMO_SCENARIOS.includes(scenario)) throw new TypeError('LOCATIONS_DEMO_SCENARIO_INVALID');
  if (scenario === LOCATIONS_DEMO_SCENARIO.EMPTY) {
    return { configuration: { sites: [], rooms: [] }, providerContext: [] };
  }
  return { configuration: structuredClone(CONFIGURATION), providerContext: structuredClone(PROVIDER_CONTEXT) };
}
