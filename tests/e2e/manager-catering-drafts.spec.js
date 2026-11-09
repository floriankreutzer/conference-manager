import { attachCustomerScreenEvidence } from './fixtures/customer-screen-evidence.js';
import { test, expect } from '@playwright/test';

const imageFile = { name: 'catering.png', mimeType: 'image/png', buffer: Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAD91JpzAAAAFElEQVR42mP4z8DAwMDAxAADCBYAOx0BA8VudC8AAAAASUVORK5CYII=', 'base64',
) };
const servedWebp = Buffer.from('UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAMAAUAmJaACdLoB+AAETAAA/uLgv996A3k//72C+9APegH9fAAA', 'base64');

async function fixture(page, { withImage = false, withPackage = false, language = 'en' } = {}) {
  await page.route('**/manager-catering-editor', (route) => route.fulfill({
    contentType: 'text/html', body: `<!doctype html><html lang="${language}"><head>
      <meta name="conference-runtime" content="demo"><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/styles.css">
      <link rel="stylesheet" href="/assets/app-layout.css"><link rel="stylesheet" href="/assets/manager-layout.css">
      </head><body><h1 id="viewTitle" tabindex="-1"></h1><main id="app"></main><div id="toast" role="status"></div></body></html>`,
  }));
  await page.route('**/api/v1/demo/media/*', (route) => route.fulfill({ contentType: 'image/webp', body: servedWebp }));
  await page.goto('/manager-catering-editor');
  await page.evaluate(async ({ hasImage, withPackage, language }) => {
    const { setLanguage } = await import('/src/core/i18n.js');
    const { createManagerBusinessSettingsApplication } = await import('/src/manager/index.js');
    setLanguage(language);
    const state = { revision: 1, writes: [], images: [], removed: [], mode: 'ready', authority: 0, navigations: 0,
      catalogue: { services: [], equipment: [], cateringPackages: [], roomPrices: [], cateringItems: [{
        id: 'coffee', name: 'Coffee', description: null, price: { amountMinor: 200, currency: 'EUR' },
        active: true, order: 1, siteIds: [], roomIds: [],
      }] } };
    if (withPackage) state.catalogue.cateringPackages.push({
      id: 'coffee-break', name: 'Coffee break', description: null, price: { amountMinor: 200, currency: 'EUR' },
      active: true, order: 1, siteIds: [], roomIds: [], itemIds: ['coffee'], variants: [],
    });
    window.managerCateringDraft = state;
    const loadCatalogue = async () => structuredClone({ revision: state.revision, catalogue: state.catalogue });
    const catalogue = { loadCatalogue, listCatalogueHistory: async () => ({ revisions: [] }),
      listDemoMedia: async () => ({ assets: hasImage ? [{ id: '11111111-1111-4111-8111-111111111111',
        ownerKind: 'catering_item', ownerId: 'coffee', altText: 'Coffee', contentType: 'image/webp',
        url: '/api/v1/demo/media/11111111-1111-4111-8111-111111111111' }] : [] }),
      removeDemoCatalogueImage: async (id) => {
        state.removed.push(id);
        if (state.mode === 'pending') await new Promise(resolve => { state.release = resolve; });
        hasImage = false;
      },
      replaceDemoCatalogueImage: async () => { throw new Error('UNEXPECTED_IMAGE_REPLACEMENT'); },
      saveCatalogue: async (value) => {
        state.writes.push(structuredClone(value));
        if (value.expectedRevision !== state.revision) throw Object.assign(new Error('CONFLICT'), { currentRevision: state.revision });
        state.catalogue = structuredClone(value.catalogue); state.revision += 1;
        return loadCatalogue();
      },
      createDemoCatalogueImage: async (kind, id) => {
        state.images.push({ kind, id });
        if (state.mode === 'pending') await new Promise((resolve) => { state.release = resolve; });
        if (state.mode === 'revoked') throw Object.assign(new Error('REVOKED'), { code: 'HTTP_403' });
        if (state.mode === 'failed') throw new Error('IMAGE_WRITE_FAILED');
        return { assetId: '11111111-1111-4111-8111-111111111111',
          url: '/api/v1/demo/media/11111111-1111-4111-8111-111111111111' };
      },
    };
    const root = document.getElementById('app');
    const app = createManagerBusinessSettingsApplication({ appRoot: root,
      setPageHeading: (title) => { document.getElementById('viewTitle').textContent = title; },
      locations: { loadLocations: async () => ({ revision: 1, configuration: { sites: [], rooms: [] } }),
        saveLocations: async () => { throw new Error('UNEXPECTED_ROOM_WRITE'); }, listLocationsHistory: async () => [] },
      catalogue, initialNavigation: { section: 'catering' }, onAuthorityFailure: () => { state.authority += 1; },
    });
    state.allowNavigation = () => app.allowNavigation(() => { state.navigations += 1; });
    await app.renderManagerSettings();
  }, { hasImage: withImage, withPackage, language });
  await expect(page.locator('#manager-catalogue-cateringItems-coffee-name')).toBeVisible();
}

test('CO-306 new Catering owner/image write locks the complete draft and retains unrelated unsaved entries', async ({ page }, testInfo) => {
  await fixture(page);
  const existing = page.locator('#manager-catalogue-cateringItems-coffee-name');
  await attachCustomerScreenEvidence(page, testInfo, { screen: '19', state: 'demo-catering-before-edit',
    roles: ['conference_manager'], composition: 'isolated-demo-component-routed-media-fixture' });
  await existing.fill('Unsubmitted coffee edit');
  await page.locator('[data-add-catalogue-entry="cateringItems"]').click();
  const name = page.locator('#manager-catalogue-cateringItems-cateringItems-1-name');
  await name.fill('New tea');
  const file = page.locator('#manager-catering-image-cateringItems-1');
  await file.setInputFiles(imageFile);
  await page.evaluate(() => { window.managerCateringDraft.mode = 'pending'; });
  await file.locator('xpath=ancestor::section[contains(@class,"room-asset-panel")]')
    .getByRole('button', { name: 'Upload catering image', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.managerCateringDraft.images.length)).toBe(1);
  await expect(existing).toBeDisabled(); await expect(name).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.managerCateringDraft.allowNavigation())).toBe(false);
  expect(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
  expect(await page.evaluate(() => window.managerCateringDraft.writes[0].catalogue.cateringItems.map((entry) => entry.name)))
    .toEqual(['Coffee', 'New tea']);
  await page.evaluate(() => { window.managerCateringDraft.mode = 'ready'; window.managerCateringDraft.release(); });
  await expect(existing).toBeEnabled(); await expect(existing).toHaveValue('Unsubmitted coffee edit');
  await expect(name).toHaveValue('New tea');
  expect(await file.evaluate((control) => control.files.length)).toBe(0);
  await page.locator('[data-add-catalogue-entry="cateringPackages"]').click();
  await expect(page.locator('#manager-catalogue-package-cateringPackages-1-items')
    .getByRole('option', { name: 'New tea', exact: true })).toHaveAttribute('value', 'cateringItems-1');
  await page.getByRole('button', { name: 'Services & equipment', exact: true }).click();
  await expect(page.locator('dialog[aria-labelledby="managerUnsavedTitle"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.managerCateringDraft.revision)).toBe(3);
  expect(await page.evaluate(() => window.managerCateringDraft.writes.map((write) => write.expectedRevision))).toEqual([1, 2]);
  expect(await page.evaluate(() => window.managerCateringDraft.catalogue.cateringItems.map((entry) => entry.name)))
    .toEqual(['Unsubmitted coffee edit', 'New tea']);
});

test('CO-306 Catering image ownership refuses a newer catalogue revision and preserves the selected file', async ({ page }) => {
  await fixture(page);
  await page.locator('[data-add-catalogue-entry="cateringItems"]').click();
  const name = page.locator('#manager-catalogue-cateringItems-cateringItems-1-name');
  await name.fill('Conflict tea');
  const file = page.locator('#manager-catering-image-cateringItems-1');
  await file.setInputFiles(imageFile);
  await page.evaluate(() => { window.managerCateringDraft.revision = 2; });
  await file.locator('xpath=ancestor::section[contains(@class,"room-asset-panel")]')
    .getByRole('button', { name: 'Upload catering image', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('changed in the meantime');
  await expect(name).toBeEnabled(); await expect(name).toHaveValue('Conflict tea');
  expect(await file.evaluate((control) => control.files.length)).toBe(1);
  expect(await page.evaluate(() => window.managerCateringDraft.writes.length)).toBe(0);
  expect(await page.evaluate(() => window.managerCateringDraft.images.length)).toBe(0);
  expect(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
});

test('CO-306 authority loss during a Catering image write clears the form and pending navigation', async ({ page }) => {
  await fixture(page);
  const file = page.locator('#manager-catering-image-coffee');
  await file.setInputFiles(imageFile);
  await page.evaluate(() => { window.managerCateringDraft.mode = 'pending'; });
  await page.getByRole('button', { name: 'Upload catering image', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.managerCateringDraft.images.length)).toBe(1);
  await page.evaluate(() => { window.managerCateringDraft.mode = 'revoked'; window.managerCateringDraft.release(); });
  await expect(page.locator('[data-manager-business-settings-root]')).toHaveCount(0);
  expect(await page.evaluate(() => window.managerCateringDraft.authority)).toBe(1);
  expect(await page.evaluate(() => window.managerCateringDraft.navigations)).toBe(0);
  expect(await page.evaluate(() => dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
});

test('CO-306 removing a Catering image restores focus to its replacement picker and keeps other drafts', async ({ page }) => {
  await fixture(page, { withImage: true });
  const name = page.locator('#manager-catalogue-cateringItems-coffee-name');
  await name.fill('Unsaved coffee name');
  await page.evaluate(() => { window.managerCateringDraft.mode = 'pending'; });
  const remove = page.getByRole('button', { name: 'Remove catering image', exact: true });
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.managerCateringDraft.removed.length)).toBe(1);
  await expect(name).toBeDisabled();
  await page.evaluate(() => { window.managerCateringDraft.mode = 'ready'; window.managerCateringDraft.release(); });
  await expect(name).toBeEnabled();
  await expect(name).toHaveValue('Unsaved coffee name');
  await expect(page.locator('#manager-catering-image-11111111-1111-4111-8111-111111111111')).toBeFocused();
  await expect(remove).toBeHidden();
  expect(await page.evaluate(() => window.managerCateringDraft.writes.length)).toBe(0);
  await page.getByRole('button', { name: 'Services & equipment', exact: true }).click();
  await expect(page.locator('dialog[aria-labelledby="managerUnsavedTitle"]')).toBeVisible();
});

for (const language of ['de', 'en']) {
  for (const selectedFile of [false, true]) {
    test(`CO-306 saved Catering items refresh named package choices with ${selectedFile ? 'selected' : 'empty'} image picker in ${language}`, async ({ page }) => {
      await fixture(page, { withPackage: true, language });
      const save = page.getByRole('button', { name: language === 'de' ? 'Speichern' : 'Save', exact: true });
      const existingChoices = page.locator('#manager-catalogue-package-coffee-break-items');
      const root = page.locator('[data-manager-business-settings-root]');
      const initialRoot = await root.getAttribute('data-manager-business-settings-root');
      await page.locator('[data-add-catalogue-entry="cateringItems"]').click();
      const name = page.locator('#manager-catalogue-cateringItems-cateringItems-1-name');
      await name.fill('Contoso Coffee');
      await page.locator('#manager-catalogue-cateringItems-cateringItems-1-amount').fill('3.00');
      const file = page.locator('#manager-catering-image-cateringItems-1');
      if (selectedFile) await file.setInputFiles(imageFile);
      await expect(existingChoices.getByRole('option', { name: 'Contoso Coffee', exact: true })).toHaveCount(0);
      await save.click();
      await expect.poll(() => page.evaluate(() => window.managerCateringDraft.revision)).toBe(2);
      await expect(save).toBeEnabled();
      if (selectedFile) {
        await expect(root).toHaveAttribute('data-manager-business-settings-root', initialRoot);
        expect(await file.evaluate((control) => control.files.length)).toBe(1);
      } else {
        await expect(root).not.toHaveAttribute('data-manager-business-settings-root', initialRoot);
        await expect(page.locator('#viewTitle')).toBeFocused();
      }
      expect(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(selectedFile);
      await expect(existingChoices).toHaveValues(['coffee']);
      await expect(existingChoices.getByRole('option', { name: 'Contoso Coffee', exact: true }))
        .toHaveAttribute('value', 'cateringItems-1');
      await page.locator('[data-add-catalogue-entry="cateringPackages"]').click();
      await page.locator('#manager-catalogue-package-cateringPackages-1-name').fill('Contoso Coffee Break');
      await page.locator('#manager-catalogue-package-cateringPackages-1-amount').fill('9.00');
      const choices = page.locator('#manager-catalogue-package-cateringPackages-1-items');
      await expect(choices.getByRole('option', { name: 'Contoso Coffee', exact: true }))
        .toHaveAttribute('value', 'cateringItems-1');
      await choices.selectOption('cateringItems-1');
      await save.click();
      await expect.poll(() => page.evaluate(() => window.managerCateringDraft.revision)).toBe(3);
      await expect(save).toBeEnabled();
      expect(await page.evaluate(() => window.managerCateringDraft.writes.map((write) => write.expectedRevision))).toEqual([1, 2]);
      expect(await page.evaluate(() => window.managerCateringDraft.catalogue.cateringPackages
        .find((entry) => entry.id === 'cateringPackages-1').itemIds)).toEqual(['cateringItems-1']);
      expect(await page.evaluate(() => window.managerCateringDraft.images.length)).toBe(0);
      if (selectedFile) {
        expect(await file.evaluate((control) => control.files.length)).toBe(1);
        expect(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
        await file.setInputFiles([]);
      }
      expect(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(false);
    });
  }
}
