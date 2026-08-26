import { expect, test } from '@playwright/test';

async function selectTenantAdmin(page) {
  await page.goto('/');
  const reload = page.waitForEvent('load');
  await page.locator('#demoRoleSwitch').selectOption('tenant_admin');
  await reload;
  await page.locator('#primaryNavigation button[data-view="tenantAdmin"]').click();
  await expect(page.locator('#viewTitle')).toBeFocused();
}

test('guided Tenant Admin onboarding completes seven explicit Demo steps without browser-authoritative activation', async ({ page }) => {
  await selectTenantAdmin(page);

  const onboarding = page.locator('[data-tenant-onboarding]');
  await expect(onboarding).toBeVisible();
  await expect(onboarding.getByText('Demo: Dieser Ablauf simuliert Microsoft 365 lokal.')).toBeVisible();
  await expect(onboarding.locator('.onboarding-progress > li')).toHaveCount(7);
  expect(await onboarding.locator('.onboarding-check-row').evaluateAll((rows) => (
    rows.every((row) => row.parentElement?.tagName === 'UL')
  ))).toBe(true);
  await expect(onboarding.locator('[data-onboarding-step="organization"]')).toContainText('Abgeschlossen');
  await expect(onboarding.locator('[data-onboarding-step="connection"]')).toHaveAttribute('aria-current', 'step');
  await expect(onboarding.getByText(/Place\.Read\.All.*Places-Lesezugriff/)).toBeVisible();
  await expect(onboarding.getByText(/Kalender-Schreibzugriff ist für das Pilot-Onboarding optional/)).toBeVisible();

  await onboarding.getByRole('button', { name: 'Microsoft 365 verbinden' }).click();
  await expect(onboarding.getByRole('button', { name: 'Microsoft 365 trennen' })).toBeVisible();
  await expect(onboarding.getByRole('heading', { name: 'Berechtigungen prüfen' })).toBeFocused();
  await expect(onboarding.locator('[data-onboarding-step="connection"]')).toContainText('Abgeschlossen');
  await expect(onboarding.locator('[data-onboarding-step="verification"]')).toHaveAttribute('aria-current', 'step');

  await onboarding.getByRole('button', { name: 'Verbindung und Berechtigungen prüfen' }).click();
  await expect(onboarding.getByRole('heading', { name: 'Microsoft-365-Räume entdecken' })).toBeFocused();
  await expect(onboarding.locator('[data-onboarding-step="verification"]')).toContainText('Abgeschlossen');
  await expect(onboarding.locator('[data-onboarding-step="discovery"]')).toHaveAttribute('aria-current', 'step');
  await expect(onboarding.locator('[data-onboarding-step="availability"]')).not.toContainText('Abgeschlossen');

  await onboarding.getByRole('button', { name: 'Räume aus Microsoft 365 laden' }).click();
  await expect(onboarding.getByRole('heading', { name: 'Räume auswählen und importieren' })).toBeFocused();
  await expect(onboarding.locator('[data-onboarding-step="discovery"]')).toContainText('Abgeschlossen');
  await expect(onboarding.locator('[data-onboarding-step="import"]')).toHaveAttribute('aria-current', 'step');
  await expect(onboarding.getByText('3 Räume gefunden.')).toBeVisible();
  const roomControlIds = await onboarding.locator('.onboarding-room-option input').evaluateAll((controls) => (
    controls.map((control) => control.id)
  ));
  expect(new Set(roomControlIds).size).toBe(roomControlIds.length);
  expect(roomControlIds.every(Boolean)).toBe(true);
  const site = onboarding.getByLabel('Lokaler Standort');
  await site.selectOption('');
  await onboarding.getByRole('button', { name: 'Ausgewählte Räume importieren' }).click();
  await expect(site).toHaveAttribute('aria-invalid', 'true');
  await expect(site).toHaveAttribute('aria-describedby', 'onboarding-import-message');
  await expect(site).toBeFocused();

  await site.selectOption('berlin');
  const roomCheckboxes = onboarding.locator('.onboarding-room-option input[type="checkbox"]');
  for (const checkbox of await roomCheckboxes.all()) await checkbox.uncheck();
  await onboarding.getByRole('button', { name: 'Ausgewählte Räume importieren' }).click();
  await expect(onboarding.locator('.onboarding-room-list')).toHaveAttribute('aria-invalid', 'true');
  await expect(roomCheckboxes.first()).toBeFocused();

  for (const checkbox of await roomCheckboxes.all()) await checkbox.check();
  const firstCapacity = onboarding.locator('.onboarding-room-option input[type="number"]').first();
  await firstCapacity.fill('0');
  await onboarding.getByRole('button', { name: 'Ausgewählte Räume importieren' }).click();
  await expect(firstCapacity).toHaveAttribute('aria-invalid', 'true');
  await expect(firstCapacity).toHaveAttribute('aria-describedby', 'onboarding-import-message');
  await expect(firstCapacity).toBeFocused();
  await expect(onboarding.getByText(/ganze lokale Kapazität zwischen 1 und 100.000/)).toBeVisible();
  await firstCapacity.fill('8');
  await expect(onboarding.locator('.onboarding-room-option input[type="checkbox"]:checked')).toHaveCount(3);
  await onboarding.getByRole('button', { name: 'Ausgewählte Räume importieren' }).click();
  await expect(onboarding.getByRole('heading', { name: 'Kalenderverfügbarkeit bestätigen' })).toBeFocused();

  await expect(onboarding.locator('[data-onboarding-step="import"]')).toContainText('Abgeschlossen');
  await expect(onboarding.locator('[data-onboarding-step="availability"]')).toHaveAttribute('aria-current', 'step');
  await expect(onboarding.locator('[data-onboarding-step="review"]')).toContainText('Noch nicht bereit');
  await onboarding.getByRole('button', { name: 'Kalenderverfügbarkeit prüfen' }).click();
  await expect(onboarding.getByRole('heading', { name: 'Setup prüfen' })).toBeFocused();

  await expect(onboarding.locator('[data-onboarding-step="availability"]')).toContainText('Abgeschlossen');
  await expect(onboarding.locator('[data-onboarding-step="review"]')).toHaveAttribute('aria-current', 'step');
  await expect(onboarding.locator('[data-onboarding-step="review"]')).toContainText('Bereit für die Pilot-Aktivierung');
  await expect(onboarding.getByText('Die finale Aktivierung erfolgt getrennt durch den SaaS-Betreiber.')).toBeVisible();
  await expect(onboarding.getByRole('button', { name: /aktiv/i })).toHaveCount(0);
});

test('guided onboarding remains keyboard reachable and reflows on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await selectTenantAdmin(page);
  const onboarding = page.locator('[data-tenant-onboarding]');

  await expect(onboarding).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const connect = onboarding.getByRole('button', { name: 'Microsoft 365 verbinden' });
  await connect.focus();
  await expect(connect).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(onboarding.locator('[data-onboarding-step="verification"]')).toHaveAttribute('aria-current', 'step');
});

test('Demo free-busy step cannot be skipped by connection verification alone', async ({ page }) => {
  await selectTenantAdmin(page);
  const onboarding = page.locator('[data-tenant-onboarding]');
  await onboarding.getByRole('button', { name: 'Microsoft 365 verbinden' }).click();
  await onboarding.getByRole('button', { name: 'Verbindung und Berechtigungen prüfen' }).click();
  await expect(onboarding.locator('[data-onboarding-step="availability"]')).toContainText('Offen');
  await expect(onboarding.locator('[data-onboarding-step="review"]')).toContainText('Noch nicht bereit');
});

test('guided onboarding exposes disconnect and resets connection-dependent readiness', async ({ page }) => {
  await selectTenantAdmin(page);
  const onboarding = page.locator('[data-tenant-onboarding]');
  await onboarding.getByRole('button', { name: 'Microsoft 365 verbinden' }).click();
  await onboarding.getByRole('button', { name: 'Verbindung und Berechtigungen prüfen' }).click();

  await onboarding.getByRole('button', { name: 'Microsoft 365 trennen' }).click();

  await expect(onboarding.getByRole('button', { name: 'Microsoft 365 verbinden' })).toBeVisible();
  await expect(onboarding.getByRole('heading', { name: 'Microsoft 365 verbinden' })).toBeFocused();
  await expect(onboarding.locator('[data-onboarding-step="connection"]')).toContainText('Offen');
  await expect(onboarding.locator('[data-onboarding-step="verification"]')).toContainText('Offen');
  await expect(onboarding.locator('[data-onboarding-step="availability"]')).toContainText('Offen');
});
