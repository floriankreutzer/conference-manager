import { expect } from '@playwright/test';
import {
  NORTHWIND, INTEGRATION_PATH, catalogue, requests, locations,
  selectContext, uiResponse, businessDate, openAdmin, imagesLoaded,
} from './scenario-support.js';

export async function verifyNorthwindBaseline(page) {
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
  return { rooms: configuration.configuration.rooms, catalog, seeded };
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
  await page.getByRole('radio', { name: 'Kaffeepause · Standard', exact: true }).check();
  await page.locator('#productionCateringParticipants').fill('4');
  await page.getByLabel('Menge für Obstauswahl', { exact: true }).fill('4');
  await next.click();
  const allocation = page.locator('#productionAllocationCenter-0');
  await expect(allocation.locator('option:not([value=""])')).toHaveCount(6);
  await allocation.selectOption('cc-1000');
  await next.click();
  await expect(page.getByRole('button', { name: 'Anfrage absenden', exact: true })).toBeEnabled();
  const created = await uiResponse(page, 'POST', '/api/v1/application/requests',
    () => page.getByRole('button', { name: 'Anfrage absenden', exact: true }).click(), 201);
  const request = created.request;
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
  return request.id;
}

export async function unavailableIntegrationFailsClosed(page) {
  await selectContext(page, NORTHWIND, 'tenant_admin');
  await openAdmin(page, 'microsoft365');
  await uiResponse(page, 'POST', `${INTEGRATION_PATH}/disconnect`,
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
  expect(result.error.code).toBe('ROOM_AVAILABILITY_UNAVAILABLE');
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
}
