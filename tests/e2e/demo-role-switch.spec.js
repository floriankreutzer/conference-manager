import { expect, test } from '@playwright/test';

const selectDemoRole = async (page, role) => {
  const reloadPromise = page.waitForEvent('load');
  await page.locator('#demoRoleSwitch').selectOption(role);
  await reloadPromise;
  await expect(page.locator('#demoRoleSwitch')).toHaveValue(role);
};

test('demo role switch lives in the demo panel and no longer in the profile controls', async ({ page }) => {
  await page.goto('/');

  const demoPanel = page.locator('[data-demo-security]');
  const roleSwitch = demoPanel.locator('#demoRoleSwitch');
  await expect(demoPanel).toBeVisible();
  await expect(demoPanel).toHaveAttribute('data-demo-role-switch', '2026.08.23.55');
  await expect(roleSwitch).toBeVisible();
  await expect(roleSwitch).toHaveValue('employee');

  await page.locator('#primaryNavigation button[aria-haspopup="dialog"]').click();
  await expect(page.locator('dialog')).toBeVisible();
  await expect(page.locator('#profileRole')).toBeHidden();
  await page.locator('dialog button.primary').click();

  await selectDemoRole(page, 'manager');
  expect(await page.evaluate(() => localStorage.getItem('conference_demo_role_v1'))).toBe('manager');
  await expect(page.locator('#primaryNavigation button[data-view="manager"]')).toHaveCount(1);

  await selectDemoRole(page, 'employee');
  expect(await page.evaluate(() => localStorage.getItem('conference_demo_role_v1'))).toBe('employee');
  await expect(page.locator('#primaryNavigation button[data-view="manager"]')).toHaveCount(0);
});

test('production runtime exposes no demo role switch', async ({ page }) => {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      response,
      body: body.replace(
        '<meta name="conference-runtime" content="demo">',
        '<meta name="conference-runtime" content="production">',
      ),
    });
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-runtime-mode', 'production');
  await expect(page.locator('#demoRoleSwitch')).toHaveCount(0);
  await expect(page.locator('[data-demo-security]')).toHaveCount(0);
});
