export const COST_ALLOCATION_DEMO_SCENARIO = Object.freeze({
  NORMAL: 'normal', EMPTY: 'empty', CONFLICT: 'conflict', HISTORY: 'history', RECOVERY: 'recovery',
});
export const COST_ALLOCATION_DEMO_SCENARIOS = Object.freeze(Object.values(COST_ALLOCATION_DEMO_SCENARIO));

const NORMAL = Object.freeze({
  allocationRequired: true,
  costCenters: Object.freeze([
    Object.freeze({ id: 'cost-events', code: 'EVENTS', name: 'Events', group: 'Commercial', active: true }),
    Object.freeze({ id: 'cost-people', code: 'PEOPLE', name: 'People', group: 'Corporate', active: true }),
  ]),
});

export function costAllocationDemoFixture(scenario = COST_ALLOCATION_DEMO_SCENARIO.NORMAL) {
  if (!COST_ALLOCATION_DEMO_SCENARIOS.includes(scenario)) throw new TypeError('COST_ALLOCATION_DEMO_SCENARIO_INVALID');
  return structuredClone(scenario === COST_ALLOCATION_DEMO_SCENARIO.EMPTY
    ? { allocationRequired: false, costCenters: [] }
    : NORMAL);
}

export const COST_ALLOCATION_DEMO_PERCENTAGES = Object.freeze({
  model: 'percentage_basis_points', totalBasisPoints: 10_000,
  entries: Object.freeze([
    Object.freeze({ costCenterId: 'cost-events', percentageBasisPoints: 6_000 }),
    Object.freeze({ costCenterId: 'cost-people', percentageBasisPoints: 4_000 }),
  ]),
});
