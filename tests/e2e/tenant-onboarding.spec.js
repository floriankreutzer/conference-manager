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
  await expect(onboarding.locator('[data-onboarding-step="organization"]')).toContainText('Abgeschlossen');
  await expect(onboarding.locator('[data-onboarding-step="connection"]')).toHaveAttribute('aria-current', 'step');

  await onboarding.getByRole('button', { name: 'Microsoft 365 verbinden' }).click();
  await expect(onboarding.locator('[data-onboarding-step="connection"]')).toContainText('Abgeschlossen');
  await expect(onboarding.locator('[data-onboarding-step="verification"]')).toHaveAttribute('aria-current', 'step');

  await onboarding.getByRole('button', { name: 'Verbindung und Berechtigungen prüfen' }).click();
  await expect(onboarding.locator('[data-onboarding-step="verification"]')).toContainText('Abgeschlossen');
  await expect(onboarding.locator('[data-onboarding-step="discovery"]')).toHaveAttribute('aria-current', 'step');
  await expect(onboarding.locator('[data-onboarding-step="availability"]')).not.toContainText('Abgeschlossen');

  await onboarding.getByRole('button', { name: 'Räume aus Microsoft 365 laden' }).click();
  await expect(onboarding.locator('[data-onboarding-step="discovery"]')).toContainText('Abgeschlossen');
  await expect(onboarding.locator('[data-onboarding-step="import"]')).toHaveAttribute('aria-current', 'step');
  await expect(onboarding.getByText('3 Räume gefunden.')).toBeVisible();
  await onboarding.getByLabel('Lokaler Standort').selectOption('berlin');
  await expect(onboarding.locator('.onboarding-room-option input[type="checkbox"]:checked')).toHaveCount(3);
  await onboarding.getByRole('button', { name: 'Ausgewählte Räume importieren' }).click();

  await expect(onboarding.locator('[data-onboarding-step="import"]')).toContainText('Abgeschlossen');
  await expect(onboarding.locator('[data-onboarding-step="availability"]')).toHaveAttribute('aria-current', 'step');
  await expect(onboarding.locator('[data-onboarding-step="review"]')).toContainText('Noch nicht bereit');
  await onboarding.getByRole('button', { name: 'Kalenderverfügbarkeit prüfen' }).click();

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
