import assert from 'node:assert/strict';
import test from 'node:test';

import { createTenantBookingPolicySettingsApi } from '../src/platform/tenant-booking-policy-settings-api.js';
import { createTenantCatalogueSettingsApi } from '../src/platform/tenant-catalogue-settings-api.js';
import {
  assertPercentageAllocation,
  createTenantCostAllocationSettingsApi,
} from '../src/platform/tenant-cost-allocation-settings-api.js';
import { createTenantLocationSettingsApi } from '../src/platform/tenant-location-settings-api.js';
import { createTenantOrganizationSettingsApi } from '../src/platform/tenant-organization-settings-api.js';
import { TENANT_SETTINGS_REVISION_CONFLICT } from '../src/tenant-admin/settings-revision.js';

const organization = () => ({
  displayName: 'Northstar Events',
  businessMetadata: { legalName: null, registrationNumber: null, countryCode: 'DE' },
  presentation: { defaultLocale: 'en-GB', defaultCurrency: 'EUR' },
  branding: { logoAssetRef: null, accentToken: 'default' },
});
const ACTOR_ID = '11111111-1111-4111-8111-111111111111';

const locations = () => ({
  sites: [{ id: 'berlin', name: 'Berlin', active: true, timeZone: 'Europe/Berlin', address: null }],
  rooms: [{
    id: 'atlas', siteId: 'berlin', name: 'Atlas', capacity: 12, active: true, floor: null,
    equipment: [], accessibility: [], serviceIds: [], cateringPackageIds: [],
    floorplanAssetId: null, mediaAssetIds: [],
  }],
});

const common = (id) => ({
  id, name: id, description: null, price: { amountMinor: 100, currency: 'EUR' }, active: true,
  order: 0, siteIds: [], roomIds: [],
});
const catalogue = () => ({
  services: [common('service-av')], equipment: [common('equipment-display')],
  cateringItems: [common('item-coffee')],
  cateringPackages: [{ ...common('package-coffee'), itemIds: ['item-coffee'], variants: [] }],
});

const policyConfiguration = () => ({
  versions: [{
    id: 'policy-default', effectiveFrom: '2026-01-01T00:00:00.000Z',
    rules: {
      minimumLeadTimeMinutes: 60, maximumAdvanceMinutes: 525600, cancellationWindowMinutes: 120,
      changeWindowMinutes: 120, maximumParticipants: 500, allowedSiteIds: [], allowedRoomIds: [],
      allowedServiceIds: [],
    },
  }],
});

const costConfiguration = () => ({
  allocationRequired: true,
  costCenters: [{ id: 'events', code: 'EVENTS', name: 'Events', group: null, active: true }],
});

function client(responses) {
  const calls = [];
  return {
    calls,
    async request(path, options) {
      calls.push({ path, options });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return structuredClone(response);
    },
  };
}

test('organization settings use the tenant endpoint, expected revision, and exact versioned envelope', async () => {
  const payload = { schemaVersion: 1, revision: 1, organization: organization() };
  const apiClient = client([payload, { ...payload, revision: 2 }]);
  const api = createTenantOrganizationSettingsApi({ apiClient });
  assert.deepEqual(await api.loadOrganization(), payload);
  await api.saveOrganization({ expectedRevision: 1, organization: organization() });
  assert.deepEqual(apiClient.calls, [
    { path: 'v1/tenant/settings/organization', options: undefined },
    {
      path: 'v1/tenant/settings/organization',
      options: { method: 'PUT', body: { schemaVersion: 1, expectedRevision: 1, organization: organization() } },
    },
  ]);
});

test('location settings keep provider context read-only and write configuration through the CSRF-capable client', async () => {
  const response = {
    locations: {
      schemaVersion: 1, revision: 2, configuration: locations(),
      providerContext: [{
        roomId: 'atlas', provider: 'microsoft365', status: 'active', displayName: 'Atlas',
        capacity: 12, lastSeenAt: '2026-08-27T10:00:00.000Z',
      }],
    },
  };
  const apiClient = client([response]);
  const api = createTenantLocationSettingsApi({ apiClient });
  await api.saveLocations({ expectedRevision: 1, configuration: locations() });
  assert.deepEqual(apiClient.calls[0], {
    path: 'v1/tenant/settings/locations',
    options: { method: 'PUT', body: { schemaVersion: 1, expectedRevision: 1, configuration: locations() } },
  });
  assert.equal(Object.hasOwn(apiClient.calls[0].options.body, 'providerContext'), false);
});

test('catalogue settings preserve all four bounded collections and British wire spelling', async () => {
  const response = { schemaVersion: 1, revision: 3, catalogue: catalogue() };
  const apiClient = client([response]);
  const api = createTenantCatalogueSettingsApi({ apiClient });
  await api.saveCatalogue({ expectedRevision: 2, catalogue: catalogue() });
  assert.equal(apiClient.calls[0].path, 'v1/tenant/settings/catalogue');
  assert.deepEqual(Object.keys(apiClient.calls[0].options.body.catalogue).sort(), [
    'cateringItems', 'cateringPackages', 'equipment', 'services',
  ]);
});

test('booking policy and cost allocation writes use bounded versioned envelopes', async () => {
  const policyClient = client([{ bookingPolicies: { schemaVersion: 1, revision: 2, configuration: policyConfiguration() } }]);
  await createTenantBookingPolicySettingsApi({ apiClient: policyClient }).saveBookingPolicies({
    expectedRevision: 1, configuration: policyConfiguration(),
  });
  assert.deepEqual(policyClient.calls[0], {
    path: 'v1/tenant/settings/booking-policies',
    options: { method: 'PUT', body: { schemaVersion: 1, expectedRevision: 1, configuration: policyConfiguration() } },
  });

  const costClient = client([{ costAllocation: { schemaVersion: 1, revision: 2, configuration: costConfiguration() } }]);
  await createTenantCostAllocationSettingsApi({ apiClient: costClient }).saveCostAllocation({
    expectedRevision: 1, configuration: costConfiguration(),
  });
  assert.deepEqual(costClient.calls[0], {
    path: 'v1/tenant/settings/cost-allocation',
    options: { method: 'PUT', body: { schemaVersion: 1, expectedRevision: 1, configuration: costConfiguration() } },
  });
});

test('cost allocation revision reads validate the immutable snapshot contract', async () => {
  const apiClient = client([{
    revision: {
      revision: 4, configuration: costConfiguration(), changedAt: '2026-08-27T10:00:00.000Z',
      actorUserId: ACTOR_ID,
    },
  }]);
  const snapshot = await createTenantCostAllocationSettingsApi({ apiClient }).loadCostAllocationRevision(4);
  assert.equal(snapshot.revision, 4);
  assert.deepEqual(apiClient.calls, [{ path: 'v1/tenant/settings/cost-allocation/history/4', options: undefined }]);
});

test('every Production adapter fails closed on extra response authority', async () => {
  const cases = [
    [createTenantOrganizationSettingsApi, { schemaVersion: 1, revision: 1, organization: organization(), tenantId: 'other' }, 'loadOrganization'],
    [createTenantLocationSettingsApi, { locations: { schemaVersion: 1, revision: 1, configuration: locations(), providerContext: [], providerId: 'secret' } }, 'loadLocations'],
    [createTenantCatalogueSettingsApi, { schemaVersion: 1, revision: 1, catalogue: { ...catalogue(), tenantOverrides: [] } }, 'loadCatalogue'],
    [createTenantBookingPolicySettingsApi, { bookingPolicies: { schemaVersion: 1, revision: 1, configuration: policyConfiguration(), approvalMode: 'browser' } }, 'loadBookingPolicies'],
    [createTenantCostAllocationSettingsApi, { costAllocation: { schemaVersion: 1, revision: 1, configuration: costConfiguration(), allocationAuthority: 'browser' } }, 'loadCostAllocation'],
  ];
  for (const [factory, response, method] of cases) {
    const api = factory({ apiClient: client([response]) });
    await assert.rejects(() => api[method](), (error) => /RESPONSE_INVALID/.test(error.code));
  }
});

test('malformed mutation fields fail before transport for every Production adapter', async () => {
  const cases = [
    [createTenantOrganizationSettingsApi, 'saveOrganization', { expectedRevision: 1, organization: { ...organization(), tenantId: 'other' } }],
    [createTenantLocationSettingsApi, 'saveLocations', { expectedRevision: 1, configuration: { ...locations(), providerContext: [] } }],
    [createTenantCatalogueSettingsApi, 'saveCatalogue', { expectedRevision: 1, catalogue: { ...catalogue(), actorUserId: ACTOR_ID } }],
    [createTenantBookingPolicySettingsApi, 'saveBookingPolicies', { expectedRevision: 1, configuration: { ...policyConfiguration(), script: 'allowAll()' } }],
    [createTenantCostAllocationSettingsApi, 'saveCostAllocation', { expectedRevision: 1, configuration: { ...costConfiguration(), authoritativeTotal: 1 } }],
  ];
  for (const [factory, method, value] of cases) {
    const apiClient = client([]);
    const api = factory({ apiClient });
    await assert.rejects(() => api[method](value), (error) => /RESPONSE_INVALID/.test(error.code));
    assert.equal(apiClient.calls.length, 0);
  }
});

test('Production adapters preserve the exact revision conflict for shared presentation', async () => {
  const conflict = Object.assign(new Error('conflict'), {
    code: 'HTTP_409', serverCode: TENANT_SETTINGS_REVISION_CONFLICT, currentRevision: 7,
  });
  const api = createTenantOrganizationSettingsApi({ apiClient: client([conflict]) });
  await assert.rejects(
    () => api.saveOrganization({ expectedRevision: 6, organization: organization() }),
    (error) => error.code === 'HTTP_409'
      && error.serverCode === TENANT_SETTINGS_REVISION_CONFLICT
      && error.currentRevision === 7,
  );
});

test('percentage allocations accept active centers only and total exactly 100 percent', () => {
  assert.deepEqual(assertPercentageAllocation([
    { costCenterId: 'events', percentageBasisPoints: 6_000 },
    { costCenterId: 'people', percentageBasisPoints: 4_000 },
  ], new Set(['events', 'people'])), {
    model: 'percentage_basis_points', totalBasisPoints: 10_000,
    entries: [
      { costCenterId: 'events', percentageBasisPoints: 6_000 },
      { costCenterId: 'people', percentageBasisPoints: 4_000 },
    ],
  });
  assert.throws(() => assertPercentageAllocation([
    { costCenterId: 'events', percentageBasisPoints: 9_999 },
  ], new Set(['events'])), /MUST_TOTAL_100/);
  assert.throws(() => assertPercentageAllocation([
    { costCenterId: 'archived', percentageBasisPoints: 10_000 },
  ], new Set(['events'])), /PERCENTAGES_INVALID/);
  assert.throws(
    () => assertPercentageAllocation([], new Set(['events']), { allocationRequired: true }),
    /TENANT_COST_ALLOCATION_REQUIRED/,
  );
});
