import { expect, test } from '@playwright/test';

const futureIsoDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return date.toISOString().slice(0, 10);
};

test('automatic Demo catering and route-code rendering stays on the application origin', async ({ context, page }) => {
  const observedRequests = [];
  context.on('request', (request) => observedRequests.push(request.url()));

  await page.addInitScript(({ seededDate }) => {
    const now = new Date().toISOString();
    localStorage.setItem('conference_requests', JSON.stringify([{
      id: 'CR-2026-LOCAL-ASSETS',
      title: 'Local asset verification',
      location: 'Berlin',
      date: seededDate,
      start: '10:00',
      end: '12:00',
      roomId: 'BER-321',
      status: 'Confirmed',
      calendarStatus: 'Busy',
      participants: 4,
      internalParticipants: 4,
      externalParticipants: 0,
      serviceIds: [],
      quantities: {},
      allocations: [{ costCenter: 'CC-LOCAL', percent: 100 }],
      estimatedCost: 80,
      createdAt: now,
      updatedAt: now,
      statusHistory: [],
    }]));
  }, { seededDate: futureIsoDate() });

  await page.goto('/');
  const applicationOrigin = new URL(page.url()).origin;
  await expect(page.locator('#primaryNavigation button[data-view="employee"]')).toBeVisible();
  await page.evaluate(() => {
    const catalog = JSON.parse(localStorage.getItem('conference_catalog_v2'));
    catalog.cateringPackages[0].variants[0].image = 'https://example.invalid/remote-catering.svg';
    localStorage.setItem('conference_catalog_v2', JSON.stringify(catalog));
  });
  await page.reload();
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await page.locator('#title').fill('Local catering illustrations');
  await page.locator('#location').selectOption('Berlin');
  await page.locator('#date').fill(futureIsoDate());
  await page.locator('#internalParticipants').fill('4');
  await page.locator('#externalParticipants').fill('0');
  await page.locator('#start').fill('10:00');
  await page.locator('#end').fill('12:00');
  await page.locator('.wizard-actions button.primary').click();
  await page.locator('#rooms .option-card:not(.disabled) button[aria-pressed]').first().click();
  await page.locator('.wizard-actions button.primary').click();
  await page.locator('.wizard-actions button.primary').click();
  await page.locator('input[name="cateringMode"][value="PACKAGE"]').check();

  const cateringImages = page.locator('.package-grid .catering-card-image');
  await expect(cateringImages).toHaveCount(12);
  for (const source of await cateringImages.evaluateAll((images) => images.map((image) => image.getAttribute('src')))) {
    expect(source).toMatch(/^data:image\/svg\+xml;charset=UTF-8,/);
  }

  await page.locator('#primaryNavigation button[data-view="requests"]').click();
  const popupPromise = page.waitForEvent('popup');
  await page.locator('[data-feature-pdf="CR-2026-LOCAL-ASSETS"]').click();
  const popup = await popupPromise;
  const routeCode = popup.locator('.qr');
  await expect(routeCode).toHaveCount(1);
  await expect.poll(() => routeCode.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(new URL(await routeCode.getAttribute('src')).origin).toBe(applicationOrigin);

  const crossOriginRequests = observedRequests.filter((value) => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin !== applicationOrigin;
  });
  expect(crossOriginRequests).toEqual([]);
});
