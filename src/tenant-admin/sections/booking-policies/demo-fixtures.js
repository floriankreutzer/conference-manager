export const BOOKING_POLICIES_DEMO_SCENARIO = Object.freeze({
  NORMAL: 'normal', EMPTY: 'empty', CONFLICT: 'conflict', HISTORY: 'history', RECOVERY: 'recovery',
});
export const BOOKING_POLICIES_DEMO_SCENARIOS = Object.freeze(Object.values(BOOKING_POLICIES_DEMO_SCENARIO));

const DEFAULT_RULES = Object.freeze({
  minimumLeadTimeMinutes: 60, maximumAdvanceMinutes: 525_600, cancellationWindowMinutes: 120,
  changeWindowMinutes: 120, maximumParticipants: 500, allowedSiteIds: Object.freeze([]),
  allowedRoomIds: Object.freeze([]), allowedServiceIds: Object.freeze([]),
});
const PLATFORM_DEFAULT_RULES = Object.freeze({
  minimumLeadTimeMinutes: 0, maximumAdvanceMinutes: 527_040, cancellationWindowMinutes: 0,
  changeWindowMinutes: 0, maximumParticipants: 100_000, allowedSiteIds: Object.freeze([]),
  allowedRoomIds: Object.freeze([]), allowedServiceIds: Object.freeze([]),
});

export function bookingPoliciesDemoFixture(scenario = BOOKING_POLICIES_DEMO_SCENARIO.NORMAL) {
  if (!BOOKING_POLICIES_DEMO_SCENARIOS.includes(scenario)) throw new TypeError('BOOKING_POLICIES_DEMO_SCENARIO_INVALID');
  if (scenario === BOOKING_POLICIES_DEMO_SCENARIO.EMPTY) {
    return structuredClone({
      versions: [{ id: 'platform-default-v1', effectiveFrom: '1970-01-01T00:00:00.000Z', rules: PLATFORM_DEFAULT_RULES }],
    });
  }
  return structuredClone({
    versions: [{ id: 'policy-default', effectiveFrom: '2026-01-01T00:00:00.000Z', rules: DEFAULT_RULES }],
  });
}
