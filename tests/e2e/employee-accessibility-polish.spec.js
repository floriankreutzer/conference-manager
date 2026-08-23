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

test('schedule DOM and sequential focus order match the visible What Where When Who order', async ({ page }) => {
  await page.locator('#primaryNavigation button[data-view="employee"]').click();

  const result = await page.locator('[data-step-panel="1"] .form-grid.two').evaluate((grid) => {
    const children = [...grid.children];
    return {
      order: children.map((child) => child.querySelector('input,select,textarea')?.id || (child.classList.contains('participant-total') ? 'participantTotal' : '')),
      controls: children
        .map((child) => child.querySelector('input,select,textarea'))
        .filter(Boolean)
        .map((control) => ({ id: control.id, tabIndex: control.tabIndex })),
    };
  });

  expect(result.order).toEqual(['title', 'location', 'date', 'start', 'end', 'internalParticipants', 'externalParticipants', 'participantTotal']);
  expect(result.controls.map(({ id }) => id)).toEqual(['title', 'location', 'date', 'start', 'end', 'internalParticipants', 'externalParticipants']);
  expect(result.controls.every(({ tabIndex }) => tabIndex === 0)).toBe(true);
  await expect(page.locator('[data-step-panel="1"] .form-grid.two')).toHaveAttribute('data-ux-dom-order', 'what-where-when-who');
});

test('participant total updates live and the UI reflects the existing combined participant rule', async ({ page }) => {
  await page.locator('#primaryNavigation button[data-view="employee"]').click();

  const internal = page.locator('#internalParticipants');
  const external = page.locator('#externalParticipants');
  const total = page.locator('.participant-total strong');

  await expect(internal).not.toHaveAttribute('required', '');
  await expect(external).not.toHaveAttribute('required', '');
  await expect(internal.closest('.field').locator('.field-label')).toHaveText('Interne Teilnehmende');
  await expect(external.closest('.field').locator('.field-label')).toHaveText('Externe Teilnehmende');
  await expect(page.locator('#uxParticipantRule')).toContainText('mindestens eine Person');
  await expect(internal).toHaveAttribute('aria-describedby', /uxParticipantRule/);
  await expect(external).toHaveAttribute('aria-describedby', /uxParticipantRule/);

  await internal.fill('8');
  await expect(total).toHaveText('8');
  await external.fill('2');
  await expect(total).toHaveText('10');
  await internal.fill('');
  await expect(total).toHaveText('2');

  await page.locator('#title').fill('External Participants Workshop');
  await page.locator('#location').selectOption('Berlin');
  await page.locator('#date').fill(futureIsoDate());
  await page.locator('#start').fill('09:00');
  await page.locator('#end').fill('11:00');
  await external.fill('4');
  await expect(total).toHaveText('4');
  await next(page);
  await expect(page.locator('[data-step-panel="2"]')).toBeVisible();
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

test('employee terminology stays consistent across the complete request journey', async ({ page }) => {
  await expect(page.locator('.how-list li').nth(1)).toContainText('Zusatzleistungen, Bewirtung und Einzeloptionen ergänzen.');

  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await expect(page.locator('.topbar p')).toHaveText('Raum, Zusatzleistungen und Bewirtung in einer Anfrage.');
  await expect(page.locator('#specialRequirements').closest('.field').locator('.field-hint')).toContainText('Raum, Zusatzleistungen oder Bewirtung');

  const steps = page.locator('.stepper .step');
  await expect(steps.nth(2)).toContainText('Zusatzleistungen');

  await fillSchedule(page);
  await next(page);
  await expect(page.locator('[data-step-panel="2"] .recommendation').first()).toHaveText('Empfohlen – passend für Ihre Teilnehmerzahl');
  await chooseRoom(page);
  await next(page);

  const servicesPanel = page.locator('[data-step-panel="3"]');
  await expect(servicesPanel.locator('.section-heading h2')).toHaveText('Zusatzleistungen (optional)');
  await expect(servicesPanel.locator('.section-heading p')).toHaveText('Sie wählen nur die benötigte Leistung aus. Das Conference Management teilt anschließend die passende Person zu.');
  await expect(servicesPanel.locator('.selection-grid')).toHaveAttribute('aria-label', 'Zusatzleistungen auswählen');

  await next(page);
  await page.locator('input[name="cateringMode"][value="PACKAGE"]').check();
  await expect(page.locator('#cateringParticipants').closest('.field').locator('.field-label')).toHaveText('Bewirtung für wie viele Personen?');
  await expect(page.locator('[data-step-panel="4"] .mode-selector')).toHaveAttribute('aria-label', 'Bewirtung auswählen');

  await next(page);
  const costLabels = page.locator('[data-step-panel="5"] .cost-summary article span');
  await expect(costLabels).toContainText(['Raum', 'Zusatzleistungen', 'Bewirtung', 'Voraussichtlicher Gesamtbetrag']);

  await page.locator('#allocation-cost-center-0').fill('471100');
  await next(page);
  await expect(page.getByRole('heading', { name: 'Zusatzleistungen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bewirtungsdetails' })).toBeVisible();
  await expect(page.locator('[data-step-panel="6"] .info-box li').nth(1)).toHaveText('Das Conference Management prüft Raum, Zusatzleistungen, Bewirtung und Kosten.');
  await expect(page.locator('html')).toHaveAttribute('data-employee-accessibility-build', '2026.08.23.04');
});
