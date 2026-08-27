export const ORGANIZATION_DEMO_SCENARIO = Object.freeze({
  NORMAL: 'normal', EMPTY: 'empty', CONFLICT: 'conflict', HISTORY: 'history', RECOVERY: 'recovery',
});

export const ORGANIZATION_DEMO_SCENARIOS = Object.freeze(Object.values(ORGANIZATION_DEMO_SCENARIO));

const NORMAL = Object.freeze({
  displayName: 'Northstar Events',
  businessMetadata: Object.freeze({ legalName: 'Northstar Events GmbH', registrationNumber: 'HRB 12345', countryCode: 'DE' }),
  presentation: Object.freeze({ defaultLocale: 'en-GB', defaultCurrency: 'EUR' }),
  branding: Object.freeze({ logoAssetRef: null, accentToken: 'default' }),
});

const EMPTY = Object.freeze({
  displayName: 'New tenant',
  businessMetadata: Object.freeze({ legalName: null, registrationNumber: null, countryCode: null }),
  presentation: Object.freeze({ defaultLocale: 'en-GB', defaultCurrency: 'EUR' }),
  branding: Object.freeze({ logoAssetRef: null, accentToken: 'default' }),
});

export function organizationDemoFixture(scenario = ORGANIZATION_DEMO_SCENARIO.NORMAL) {
  if (!ORGANIZATION_DEMO_SCENARIOS.includes(scenario)) throw new TypeError('ORGANIZATION_DEMO_SCENARIO_INVALID');
  return structuredClone(scenario === ORGANIZATION_DEMO_SCENARIO.EMPTY ? EMPTY : NORMAL);
}
