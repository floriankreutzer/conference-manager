import { expect, test } from '@playwright/test';

async function mount(page, domain, scenario = 'normal') {
  await page.goto('/');
  await page.evaluate(async ({ requestedDomain, requestedScenario }) => {
    document.getElementById('tenant-settings-domain-fixture')?.remove();
    const root = document.createElement('main');
    root.id = 'tenant-settings-domain-fixture';
    document.body.appendChild(root);
    const modules = {
      organization: [
        await import('/src/tenant-admin/sections/organization/index.js'),
        await import('/src/tenant-admin/sections/organization/demo-adapter.js'),
        'createOrganizationSection', 'createDemoOrganizationSettings',
      ],
      locations: [
        await import('/src/tenant-admin/sections/locations/index.js'),
        await import('/src/tenant-admin/sections/locations/demo-adapter.js'),
        'createLocationsSection', 'createDemoLocationSettings',
      ],
      catalog: [
        await import('/src/tenant-admin/sections/catalog/index.js'),
        await import('/src/tenant-admin/sections/catalog/demo-adapter.js'),
        'createCatalogSection', 'createDemoCatalogueSettings',
      ],
      policies: [
        await import('/src/tenant-admin/sections/booking-policies/index.js'),
        await import('/src/tenant-admin/sections/booking-policies/demo-adapter.js'),
        'createBookingPoliciesSection', 'createDemoBookingPolicySettings',
      ],
      allocation: [
        await import('/src/tenant-admin/sections/cost-allocation/index.js'),
        await import('/src/tenant-admin/sections/cost-allocation/demo-adapter.js'),
        'createCostAllocationSection', 'createDemoCostAllocationSettings',
      ],
    };
    const [sectionModule, adapterModule, sectionFactory, adapterFactory] = modules[requestedDomain];
    const adapter = adapterModule[adapterFactory]({ scenario: requestedScenario });
    const section = sectionModule[sectionFactory]({ adapter });
    const render = () => section.render({ root, isCurrent: () => true, rerender: render });
    globalThis.__tenantSettingsDomainFixture = { adapter, render };
    await render();
  }, { requestedDomain: domain, requestedScenario: scenario });
}

test('organization form saves through the revision contract and restores heading focus', async ({ page }) => {
  await mount(page, 'organization');
  const name = page.locator('#tenant-organization-display-name');
  await expect(name).toHaveValue('Northstar Events');
  await name.fill('Updated Northstar');
  await page.locator('[data-tenant-settings-form="organization"] button[type="submit"]').click();
  await expect(page.locator('[data-tenant-settings-form="organization"]')).toBeVisible();
  await expect(page.locator('#tenant-settings-domain-fixture h2')).toBeFocused();
  await expect(page.locator('#tenant-settings-domain-fixture')).toContainText(/2/);
});

test('revision conflicts are announced with reload and deliberate reapply actions', async ({ page }) => {
  await mount(page, 'organization', 'conflict');
  await page.locator('#tenant-organization-display-name').fill('Conflicting update');
  await page.locator('[data-tenant-settings-form="organization"] button[type="submit"]').click();
  await expect(page.locator('[data-tenant-settings-conflict-reload="true"]')).toBeVisible();
  await expect(page.locator('[data-tenant-settings-conflict-reapply="true"]')).toBeVisible();
  await expect(page.locator('#tenant-settings-domain-fixture .tenant-admin-status[role="alert"]')).toBeVisible();
  await page.locator('[data-tenant-settings-conflict-reload="true"]').click();
  await expect(page.locator('[data-tenant-settings-form="organization"]')).toBeVisible();
});

test('locations, catalogue, policies, and allocation expose bounded accessible controls', async ({ page }) => {
  await mount(page, 'locations');
  await expect(page.locator('[data-tenant-room-id="room-atlas"]')).toBeVisible();
  await expect(page.locator('#tenant-settings-domain-fixture')).not.toContainText(/@|providerId|externalRoomId/i);
  await expect(page.locator('#tenant-site-time-zone-0')).toHaveValue('Europe/Berlin');

  await mount(page, 'catalog');
  for (const category of ['services', 'equipment', 'cateringItems', 'cateringPackages']) {
    await expect(page.locator(`[data-catalogue-category="${category}"]`).first()).toBeVisible();
  }
  await expect(page.locator('[data-catalogue-variant-id="variant-large"]')).toBeVisible();
  await page.evaluate(() => {
    const fixture = globalThis.__tenantSettingsDomainFixture;
    const originalLoad = fixture.adapter.loadCatalogue.bind(fixture.adapter);
    fixture.adapter.loadCatalogue = async () => {
      const snapshot = await originalLoad();
      const entry = snapshot.catalogue.cateringPackages[0];
      return {
        ...snapshot,
        catalogue: {
          ...snapshot.catalogue,
          cateringPackages: [{
            ...entry,
            variants: [
              ...entry.variants,
              { ...entry.variants[0], id: `${entry.id}-variant-3`, name: 'Reserved ID' },
            ],
          }],
        },
      };
    };
    return fixture.render();
  });
  const packageEditor = page.locator('[data-catalogue-entry-id="package-coffee"]');
  const variants = packageEditor.locator('[data-catalogue-variant-id]');
  const existingVariantIds = await variants.evaluateAll((nodes) => (
    nodes.map((node) => node.dataset.catalogueVariantId)
  ));
  await packageEditor.getByRole('button', { name: /tenantSettings\.catalogue\.addVariant|Variante|variant/i }).click();
  await expect(variants).toHaveCount(existingVariantIds.length + 1);
  const addedVariantIds = (await variants.evaluateAll((nodes) => (
    nodes.map((node) => node.dataset.catalogueVariantId)
  ))).filter((id) => !existingVariantIds.includes(id));
  expect(addedVariantIds).toHaveLength(1);
  expect(addedVariantIds[0]).toMatch(/^package-coffee-variant-\d+$/);
  expect(addedVariantIds[0]).not.toBe('package-coffee-variant-3');
  await expect(packageEditor.locator(`[data-catalogue-variant-id="${addedVariantIds[0]}"]`)).toBeVisible();

  await mount(page, 'policies');
  await expect(page.locator('[data-booking-policy-id="policy-default"] input').first()).toBeDisabled();
  await page.locator('#tenant-settings-domain-fixture').getByRole('button').filter({ hasText: /tenantSettings\.bookingPolicies\.addVersion|Richtlinienstand|policy revision/ }).click();
  await expect(page.locator('[data-booking-policy-id="policy-2"]')).toBeVisible();

  await mount(page, 'allocation');
  await expect(page.locator('#tenant-allocation-required')).toBeChecked();
  await expect(page.locator('[data-cost-center-id]')).toHaveCount(2);
});
