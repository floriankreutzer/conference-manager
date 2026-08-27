import { expect, test } from '@playwright/test';

const DOMAINS = Object.freeze([
  ['organization', 'createOrganizationSection', 'createDemoOrganizationSettings', 'saveOrganization', 'organization'],
  ['locations', 'createLocationsSection', 'createDemoLocationSettings', 'saveLocations', 'locations'],
  ['catalog', 'createCatalogSection', 'createDemoCatalogueSettings', 'saveCatalogue', 'catalogue'],
  ['policies', 'createBookingPoliciesSection', 'createDemoBookingPolicySettings', 'saveBookingPolicies', 'booking-policies'],
  ['allocation', 'createCostAllocationSection', 'createDemoCostAllocationSettings', 'saveCostAllocation', 'cost-allocation'],
]);

async function mount(page, domain, scenario = 'conflict') {
  await page.goto('/');
  await page.evaluate(async ({ requestedDomain, requestedScenario, definitions }) => {
    document.getElementById('tenant-settings-conflict-fixture')?.remove();
    const root = document.createElement('main');
    root.id = 'tenant-settings-conflict-fixture';
    document.body.appendChild(root);

    const modules = {
      organization: [
        await import('/src/tenant-admin/sections/organization/index.js'),
        await import('/src/tenant-admin/sections/organization/demo-adapter.js'),
      ],
      locations: [
        await import('/src/tenant-admin/sections/locations/index.js'),
        await import('/src/tenant-admin/sections/locations/demo-adapter.js'),
      ],
      catalog: [
        await import('/src/tenant-admin/sections/catalog/index.js'),
        await import('/src/tenant-admin/sections/catalog/demo-adapter.js'),
      ],
      policies: [
        await import('/src/tenant-admin/sections/booking-policies/index.js'),
        await import('/src/tenant-admin/sections/booking-policies/demo-adapter.js'),
      ],
      allocation: [
        await import('/src/tenant-admin/sections/cost-allocation/index.js'),
        await import('/src/tenant-admin/sections/cost-allocation/demo-adapter.js'),
      ],
    };
    const definition = definitions.find(([id]) => id === requestedDomain);
    const [, sectionFactory, adapterFactory, saveMethod] = definition;
    const [sectionModule, adapterModule] = modules[requestedDomain];
    const baseAdapter = adapterModule[adapterFactory]({ scenario: 'conflict' });
    const state = { reapplyCalls: 0, rejectReapply: null };
    const adapter = requestedScenario === 'reapply-failure'
      ? Object.freeze({
        ...baseAdapter,
        async [saveMethod](payload) {
          if (state.reapplyCalls === 0) {
            state.reapplyCalls += 1;
            return baseAdapter[saveMethod](payload);
          }
          state.reapplyCalls += 1;
          return new Promise((_resolve, reject) => {
            state.rejectReapply = () => reject(new Error('EXPECTED_REAPPLY_FAILURE'));
          });
        },
      })
      : baseAdapter;
    const section = sectionModule[sectionFactory]({ adapter });
    const render = () => section.render({ root, isCurrent: () => true, rerender: render });
    globalThis.__tenantSettingsConflictFixture = { render, state };
    await render();
  }, { requestedDomain: domain, requestedScenario: scenario, definitions: DOMAINS });
}

for (const [domain, , , , formId] of DOMAINS) {
  test(`${domain} deliberately reapplies a stale draft and restores heading focus`, async ({ page }) => {
    await mount(page, domain);
    const root = page.locator('#tenant-settings-conflict-fixture');
    await root.locator(`[data-tenant-settings-form="${formId}"]`).evaluate((form) => form.requestSubmit());
    await expect(root.locator('[data-tenant-settings-conflict-reapply="true"]')).toBeVisible();
    await root.locator('[data-tenant-settings-conflict-reapply="true"]').click();
    await expect(root.locator(`[data-tenant-settings-form="${formId}"]`)).toBeVisible();
    await expect(root.locator('h2')).toBeFocused();
  });
}

test('reapply failure is guarded, visible, live, and returns focus without duplicate writes', async ({ page }) => {
  await mount(page, 'organization', 'reapply-failure');
  const root = page.locator('#tenant-settings-conflict-fixture');
  await root.locator('[data-tenant-settings-form="organization"]').evaluate((form) => form.requestSubmit());

  const reload = root.locator('[data-tenant-settings-conflict-reload="true"]');
  const reapply = root.locator('[data-tenant-settings-conflict-reapply="true"]');
  await expect(reapply).toBeVisible();
  await page.evaluate(() => {
    const control = document.querySelector('[data-tenant-settings-conflict-reapply="true"]');
    const event = () => new MouseEvent('click', { bubbles: true, cancelable: true });
    control.dispatchEvent(event());
    control.dispatchEvent(event());
  });

  await expect.poll(() => page.evaluate(() => globalThis.__tenantSettingsConflictFixture.state.reapplyCalls)).toBe(2);
  await expect(reload).toBeDisabled();
  await expect(reapply).toBeDisabled();
  await expect(root.locator('[data-tenant-settings-conflict-pending="true"]')).toBeVisible();

  await page.evaluate(() => globalThis.__tenantSettingsConflictFixture.state.rejectReapply());
  const error = root.locator('[data-tenant-settings-conflict-error="true"]');
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute('role', 'alert');
  await expect(error).toHaveText('Die Änderungen konnten nicht sicher gespeichert werden.');
  await expect(reload).toBeEnabled();
  await expect(reapply).toBeEnabled();
  await expect(reapply).toBeFocused();
  expect(await page.evaluate(() => globalThis.__tenantSettingsConflictFixture.state.reapplyCalls)).toBe(2);
});
