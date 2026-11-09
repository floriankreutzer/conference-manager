import { attachCustomerScreenEvidence } from './fixtures/customer-screen-evidence.js';
import { expect, test } from '@playwright/test';

const PLAN = 'c6000000-0000-4000-8000-000000000091';
const PHOTO = 'c6000000-0000-4000-8000-000000000092';
const OTHER = 'c6000000-0000-4000-8000-000000000093';
const UPLOADED = 'c6000000-0000-4000-8000-000000000094';
const MEDIA_ROOT = '/api/v1/tenant/catalogue-media';
const PHOTO_PATH = `/api/v1/tenant/rooms/room-a/media/${PHOTO}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8l8AAAAASUVORK5CYII=', 'base64');

function initialSnapshot() {
  const room = { id: 'room-a', siteId: 'site-a', name: 'Workshop Loft', description: 'Existing description',
    capacity: 20, active: true, floor: '2', equipment: [], accessibility: ['step-free'],
    serviceIds: [], cateringPackageIds: [], floorplanAssetId: PLAN, mediaAssetIds: [PHOTO, 'legacy-photo'],
    guestPublicValues: { floorNumber: 2, accessibilityFeatures: ['lift'] } };
  return { schemaVersion: 3, revision: 7, providerContext: [{ roomId: 'room-a', provider: 'microsoft365',
    status: 'active', displayName: 'Provider room', capacity: 20, lastSeenAt: '2026-11-09T12:00:00.000Z' }],
  configuration: { sites: [{ id: 'site-a', name: 'Berlin', active: true, timeZone: 'Europe/Berlin',
    address: null, guestInformation: null, guestPublicValues: null }],
  rooms: [room, { ...room, id: 'room-b', name: 'Unchanged room', active: false,
    floorplanAssetId: 'legacy-plan', mediaAssetIds: ['unknown-photo'] }] } };
}

async function fixture(page, { language = 'en', metadataStatus = 200, foreign = false, denyPhoto = false,
  demoRuntime = false, withUpload = false } = {}) {
  const origin = new URL(test.info().project.use.baseURL).origin;
  const calls = [], errors = [], external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const root = demoRuntime ? '/api/v1/demo/media' : MEDIA_ROOT;
  const metadata = [{ id: PLAN, ownerKind: 'room_plan', ownerId: 'room-a', contentType: 'image/png',
    altText: '<img src=x onerror=alert(1)>', url: foreign ? 'https://foreign.invalid/private.png' : `${root}/${PLAN}` },
  { id: OTHER, ownerKind: 'room_plan', ownerId: 'room-other', contentType: 'image/png',
    altText: 'Other room plan', url: `${root}/${OTHER}` }];
  await page.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { external.push(request.url()); await route.abort(); return; }
    if (url.pathname === '/manager-room-media-fixture') {
      await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${language}"><head>
        <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <meta name="conference-runtime" content="${demoRuntime ? 'demo' : 'production'}">
        <link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/styles.css">
        <link rel="stylesheet" href="/assets/app-layout.css"><link rel="stylesheet" href="/assets/employee-ux.css">
        <link rel="stylesheet" href="/assets/manager-layout.css"></head><body>
        <div class="content-shell"><h1 id="viewTitle" tabindex="-1"></h1><main id="app" class="manager-surface"></main></div>
        <div id="toast" role="status"></div></body></html>` });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      calls.push({ path: url.pathname, method: request.method() });
      if (url.pathname === root) {
        await route.fulfill({ status: metadataStatus, contentType: 'application/json',
          body: JSON.stringify(metadataStatus === 200 ? { assets: metadata, requestId: PLAN }
            : { error: { code: metadataStatus === 401 ? 'SESSION_REVOKED' : 'MEDIA_UNAVAILABLE' } }) });
      } else if (url.pathname === `${root}/${PLAN}` || (url.pathname === PHOTO_PATH && !denyPhoto)
        || url.pathname === `/api/v1/tenant/rooms/room-a/media/${UPLOADED}`) {
        await route.fulfill({ contentType: 'image/png', body: PNG });
      } else {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'AUTHORIZATION_DENIED' } }) });
      }
      return;
    }
    await route.continue();
  });
  const snapshot = initialSnapshot();
  await page.goto('/manager-room-media-fixture');
  await page.evaluate(async ({ snapshot, language, withUpload, uploaded }) => {
    const { createManagerBusinessSettingsApplication } = await import('/src/manager/business-settings-application.js');
    const { createCatalogueMediaApi } = await import('/src/core/catalogue-media-api.js');
    const { createApiClient } = await import('/src/core/api-client.js');
    const { setLanguage } = await import('/src/core/i18n.js');
    setLanguage(language);
    const api = createApiClient();
    const media = createCatalogueMediaApi({ apiClient: api });
    const evidence = { saves: [], uploads: [], holdSave: false, authorityFailures: [], current: structuredClone(snapshot) };
    window.__roomMediaEvidence = evidence;
    const catalogue = { services: [], equipment: [], cateringPackages: [], cateringItems: [], roomPrices: [] };
    const app = createManagerBusinessSettingsApplication({ appRoot: document.getElementById('app'),
      setPageHeading(title) { document.getElementById('viewTitle').textContent = title; },
      onAuthorityFailure(error) { evidence.authorityFailures.push(error.code); document.getElementById('app').replaceChildren(); },
      locations: {
        async loadLocations() { return structuredClone(evidence.current); },
        async listLocationsHistory() { return []; },
        async saveLocations(value) {
          evidence.saves.push(structuredClone(value));
          if (evidence.holdSave) await new Promise((resolve) => { evidence.releaseSave = resolve; });
          evidence.current = { ...evidence.current, revision: evidence.current.revision + 1, configuration: structuredClone(value.configuration) };
          return structuredClone(evidence.current);
        },
        ...(withUpload ? { async uploadRoomMedia(roomId, file) {
          evidence.uploads.push({ roomId, name: file.name });
          return uploaded;
        } } : {}),
      },
      catalogue: {
        async loadCatalogue() { return { schemaVersion: 1, revision: 3, catalogue }; },
        async listCatalogueHistory() { return { revisions: [] }; },
        async saveCatalogue() { throw new Error('UNEXPECTED_CATALOGUE_WRITE'); },
        async listCatalogueMedia() { return { assets: await media.list() }; },
        async listDemoMedia() { return api.request('v1/demo/media'); },
      },
    });
    await app.renderManagerSettings();
  }, { snapshot, language, withUpload, uploaded: UPLOADED });
  return { snapshot, calls, errors, external, origin };
}

for (const language of ['de', 'en']) {
  test(`CO-306 named room media previews and full snapshot save retain unknown refs in ${language}`, async ({ page }, testInfo) => {
    const f = await fixture(page, { language });
    const room = page.locator('[data-manager-room-id="room-a"]');
    const floorplan = room.locator('#manager-room-floorplan-0');
    const photos = room.locator('#manager-room-media-0');
    await expect(floorplan).toHaveValue(PLAN);
    await expect(photos).toHaveValues([PHOTO, 'legacy-photo']);
    await expect(floorplan.locator('option')).toHaveCount(4);
    await expect(photos.locator('option')).toHaveCount(2);
    const names = await floorplan.locator('option').allTextContents();
    expect(names.join(' ')).not.toMatch(/c6000000|legacy-photo|room-other/);
    expect(names.join(' ')).toContain(language === 'de' ? 'Vorschau nicht verfügbar' : 'preview unavailable');
    await expect(page.getByRole('heading', { name: language === 'de' ? 'Grundriss und Raumbilder' : 'Floor plan and room images' }).first()).toBeVisible();
    const preview = room.locator('[data-manager-room-media-previews]');
    const planImage = preview.getByRole('img', { name: '<img src=x onerror=alert(1)>' });
    await planImage.scrollIntoViewIfNeeded();
    await expect(planImage).toHaveAttribute('src', `${MEDIA_ROOT}/${PLAN}`);
    await expect.poll(() => planImage.evaluate((image) => image.naturalWidth)).toBe(1);
    const photoImage = preview.locator(`img[src="${PHOTO_PATH}"]`);
    await expect.poll(() => photoImage.evaluate((image) => image.naturalWidth)).toBe(1);
    await expect(preview.locator('img')).toHaveCount(2);
    await expect(preview.getByRole('status').filter({ hasText: language === 'de' ? 'nicht verfügbar' : 'unavailable' })).toHaveCount(1);
    await expect(room.locator('script, img[src="x"]')).toHaveCount(0);
    await attachCustomerScreenEvidence(page, testInfo, { screen: '17', state: 'own-room-named-media-and-previews', roles: ['conference_manager'], composition: 'isolated-component-routed-media-fixture' });
    await floorplan.focus();
    await expect(floorplan).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(photos).toBeFocused();
    expect(await photos.evaluate((control) => getComputedStyle(control).outlineStyle)).not.toBe('none');
    await room.locator('#manager-room-media-0-search').fill('no match');
    await expect(photos).toHaveValues([PHOTO, 'legacy-photo']);
    await expect(photos.locator('option')).toHaveCount(2);
    for (const width of [390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await photos.selectOption(['legacy-photo']);
    await expect(preview.locator(`img[src="${PHOTO_PATH}"]`)).toHaveCount(0);
    await page.locator('#manager-rooms-search').fill('Workshop');
    await expect(page.locator('[data-manager-room-id="room-b"]')).toBeHidden();
    await page.getByRole('button', { name: language === 'de' ? 'Speichern' : 'Save', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__roomMediaEvidence.saves.length)).toBe(1);
    const saved = await page.evaluate(() => window.__roomMediaEvidence.saves[0]);
    expect(saved).toEqual({ schemaVersion: 3, expectedRevision: 7, configuration: {
      sites: f.snapshot.configuration.sites,
      rooms: [{ ...f.snapshot.configuration.rooms[0], mediaAssetIds: ['legacy-photo'] }, f.snapshot.configuration.rooms[1]],
    } });
    expect(saved).not.toHaveProperty('tenantId');
    expect(f.calls.every(({ method }) => method === 'GET')).toBe(true);
    expect(f.calls.some(({ path }) => path.includes('/demo/') || path.includes(OTHER) || path.includes('legacy'))).toBe(false);
    expect(f.errors).toEqual([]);
    expect(f.external).toEqual([]);
  });

  test(`CO-306 unavailable metadata and denied previews preserve selections without automatic retry in ${language}`, async ({ page }) => {
    const f = await fixture(page, { language, metadataStatus: 503, denyPhoto: true });
    const room = page.locator('[data-manager-room-id="room-a"]');
    const preview = room.locator('[data-manager-room-media-previews]');
    await preview.scrollIntoViewIfNeeded();
    await expect(room.getByText(language === 'de'
      ? 'Die Bildinformationen konnten nicht geladen werden. Ihre gespeicherten Verknüpfungen bleiben erhalten.'
      : 'Image information could not be loaded. Your saved links have been preserved.')).toBeVisible();
    await expect(preview.getByRole('status').filter({ hasText: language === 'de' ? 'nicht verfügbar' : 'unavailable' })).toHaveCount(3);
    await expect(room.locator('#manager-room-media-0')).toHaveValues([PHOTO, 'legacy-photo']);
    const requests = [...f.calls];
    await room.locator('#manager-room-floorplan-0').selectOption('');
    await room.locator('#manager-room-media-0').selectOption(['legacy-photo']);
    await room.locator('#manager-room-media-0').selectOption([PHOTO, 'legacy-photo']);
    await room.locator('#manager-room-floorplan-0').selectOption(PLAN);
    await expect(preview.getByRole('status').filter({ hasText: language === 'de' ? 'nicht verfügbar' : 'unavailable' })).toHaveCount(3);
    expect(f.calls).toEqual(requests);
    expect(f.calls.filter(({ path }) => path === MEDIA_ROOT)).toHaveLength(1);
    expect(f.calls.some(({ path }) => path.includes('/demo/') || path.includes(OTHER))).toBe(false);
    expect(f.errors).toEqual([]);
    expect(f.external).toEqual([]);
  });

  test(`CO-306 photo upload rebases only its attachment and preserves pending removals in ${language}`, async ({ page }) => {
    const f = await fixture(page, { language, withUpload: true });
    const room = page.locator('[data-manager-room-id="room-a"]');
    const name = room.locator('#manager-room-name-0');
    const price = room.locator('#manager-room-price-amount-0');
    const floorplan = room.locator('#manager-room-floorplan-0');
    const photos = room.locator('#manager-room-media-0');
    const picker = room.locator('#manager-room-media-upload-0');
    await name.fill('Unsubmitted room name');
    await price.fill('17.50');
    await floorplan.selectOption('');
    await photos.selectOption(['legacy-photo']);
    await picker.setInputFiles({ name: 'uploaded.png', mimeType: 'image/png', buffer: PNG });
    await page.evaluate(() => { window.__roomMediaEvidence.holdSave = true; });
    await room.getByRole('button', { name: language === 'de' ? 'Bild hochladen' : 'Upload image', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__roomMediaEvidence.saves.length)).toBe(1);
    await expect(name).toBeDisabled();
    await expect(photos).toBeDisabled();
    expect(await page.evaluate(() => window.__roomMediaEvidence.uploads)).toEqual([{ roomId: 'room-a', name: 'uploaded.png' }]);
    expect(await page.evaluate(() => window.__roomMediaEvidence.saves[0])).toEqual({
      schemaVersion: 3, expectedRevision: 7, configuration: {
        sites: f.snapshot.configuration.sites,
        rooms: [{ ...f.snapshot.configuration.rooms[0], mediaAssetIds: [PHOTO, 'legacy-photo', UPLOADED] },
          f.snapshot.configuration.rooms[1]],
      },
    });
    await page.evaluate(() => {
      window.__roomMediaEvidence.holdSave = false;
      window.__roomMediaEvidence.releaseSave();
    });
    await expect(name).toBeEnabled();
    await expect(name).toHaveValue('Unsubmitted room name');
    await expect(price).toHaveValue('17.50');
    await expect(floorplan).toHaveValue('');
    await expect(photos).toHaveValues(['legacy-photo', UPLOADED]);
    expect(await picker.evaluate((control) => control.files.length)).toBe(0);
    await expect(room.locator(`[data-manager-room-media-previews] img[src="/api/v1/tenant/rooms/room-a/media/${UPLOADED}"]`)).toHaveCount(1);

    // Undo the other drafts to isolate the saved attachment baseline. The
    // earlier photo removal must still be dirty after this successful upload.
    await name.fill(f.snapshot.configuration.rooms[0].name);
    await price.fill('');
    await floorplan.selectOption(PLAN);
    expect(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
    await photos.selectOption([PHOTO, 'legacy-photo', UPLOADED]);
    expect(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(false);
    await photos.selectOption(['legacy-photo', UPLOADED]);
    await page.getByRole('button', { name: language === 'de' ? 'Speichern' : 'Save', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__roomMediaEvidence.saves.length)).toBe(2);
    expect(await page.evaluate(() => window.__roomMediaEvidence.saves[1])).toEqual({
      schemaVersion: 3, expectedRevision: 8, configuration: {
        sites: f.snapshot.configuration.sites,
        rooms: [{ ...f.snapshot.configuration.rooms[0], mediaAssetIds: ['legacy-photo', UPLOADED] },
          f.snapshot.configuration.rooms[1]],
      },
    });
    await expect(photos).toHaveValues(['legacy-photo', UPLOADED]);
    expect(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(false);
    expect(f.errors).toEqual([]);
    expect(f.external).toEqual([]);
  });
}

test('CO-306 invalid catalogue URLs cannot become bytes requests; metadata authority failures leave the editor', async ({ page }) => {
  const f = await fixture(page, { foreign: true });
  await expect(page.locator('[data-manager-room-id="room-a"]')).toBeVisible();
  expect(f.calls.some(({ path }) => path === `${MEDIA_ROOT}/${PLAN}`)).toBe(false);
  expect(f.external).toEqual([]);
  expect(f.errors).toEqual([]);
  await page.unrouteAll({ behavior: 'wait' });
  const expired = await fixture(page, { metadataStatus: 401 });
  expect(await page.evaluate(() => window.__roomMediaEvidence.authorityFailures)).toEqual(['HTTP_401']);
  await expect(page.locator('[data-manager-room-id]')).toHaveCount(0);
  expect(expired.calls).toEqual([{ path: MEDIA_ROOT, method: 'GET' }]);
  expect(expired.external).toEqual([]);
  expect(expired.errors).toEqual([]);
});

test('CO-306 explicit Demo Room plan uses only exact owner-bound metadata', async ({ page }) => {
  const f = await fixture(page, { demoRuntime: true });
  const preview = page.locator('[data-manager-room-id="room-a"] [data-manager-room-media-previews]');
  await preview.scrollIntoViewIfNeeded();
  await expect(preview.getByRole('img', { name: '<img src=x onerror=alert(1)>' }))
    .toHaveAttribute('src', `/api/v1/demo/media/${PLAN}`);
  expect(f.calls.some(({ path }) => path.startsWith(MEDIA_ROOT) || path.includes(OTHER))).toBe(false);
  expect(f.external).toEqual([]);
  expect(f.errors).toEqual([]);
});

test('CO-306 confirmed uploads update only media controls and preserve draft selection and focus', async ({ page }) => {
  const f = await fixture(page);
  const result = await page.evaluate(async ({ room, assetId }) => {
    const { createRoomMediaEditor } = await import('/src/manager/room-media-editor.js');
    const editor = createRoomMediaEditor({ room, index: 10, catalogueMedia: [] });
    const root = document.getElementById('app');
    root.replaceChildren(editor.node);
    const search = editor.node.querySelector('input[type="search"]');
    search.value = 'a draft search';
    search.focus();
    // Keep one unsaved removal and an opaque saved reference while uploading.
    editor.controls.mediaAssetIds.options[0].selected = false;
    editor.addUploadedAsset({ kind: 'media', assetId });
    const value = editor.readValue();
    return { value, searchRetained: search.value, focused: document.activeElement === search,
      choices: Array.from(editor.controls.mediaAssetIds.options, ({ value }) => value) };
  }, { room: f.snapshot.configuration.rooms[0], assetId: UPLOADED });
  expect(result).toEqual({ value: { floorplanAssetId: PLAN, mediaAssetIds: ['legacy-photo', UPLOADED] },
    searchRetained: 'a draft search', focused: true, choices: [PHOTO, 'legacy-photo', UPLOADED] });
  await expect(page.locator('#manager-room-media-10')).toHaveValues(['legacy-photo', UPLOADED]);
  await expect(page.locator('.named-selection-values li')).toHaveCount(2);
  expect(f.external).toEqual([]);
  expect(f.errors).toEqual([]);
});

test('CO-306 one attachment in both slots retains the protected floorplan preview and both saved values', async ({ page }) => {
  const f = await fixture(page);
  const value = await page.evaluate(async ({ room, plan }) => {
    const { createRoomMediaEditor } = await import('/src/manager/room-media-editor.js');
    const editor = createRoomMediaEditor({ room: { ...room, mediaAssetIds: [plan] }, index: 10,
      catalogueMedia: [{ id: plan, ownerKind: 'room_plan', ownerId: room.id, contentType: 'image/png',
        altText: 'Current floor plan', url: `/api/v1/tenant/catalogue-media/${plan}` }] });
    document.getElementById('app').replaceChildren(editor.node);
    return editor.readValue();
  }, { room: f.snapshot.configuration.rooms[0], plan: PLAN });
  await expect(page.locator('[data-manager-room-media-previews] img')).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'Current floor plan' })).toHaveAttribute('src', `${MEDIA_ROOT}/${PLAN}`);
  expect(value).toEqual({ floorplanAssetId: PLAN, mediaAssetIds: [PLAN] });
  expect(f.calls.some(({ path }) => path === `/api/v1/tenant/rooms/room-a/media/${PLAN}`)).toBe(false);
  expect(f.errors).toEqual([]);
});
