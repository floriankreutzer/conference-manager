import { expect, test } from '@playwright/test';

const REQUEST_ID = 'CR-2026-000001';

async function seedManager(page, { requesterName = '' } = {}) {
  await page.addInitScript(({ requestId, storedRequester }) => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    const eventDate = date.toISOString().slice(0, 10);
    localStorage.setItem('conference_demo_role_v1', 'manager');
    localStorage.setItem('conference_user_profile_v1', JSON.stringify({ firstName: 'Alex', lastName: 'Manager' }));
    localStorage.setItem('conference_requests', JSON.stringify([{
      id: requestId,
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
      ...(storedRequester ? { requesterName: storedRequester } : {}),
    }]));
  }, { requestId: REQUEST_ID, storedRequester: requesterName });
  await page.goto('/');
}

test('conference manager lands in a clear compact manager workspace', async ({ page }) => {
  await seedManager(page);

  await expect(page.locator('.manager-tabs')).toBeVisible();
  await expect(page.locator('#viewTitle')).toHaveText('Conference Management');
  await expect(page.locator('#viewSubtitle')).toContainText('Prüfen und steuern');
  await expect(page.locator('#primaryNavigation button[data-view="requests"]')).toHaveText('Meine Buchungen');
  await expect(page.locator('#primaryNavigation button[data-view="manager"]')).toHaveText('Conference Management');
  await expect(page.locator('[data-manager-first-use]')).toBeVisible();
  await expect(page.locator('[data-quick-filter="ACTION"]')).toHaveText('Offene Anfragen');
  await expect(page.locator('[data-quick-filter="ACTION"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.manager-overview-card').first().locator('h3')).toHaveText('Jetzt prüfen');
  await expect(page.locator('[data-manager-active-filters]')).toContainText('Offene Anfragen');

  const advancedFilters = page.locator('[data-manager-advanced-filters]');
  await expect(advancedFilters).toBeVisible();
  await expect(advancedFilters).not.toHaveAttribute('open', '');

  const how = page.locator('.manager-first-use-how');
  await expect(how).toBeVisible();
  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 760) {
    await expect(how).not.toHaveAttribute('open', '');
    const kpiColumns = await page.locator('.manager-parity-kpis').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);
    expect(kpiColumns).toBe(2);
  } else {
    await expect(how).toHaveAttribute('open', '');
  }

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

  await page.reload();
  await expect(page.locator('.manager-tabs')).toBeVisible();
  await expect(page.locator('#viewTitle')).toHaveText('Conference Management');
});

test('manager reviews complete request details and history before unchanged decision actions', async ({ page }) => {
  await seedManager(page);

  const card = page.locator('.request-card').filter({ hasText: 'Executive Workshop' });
  await expect(card).toBeVisible();
  await expect(card.locator('.manager-native-actions')).toBeHidden();
  await expect(card.locator('.manager-native-actions [data-manager-action="confirm"]')).toHaveCount(1);
  await expect(card.locator('.manager-native-actions [data-manager-action="change"]')).toHaveCount(1);
  await expect(card.locator('.manager-native-actions [data-manager-action="reject"]')).toHaveCount(1);
  await expect(card.locator('.request-timeline')).toBeHidden();
  await expect(card.locator(`[data-manager-review="${REQUEST_ID}"]`)).toBeVisible();

  await card.locator(`[data-manager-review="${REQUEST_ID}"]`).click();
  const review = page.locator('dialog.manager-review-dialog');
  await expect(review).toBeVisible();
  await expect(review).toContainText('Anfragende Person');
  await expect(review).toContainText('Nicht in der Anfrage gespeichert');
  await expect(review).not.toContainText('Alex Manager');
  await expect(review).toContainText('Intern');
  await expect(review).toContainText('Extern');
  await expect(review).toContainText('1× vegan');
  await expect(review).toContainText('CC-1000');
  await expect(review).toContainText('Empfang für externe Gäste vorbereiten');
  await expect(review.locator('[data-manager-review-history]')).toBeVisible();
  await expect(review.locator('[data-manager-review-history]')).toContainText('Buchungsverlauf');

  await review.locator(`[data-manager-confirm-from-review="${REQUEST_ID}"]`).click();
  const confirmation = page.locator('dialog.manager-confirm-dialog');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('Buchung verbindlich bestätigen?');
  await expect(confirmation).toContainText('Executive Workshop');
  await expect(confirmation).toContainText('12');
  await expect(confirmation).toContainText('Raum verbindlich als belegt geführt');
  await expect(confirmation).not.toContainText('bestehende Bestätigungslogik');

  await confirmation.locator(`[data-manager-confirm-final="${REQUEST_ID}"]`).click();
  await expect(page.locator('.request-card').filter({ hasText: 'Executive Workshop' }).locator('.status-badge')).toHaveText('Bestätigt');
});

test('request persistence failure does not present an unsaved manager decision as successful', async ({ page }) => {
  await seedManager(page);
  await page.evaluate(() => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function guardedSetItem(key, value) {
      if (key === 'conference_requests') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return nativeSetItem.call(this, key, value);
    };
  });

  const card = page.locator('.request-card').filter({ hasText: 'Executive Workshop' });
  await card.locator(`[data-manager-review="${REQUEST_ID}"]`).click();
  await page.locator(`dialog.manager-review-dialog [data-manager-confirm-from-review="${REQUEST_ID}"]`).click();
  await page.locator(`dialog.manager-confirm-dialog [data-manager-confirm-final="${REQUEST_ID}"]`).click();

  await expect(card.locator('.status-badge')).toHaveText('Zur Prüfung');
  await expect(page.locator('#toast')).toContainText('konnten nicht zuverlässig gelesen oder gespeichert werden');
  await expect(page.locator('#alertRegion')).toContainText('konnten nicht zuverlässig gelesen oder gespeichert werden');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('conference_requests') || '[]'));
  expect(stored[0].status).toBe('Submitted');
});

test('stored requester is shown instead of the manager profile', async ({ page }) => {
  await seedManager(page, { requesterName: 'Mia Employee' });

  await page.locator(`[data-manager-review="${REQUEST_ID}"]`).click();
  const review = page.locator('dialog.manager-review-dialog');
  await expect(review).toContainText('Mia Employee');
  await expect(review).not.toContainText('Alex Manager');
  await expect(review).not.toContainText('Nicht in der Anfrage gespeichert');
});

test('active manager filters are transparent and can be reset together', async ({ page }) => {
  await seedManager(page);

  const advanced = page.locator('[data-manager-advanced-filters]');
  await advanced.locator('summary').click();
  await expect(advanced).toHaveAttribute('open', '');

  const status = advanced.locator('select').first();
  await status.selectOption('Confirmed');

  const active = page.locator('[data-manager-active-filters]');
  await expect(active).toContainText('Offene Anfragen');
  await expect(active).toContainText('Status: Bestätigt');
  await expect(page.locator('[data-manager-filter-empty], .manager-surface > .info-box')).toContainText('Keine Buchungen passen zu den aktuellen Filtern.');

  await active.getByRole('button', { name: 'Alle Filter zurücksetzen' }).click();
  await expect(page.locator('[data-quick-filter="ALL"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.manager-filters select').first()).toHaveValue('ALL');
  await expect(page.locator('[data-manager-active-filters]')).toHaveCount(0);
  await expect(page.locator('.request-card').filter({ hasText: 'Executive Workshop' })).toBeVisible();
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
