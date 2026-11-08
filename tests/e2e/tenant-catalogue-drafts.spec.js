import { test, expect } from '@playwright/test';

const sections = {
  locations: { field: '#tenant-site-name-0', search: '#tenant-sites-search', initial: 'Berlin Campus' },
  'cost-allocation': { field: '#tenant-cost-center-0-name', search: '#tenant-cost-centers-search', initial: 'Events' },
};

async function fixture(page, section, language) {
  await page.goto('/');
  await page.evaluate(async ({ section, language }) => {
    const { setLanguage } = await import('/src/core/i18n.js');
    const { createLocationsSection } = await import('/src/tenant-admin/sections/locations/index.js');
    const { createCostAllocationSection } = await import('/src/tenant-admin/sections/cost-allocation/index.js');
    const { createTenantAdminSettingsShell } = await import('/src/tenant-admin/settings-shell.js');
    setLanguage(language);
    const state = { revision: 3, writes: [], mode: 'ready', configuration: section === 'locations' ? {
      sites: [{ id: 'berlin', name: 'Berlin Campus', active: true, timeZone: 'Europe/Berlin',
        address: null, guestInformation: null, guestPublicValues: null }], rooms: [],
    } : { allocationRequired: false,
      costCenters: [{ id: 'events', code: 'EVENTS', name: 'Events', group: null, active: true }] } };
    window.catalogueDraftTest = state;
    const load = async () => structuredClone({ revision: state.revision, configuration: state.configuration, providerContext: [] });
    const save = async (value) => {
      state.writes.push(structuredClone(value));
      if (state.mode === 'pending') await new Promise((resolve) => { state.release = resolve; });
      if (state.mode === 'failed') throw new Error('TEST_SAVE_FAILED');
      if (state.mode === 'conflict') throw Object.assign(new Error('CONFLICT'), {
        code: 'HTTP_409', serverCode: 'TENANT_SETTINGS_REVISION_CONFLICT', currentRevision: 4,
      });
      state.configuration = structuredClone(value.configuration); state.revision += 1;
    };
    const adapter = { loadLocations: load, saveLocations: save, listLocationsHistory: async () => [],
      loadCostAllocation: load, saveCostAllocation: save, listCostAllocationHistory: async () => [],
      loadCostAllocationRevision: load };
    document.body.replaceChildren();
    const root = document.createElement('main'); document.body.appendChild(root);
    history.replaceState(null, '', `#tenant-admin/${section}`);
    const shell = createTenantAdminSettingsShell({ appRoot: root, setPageHeading() {}, sections: [
      section === 'locations' ? createLocationsSection({ adapter }) : createCostAllocationSection({ adapter }),
    ] });
    shell.render();
  }, { section, language });
  await expect(page.locator(sections[section].field)).toBeVisible();
}

for (const section of Object.keys(sections)) {
  for (const language of ['de', 'en']) {
    test(`CO-306 ${section} ${language}: search is clean; edits require explicit discard and save clears dirty state`, async ({ page }) => {
      await fixture(page, section, language);
      const { field, search, initial } = sections[section];
      const overview = page.locator('[data-tenant-admin-section="overview"]');
      await page.locator(search).fill('No match');
      await overview.click();
      await expect(page.locator('form')).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.locator(`[data-tenant-admin-section="${section}"]`).click();
      await page.locator(field).fill('Draft preserved');
      expect(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
      await overview.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('button', { name: language === 'de' ? 'Hier bleiben' : 'Stay here' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator(field)).toHaveValue('Draft preserved');
      await overview.click();
      await dialog.getByRole('button', { name: language === 'de' ? 'Änderungen verwerfen' : 'Discard changes' }).click();
      await expect(page.locator('form')).toHaveCount(0);
      await page.locator(`[data-tenant-admin-section="${section}"]`).click();
      await expect(page.locator(field)).toHaveValue(initial);
      await page.locator(field).fill('Saved once');
      await page.locator('button[type="submit"]').click();
      await expect.poll(() => page.evaluate(() => window.catalogueDraftTest.revision)).toBe(4);
      await expect(page.locator(field)).toHaveValue('Saved once');
      await overview.click();
      await expect(page.locator('form')).toHaveCount(0);
      await expect(dialog).toHaveCount(0);
      expect(await page.evaluate(() => window.catalogueDraftTest.writes.length)).toBe(1);
    });

    test(`CO-306 ${section} ${language}: pending save locks edits and conflict preserves the unsaved form`, async ({ page }) => {
      await fixture(page, section, language);
      const { field } = sections[section];
      await page.locator(field).fill('Retain after failure');
      await page.evaluate(() => { window.catalogueDraftTest.mode = 'pending'; });
      await page.locator('button[type="submit"]').click();
      await expect(page.locator(field)).toBeDisabled();
      await expect(page.locator('button[type="submit"]')).toBeDisabled();
      await page.evaluate(() => { window.catalogueDraftTest.mode = 'failed'; window.catalogueDraftTest.release(); });
      await expect(page.locator(field)).toBeEnabled();
      await expect(page.locator(field)).toHaveValue('Retain after failure');
      await page.evaluate(() => { window.catalogueDraftTest.mode = 'conflict'; });
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('button[type="submit"]')).toBeEnabled();
      await expect(page.locator(field)).toHaveValue('Retain after failure');
      await expect(page.locator('[data-tenant-settings-conflict-reapply]')).toHaveCount(0);
      await page.locator('[data-tenant-admin-section="overview"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(field)).toHaveValue('Retain after failure');
      expect(await page.evaluate(() => window.catalogueDraftTest.writes.map((write) => write.expectedRevision))).toEqual([3, 3]);
      // A security lock makes stale editor state ineligible for a navigation veto.
      await page.evaluate(() => { document.documentElement.dataset.sessionLocked = 'true'; });
      expect(await page.evaluate(() => dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
    });
  }
}
