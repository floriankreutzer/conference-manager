import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import {
  NORTHWIND, INTEGRATION_PATH, ORIGINS, catalogue, requests, locations,
  json, headers, customerSession,
  selectContext, uiResponse, businessDate, openAdmin, imagesLoaded, mediaHash,
} from './scenario-support.js';

const REPLACEMENT_CATERING_IMAGE = new URL(
  '../../demo-assets-saas-3.7/catering/afternoon-snack.webp', import.meta.url,
);

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function verifyNorthwindBaseline(page, {
  replaceCateringImage = true,
  expectedCateringImageHash = null,
} = {}) {
  await selectContext(page, NORTHWIND, 'conference_manager');
  const context = page.context();
  const configuration = await locations(context);
  const catalog = (await catalogue(context)).catalogue;
  const seeded = await requests(context);
  expect(configuration.configuration.rooms).toHaveLength(10);
  expect(new Set(configuration.configuration.rooms.map(({ id }) => id)).size).toBe(10);
  expect(catalog.equipment).toHaveLength(18);
  expect(catalog.roomPrices).toHaveLength(10);
  expect(catalog.cateringPackages).toHaveLength(4);
  expect(catalog.cateringItems).toHaveLength(8);
  expect(seeded).toHaveLength(20);
  expect(seeded.filter(({ status }) => status === 'Confirmed')).toHaveLength(16);
  expect(seeded.filter(({ status }) => status === 'In Review')).toHaveLength(4);
  expect(new Set(seeded.map(({ roomId }) => roomId)).size).toBe(10);
  for (const request of seeded) {
    expect(request.schemaVersion).toBe(3);
    expect(request.details.title.length).toBeGreaterThan(3);
    expect(request.details.equipmentIds.length).toBeGreaterThan(0);
    expect(request.pricing.equipment.length).toBe(request.details.equipmentIds.length);
    expect(request.allocations.entries).toHaveLength(1);
    expect(request.allocations.entries[0].costCenterId).toMatch(/^cc-/);
    expect(request.pricing.totalMinor).toBeGreaterThan(0);
    expect(request.details.catering.packageSelection.packageId).toBeTruthy();
  }
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Anfragen & Buchungen', exact: true }).click();
  for (const request of seeded) {
    await expect(page.locator(`[data-production-request-id="${request.id}"]`)).toContainText(request.details.title);
  }
  await page.getByRole('tab', { name: 'Administration', exact: true }).click();
  await page.getByRole('button', { name: 'Business-Einstellungen', exact: true }).click();
  await page.getByRole('button', { name: 'Katalog & Preise', exact: true }).click();
  const packageImage = page.locator('[data-catalogue-entry-id="coffee-break"] .room-asset-panel');
  await expect(packageImage).toBeVisible();
  await packageImage.locator('img').scrollIntoViewIfNeeded();
  await imagesLoaded(packageImage);
  const imageUrl = await packageImage.locator('img').getAttribute('src');
  const absoluteImageUrl = new URL(imageUrl, ORIGINS.customer).href;
  const originalImage = await page.context().request.get(absoluteImageUrl);
  expect(originalImage.status()).toBe(200);
  const originalHash = sha256(await originalImage.body());
  if (expectedCateringImageHash !== null) expect(originalHash).toBe(expectedCateringImageHash);
  if (replaceCateringImage) {
    const replacement = await readFile(REPLACEMENT_CATERING_IMAGE);
    const replacementHash = sha256(replacement);
    expect(replacementHash).not.toBe(originalHash);
    const unsavedName = page.locator('#manager-catalogue-package-coffee-break-name');
    await unsavedName.fill('Ungespeicherter Kaffeepausen-Entwurf');
    await packageImage.locator('input[type="file"]').setInputFiles({
      name: 'afternoon-snack.webp', mimeType: 'image/webp', buffer: replacement,
    });
    await uiResponse(page, 'PUT', new URL(imageUrl, ORIGINS.customer).pathname,
      () => packageImage.getByRole('button', { name: 'Catering-Bild ersetzen' }).click());
    await expect(unsavedName).toHaveValue('Ungespeicherter Kaffeepausen-Entwurf');
    await expect(packageImage).toBeVisible();
    await packageImage.locator('img').scrollIntoViewIfNeeded();
    await imagesLoaded(packageImage);
    expect(await mediaHash(page.context(), absoluteImageUrl)).toBe(replacementHash);
  }
  return {
    rooms: configuration.configuration.rooms,
    catalog,
    seeded,
    cateringImage: { url: absoluteImageUrl, originalHash },
  };
}

export async function northwindBooking(page, cycle, baseline) {
  await selectContext(page, NORTHWIND, 'employee');
  await page.locator('[data-view="employee"]').click();
  const title = `Northwind acceptance cycle ${cycle}`;
  const date = businessDate();
  await page.locator('#productionTitle').fill(title);
  await page.locator('#productionDate').fill(date);
  await page.locator('#productionEndDate').fill(date);
  await page.locator('#productionStart').fill('10:00');
  await page.locator('#productionEnd').fill('11:00');
  await page.locator('#productionInternal').fill('3');
  await page.locator('#productionExternal').fill('1');
  const next = page.getByRole('button', { name: 'Weiter', exact: true });
  await next.click();
  await expect(page.locator('article[data-room-id]')).toHaveCount(10);
  for (const room of baseline.rooms) {
    const card = page.locator(`article[data-room-id="${room.id}"]`);
    await expect(card).toContainText(room.name);
    await expect(card.locator('.price')).toBeVisible();
    const [badgeBox, cardBox] = await Promise.all([
      card.locator('.badge').boundingBox(), card.boundingBox(),
    ]);
    expect(badgeBox.width).toBeLessThan(cardBox.width * 0.85);
    await imagesLoaded(card);
    await card.locator('.room-preview-action').click();
    const preview = page.getByRole('dialog');
    await expect(preview).toContainText(room.name);
    await expect(preview).toContainText(room.description);
    await imagesLoaded(preview);
    await preview.getByRole('button', { name: 'Schließen', exact: true }).click();
    await expect(card.locator('.room-preview-action')).toBeFocused();
  }
  await page.locator('input[name="productionRoomChoice"][value="northwind-berlin-room-1"]').check();
  await uiResponse(page, 'POST', '/api/v1/application/room-availability',
    () => page.getByRole('button', { name: 'Raumverfügbarkeit prüfen', exact: true }).click());
  await expect(next).toBeEnabled();
  await next.click();
  await page.locator('input[type="checkbox"][value="display-86"]').check();
  await page.locator('input[type="checkbox"][value="video-system"]').check();
  await next.click();
  await expect(page.locator('.catering-package-grid input[type="radio"]')).toHaveCount(5);
  await expect(page.locator('.catering-item-grid input[type="number"]')).toHaveCount(8);
  await imagesLoaded(page.locator('.catering-package-grid'));
  await imagesLoaded(page.locator('.catering-item-grid'));
  // The explicit opt-out is not a product. Never filter real cards by image
  // presence: a missing image on any of the twelve products must still fail.
  const noPackage = page.locator('#productionCateringPackage-none');
  const noPackageCard = page.locator('.catering-variant-card').filter({ has: noPackage });
  await expect(noPackageCard).toHaveCount(1);
  await expect(noPackageCard.getByRole('radio', { name: 'Kein Catering-Paket', exact: true })).toBeVisible();
  await expect(noPackageCard.locator('img')).toHaveCount(0);
  const productCards = page.locator('.catering-variant-card, .catering-item-card')
    .filter({ hasNot: noPackage });
  await expect(productCards).toHaveCount(12);
  for (const card of await productCards.all()) {
    await imagesLoaded(card);
  }
  await page.getByRole('radio', { name: 'Kaffeepause · Standard', exact: true }).check();
  await page.locator('#productionCateringParticipants').fill('4');
  await page.getByLabel('Menge für Obstauswahl', { exact: true }).fill('4');
  await next.click();
  await page.getByRole('button', { name: 'Kostenstelle hinzufügen', exact: true }).click();
  const allocation = page.locator('#productionAllocationCenter-0');
  await expect(allocation.locator('option:not([value=""])')).toHaveCount(6);
  await allocation.selectOption('cc-1000');
  await page.locator('#productionAllocationPercent-0').fill('100');
  await next.click();
  await expect(page.getByRole('button', { name: 'Anfrage absenden', exact: true })).toBeEnabled();
  await uiResponse(page, 'POST', '/api/v1/application/requests',
    () => page.getByRole('button', { name: 'Anfrage absenden', exact: true }).click(), 201);
  const committedCard = page.locator('[data-production-request-id]').filter({ hasText: title });
  await expect(committedCard).toHaveCount(1);
  const committedId = await committedCard.getAttribute('data-production-request-id');
  const request = (await json(await page.context().request.get(
    `${ORIGINS.customer}/api/v1/requests/${committedId}`))).request;
  expect(request).toMatchObject({ schemaVersion: 3, roomId: 'northwind-berlin-room-1', details: {
    title, equipmentIds: ['display-86', 'video-system'],
    catering: { participantCount: 4, packageSelection: { packageId: 'coffee-break' } },
  }, allocations: { entries: [{ costCenterId: 'cc-1000' }] } });
  const card = page.locator(`[data-production-request-id="${request.id}"]`);
  await expect(card).toContainText(title);
  await expect(card).toContainText('Kaffeepause');
  await expect(card).toContainText('86-Zoll-Präsentationsdisplay');
  await expect(card).toContainText('Obstauswahl');
  await page.reload();
  await page.locator('[data-view="requests"]').click();
  await expect(card).toContainText(title);
  await selectContext(page, NORTHWIND, 'conference_manager');
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Anfragen & Buchungen', exact: true }).click();
  await uiResponse(page, 'POST', `/api/v1/requests/${request.id}/transitions`,
    () => card.getByRole('button', { name: 'Prüfung starten', exact: true }).click());
  await card.getByRole('button', { name: 'Bestätigen', exact: true }).click();
  await uiResponse(page, 'POST', `/api/v1/requests/${request.id}/transitions`,
    () => page.getByRole('dialog').getByRole('button', { name: 'Bestätigen', exact: true }).click());
  await expect(card).toContainText('Bestätigt');
  await page.getByRole('tab', { name: 'Raumplanung', exact: true }).click();
  await page.locator('#productionRoomPlanDate').fill(date);
  await page.locator('#productionRoomPlanDate').dispatchEvent('change');
  await expect(page.getByRole('table')).toContainText(title);
  await page.getByRole('radio', { name: 'Zeitplan', exact: true }).check();
  const entry = page.getByRole('region', { name: 'Raumbelegung' }).getByRole('button', { name: new RegExp(title) });
  await entry.focus();
  await page.keyboard.press('Enter');
  await expect(card).toBeFocused();
  await card.getByRole('button', { name: 'Verlauf', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'Verlauf', exact: true });
  await expect(history.getByRole('list')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card.getByRole('button', { name: 'Verlauf', exact: true })).toBeFocused();
  await selectContext(page, NORTHWIND, 'employee');
  await page.locator('[data-view="requests"]').click();
  const confirmed = page.locator(`[data-production-request-id="${request.id}"]`);
  await uiResponse(page, 'GET', `/api/v1/requests/${request.id}/room-context`,
    () => confirmed.getByRole('button', { name: 'Gästeinformationen' }).click());
  const guest = page.getByRole('dialog', { name: 'Gästeinformationen' });
  await expect(guest).toBeVisible();
  await expect(guest).not.toContainText('Door code');
  const popupPromise = page.waitForEvent('popup');
  await guest.getByRole('button', { name: 'Drucken / Als PDF speichern' }).click();
  const popup = await popupPromise;
  await expect(popup.locator('body')).toContainText(title);
  await popup.close();
  await guest.getByRole('button', { name: 'Schließen' }).click();
  return request.id;
}

export async function unavailableIntegrationFailsClosed(page) {
  await selectContext(page, NORTHWIND, 'tenant_admin');
  await openAdmin(page, 'microsoft365');
  await uiResponse(page, 'DELETE', INTEGRATION_PATH,
    () => page.getByRole('button', { name: 'Microsoft 365 trennen', exact: true }).click());
  await selectContext(page, NORTHWIND, 'employee');
  await page.locator('[data-view="employee"]').click();
  const date = businessDate();
  await page.locator('#productionTitle').fill('Unavailable provider negative');
  await page.locator('#productionDate').fill(date);
  await page.locator('#productionEndDate').fill(date);
  await page.locator('#productionStart').fill('14:00');
  await page.locator('#productionEnd').fill('15:00');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.locator('input[name="productionRoomChoice"][value="northwind-berlin-room-1"]').check();
  const result = await uiResponse(page, 'POST', '/api/v1/application/room-availability',
    () => page.getByRole('button', { name: 'Raumverfügbarkeit prüfen', exact: true }).click(), 503);
  // Independently repeat this non-mutating availability read with the exact UI
  // query. Both operations must fail closed; this is not a denial retry.
  const independentlyUnavailable = await json(await page.context().request.post(
    `${ORIGINS.customer}/api/v1/application/room-availability`, {
      headers: headers(await customerSession(page.context())),
      data: result.request().postDataJSON(),
    }), 503);
  expect(independentlyUnavailable.error.code).toBe('ROOM_AVAILABILITY_UNAVAILABLE');
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
}
