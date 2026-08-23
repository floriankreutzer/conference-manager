import { expect, test } from '@playwright/test';

const futureIsoDate = (days = 35) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

async function fillSchedule(page) {
  await page.locator('#title').fill('Accessibility Regression Workshop');
  await page.locator('#location').selectOption('Berlin');
  await page.locator('#date').fill(futureIsoDate());
  await page.locator('#start').fill('09:00');
  await page.locator('#end').fill('11:00');
  await page.locator('#internalParticipants').fill('6');
  await page.locator('#externalParticipants').fill('2');
}

async function next(page) {
  await page.locator('.wizard-actions button.primary').click();
}

async function chooseRoom(page) {
  await page.locator('#rooms .option-card:not(.disabled) button[aria-pressed]').first().click();
}

async function reachCatering(page) {
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await fillSchedule(page);
  await next(page);
  await chooseRoom(page);
  await next(page);
  await next(page);
}

async function reachCosts(page) {
  await reachCatering(page);
  await next(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('first-time users never inherit the demo developer identity', async ({ page }) => {
  await expect(page.locator('#welcomeHeading')).toHaveText('Willkommen');
  const profile = page.locator('#primaryNavigation button[aria-haspopup="dialog"]');
  await expect(profile).toHaveText('Profil');
  await expect(profile).toHaveAttribute('aria-label', 'Profil öffnen');
  await expect(page.locator('body')).not.toContainText('Willkommen, Florian');

  await profile.click();
  const values = page.locator('.profile-content .details-list dd');
  await expect(values.nth(0)).toHaveText('Nicht hinterlegt');
  await expect(values.nth(1)).toHaveText('Nicht hinterlegt');
});

test('schedule DOM and keyboard focus follow the visible What Where When Who order', async ({ page }, testInfo) => {
  await page.locator('#primaryNavigation button[data-view="employee"]').click();

  const order = await page.locator('[data-step-panel="1"] .form-grid.two').evaluate((grid) =>
    [...grid.children].map((child) => child.querySelector('input,select,textarea')?.id || (child.classList.contains('participant-total') ? 'participantTotal' : '')),
  );
  expect(order).toEqual(['title', 'location', 'date', 'start', 'end', 'internalParticipants', 'externalParticipants', 'participantTotal']);

  if (testInfo.project.name !== 'webkit-mobile') {
    await page.locator('#date').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#start')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#end')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#internalParticipants')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#externalParticipants')).toBeFocused();
  }

  await expect(page.locator('[data-step-panel="1"] .form-grid.two')).toHaveAttribute('data-ux-dom-order', 'what-where-when-who');
});

test('cost allocation has visible meaning on desktop and mobile without changing the existing controls', async ({ page }, testInfo) => {
  await reachCosts(page);
  await expect(page.locator('[data-step-panel="5"]')).toBeVisible();

  if (testInfo.project.name === 'webkit-mobile') {
    await expect(page.locator('[data-ux-allocation-labels]')).toBeHidden();
    await expect(page.locator('[data-ux-mobile-allocation-label="cost-center"]')).toHaveText('Kostenstelle');
    await expect(page.locator('[data-ux-mobile-allocation-label="percent"]')).toHaveText('Anteil (%)');
    await expect(page.locator('[data-ux-mobile-allocation-label="amount"]')).toHaveText('Betrag');
  } else {
    await expect(page.locator('[data-ux-allocation-labels]')).toBeVisible();
    await expect(page.locator('[data-ux-allocation-labels]')).toContainText('Kostenstelle');
    await expect(page.locator('[data-ux-allocation-labels]')).toContainText('Anteil (%)');
    await expect(page.locator('[data-ux-allocation-labels]')).toContainText('Betrag');
  }

  await page.locator('#allocation-cost-center-0').fill('471100');
  await page.locator('#allocation-percent-0').fill('100');
  await expect(page.locator('#allocation-cost-center-0')).toHaveValue('471100');
  await expect(page.locator('#allocation-percent-0')).toHaveValue('100');
});

test('all catering variants remain available while only one package family is shown at a time', async ({ page }) => {
  await reachCatering(page);
  await page.locator('input[name="cateringMode"][value="PACKAGE"]').check();

  await expect(page.locator('.ux-package-groups')).toBeVisible();
  await expect(page.locator('.ux-package-groups button')).toHaveCount(4);
  await expect(page.locator('.package-grid .option-card')).toHaveCount(12);
  await expect(page.locator('.package-grid .option-card:visible')).toHaveCount(3);

  for (const group of ['Meeting', 'Frühstück', 'Mittagessen', 'Ganzer Tag']) {
    await page.locator('.ux-package-groups').getByRole('button', { name: group }).click();
    await expect(page.locator('.package-grid .option-card:visible')).toHaveCount(3);
  }

  await page.locator('.ux-package-groups').getByRole('button', { name: 'Mittagessen' }).click();
  const option = page.locator('.package-grid .option-card:visible').nth(1);
  await option.getByRole('button', { name: /auswählen/i }).click();
  await expect(page.locator('.package-grid .option-card.selected')).toHaveCount(1);
  await expect(page.locator('.package-grid .option-card.selected')).toContainText('Mittagessen');
});

test('employee terminology is consistent without changing wizard navigation', async ({ page }) => {
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  const steps = page.locator('.stepper .step');
  await expect(steps.nth(2)).toContainText('Zusatzleistungen');

  await fillSchedule(page);
  await next(page);
  await chooseRoom(page);
  await next(page);
  await expect(page.locator('[data-step-panel="3"] .section-heading h2')).toHaveText('Zusatzleistungen (optional)');
  await expect(page.locator('html')).toHaveAttribute('data-employee-accessibility-build', '2026.08.23.03');
});
