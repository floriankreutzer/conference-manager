import { expect, test } from '@playwright/test';

async function mountLocations(page, { setup = 'normal', behavior = 'normal' } = {}) {
  await page.goto('/');
  await page.evaluate(async ({ requestedSetup, requestedBehavior }) => {
    document.getElementById('tenant-location-settings-fixture')?.remove();
    const root = document.createElement('main');
    root.id = 'tenant-location-settings-fixture';
    document.body.appendChild(root);

    const sectionModule = await import('/src/tenant-admin/sections/locations/index.js');
    const adapterModule = await import('/src/tenant-admin/sections/locations/demo-adapter.js');
    const rawAdapter = adapterModule.createDemoLocationSettings();
    const initial = await rawAdapter.loadLocations();
    if (requestedSetup === 'editable' || requestedSetup === 'history') {
      const munich = {
        id: 'munich', name: 'Munich', active: true, timeZone: 'Europe/Berlin', address: null,
      };
      const configuration = {
        sites: [...initial.configuration.sites, munich],
        rooms: requestedSetup === 'history'
          ? [
            {
              ...initial.configuration.rooms[0], capacity: 18,
              floorplanAssetId: 'atlas-current-plan', mediaAssetIds: ['atlas-current-photo'],
            },
            {
              ...initial.configuration.rooms[0], id: 'room-orion', siteId: 'munich', name: 'Orion',
              floorplanAssetId: null, mediaAssetIds: [],
            },
          ]
          : initial.configuration.rooms,
      };
      await rawAdapter.saveLocations({ expectedRevision: initial.revision, configuration });
    }

    const trackedStart = await rawAdapter.loadLocations();
    const calls = [];
    let rollbackConflictPending = requestedBehavior === 'rollback-conflict';
    const adapter = {};
    for (const method of ['loadLocations', 'saveLocations', 'listLocationsHistory', 'loadLocationRevision', 'rollbackLocations']) {
      adapter[method] = async (...args) => {
        calls.push({ method, args: structuredClone(args) });
        if (method === 'rollbackLocations' && rollbackConflictPending) {
          rollbackConflictPending = false;
          const current = await rawAdapter.loadLocations();
          await rawAdapter.saveLocations({
            expectedRevision: current.revision,
            configuration: current.configuration,
          });
          throw Object.assign(new Error('TENANT_SETTINGS_REVISION_CONFLICT'), {
            code: 'HTTP_409',
            serverCode: 'TENANT_SETTINGS_REVISION_CONFLICT',
            currentRevision: current.revision + 1,
          });
        }
        return rawAdapter[method](...args);
      };
    }

    const section = sectionModule.createLocationsSection({ adapter });
    const render = () => section.render({ root, isCurrent: () => true, rerender: render });
    globalThis.__tenantLocationSettingsFixture = {
      adapter, calls, initialConfiguration: structuredClone(trackedStart.configuration), rawAdapter, render,
    };
    await render();
  }, { requestedSetup: setup, requestedBehavior: behavior });
}

async function callsFor(page, method) {
  return page.evaluate((requestedMethod) => {
    return globalThis.__tenantLocationSettingsFixture.calls
      .filter((entry) => entry.method === requestedMethod);
  }, method);
}

test('Room Site and managed asset edits preserve the exact remaining mutable configuration', async ({ page }) => {
  await mountLocations(page, { setup: 'editable' });
  const room = page.locator('[data-tenant-room-id="room-atlas"]');
  await expect(room.locator('dl')).toBeVisible();
  await expect(room.locator('dl input, dl select, dl button')).toHaveCount(0);

  await page.locator('#tenant-room-site-0').selectOption('munich');
  await page.locator('#tenant-room-floorplan-asset-0').fill('atlas-floorplan-v2');
  await page.locator('#tenant-room-media-assets-0').fill('atlas-front, atlas-rear');
  await page.locator('[data-tenant-settings-form="locations"] button[type="submit"]').click();
  await expect(page.locator('#tenant-location-settings-fixture h2')).toBeFocused();
  await expect(page.locator('#tenant-room-site-0')).toHaveValue('munich');
  await expect(page.locator('#tenant-room-floorplan-asset-0')).toHaveValue('atlas-floorplan-v2');
  await expect(page.locator('#tenant-room-media-assets-0')).toHaveValue('atlas-front, atlas-rear');

  const evidence = await page.evaluate(() => {
    const fixture = globalThis.__tenantLocationSettingsFixture;
    const write = fixture.calls.find((entry) => entry.method === 'saveLocations');
    return { initialConfiguration: fixture.initialConfiguration, payload: write.args[0] };
  });
  const expectedConfiguration = structuredClone(evidence.initialConfiguration);
  expectedConfiguration.rooms[0] = {
    ...expectedConfiguration.rooms[0],
    siteId: 'munich',
    floorplanAssetId: 'atlas-floorplan-v2',
    mediaAssetIds: ['atlas-front', 'atlas-rear'],
  };
  expect(evidence.payload).toEqual({ expectedRevision: 2, configuration: expectedConfiguration });
  expect(Object.keys(evidence.payload.configuration).sort()).toEqual(['rooms', 'sites']);
  expect(Object.hasOwn(evidence.payload.configuration, 'providerContext')).toBe(false);
});

test('managed asset controls reject URLs, duplicates, and more than 20 references before transport', async ({ page }) => {
  await mountLocations(page);
  const floorplan = page.locator('#tenant-room-floorplan-asset-0');
  const media = page.locator('#tenant-room-media-assets-0');
  await expect(floorplan).toHaveAttribute('maxlength', '128');
  await expect(floorplan).toHaveAttribute('pattern', /A-Za-z0-9/);
  await expect(media).toHaveAttribute('maxlength', '2598');

  await floorplan.fill('https://attacker.invalid/plan');
  await page.locator('[data-tenant-settings-form="locations"] button[type="submit"]').click();
  await expect(floorplan).toBeFocused();
  expect(await callsFor(page, 'saveLocations')).toHaveLength(0);

  await floorplan.fill('atlas-plan');
  await media.fill(Array.from({ length: 21 }, (_entry, index) => `asset-${index + 1}`).join(', '));
  await page.locator('[data-tenant-settings-form="locations"] button[type="submit"]').click();
  await expect(media).toBeFocused();
  await expect(media).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#tenant-location-settings-fixture .validation-summary')).toBeVisible();
  expect(await callsFor(page, 'saveLocations')).toHaveLength(0);

  await media.fill('asset-one, asset-one');
  await page.locator('[data-tenant-settings-form="locations"] button[type="submit"]').click();
  await expect(media).toBeFocused();
  expect(await callsFor(page, 'saveLocations')).toHaveLength(0);

  await media.fill('');
  await page.locator('#tenant-site-active-0').uncheck();
  await page.locator('[data-tenant-settings-form="locations"] button[type="submit"]').click();
  await expect(page.locator('#tenant-room-site-0')).toBeFocused();
  await expect(page.locator('#tenant-room-site-0')).toHaveAttribute('aria-invalid', 'true');
  expect(await callsFor(page, 'saveLocations')).toHaveLength(0);

  await page.locator('#tenant-site-active-0').check();
  await page.locator('[data-tenant-settings-form="locations"] button[type="submit"]').click();
  await expect(page.locator('#tenant-location-settings-fixture h2')).toBeFocused();
  expect(await callsFor(page, 'saveLocations')).toHaveLength(1);
});

test('managed asset controls preserve the legal 128-character and 20-reference boundaries', async ({ page }) => {
  await mountLocations(page);
  const floorplanAssetId = 'f'.repeat(128);
  const mediaAssetIds = Array.from({ length: 20 }, (_entry, index) => {
    return `asset-${index + 1}`.padEnd(128, 'x');
  });
  await page.locator('#tenant-room-floorplan-asset-0').fill(floorplanAssetId);
  await page.locator('#tenant-room-media-assets-0').fill(mediaAssetIds.join(', '));
  await page.locator('[data-tenant-settings-form="locations"] button[type="submit"]').click();
  await expect(page.locator('#tenant-location-settings-fixture h2')).toBeFocused();

  const writes = await callsFor(page, 'saveLocations');
  expect(writes).toHaveLength(1);
  expect(writes[0].args[0].configuration.rooms[0].floorplanAssetId).toBe(floorplanAssetId);
  expect(writes[0].args[0].configuration.rooms[0].mediaAssetIds).toEqual(mediaAssetIds);
});

test('rollback loads a diff and sends expected/source revisions only after explicit confirmation', async ({ page }) => {
  await mountLocations(page, { setup: 'history' });
  const restore = page.locator('button[data-source-revision="1"]');
  await restore.click();

  const preview = page.locator('[data-tenant-location-rollback-preview="true"]');
  await expect(preview).toBeVisible();
  expect(await callsFor(page, 'loadLocationRevision')).toEqual([{ method: 'loadLocationRevision', args: [1] }]);
  expect(await callsFor(page, 'rollbackLocations')).toHaveLength(0);
  await expect(page.locator('[data-tenant-location-rollback-changed-sites="1"]')).toBeVisible();
  await expect(page.locator('[data-tenant-location-rollback-changed-rooms="2"]')).toBeVisible();
  await expect(page.locator('[data-tenant-location-rollback-retained-sites="1"]')).toBeVisible();
  await expect(page.locator('[data-tenant-location-rollback-retained-rooms="1"]')).toBeVisible();
  await expect(page.locator('[data-tenant-location-rollback-consequence="true"]')).toBeVisible();

  const confirm = page.locator('[data-tenant-location-rollback-confirm="true"]');
  await expect(confirm).toHaveAttribute('data-expected-revision', '2');
  await expect(confirm).toHaveAttribute('data-source-revision', '1');
  await page.locator('dialog').getByRole('button', { name: /Abbrechen|Cancel/ }).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(restore).toBeFocused();
  expect(await callsFor(page, 'rollbackLocations')).toHaveLength(0);

  await restore.click();
  await page.locator('[data-tenant-location-rollback-confirm="true"]').click();
  await expect(page.locator('#tenant-location-settings-fixture h2')).toBeFocused();
  expect(await callsFor(page, 'rollbackLocations')).toEqual([{
    method: 'rollbackLocations', args: [{ expectedRevision: 2, sourceRevision: 1 }],
  }]);
  const resulting = await page.evaluate(async () => {
    return globalThis.__tenantLocationSettingsFixture.rawAdapter.loadLocations();
  });
  expect(resulting.revision).toBe(3);
  expect(resulting.configuration.sites.find(({ id }) => id === 'munich').active).toBe(false);
  expect(resulting.configuration.rooms.find(({ id }) => id === 'room-orion').active).toBe(false);
});

test('rollback revision conflicts render a focused recovery surface without a false success', async ({ page }) => {
  await mountLocations(page, { setup: 'history', behavior: 'rollback-conflict' });
  await page.locator('button[data-source-revision="1"]').click();
  await page.locator('[data-tenant-location-rollback-confirm="true"]').click();

  await expect(page.locator('#tenant-location-settings-fixture [role="alert"]')).toBeVisible();
  await expect(page.locator('#tenant-location-settings-fixture h2')).toBeFocused();
  await expect(page.locator('[data-tenant-settings-conflict-reload="true"]')).toBeVisible();
  expect(await callsFor(page, 'rollbackLocations')).toEqual([{
    method: 'rollbackLocations', args: [{ expectedRevision: 2, sourceRevision: 1 }],
  }]);

  await page.locator('[data-tenant-settings-conflict-reload="true"]').click();
  await expect(page.locator('[data-tenant-settings-form="locations"]')).toBeVisible();
  const current = await page.evaluate(async () => {
    return globalThis.__tenantLocationSettingsFixture.rawAdapter.loadLocations();
  });
  expect(current.revision).toBe(3);
});
