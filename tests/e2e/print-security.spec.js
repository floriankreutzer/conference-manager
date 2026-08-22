import { expect, test } from '@playwright/test';

function futureIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return date.toISOString().slice(0, 10);
}

test('welcome print keeps its approved styling under the strict CSP', async ({ page }) => {
  const date = futureIsoDate();
  await page.addInitScript(({ seededDate }) => {
    const now = new Date().toISOString();
    localStorage.setItem('conference_requests', JSON.stringify([{
      id: 'CR-SEC-PRINT-001',
      title: 'Strict CSP Welcome',
      location: 'Berlin',
      date: seededDate,
      start: '10:00',
      end: '12:00',
      roomId: 'BER-321',
      status: 'Confirmed',
      calendarStatus: 'Busy',
      participants: 4,
      internalParticipants: 2,
      externalParticipants: 2,
      serviceIds: [],
      quantities: {},
      allocations: [{ costCenter: 'CC-SEC', percent: 100 }],
      estimatedCost: 80,
      createdAt: now,
      updatedAt: now,
      statusHistory: [],
    }]));
  }, { seededDate: date });

  await page.goto('/');
  await page.locator('#primaryNavigation button[data-view="requests"]').click();
  const pdfButton = page.locator('[data-feature-pdf="CR-SEC-PRINT-001"]');
  await expect(pdfButton).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await pdfButton.click();
  const popup = await popupPromise;
  await expect(popup.locator('.hero')).toContainText('Strict CSP Welcome');
  await expect(popup.locator('.hero')).toHaveCSS('background-color', 'rgb(29, 29, 31)');
  await expect(popup.locator('.qr')).toHaveCount(1);
});
