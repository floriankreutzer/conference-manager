import { expect, test } from '@playwright/test';

async function startAsTenantAdmin(page) {
  await page.addInitScript(() => {
    localStorage.setItem('conference_demo_role_v1', 'tenant_admin');
  });
  await page.goto('/');
  await expect(page.locator('#demoRoleSwitch')).toHaveValue('tenant_admin');
  await expect(page.locator('#primaryNavigation button[data-view="tenantAdmin"]')).toHaveCount(1);
}

test('Tenant Admin shell provides authorized direct navigation, keyboard focus and responsive sections', async ({ page }) => {
  await startAsTenantAdmin(page);

  await page.locator('#primaryNavigation button[data-view="tenantAdmin"]').click();
  await expect(page.locator('[data-tenant-admin-shell]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
  await expect(page.locator('[data-tenant-admin-section="users"]')).toHaveCount(1);
  await expect(page.locator('[data-tenant-admin-section="microsoft365"]')).toHaveCount(1);
  await expect(page.locator('[data-tenant-admin-section="organization"]')).toHaveCount(0);

  await page.locator('[data-tenant-admin-section="users"]').click();
  await expect(page).toHaveURL(/#tenant-admin\/users$/);
  await expect(page.getByRole('heading', { name: 'Benutzer & Rollen' })).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-tenant-admin-section-content="users"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Benutzer & Rollen' })).toBeVisible();

  await page.locator('[data-tenant-admin-section="microsoft365"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Microsoft 365' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const shellBox = await page.locator('[data-tenant-admin-shell]').boundingBox();
  expect(shellBox?.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
