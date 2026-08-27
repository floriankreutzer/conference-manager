import assert from 'node:assert/strict';
import test from 'node:test';

import { createTenantBookingPolicySettingsApi } from '../src/platform/tenant-booking-policy-settings-api.js';
import { createTenantCatalogueSettingsApi } from '../src/platform/tenant-catalogue-settings-api.js';
import { createTenantCostAllocationSettingsApi } from '../src/platform/tenant-cost-allocation-settings-api.js';
import { createTenantLocationSettingsApi } from '../src/platform/tenant-location-settings-api.js';
import { createTenantOrganizationSettingsApi } from '../src/platform/tenant-organization-settings-api.js';
import { TENANT_SETTINGS_REVISION_CONFLICT } from '../src/tenant-admin/settings-revision.js';
import { createDemoBookingPolicySettings } from '../src/tenant-admin/sections/booking-policies/demo-adapter.js';
import { createDemoCatalogueSettings } from '../src/tenant-admin/sections/catalog/demo-adapter.js';
import { createDemoCostAllocationSettings } from '../src/tenant-admin/sections/cost-allocation/demo-adapter.js';
import { createDemoLocationSettings } from '../src/tenant-admin/sections/locations/demo-adapter.js';
import { createDemoOrganizationSettings } from '../src/tenant-admin/sections/organization/demo-adapter.js';

const domains = [
  {
    name: 'organization', factory: createDemoOrganizationSettings, load: 'loadOrganization', save: 'saveOrganization',
    value(snapshot) { return snapshot.organization; }, body(value) { return { organization: value }; },
  },
  {
    name: 'locations', factory: createDemoLocationSettings, load: 'loadLocations', save: 'saveLocations',
    value(snapshot) { return snapshot.configuration; }, body(value) { return { configuration: value }; },
  },
  {
    name: 'catalogue', factory: createDemoCatalogueSettings, load: 'loadCatalogue', save: 'saveCatalogue',
    value(snapshot) { return snapshot.catalogue; }, body(value) { return { catalogue: value }; },
  },
  {
    name: 'booking policies', factory: createDemoBookingPolicySettings, load: 'loadBookingPolicies', save: 'saveBookingPolicies',
    value(snapshot) { return snapshot.configuration; }, body(value) { return { configuration: value }; },
  },
  {
    name: 'cost allocation', factory: createDemoCostAllocationSettings, load: 'loadCostAllocation', save: 'saveCostAllocation',
    value(snapshot) { return snapshot.configuration; }, body(value) { return { configuration: value }; },
  },
];

for (const domain of domains) {
  test(`${domain.name} Demo adapter resets deterministically and returns defensive values`, async () => {
    const adapter = domain.factory();
    const first = await adapter[domain.load]();
    assert.equal(first.revision, 1);
    const value = domain.value(first);
    await adapter[domain.save]({ expectedRevision: 1, ...domain.body(value) });
    assert.equal((await adapter[domain.load]()).revision, 2);
    await assert.rejects(
      () => adapter[domain.save]({ expectedRevision: 1, ...domain.body(value) }),
      (error) => error.code === 'HTTP_409'
        && error.serverCode === TENANT_SETTINGS_REVISION_CONFLICT
        && error.currentRevision === 2,
    );
    assert.equal(adapter.reset({ scenario: 'empty' }), 1);
    assert.equal((await adapter[domain.load]()).revision, 1);
    assert.equal(adapter.reset({ scenario: 'normal' }), 1);
    assert.equal((await adapter[domain.load]()).revision, 1);
  });

  test(`${domain.name} Demo conflict advances authoritative state and exposes the exact shared conflict`, async () => {
    const adapter = domain.factory({ scenario: 'conflict' });
    const first = await adapter[domain.load]();
    await assert.rejects(
      () => adapter[domain.save]({ expectedRevision: first.revision, ...domain.body(domain.value(first)) }),
      (error) => error.code === 'HTTP_409'
        && error.serverCode === TENANT_SETTINGS_REVISION_CONFLICT
        && error.currentRevision === 2,
    );
    assert.equal((await adapter[domain.load]()).revision, 2);
  });

  test(`${domain.name} Demo recovery fails once without external fallback`, async () => {
    const adapter = domain.factory({ scenario: 'recovery' });
    await assert.rejects(() => adapter[domain.load](), (error) => error.code === 'HTTP_503');
    assert.equal((await adapter[domain.load]()).revision, 1);
  });
}

test('Demo percentage allocations are deterministic and exactly 100 percent', async () => {
  const allocation = await createDemoCostAllocationSettings().loadDemoPercentageAllocation();
  assert.equal(allocation.model, 'percentage_basis_points');
  assert.equal(allocation.totalBasisPoints, 10_000);
  assert.equal(allocation.entries.reduce((total, entry) => total + entry.percentageBasisPoints, 0), 10_000);
});

test('Demo current and history values satisfy the exact Production response validators', async () => {
  const organizationDemo = createDemoOrganizationSettings();
  const organizationResponses = [
    await organizationDemo.loadOrganization(),
    await organizationDemo.listOrganizationHistory(),
  ];
  const organizationApi = createTenantOrganizationSettingsApi({
    apiClient: { async request() { return organizationResponses.shift(); } },
  });
  await organizationApi.loadOrganization();
  await organizationApi.listOrganizationHistory();

  const locationDemo = createDemoLocationSettings();
  const locationResponses = [
    { locations: await locationDemo.loadLocations() },
    { history: await locationDemo.listLocationsHistory() },
  ];
  const locationApi = createTenantLocationSettingsApi({
    apiClient: { async request() { return locationResponses.shift(); } },
  });
  await locationApi.loadLocations();
  await locationApi.listLocationsHistory();

  const catalogueDemo = createDemoCatalogueSettings();
  const catalogueResponses = [
    await catalogueDemo.loadCatalogue(),
    await catalogueDemo.listCatalogueHistory(),
  ];
  const catalogueApi = createTenantCatalogueSettingsApi({
    apiClient: { async request() { return catalogueResponses.shift(); } },
  });
  await catalogueApi.loadCatalogue();
  await catalogueApi.listCatalogueHistory();

  const policyDemo = createDemoBookingPolicySettings();
  const policyResponses = [
    { bookingPolicies: await policyDemo.loadBookingPolicies() },
    { history: await policyDemo.listBookingPoliciesHistory() },
  ];
  const policyApi = createTenantBookingPolicySettingsApi({
    apiClient: { async request() { return policyResponses.shift(); } },
  });
  await policyApi.loadBookingPolicies();
  await policyApi.listBookingPoliciesHistory();

  const allocationDemo = createDemoCostAllocationSettings();
  const allocationResponses = [
    { costAllocation: await allocationDemo.loadCostAllocation() },
    { history: await allocationDemo.listCostAllocationHistory() },
  ];
  const allocationApi = createTenantCostAllocationSettingsApi({
    apiClient: { async request() { return allocationResponses.shift(); } },
  });
  await allocationApi.loadCostAllocation();
  await allocationApi.listCostAllocationHistory();
});
