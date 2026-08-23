import { expect, test } from '@playwright/test';

async function seedManager(page) {
  await page.addInitScript(() => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    const eventDate = date.toISOString().slice(0, 10);
    localStorage.setItem('conference_demo_role_v1', 'manager');
    localStorage.setItem('conference_user_profile_v1', JSON.stringify({ firstName: 'Alex', lastName: 'Manager' }));
    localStorage.setItem('conference_requests', JSON.stringify([{
      id: 'CR-FIRST-001',
      title: 'Executive Workshop',
      location: 'Berlin',
      date: eventDate,
      start: '10:00',
      end: '12:00',
      roomId: 'BER-321',
      status: 'Submitted',
      calendarStatus: 'Provisional',
      participants: 12,
      internalParticipants: 8,
      externalParticipants: 4,
      serviceIds: ['host'],
      packageSelection: null,
      quantities: {},
      cateringParticipants: 12,
      dietaryRequirements: '1× vegan',
      specialRequirements: 'Empfang für externe Gäste vorbereiten',
      allocations: [{ costCenter: 'CC-1000', percent: 100 }],
      estimatedCost: 240,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statusHistory: [],
    }]));
  });
  await page.goto('/');
}

test('conference manager lands in the manager workspace with first-use guidance', async ({ page }) => {
  await seedManager(page);

  await expect(page.locator('.manager-tabs')).toBeVisible();
  await expect(page.locator('#viewTitle')).toHaveText('Conference Management');
  await expect(page.locator('#viewSubtitle')).toContainText('Prüfen und steuern');
  await expect(page.locator('[data-manager-first-use]')).toBeVisible();
  await expect(page.locator('[data-quick-filter="ACTION"]')).toHaveAttribute('aria-pressed', 'true');

  const advancedFilters = page.locator('[data-manager-advanced-filters]');
  await expect(advancedFilters).toBeVisible();
  await expect(advancedFilters).not.toHaveAttribute('open', '');

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

  await page.reload();
  await expect(page.locator('.manager-tabs')).toBeVisible();
  await expect(page.locator('#viewTitle')).toHaveText('Conference Management');
});

test('manager reviews complete request details before using the unchanged decision actions', async ({ page }) => {
  await seedManager(page);

  const card = page.locator('.request-card').filter({ hasText: 'Executive Workshop' });
  await expect(card).toBeVisible();
  await expect(card.locator('.manager-native-actions')).toBeHidden();
  await expect(card.locator('[data-manager-review="CR-FIRST-001"]')).toBeVisible();

  await card.locator('[data-manager-review="CR-FIRST-001"]').click();
  const review = page.locator('dialog.manager-review-dialog');
  await expect(review).toBeVisible();
  await expect(review).toContainText('Anfragende Person');
  await expect(review).toContainText('Alex Manager');
  await expect(review).toContainText('Intern');
  await expect(review).toContainText('Extern');
  await expect(review).toContainText('1× vegan');
  await expect(review).toContainText('CC-1000');
  await expect(review).toContainText('Empfang für externe Gäste vorbereiten');

  await review.locator('[data-manager-confirm-from-review="CR-FIRST-001"]').click();
  const confirmation = page.locator('dialog.manager-confirm-dialog');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('Buchung verbindlich bestätigen?');
  await expect(confirmation).toContainText('Executive Workshop');
  await expect(confirmation).toContainText('12');

  await confirmation.locator('[data-manager-confirm-final="CR-FIRST-001"]').click();
  await expect(page.locator('.request-card').filter({ hasText: 'Executive Workshop' }).locator('.status-badge')).toHaveText('Bestätigt');
});

test('manager tab subtitles follow the active work area', async ({ page }) => {
  await seedManager(page);

  await page.getByRole('button', { name: 'Raumplanung', exact: true }).click();
  await expect(page.locator('#viewSubtitle')).toContainText('Raumbelegung');

  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(page.locator('#viewSubtitle')).toContainText('Analysieren');

  await page.getByRole('button', { name: 'Administration', exact: true }).click();
  await expect(page.locator('#viewSubtitle')).toContainText('Verwalten');
});
