import { expect, test } from '@playwright/test';

const futureIsoDate = (days = 30) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

async function fillSchedule(page) {
  await page.locator('#title').fill('UX Regression Workshop');
  await page.locator('#location').selectOption('Berlin');
  await page.locator('#date').fill(futureIsoDate());
  await page.locator('#start').fill('10:00');
  await page.locator('#end').fill('12:00');
  await page.locator('#internalParticipants').fill('8');
  await page.locator('#externalParticipants').fill('2');
}

async function next(page) {
  await page.locator('.wizard-actions button.primary').click();
}

async function chooseRoom(page) {
  const roomButton = page.locator('#rooms .option-card:not(.disabled) button[aria-pressed]').first();
  await expect(roomButton).toBeVisible();
  await roomButton.click();
  await expect(page.locator('#rooms .option-card.selected:not(.disabled)')).toHaveCount(1);
}

async function reachCatering(page) {
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await fillSchedule(page);
  await next(page);
  await chooseRoom(page);
  await next(page);
  await next(page);
  await expect(page.locator('[data-step-panel="4"]')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('first-use welcome prioritizes the primary action and explains the task clearly', async ({ page }) => {
  await expect(page.locator('.welcome-hero')).toBeVisible();
  await expect(page.locator('#brandSubtitle')).toHaveText('Interne Services');
  await expect(page.locator('.welcome-hero > p:not(.eyebrow)')).toHaveText('Planen Sie Ihre Veranstaltung – Raum, Services und Bewirtung in einer Anfrage.');
  await expect(page.getByRole('button', { name: 'Neue Konferenz anfragen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Meine Buchungen ansehen' })).toBeHidden();
  await expect(page.locator('.dashboard-grid')).toBeHidden();
  await expect(page.locator('.card').filter({ hasText: 'Nächste bestätigte Buchung' })).toBeHidden();
  await expect(page.locator('.card').filter({ hasText: 'Aktuelle Hinweise' })).toBeHidden();
  await expect(page.locator('.card').filter({ hasText: 'So funktioniert es' })).toBeVisible();
  await expect(page.locator('#primaryNavigation button[data-view="requests"]')).toBeVisible();
});

test('wizard only allows sequential forward navigation while preserving backward navigation', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'webkit-mobile';
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  const steps = page.locator('.stepper .step');
  await expect(steps).toHaveCount(6);
  await expect(steps.nth(0)).toBeEnabled();
  await expect(steps.nth(1)).toBeEnabled();
  await expect(steps.nth(2)).toBeDisabled();
  await expect(steps.nth(5)).toBeDisabled();

  await fillSchedule(page);
  await next(page);
  await expect(page.locator('[data-step-panel="2"]')).toBeVisible();
  await expect(steps.nth(0)).toBeEnabled();
  await expect(steps.nth(2)).toBeEnabled();
  await expect(steps.nth(3)).toBeDisabled();

  if (mobile) {
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  } else {
    await steps.nth(0).click();
  }
  await expect(page.locator('[data-step-panel="1"]')).toBeVisible();
  await expect(steps.nth(1)).toBeEnabled();
  await expect(steps.nth(2)).toBeDisabled();
});

test('room and service prices state their basis and catering packages use clear selection semantics', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'webkit-mobile';
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await fillSchedule(page);
  await next(page);

  await expect(page.locator('[data-step-panel="2"] .option-card .price').first()).toContainText('pro Anfrage');
  await chooseRoom(page);
  await next(page);
  await expect(page.locator('[data-step-panel="3"] .option-card .price').first()).toContainText('pro Anfrage');
  await next(page);

  await page.locator('input[name="cateringMode"][value="PACKAGE"]').check();
  await expect(page.locator('.package-grid button[aria-pressed="false"]').first()).toHaveText('Auswählen');
  await expect(page.locator('.package-grid h3').first()).toContainText('Basis');
  await expect(page.getByRole('button', { name: 'Servicepersonal hinzufügen' })).toBeVisible();

  if (mobile) {
    await expect(page.locator('.ux-package-groups')).toBeVisible();
    await expect(page.locator('.package-grid .option-card:visible')).toHaveCount(3);
    await page.locator('.ux-package-groups').getByRole('button', { name: 'Mittagessen' }).click();
    await expect(page.locator('.package-grid .option-card:visible')).toHaveCount(3);
    await expect(page.locator('.package-grid .option-card:visible h3').first()).toContainText('Mittagessen');
  } else {
    await expect(page.locator('.ux-package-groups')).toBeHidden();
    await expect(page.locator('.package-grid .option-card:visible')).toHaveCount(12);
  }

  await page.getByRole('button', { name: 'Servicepersonal hinzufügen' }).click();
  await expect(page.locator('[data-step-panel="4"]')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  const serviceCard = page.locator('[data-step-panel="3"] .option-card').filter({ hasText: 'Servicepersonal' });
  await expect(serviceCard.locator('button[aria-pressed="true"]')).toHaveCount(1);
});

test('cost guidance is explicit and review sections can be edited directly', async ({ page }) => {
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await fillSchedule(page);
  await next(page);
  await chooseRoom(page);
  await next(page);
  await next(page);
  await next(page);

  await expect(page.locator('[data-step-panel="5"]')).toBeVisible();
  await expect(page.locator('[data-ux-cost-calculation]')).toContainText('Raum- und Servicepreise werden einmal je Anfrage angesetzt');
  await expect(page.locator('[data-ux-cost-center-help]')).toContainText('Falls Sie sie nicht kennen');
  await expect(page.locator('#allocation-cost-center-0')).toHaveAttribute('placeholder', 'z. B. 471100');
  await expect(page.locator('#allocation-cost-center-0')).toHaveAttribute('aria-describedby', /uxCostCenterHelp/);

  await page.locator('#allocation-cost-center-0').fill('471100');
  await next(page);
  await expect(page.locator('[data-step-panel="6"]')).toBeVisible();
  await expect(page.locator('.ux-review-edit')).toHaveCount(5);

  const scheduleCard = page.locator('.review-card').filter({ has: page.getByRole('heading', { name: 'Termin' }) });
  await scheduleCard.getByRole('button', { name: 'Termin ändern' }).click();
  await expect(page.locator('[data-step-panel="1"]')).toBeVisible();
  await expect(page.locator('#title')).toHaveValue('UX Regression Workshop');
});

test('successful submission receives a persistent completion state without changing the request workflow', async ({ page }) => {
  await reachCatering(page);
  await next(page);
  await expect(page.locator('[data-step-panel="5"]')).toBeVisible();
  await page.locator('#allocation-cost-center-0').fill('471100');
  await next(page);
  await expect(page.locator('[data-step-panel="6"]')).toBeVisible();
  await page.getByRole('button', { name: 'Anfrage absenden' }).click();

  await expect(page.locator('[data-ux-submission-success]')).toBeVisible();
  await expect(page.locator('[data-ux-submission-success]')).toContainText('Anfrage erfolgreich gesendet');
  await expect(page.locator('[data-ux-submission-success]')).toContainText('vorläufig reserviert');
  await expect(page.locator('.request-card').filter({ hasText: 'UX Regression Workshop' })).toBeVisible();
  await expect(page.locator('.request-card').filter({ hasText: 'UX Regression Workshop' })).toContainText('Zur Prüfung');
});

test('desktop and mobile receive the intended responsive request experience', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'webkit-mobile';

  if (mobile) {
    await expect(page.locator('.topbar p')).toBeHidden();
  } else {
    await expect(page.locator('.topbar p')).toBeVisible();
  }

  await page.locator('#primaryNavigation button[data-view="employee"]').click();

  const order = await page.evaluate(() => Object.fromEntries(
    ['date', 'start', 'end', 'internalParticipants', 'externalParticipants'].map((id) => {
      const field = document.getElementById(id)?.closest('.field');
      return [id, field ? getComputedStyle(field).order : ''];
    }),
  ));
  expect(order).toEqual({ date: '3', start: '4', end: '5', internalParticipants: '6', externalParticipants: '7' });

  if (mobile) {
    await expect(page.locator('.ux-mobile-progress')).toBeVisible();
    await expect(page.locator('.stepper ol')).toBeHidden();
    const positions = {};
    for (const id of ['date', 'start', 'end', 'internalParticipants', 'externalParticipants']) {
      positions[id] = (await page.locator(`#${id}`).boundingBox())?.y ?? 0;
    }
    expect(positions.start).toBeGreaterThan(positions.date);
    expect(positions.end).toBeGreaterThan(positions.start);
    expect(positions.internalParticipants).toBeGreaterThan(positions.end);
    expect(positions.externalParticipants).toBeGreaterThan(positions.internalParticipants);
  } else {
    await expect(page.locator('.ux-mobile-progress')).toBeHidden();
    await expect(page.locator('.stepper ol')).toBeVisible();
  }

  await expect(page.locator('.wizard-card')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-employee-ux-build', '2026.08.23.02');
});
