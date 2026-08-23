import { expect, test } from '@playwright/test';

const futureIsoDate = (days = 3) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

async function seedManager(page, requests) {
  await page.addInitScript(({ seededRequests }) => {
    localStorage.setItem('conference_demo_role_v1', 'manager');
    localStorage.setItem('conference_requests', JSON.stringify(seededRequests));
  }, { seededRequests: requests });
  await page.goto('/');
  await expect(page.locator('.manager-tabs')).toBeVisible();
}

function managerRequest({ id, title, date, start = '10:00', end = '12:00', roomId = 'BER-321', status = 'Submitted' }) {
  return {
    id,
    title,
    location: 'Berlin',
    date,
    start,
    end,
    roomId,
    status,
    calendarStatus: status === 'Confirmed' ? 'Busy' : 'Provisional',
    participants: 6,
    internalParticipants: 6,
    externalParticipants: 0,
    serviceIds: [],
    quantities: {},
    allocations: [{ costCenter: 'CC-HARDENING', percent: 100 }],
    estimatedCost: 120,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    statusHistory: [],
  };
}

test('semantic request and manager-action contracts survive visible copy mutation', async ({ page }) => {
  const date = futureIsoDate();
  const request = managerRequest({ id: 'CR-2026-SEMANTIC-001', title: 'Semantic Contract Workshop', date });
  await seedManager(page, [request]);

  const card = page.locator('[data-request-id="CR-2026-SEMANTIC-001"]');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-manager-action="confirm"]')).toHaveCount(1);
  await expect(card.locator('[data-manager-action="change"]')).toHaveCount(1);
  await expect(card.locator('[data-manager-action="reject"]')).toHaveCount(1);

  await card.locator('.request-card-header .muted').evaluate((node) => { node.textContent = 'Visible copy deliberately changed'; });
  await page.locator('[data-quick-filter="ACTION"]').click();
  await expect(card).toBeVisible();
  await card.locator('[data-manager-review="CR-2026-SEMANTIC-001"]').click();
  await expect(page.locator('dialog.manager-review-dialog')).toBeVisible();
});

test('room and catering enhancements use semantic source identities', async ({ page }) => {
  await page.goto('/');
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await page.locator('#title').fill('Semantic Selection Workshop');
  await page.locator('#location').selectOption('Berlin');
  await page.locator('#date').fill(futureIsoDate());
  await page.locator('#internalParticipants').fill('6');
  await page.locator('#externalParticipants').fill('0');
  await page.locator('#start').fill('10:00');
  await page.locator('#end').fill('12:00');
  await page.locator('.wizard-actions button.primary').click();

  const roomCard = page.locator('#rooms .option-card[data-room-id]').first();
  await expect(roomCard).toBeVisible();
  await expect(roomCard.locator('[data-room-action="select"]')).toHaveCount(1);
  await expect(roomCard.locator('[data-room-action="floorplan"]')).toHaveCount(1);
  await expect(roomCard.locator('[data-room-action="floorplan"]')).toHaveAttribute('data-feature-floorplan', /.+/);
  await roomCard.locator('[data-room-action="select"]').click();

  await page.locator('.wizard-actions button.primary').click();
  await page.locator('.wizard-actions button.primary').click();
  await page.locator('input[name="cateringMode"][value="PACKAGE"]').check();
  const packageCard = page.locator('.package-grid .option-card[data-package-id][data-package-tier]').first();
  await expect(packageCard).toBeVisible();
  await expect(packageCard.locator('[data-package-action="select"]')).toHaveCount(1);
  await expect(packageCard.locator('.catering-card-image')).toBeVisible();
});

test('manager master-data write failure remains visible and does not reload or claim success', async ({ page }) => {
  await seedManager(page, []);
  await page.getByRole('button', { name: 'Administration', exact: true }).click();
  await expect(page.locator('[data-feature-parity="admin"]')).toBeVisible();

  const before = await page.evaluate(() => localStorage.getItem('conference_catalog_v2'));
  await page.evaluate(() => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function guardedSetItem(key, value) {
      if (key === 'conference_catalog_v2') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return nativeSetItem.call(this, key, value);
    };
  });

  const name = page.locator('#room-name-BER-321');
  await name.fill('Unsaved room name');
  const card = name.locator('xpath=ancestor::article[contains(@class,"parity-admin-card")]');
  await card.getByRole('button', { name: 'Speichern', exact: true }).click();

  await expect(page.locator('#alertRegion')).toContainText('konnten nicht zuverlässig gelesen oder gespeichert werden');
  await expect(name).toHaveValue('Unsaved room name');
  const after = await page.evaluate(() => localStorage.getItem('conference_catalog_v2'));
  expect(after).toBe(before);
});

test('room timeline uses CSP-safe class positioning and remains valid in RTL', async ({ page }) => {
  const date = futureIsoDate();
  await seedManager(page, [
    managerRequest({ id: 'CR-2026-TIMELINE-001', title: 'Morning Timeline', date, start: '10:00', end: '12:00', status: 'Confirmed' }),
    managerRequest({ id: 'CR-2026-TIMELINE-002', title: 'Afternoon Timeline', date, start: '14:15', end: '16:45', roomId: 'BER-412', status: 'Confirmed' }),
  ]);

  await page.getByRole('button', { name: 'Raumplanung', exact: true }).click();
  await page.locator('#roomPlanDate').fill(date);
  await page.locator('#roomPlanDate').dispatchEvent('change');
  await page.locator('[data-room-plan-view="TIMELINE"]').click();

  const bookings = page.locator('.room-timeline-booking');
  await expect(bookings).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    const booking = bookings.nth(index);
    await expect(booking).not.toHaveAttribute('style', /.+/);
    await expect(booking).toHaveAttribute('data-timeline-start', /^\d+$/);
    await expect(booking).toHaveAttribute('data-timeline-width', /^\d+$/);
    const geometry = await booking.evaluate((node) => {
      const style = getComputedStyle(node);
      return { insetInlineStart: style.insetInlineStart, inlineSize: style.inlineSize };
    });
    expect(geometry.insetInlineStart).not.toBe('auto');
    expect(Number.parseFloat(geometry.inlineSize)).toBeGreaterThan(0);
  }

  await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
  const rtlGeometry = await bookings.first().evaluate((node) => {
    const style = getComputedStyle(node);
    return { insetInlineStart: style.insetInlineStart, inlineSize: style.inlineSize };
  });
  expect(rtlGeometry.insetInlineStart).not.toBe('auto');
  expect(Number.parseFloat(rtlGeometry.inlineSize)).toBeGreaterThan(0);
});
