import { expect, test } from '@playwright/test';

async function startAsTenantAdmin(page) {
  await page.addInitScript(() => {
    localStorage.setItem('conference_demo_role_v1', 'tenant_admin');
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-build', /\S+/);
  await page.locator('#primaryNavigation button[data-view="tenantAdmin"]').click();
  await expect(page.locator('[data-tenant-admin-shell]')).toBeVisible();
}

test('audit history filters are keyboard operable, localized, redacted, and responsive', async ({ page }) => {
  await startAsTenantAdmin(page);
  const navigation = page.locator('[data-tenant-admin-section="audit"]');
  await navigation.focus();
  await page.keyboard.press('Enter');

  const section = page.locator('[data-tenant-admin-section-content="audit"]');
  await expect(section.getByRole('heading', { name: 'Audit & Änderungshistorie' })).toBeFocused();
  await expect(section.locator('[data-tenant-audit-events] .tenant-audit-event')).toHaveCount(4);
  await expect(section).not.toContainText(/providerTenant|resourceAddress|accessToken|HMAC/i);

  const actor = section.locator('#tenant-audit-actor-filter');
  await actor.fill('provider-object-id');
  await actor.press('Enter');
  await expect(section.getByText('Geben Sie eine gültige interne Benutzer-ID ein.')).toBeVisible();
  await expect(actor).toBeFocused();

  await page.getByRole('button', { name: 'Profil' }).click();
  await page.locator('#profileLanguage').selectOption('en');
  await expect(section.getByRole('heading', { name: 'Audit & change history' })).toBeVisible();
  await expect(section.getByText('The complete integrity chain is verified by the server before filtered results are shown.')).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('capability readiness is a server-shaped read-only view with no entitlement controls', async ({ page }) => {
  await startAsTenantAdmin(page);
  await page.locator('[data-tenant-admin-section="capabilities"]').click();
  const section = page.locator('[data-tenant-admin-section-content="capabilities"]');

  await expect(section.locator('[data-tenant-capability-id]')).toHaveCount(6);
  await expect(section.getByText(/schreibgeschützt/)).toBeVisible();
  await expect(section.locator('input, select, textarea, button')).toHaveCount(0);
  await expect(section.locator('[data-tenant-capability-id="microsoft.calendar"]')).toContainText('Eingeschränkt');
  await expect(section.locator('[data-tenant-capability-id="microsoft.calendar.write"]')).toContainText('Nicht gebucht');
  const recovery = section.getByRole('link', { name: 'Microsoft-365-Verbindung verwalten' });
  await expect(recovery).toHaveAttribute('href', '#tenant-admin/microsoft365');
  await recovery.click();
  await expect(page.locator('[data-tenant-admin-section-content="microsoft365"]')).toBeVisible();
  await expect(page.locator('[data-tenant-admin-section="microsoft365"]')).toHaveAttribute('aria-current', 'page');
});

test('Microsoft 365 operational recovery separates readiness and restores focus after refresh and resync', async ({ page }) => {
  await startAsTenantAdmin(page);
  await page.locator('[data-tenant-admin-section="microsoft365"]').click();
  const section = page.locator('[data-tenant-admin-section-content="microsoft365"]');
  const onboarding = section.locator('[data-tenant-onboarding]');
  const operations = section.locator('[data-microsoft365-operations]');

  await expect(operations.locator('[data-microsoft365-health]')).toHaveCount(3);
  await expect(operations.getByText('Verzeichnis, Frei/Gebucht-Lesen und Kalenderschreiben werden getrennt ausgewertet. Eine grüne Lesefunktion gibt keinen Schreibzugriff frei.')).toBeVisible();
  await expect(operations.getByText(/Beim Trennen werden die Verbindung/)).toBeVisible();

  const refresh = operations.locator('[data-microsoft365-refresh]');
  await refresh.focus();
  await page.keyboard.press('Enter');
  await expect(section.locator('[data-microsoft365-refresh]')).toBeFocused();

  await onboarding.getByRole('button', { name: 'Microsoft 365 verbinden' }).click();
  await onboarding.getByRole('button', { name: 'Verbindung und Berechtigungen prüfen' }).click();
  await onboarding.getByRole('button', { name: 'Räume aus Microsoft 365 laden' }).click();
  await onboarding.getByLabel('Lokaler Standort').selectOption('berlin');
  await onboarding.getByRole('button', { name: 'Ausgewählte Räume importieren' }).click();
  await onboarding.getByRole('button', { name: 'Kalenderverfügbarkeit prüfen' }).click();

  await section.locator('[data-microsoft365-refresh]').click();
  const resync = section.locator('[data-microsoft365-resync]');
  await expect(resync).toBeEnabled();
  await resync.focus();
  await page.keyboard.press('Enter');
  await expect(section.locator('[data-microsoft365-resync]')).toBeFocused();
  await expect(section.getByText('3 Zuordnungen wurden synchronisiert.')).toBeVisible();
  await expect(section.getByRole('list', { name: 'Erkannte Abweichungen' }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
