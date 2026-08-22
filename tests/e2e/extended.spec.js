import { expect, test } from '@playwright/test';

const futureIsoDate = (days = 30) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const clickWizardPrimary = async (page) => {
  await page.locator('.wizard-actions button.primary').click();
};

const openProfile = async (page) => {
  await page.locator('#primaryNavigation button[aria-haspopup="dialog"]').click();
  await expect(page.locator('dialog')).toBeVisible();
};

const setManagerRole = async (page) => {
  await openProfile(page);
  await page.locator('#profileRole').selectOption('manager');
  const managerNav = page.locator('#primaryNavigation button[data-view="manager"]');
  await expect(managerNav).toBeVisible();
  await managerNav.click();
};

const fillSchedule = async (page, { title, date = futureIsoDate() }) => {
  await page.locator('#title').fill(title);
  await page.locator('#location').selectOption('Berlin');
  await page.locator('#date').fill(date);
  await page.locator('#internalParticipants').fill('10');
  await page.locator('#externalParticipants').fill('2');
  await page.locator('#start').fill('10:00');
  await page.locator('#end').fill('12:00');
};

const chooseRoom = async (page) => {
  const room = page.locator('#rooms .option-card:not(.disabled) button[aria-pressed]').first();
  await expect(room).toBeVisible();
  await room.click();
};

const createBasicRequest = async (page, { title, date = futureIsoDate() }) => {
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await fillSchedule(page, { title, date });
  await clickWizardPrimary(page);
  await chooseRoom(page);
  await clickWizardPrimary(page);
  await clickWizardPrimary(page);
  await clickWizardPrimary(page);
  await page.locator('#allocation-cost-center-0').fill('CC-E2E-200');
  await clickWizardPrimary(page);
  await clickWizardPrimary(page);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});

test('autosave draft survives navigation and can be restored', async ({ page }) => {
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await page.locator('#title').fill('Persisted Draft Workshop');
  await expect(page.locator('#draftStatus')).toContainText('Entwurf automatisch gespeichert', { timeout: 2_000 });

  await page.locator('#primaryNavigation button[data-view="welcome"]').click();
  const continueDraft = page.getByRole('button', { name: 'Entwurf fortsetzen' });
  await expect(continueDraft).toBeVisible();
  await continueDraft.click();
  await expect(page.locator('#title')).toHaveValue('Persisted Draft Workshop');
});

test('services and catering persist with adjusted catering participant count and cost', async ({ page }) => {
  const title = 'Catering Cost Workshop';
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await fillSchedule(page, { title });
  await clickWizardPrimary(page);
  await chooseRoom(page);
  await clickWizardPrimary(page);

  const serviceButton = page.locator('[data-step-panel="3"] .option-card button[aria-pressed]').first();
  await serviceButton.click();
  await expect(serviceButton).toHaveAttribute('aria-pressed', 'true');
  await clickWizardPrimary(page);

  await page.locator('input[name="cateringMode"][value="PACKAGE"]').check();
  const packageButton = page.locator('.package-grid .option-card button[aria-pressed]').first();
  await packageButton.click();
  await page.locator('#cateringParticipants').fill('5');
  await clickWizardPrimary(page);

  await page.locator('#allocation-cost-center-0').fill('CC-CATERING');
  await clickWizardPrimary(page);
  await expect(page.locator('[data-step-panel="6"]')).toContainText('Catering');
  await clickWizardPrimary(page);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('conference_requests') || '[]')[0]);
  expect(stored.title).toBe(title);
  expect(stored.serviceIds).toHaveLength(1);
  expect(stored.cateringParticipants).toBe(5);
  expect(stored.packageSelection).not.toBeNull();
  expect(stored.estimatedCost).toBeGreaterThan(80);
});

test('manager room plan reports and master-data administration work end to end', async ({ page }) => {
  const title = 'Manager Surface Workshop';
  const date = futureIsoDate(35);
  await createBasicRequest(page, { title, date });
  await setManagerRole(page);

  await page.getByRole('button', { name: 'Raumplanung' }).click();
  await page.locator('#roomPlanDate').fill(date);
  await page.locator('#roomPlanDate').dispatchEvent('change');
  await expect(page.locator('.data-table')).toContainText(title);

  await page.getByRole('button', { name: 'Reports' }).click();
  await expect(page.locator('.dashboard-grid')).toContainText('Offene Anfragen');

  await page.getByRole('button', { name: 'Administration' }).click();
  const capacity = page.locator('#room-cap-BER-321');
  await expect(capacity).toBeVisible();
  await capacity.fill('13');
  const roomCard = capacity.locator('xpath=ancestor::article[contains(@class,"admin-card")]');
  await roomCard.getByRole('button', { name: 'Speichern' }).click();

  const savedCapacity = await page.evaluate(() => {
    const catalog = JSON.parse(localStorage.getItem('conference_catalog_v2') || '{}');
    return catalog.rooms?.find((room) => room.id === 'BER-321')?.capacity;
  });
  expect(savedCapacity).toBe(13);

  await page.getByRole('button', { name: 'Services' }).click();
  await expect(page.locator('#service-name-host')).toBeVisible();
});
