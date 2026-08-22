import { expect, test } from '@playwright/test';

const futureIsoDate = (days = 30) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const openProfile = async (page) => {
  await page.locator('#primaryNavigation button[aria-haspopup="dialog"]').click();
  await expect(page.locator('dialog')).toBeVisible();
};

const setRole = async (page, role) => {
  await openProfile(page);
  await page.locator('#profileRole').selectOption(role);
};

const setLanguage = async (page, language) => {
  await openProfile(page);
  await page.locator('#profileLanguage').selectOption(language);
};

const clickWizardPrimary = async (page) => {
  await page.locator('.wizard-actions button.primary').click();
};

const fillSchedule = async (page, {
  title = 'E2E Workshop',
  location = 'Berlin',
  date = futureIsoDate(),
  internalParticipants = 10,
  externalParticipants = 2,
  start = '10:00',
  end = '12:00',
} = {}) => {
  await page.locator('#title').fill(title);
  await page.locator('#location').selectOption(location);
  await page.locator('#date').fill(date);
  await page.locator('#internalParticipants').fill(String(internalParticipants));
  await page.locator('#externalParticipants').fill(String(externalParticipants));
  await page.locator('#start').fill(start);
  await page.locator('#end').fill(end);
};

const chooseFirstAvailableRoom = async (page) => {
  const roomButton = page.locator('#rooms .option-card:not(.disabled) button[aria-pressed]').first();
  await expect(roomButton).toBeVisible();
  await roomButton.click();
  await expect(page.locator('#rooms .option-card.selected:not(.disabled)')).toHaveCount(1);
};

const createRequest = async (page, { title = 'E2E Workshop', date = futureIsoDate() } = {}) => {
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await fillSchedule(page, { title, date });
  await clickWizardPrimary(page);
  await chooseFirstAvailableRoom(page);
  await clickWizardPrimary(page);
  await clickWizardPrimary(page);
  await clickWizardPrimary(page);
  await page.locator('#allocation-cost-center-0').fill('CC-E2E-100');
  await clickWizardPrimary(page);
  await expect(page.locator('[data-step-panel="6"]')).toBeVisible();
  await clickWizardPrimary(page);
  const card = page.locator('.request-card').filter({ hasText: title }).first();
  await expect(card).toBeVisible();
  return card;
};

const switchToManager = async (page) => {
  await setRole(page, 'manager');
  const managerNav = page.locator('#primaryNavigation button[data-view="manager"]');
  await expect(managerNav).toBeVisible();
  await managerNav.click();
};

const switchToEmployeeRequests = async (page) => {
  await setRole(page, 'employee');
  await expect(page.locator('#primaryNavigation button[data-view="manager"]')).toHaveCount(0);
  await page.locator('#primaryNavigation button[data-view="requests"]').click();
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});

test('first employee visit, profile, help and English accessibility are coherent', async ({ page }) => {
  await expect(page.locator('#primaryNavigation button[data-view="manager"]')).toHaveCount(0);
  await expect(page.locator('#primaryNavigation')).not.toContainText('Hilfe & Kontakt');
  await expect(page.locator('#skipLink')).toHaveText('Direkt zum Hauptinhalt');

  await openProfile(page);
  await expect(page.locator('#profileRole')).toHaveValue('employee');
  await expect(page.locator('#profileLanguage')).toHaveValue('de');
  await page.getByRole('button', { name: 'Hilfe & Kontakt' }).click();
  await expect(page.locator('dialog')).toBeVisible();
  await expect(page.locator('label[for="helpMessage"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);

  await setLanguage(page, 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#skipLink')).toHaveText('Skip to main content');
  await expect(page.locator('#primaryNavigation button[data-view="employee"]')).toHaveText('New request');

  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await clickWizardPrimary(page);
  await expect(page.locator('.validation-summary')).toContainText('Please enter a title.');
  await expect(page.locator('#title')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#title')).toBeFocused();
});

test('German happy path submits and manager confirms a request; guest dialog restores focus', async ({ page }) => {
  const title = 'Happy Path Workshop';
  await createRequest(page, { title });
  await expect(page.locator('.request-card').filter({ hasText: title }).locator('.status-badge')).toHaveText('Zur Prüfung');

  await switchToManager(page);
  const managerCard = page.locator('.request-card').filter({ hasText: title }).first();
  await managerCard.locator('.request-actions button.primary').click();
  await expect(managerCard.locator('.status-badge')).toHaveText('Bestätigt');

  await switchToEmployeeRequests(page);
  const employeeCard = page.locator('.request-card').filter({ hasText: title }).first();
  await expect(employeeCard.locator('.status-badge')).toHaveText('Bestätigt');
  const guestButton = employeeCard.getByRole('button', { name: 'Gästeinformationen' });
  await guestButton.click();
  await expect(page.locator('dialog')).toContainText('Guest-WiFi');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(guestButton).toBeFocused();
});

test('negative paths block invalid schedule, unavailable capacity and invalid allocations before review', async ({ page }) => {
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await clickWizardPrimary(page);
  await expect(page.locator('.validation-summary')).toBeVisible();

  await fillSchedule(page, { title: 'Capacity Test', internalParticipants: 100, externalParticipants: 0 });
  await clickWizardPrimary(page);
  await expect(page.locator('#rooms .recovery-card')).toContainText('Kein Raum bietet ausreichend Kapazität');

  await page.locator('#rooms .recovery-card button').first().click();
  await page.locator('#internalParticipants').fill('10');
  await clickWizardPrimary(page);
  await chooseFirstAvailableRoom(page);
  await clickWizardPrimary(page);
  await clickWizardPrimary(page);
  await clickWizardPrimary(page);

  await page.locator('#allocation-cost-center-0').fill('CC-A');
  await page.locator('#allocation-percent-0').fill('-20');
  await page.getByRole('button', { name: 'Kostenstelle hinzufügen' }).click();
  await page.locator('#allocation-cost-center-1').fill('CC-B');
  await page.locator('#allocation-percent-1').fill('120');
  await clickWizardPrimary(page);
  await expect(page.locator('.validation-summary')).toContainText('Jeder Kostenanteil muss zwischen 0 % und 100 % liegen.');
  await expect(page.locator('[data-step-panel="5"]')).toBeVisible();
});

test('all suitable rooms occupied produces deterministic recovery instead of a dead end', async ({ page }) => {
  const date = futureIsoDate(45);
  await page.evaluate(({ dateValue }) => {
    const occupied = ['BER-321', 'BER-412', 'BER-AUD'].map((roomId, index) => ({
      id: `CR-BUSY-${index}`,
      title: `Busy ${index}`,
      location: 'Berlin',
      date: dateValue,
      start: '10:00',
      end: '12:00',
      roomId,
      status: 'Confirmed',
      calendarStatus: 'Busy',
      internalParticipants: 1,
      externalParticipants: 0,
      participants: 1,
      allocations: [{ costCenter: 'CC', percent: 100 }],
      statusHistory: [],
    }));
    localStorage.setItem('conference_requests', JSON.stringify(occupied));
  }, { dateValue: date });
  await page.reload();
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await fillSchedule(page, { title: 'Busy Room Test', date, internalParticipants: 10, externalParticipants: 0 });
  await clickWizardPrimary(page);
  await expect(page.locator('#rooms .recovery-card')).toContainText('Passende Räume sind im gewählten Zeitraum bereits belegt.');
  await expect(page.locator('#rooms .recovery-card button')).toHaveCount(3);
});

test('change requested can be edited and resubmitted with the existing room without self-conflict', async ({ page }) => {
  const title = 'Change Flow Workshop';
  await createRequest(page, { title });
  await switchToManager(page);
  const managerCard = page.locator('.request-card').filter({ hasText: title }).first();
  await managerCard.locator('.request-actions button.secondary').click();
  await page.locator('#reasonText').fill('Please increase the external participant count.');
  await page.locator('dialog .modal-actions button.primary').click();
  await expect(managerCard.locator('.status-badge')).toHaveText('Änderung angefordert');

  await switchToEmployeeRequests(page);
  const employeeCard = page.locator('.request-card').filter({ hasText: title }).first();
  await employeeCard.locator('.request-actions button.primary').click();
  await expect(page.locator('#title')).toHaveValue(title);
  await page.locator('#externalParticipants').fill('3');
  await clickWizardPrimary(page);
  await expect(page.locator('#rooms .option-card.selected:not(.disabled)')).toHaveCount(1);
  await clickWizardPrimary(page);
  await clickWizardPrimary(page);
  await clickWizardPrimary(page);
  await clickWizardPrimary(page);
  await expect(page.locator('[data-step-panel="6"]')).toBeVisible();
  await clickWizardPrimary(page);
  await expect(page.locator('.request-card').filter({ hasText: title }).locator('.status-badge')).toHaveText('Zur Prüfung');
});

test('rejection reason is shown and the request can be reused as a new request', async ({ page }) => {
  const title = 'Rejected Workshop';
  await createRequest(page, { title });
  await switchToManager(page);
  const managerCard = page.locator('.request-card').filter({ hasText: title }).first();
  await managerCard.locator('.request-actions button.danger').click();
  await page.locator('#reasonText').fill('No suitable operational capacity.');
  await page.locator('dialog .modal-actions button.danger').click();

  await switchToEmployeeRequests(page);
  const employeeCard = page.locator('.request-card').filter({ hasText: title }).first();
  await expect(employeeCard.locator('.status-badge')).toHaveText('Abgelehnt');
  await expect(employeeCard).toContainText('No suitable operational capacity.');
  await employeeCard.locator('.request-actions button.primary').click();
  await expect(page.locator('#title')).toHaveValue(title);
  await expect(page.locator('[data-step-panel="1"]')).toBeVisible();
});

test('cancellation dialog supports Escape, focus restoration, cancellation and repeat', async ({ page }) => {
  const title = 'Cancellation Workshop';
  await createRequest(page, { title });
  const card = page.locator('.request-card').filter({ hasText: title }).first();
  const cancelButton = card.locator('.request-actions button.danger');

  await cancelButton.click();
  await expect(page.locator('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(cancelButton).toBeFocused();

  await cancelButton.click();
  await page.locator('dialog .modal-actions button.danger').click();
  await expect(card.locator('.status-badge')).toHaveText('Storniert');
  await card.locator('.request-actions button.primary').click();
  await expect(page.locator('#title')).toHaveValue(title);
  await expect(page.locator('[data-step-panel="1"]')).toBeVisible();
});

test('English happy path remains fully localized through submission', async ({ page }) => {
  await setLanguage(page, 'en');
  const title = 'English E2E Workshop';
  await createRequest(page, { title });
  const card = page.locator('.request-card').filter({ hasText: title }).first();
  await expect(card.locator('.status-badge')).toHaveText('Pending review');
  await expect(page.locator('#viewTitle')).toHaveText('My requests');
  await expect(page.locator('#skipLink')).toHaveText('Skip to main content');
});
