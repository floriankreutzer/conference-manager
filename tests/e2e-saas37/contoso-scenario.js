import { expect } from '@playwright/test';
import {
  ORIGINS, CONTOSO, PNG, LOCATIONS_PATH, CATALOGUE_PATH, selectContext,
  locations, catalogue, requests, uiResponse, mediaHash,
} from './scenario-support.js';

const STUDIO = 'contoso-paris-room-2';
export async function verifyContosoBaseline(page) {
  await selectContext(page, CONTOSO, 'conference_manager');
  await page.locator('[data-view="manager"]').click();
  await expect(page.locator('[data-demo-manager-task]')).toHaveCount(7);
  const worklist = page.locator('[data-demo-manager-tasks]');
  await expect(worklist.getByRole('heading', { name: 'Anfragen', exact: true })).toBeVisible();
  await expect(worklist.getByRole('heading', { name: 'Einrichtung & Katalog', exact: true })).toBeVisible();
  await expect(worklist.getByRole('button', { name: /^.+ öffnen$/ })).toHaveCount(7);
  const snapshot = await locations(page.context());
  const studio = snapshot.configuration.rooms.find(({ id }) => id === STUDIO);
  expect(studio.description).toBeNull();
  expect(studio.mediaAssetIds).toEqual([]);
  const catalog = (await catalogue(page.context())).catalogue;
  expect(catalog.roomPrices.some(({ roomId }) => roomId === STUDIO)).toBe(false);
  expect(catalog.cateringPackages).toHaveLength(0);
  const pending = await requests(page.context());
  expect(pending).toHaveLength(3);
  expect(pending.every(({ status }) => status === 'In Review')).toBe(true);
  const atelier = snapshot.configuration.rooms.find(({ id }) => id === 'contoso-paris-room-1');
  const originalMediaUrl = `${ORIGINS.customer}/api/v1/tenant/rooms/${atelier.id}/media/${atelier.mediaAssetIds[0]}`;
  const originalHash = await mediaHash(page.context(), originalMediaUrl);
  return { pending, originalMediaUrl, originalHash };
}

export async function completeContosoTasks(page, cycle, baseline) {
  await page.getByRole('tab', { name: 'Anfragen & Buchungen', exact: true }).click();
  const actions = ['Bestätigen', 'Ablehnen', 'Anfrage stornieren'];
  const statuses = ['Bestätigt', 'Abgelehnt', 'Storniert'];
  for (let index = 0; index < baseline.pending.length; index += 1) {
    const request = baseline.pending[index];
    const card = page.locator(`[data-production-request-id="${request.id}"]`);
    await card.getByRole('button', { name: actions[index], exact: true }).click();
    const dialog = page.getByRole('dialog');
    if (index === 1) await dialog.getByLabel('Begründung').fill('Synthetic scenario rejection with retained history');
    await uiResponse(page, 'POST', `/api/v1/requests/${request.id}/transitions`,
      () => dialog.getByRole('button', { name: actions[index], exact: true }).click());
    await expect(dialog).not.toBeVisible();
    await expect(card).toContainText(statuses[index]);
    await expect(page.locator('[data-demo-manager-task]')).toHaveCount(6 - index);
    await expect(page.locator(`[data-demo-manager-task="request:${request.id}"]`)).toHaveCount(0);
  }
  await expect(page.locator('[data-demo-manager-task]')).toHaveCount(4);
  await page.locator('[data-demo-manager-task="room:description"] button').click();
  const studio = page.locator(`[data-manager-room-id="${STUDIO}"]`);
  await studio.locator('textarea[id^="manager-room-description-"]').fill(`Completed Studio description cycle ${cycle}`);
  const roomsForm = studio.locator('xpath=..');
  await expect(roomsForm.locator(':invalid')).toHaveCount(0);
  await uiResponse(page, 'PUT', LOCATIONS_PATH, async () => {
    await roomsForm.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.locator('#toast')).toHaveText('Business-Einstellungen wurden gespeichert.');
  });
  await expect(roomsForm.getByRole('button', { name: 'Speichern', exact: true })).toBeEnabled();
  await expect(page.locator('[data-demo-manager-task]')).toHaveCount(3);
  await expect(page.locator('[data-demo-manager-task="room:description"]')).toHaveCount(0);
  await studio.locator('input[type="file"][id^="manager-room-media-upload-"]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: PNG });
  await uiResponse(page, 'PUT', LOCATIONS_PATH,
    () => studio.getByRole('button', { name: 'Bild hochladen', exact: true }).click());
  await expect(roomsForm.getByRole('button', { name: 'Speichern', exact: true })).toBeEnabled();
  await expect(studio.locator('input[type="file"][id^="manager-room-media-upload-"]')).toHaveValue('');
  await expect(page.locator('[data-demo-manager-task]')).toHaveCount(2);
  await expect(page.locator('[data-demo-manager-task="room:image"]')).toHaveCount(0);
  const uploadedStudio = (await locations(page.context())).configuration.rooms.find(({ id }) => id === STUDIO);
  expect(uploadedStudio.mediaAssetIds).toHaveLength(1);
  expect(uploadedStudio.description).toBe(`Completed Studio description cycle ${cycle}`);
  const uploadedUrl = `${ORIGINS.customer}/api/v1/tenant/rooms/${STUDIO}/media/${uploadedStudio.mediaAssetIds[0]}`;
  await mediaHash(page.context(), uploadedUrl);
  await studio.locator('input[id^="manager-room-price-amount-"]').fill('35.00');
  await uiResponse(page, 'PUT', CATALOGUE_PATH,
    () => studio.getByRole('button', { name: 'Raumpreis speichern', exact: true }).click());
  await page.getByRole('button', { name: 'Catering', exact: true }).click();
  await page.locator('[data-add-catalogue-entry="cateringItems"]').click();
  await page.locator('#manager-catalogue-cateringItems-cateringItems-1-name').fill('Contoso Coffee');
  await page.locator('#manager-catalogue-cateringItems-cateringItems-1-amount').fill('3.00');
  await page.locator('[data-add-catalogue-entry="cateringPackages"]').click();
  await page.locator('#manager-catalogue-package-cateringPackages-1-name').fill('Contoso Coffee Break');
  await page.locator('#manager-catalogue-package-cateringPackages-1-amount').fill('9.00');
  await page.locator('#manager-catalogue-package-cateringPackages-1-items').fill('cateringItems-1');
  await page.locator('[data-add-catalogue-variant="cateringPackages-1"]').click();
  const variant = page.locator('[data-catalogue-variant-id]');
  await variant.locator('input[id$="-name"]').fill('Standard');
  await variant.locator('input[id$="-amount"]').fill('9.00');
  const cateringForm = page.locator('form')
    .filter({ has: page.locator('[data-add-catalogue-entry="cateringPackages"]') });
  const saveCatering = cateringForm.getByRole('button', { name: 'Speichern', exact: true });
  await uiResponse(page, 'PUT', CATALOGUE_PATH, () => saveCatering.click());
  // The response arrives before the submit listener's authoritative reload.
  // Require the newly rendered enabled form before interacting with its media editors.
  await expect(saveCatering).toBeEnabled();
  const itemEditor = page.locator('[data-catalogue-entry-id="cateringItems-1"]');
  await itemEditor.locator('input[type="file"]').setInputFiles({
    name: 'contoso-coffee.png', mimeType: 'image/png', buffer: PNG,
  });
  await uiResponse(page, 'POST', '/api/v1/demo/media/catering-item/cateringItems-1',
    () => itemEditor.getByRole('button', { name: 'Catering-Bild hochladen', exact: true }).click());
  await expect(itemEditor.locator('img.room-asset-visual')).toBeVisible();
  const packageEditor = page.locator('[data-catalogue-entry-id="cateringPackages-1"]');
  await packageEditor.locator('input[type="file"]').setInputFiles({
    name: 'contoso-break.png', mimeType: 'image/png', buffer: PNG,
  });
  await uiResponse(page, 'POST', '/api/v1/demo/media/catering-package/cateringPackages-1',
    () => packageEditor.getByRole('button', { name: 'Catering-Bild hochladen', exact: true }).click());
  await expect(packageEditor.locator('img.room-asset-visual')).toBeVisible();
  await expect(page.locator('[data-demo-manager-tasks]')).toHaveCount(0);
  await page.reload();
  await page.locator('[data-view="manager"]').click();
  await expect(page.locator('[data-demo-manager-tasks]')).toHaveCount(0);
  const catalog = (await catalogue(page.context())).catalogue;
  expect(catalog.roomPrices.find(({ roomId }) => roomId === STUDIO).price.amountMinor).toBe(3500);
  expect(catalog.cateringPackages).toHaveLength(1);
  expect(catalog.cateringPackages[0].variants).toHaveLength(1);
  // Delete a seeded media association via its normal authorized editor. Reset
  // must restore it and the original bytes, not just remove the newly uploaded image.
  await page.getByRole('tab', { name: 'Administration', exact: true }).click();
  const atelier = page.locator('[data-manager-room-id="contoso-paris-room-1"]');
  await atelier.locator('input[id^="manager-room-media-"][type="text"]').fill('');
  await uiResponse(page, 'PUT', LOCATIONS_PATH,
    () => atelier.locator('xpath=..').getByRole('button', { name: 'Speichern', exact: true }).click());
  expect((await page.context().request.get(baseline.originalMediaUrl)).status()).toBe(404);
  return { uploadedUrl, originalMediaUrl: baseline.originalMediaUrl, originalHash: baseline.originalHash };
}
