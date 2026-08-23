import { expect, test } from '@playwright/test';

const ACTION_ID = 'CR-2026-000201';
const UPCOMING_ID = 'CR-2026-000202';

async function seedManager(page) {
  await page.addInitScript(({ actionId, upcomingId }) => {
    const actionDate = new Date();
    actionDate.setDate(actionDate.getDate() + 2);
    const upcomingDate = new Date();
    upcomingDate.setDate(upcomingDate.getDate() + 3);
    const now = new Date().toISOString();

    localStorage.setItem('conference_demo_role_v1', 'manager');
    localStorage.setItem('conference_user_profile_v1', JSON.stringify({ firstName: 'Alex', lastName: 'Manager' }));
    localStorage.setItem('conference_requests', JSON.stringify([
      {
        id: actionId,
        requesterName: 'Mia Employee',
        title: 'Manager Ready Review',
        location: 'Berlin',
        date: actionDate.toISOString().slice(0, 10),
        start: '10:00',
        end: '12:00',
        roomId: 'BER-321',
        status: 'Submitted',
        calendarStatus: 'Provisional',
        participants: 10,
        internalParticipants: 6,
        externalParticipants: 4,
        serviceIds: [],
        packageSelection: null,
        quantities: {},
        cateringParticipants: 0,
        dietaryRequirements: '',
        specialRequirements: '',
        allocations: [{ costCenter: 'CC-READY', percent: 100 }],
        estimatedCost: 200,
        createdAt: now,
        updatedAt: now,
        statusHistory: [],
      },
      {
        id: upcomingId,
        requesterName: 'Jon Employee',
        title: 'Manager Ready Confirmed',
        location: 'Berlin',
        date: upcomingDate.toISOString().slice(0, 10),
        start: '13:00',
        end: '14:00',
        roomId: 'BER-321',
        status: 'Confirmed',
        calendarStatus: 'Busy',
        participants: 6,
        internalParticipants: 4,
        externalParticipants: 2,
        serviceIds: [],
        packageSelection: null,
        quantities: {},
        cateringParticipants: 0,
        dietaryRequirements: '',
        specialRequirements: '',
        allocations: [{ costCenter: 'CC-READY', percent: 100 }],
        estimatedCost: 120,
        createdAt: now,
        updatedAt: now,
        statusHistory: [],
      },
    ]));
  }, { actionId: ACTION_ID, upcomingId: UPCOMING_ID });

  await page.goto('/');
  await expect(page.locator('.manager-tabs')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-conference-manager-readiness', 'ready');
}

test('conference manager ready marker, clear bookings label and permanent help are available', async ({ page }) => {
  await seedManager(page);

  await expect(page.locator('meta[name="conference-manager-readiness"]')).toHaveAttribute('content', 'ready');
  const bookingsTab = page.locator('[data-manager-ready-bookings-tab]');
  await expect(bookingsTab).toBeVisible();
  await expect(bookingsTab).toHaveAttribute('aria-label', 'Anfragen & Buchungen');
  const prefix = await bookingsTab.evaluate((node) => getComputedStyle(node, '::before').content);
  expect(prefix).toContain('Anfragen &');

  const help = page.locator('[data-manager-ready-help]');
  await expect(help).toBeVisible();
  await help.locator('summary').click();
  await expect(help).toContainText('Offene Anfragen zuerst');
  await expect(help).toContainText('Vorläufig reserviert');
  await expect(help).toContainText('Bestätigen Sie die Anfrage');

  const intro = page.locator('[data-manager-first-use]');
  await expect(intro).toBeVisible();
  await intro.getByRole('button', { name: 'Verstanden' }).click();
  await expect(intro).toHaveCount(0);
  await expect(help).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-manager-first-use]')).toHaveCount(0);
  await expect(page.locator('[data-manager-ready-help]')).toBeVisible();
});

test('secondary mobile time filters remain fully functional while desktop keeps all quick filters', async ({ page }) => {
  await seedManager(page);

  const sevenDays = page.locator('.manager-quick-filters [data-quick-filter="7D"]');
  const upcoming = page.locator('.manager-quick-filters [data-quick-filter="UPCOMING"]');
  const secondary = page.locator('[data-manager-ready-secondary-filters]');
  const viewport = page.viewportSize();
  const isMobile = Boolean(viewport && viewport.width <= 760);

  if (isMobile) {
    await expect(page.locator('.manager-quick-filters [data-quick-filter="ACTION"]')).toBeVisible();
    await expect(page.locator('.manager-quick-filters [data-quick-filter="TODAY"]')).toBeVisible();
    await expect(page.locator('.manager-quick-filters [data-quick-filter="TENTATIVE"]')).toBeVisible();
    await expect(page.locator('.manager-quick-filters [data-quick-filter="ALL"]')).toBeVisible();
    await expect(sevenDays).toBeHidden();
    await expect(upcoming).toBeHidden();
    await expect(secondary).toBeVisible();

    await secondary.locator('summary').click();
    const sevenDaysProxy = secondary.locator('[data-manager-ready-filter-proxy="7D"]');
    await expect(sevenDaysProxy).toBeVisible();
    await sevenDaysProxy.click();
    await expect(sevenDays).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-manager-active-filters]')).toContainText('Nächste 7 Tage');

    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  } else {
    await expect(sevenDays).toBeVisible();
    await expect(upcoming).toBeVisible();
    await expect(secondary).toBeHidden();
  }
});

test('ready layer preserves the existing manager review and confirmation flow', async ({ page }) => {
  await seedManager(page);

  await page.locator(`[data-manager-review="${ACTION_ID}"]`).click();
  const review = page.locator('dialog.manager-review-dialog');
  await expect(review).toBeVisible();
  await expect(review.locator('[data-manager-decision-summary]')).toContainText('Entscheidung erforderlich');
  await expect(review.getByRole('button', { name: 'Änderung anfordern' })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Ablehnen' })).toBeVisible();
  await review.locator(`[data-manager-confirm-from-review="${ACTION_ID}"]`).click();

  const confirmation = page.locator('dialog.manager-confirm-dialog');
  await expect(confirmation).toBeVisible();
  await confirmation.locator(`[data-manager-confirm-final="${ACTION_ID}"]`).click();
  await expect(page.locator('.request-card').filter({ hasText: 'Manager Ready Review' }).locator('.status-badge')).toHaveText('Bestätigt');
});
