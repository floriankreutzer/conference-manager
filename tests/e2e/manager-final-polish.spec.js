import { expect, test } from '@playwright/test';

const ACTION_ID = 'CR-2026-000101';
const UPCOMING_ID = 'CR-2026-000102';

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
        title: 'Action Required Workshop',
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
        allocations: [{ costCenter: 'CC-1000', percent: 100 }],
        estimatedCost: 240,
        createdAt: now,
        updatedAt: now,
        statusHistory: [],
      },
      {
        id: upcomingId,
        requesterName: 'Jon Employee',
        title: 'Confirmed Client Meeting',
        location: 'Berlin',
        date: upcomingDate.toISOString().slice(0, 10),
        start: '13:00',
        end: '15:00',
        roomId: 'BER-321',
        status: 'Confirmed',
        calendarStatus: 'Busy',
        participants: 6,
        internalParticipants: 4,
        externalParticipants: 2,
        serviceIds: [],
        packageSelection: null,
        quantities: {},
        allocations: [{ costCenter: 'CC-2000', percent: 100 }],
        estimatedCost: 160,
        createdAt: now,
        updatedAt: now,
        statusHistory: [],
      },
    ]));
  }, { actionId: ACTION_ID, upcomingId: UPCOMING_ID });
  await page.goto('/');
  await expect(page.locator('.manager-tabs')).toBeVisible();
}

test('overview separates action requests from additional upcoming bookings', async ({ page }) => {
  await seedManager(page);

  const cards = page.locator('.manager-overview-columns .manager-overview-card');
  await expect(cards.first()).toContainText('Action Required Workshop');
  await expect(cards.nth(1)).not.toContainText('Action Required Workshop');
  await expect(cards.nth(1)).toContainText('Confirmed Client Meeting');
  await expect(cards.nth(1).locator(`[data-manager-open="${UPCOMING_ID}"]`)).toBeVisible();
});

test('review makes request state, room reservation and next decision explicit', async ({ page }) => {
  await seedManager(page);

  await page.locator(`[data-manager-review="${ACTION_ID}"]`).click();
  const review = page.locator('dialog.manager-review-dialog');
  await expect(review).toBeVisible();

  const summary = review.locator('[data-manager-decision-summary]');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('Anfrage');
  await expect(summary).toContainText('Vorläufig reserviert');
  await expect(summary).toContainText('Entscheidung erforderlich');

  await expect(review.getByRole('button', { name: 'Änderung anfordern' })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Ablehnen' })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Bestätigen', exact: true })).toBeVisible();
});

test('mobile review keeps decisions compact and moves close to the header', async ({ page }) => {
  await seedManager(page);
  await page.locator(`[data-manager-review="${ACTION_ID}"]`).click();

  const review = page.locator('dialog.manager-review-dialog');
  const headerClose = review.locator('[data-manager-review-header-close]');
  const bottomClose = review.locator('[data-manager-review-bottom-close]');
  const viewport = page.viewportSize();

  if (viewport && viewport.width <= 760) {
    await expect(headerClose).toBeVisible();
    await expect(bottomClose).toBeHidden();
    await expect(review.locator('[data-manager-confirm-from-review]')).toBeVisible();
    await headerClose.click();
    await expect(review).not.toBeVisible();
  } else {
    await expect(headerClose).toBeHidden();
    await expect(bottomClose).toBeVisible();
  }
});
