export const CATALOGUE_DEMO_SCENARIO = Object.freeze({
  NORMAL: 'normal', EMPTY: 'empty', CONFLICT: 'conflict', HISTORY: 'history', RECOVERY: 'recovery',
});
export const CATALOGUE_DEMO_SCENARIOS = Object.freeze(Object.values(CATALOGUE_DEMO_SCENARIO));

const common = (id, name, amountMinor, order = 0) => Object.freeze({
  id, name, description: null, price: Object.freeze({ amountMinor, currency: 'EUR' }), active: true,
  order, siteIds: Object.freeze([]), roomIds: Object.freeze([]),
});
const NORMAL = Object.freeze({
  services: Object.freeze([common('service-av', 'AV support', 7500)]),
  equipment: Object.freeze([common('equipment-projector', 'Projector', 2500)]),
  cateringItems: Object.freeze([common('item-coffee', 'Coffee', 350)]),
  cateringPackages: Object.freeze([
    Object.freeze({
      ...common('package-coffee', 'Coffee service', 1200), itemIds: Object.freeze(['item-coffee']),
      variants: Object.freeze([Object.freeze({ id: 'variant-large', name: 'Large', description: null, price: Object.freeze({ amountMinor: 1800, currency: 'EUR' }), active: true, order: 0 })]),
    }),
  ]),
});

export function catalogueDemoFixture(scenario = CATALOGUE_DEMO_SCENARIO.NORMAL) {
  if (!CATALOGUE_DEMO_SCENARIOS.includes(scenario)) throw new TypeError('CATALOGUE_DEMO_SCENARIO_INVALID');
  return structuredClone(scenario === CATALOGUE_DEMO_SCENARIO.EMPTY
    ? { services: [], equipment: [], cateringPackages: [], cateringItems: [] }
    : NORMAL);
}
