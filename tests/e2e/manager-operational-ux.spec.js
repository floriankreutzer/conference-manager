import { expect, test } from '@playwright/test';

const REQUEST_ID = 'CR-2026-OP-001';

async function seedManager(page) {
  await page.addInitScript(({ requestId }) => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    localStorage.setItem('conference_demo_role_v1', 'manager');
    localStorage.setItem('conference_user_profile_v1', JSON.stringify({ firstName: 'Alex', lastName: 'Manager' }));
    localStorage.setItem('conference_requests', JSON.stringify([{
      id: requestId,
      requesterName: 'Mia Employee',
      title: 'Operational Review Workshop',
      location: 'Berlin',
      date: date.toISOString().slice(0, 10),
      start: '10:00',
      end: '12:00',
      roomId: 'BER-321',
      status: 'Submitted',
      calendarStatus: 'Provisional',
      participants: 12,
      internalParticipants: 8,
      externalParticipants: 4,
      serviceIds: [],
      packageSelection: null,
      quantities: {},
      cateringParticipants: 0,
      dietaryRequirements: '',
      specialRequirements: '',
      allocations: [{ costCenter: 'CC-1000', percent: 100 }],
      estimatedCost: 240,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statusHistory: [],
    }]));
  }, { requestId: REQUEST_ID });
  await page.goto('/');
}

test('new request attribution uses the requester profile and survives later updates', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('conference_user_profile_v1', JSON.stringify({ firstName: 'Mia', lastName: 'Employee' }));
    localStorage.setItem('conference_requests', JSON.stringify([{
      id: 'CR-LEGACY-001',
      title: 'Legacy Request',
      status: 'Submitted',
    }]));
  });
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const { requestRepository } = await import('/src/core/storage.js');
    const current = requestRepository.all();
    requestRepository.save([{
      id: 'CR-NEW-001',
      title: 'New Request',
      status: 'Submitted',
    }, ...current]);

    const afterCreate = requestRepository.all();
    localStorage.setItem('conference_user_profile_v1', JSON.stringify({ firstName: 'Alex', lastName: 'Manager' }));
    requestRepository.update((list) => list.map((request) => ({ ...request, updatedAt: new Date().toISOString() })));
    const afterUpdate = requestRepository.all();

    return {
      newRequester: afterCreate.find((request) => request.id === 'CR-NEW-001')?.requesterName || '',
      legacyRequester: afterCreate.find((request) => request.id === 'CR-LEGACY-001')?.requesterName || '',
      requesterAfterUpdate: afterUpdate.find((request) => request.id === 'CR-NEW-001')?.requesterName || '',
    };
  });

  expect(result.newRequester).toBe('Mia Employee');
  expect(result.legacyRequester).toBe('');
  expect(result.requesterAfterUpdate).toBe('Mia Employee');
});

test('tentative KPI has a visible quick-filter state', async ({ page }) => {
  await seedManager(page);

  const tentativeQuick = page.locator('[data-quick-filter="TENTATIVE"]');
  await expect(tentativeQuick).toBeVisible();
  await expect(tentativeQuick).toHaveText('Vorläufig reserviert');

  await page.locator('[data-overview-filter="TENTATIVE"]').click();
  await expect(tentativeQuick).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-manager-active-filters]')).toContainText('Vorläufig reserviert');
  await expect(page.locator('.request-card').filter({ hasText: 'Operational Review Workshop' })).toBeVisible();
});

test('overview open goes directly to review and clears blocking filters only when needed', async ({ page }) => {
  await seedManager(page);

  const advanced = page.locator('[data-manager-advanced-filters]');
  await advanced.locator('summary').click();
  await advanced.locator('select').first().selectOption('Confirmed');
  await expect(page.locator('.manager-surface > .info-box, [data-manager-filter-empty]')).toContainText('Keine Buchungen passen zu den aktuellen Filtern.');

  await page.locator(`[data-manager-open="${REQUEST_ID}"]`).click();

  const review = page.locator('dialog.manager-review-dialog');
  await expect(review).toBeVisible();
  await expect(review).toContainText('Operational Review Workshop');
  await expect(review).toContainText('Mia Employee');
  await expect(page.locator('.manager-filters select').first()).toHaveValue('ALL');
  await expect(page.locator('[data-quick-filter="ALL"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.manager-filters input[type="search"]')).toHaveValue('');
});
