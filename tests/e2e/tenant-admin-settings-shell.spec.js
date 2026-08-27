import { expect, test } from '@playwright/test';

async function startAsTenantAdmin(page) {
  await page.addInitScript(() => {
    localStorage.setItem('conference_demo_role_v1', 'tenant_admin');
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-build', /\S+/);
  await expect(page.locator('#demoRoleSwitch')).toHaveValue('tenant_admin');
  await expect(page.locator('#primaryNavigation button[data-view="tenantAdmin"]')).toHaveCount(1);
}

test('Tenant Admin shell provides authorized direct navigation, keyboard focus and responsive sections', async ({ page }) => {
  await startAsTenantAdmin(page);

  await page.locator('#primaryNavigation button[data-view="tenantAdmin"]').click();
  await expect(page.locator('[data-tenant-admin-shell]')).toBeVisible();
  await expect(page.locator('[data-tenant-admin-section-content="overview"] h2')).toHaveText('Übersicht');
  await expect(page.locator('[data-tenant-admin-section="users"]')).toHaveCount(1);
  await expect(page.locator('[data-tenant-admin-section="microsoft365"]')).toHaveCount(1);
  await expect(page.locator('[data-tenant-admin-section="organization"]')).toHaveCount(0);

  await page.locator('[data-tenant-admin-section="users"]').click();
  await expect(page).toHaveURL(/#tenant-admin\/users$/);
  const usersHeading = page.locator('[data-tenant-admin-section-content="users"] h2');
  await expect(usersHeading).toHaveText('Benutzer & Rollen');
  await expect(usersHeading).toBeFocused();

  await page.reload();
  await expect(page.locator('[data-tenant-admin-section-content="users"]')).toBeVisible();
  await expect(page.locator('[data-tenant-admin-section-content="users"] h2')).toHaveText('Benutzer & Rollen');

  const employeeCard = page.locator('[data-tenant-user-id="demo-employee"]');
  await expect(employeeCard).toBeVisible();
  await employeeCard.locator('#tenant-user-manager-demo-employee').check();
  await employeeCard.locator('[data-tenant-role-action="save"]').click();
  await expect(employeeCard).toBeFocused();

  await page.locator('[data-tenant-admin-section="microsoft365"]').focus();
  await page.keyboard.press('Enter');
  await expect(
    page.locator('[data-tenant-admin-section-content="microsoft365"]')
      .getByRole('heading', { name: 'Microsoft 365', exact: true, level: 2 }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const shellBox = await page.locator('[data-tenant-admin-shell]').boundingBox();
  expect(shellBox?.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#primaryNavigation button[data-view="welcome"]').click();
  await expect(page.locator('#primaryNavigation button[data-view="welcome"]')).toHaveAttribute('aria-current', 'page');
  await expect(page).not.toHaveURL(/#tenant-admin(?:\/|$)/);
  await expect(page.locator('[data-tenant-admin-shell]')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('#primaryNavigation button[data-view="welcome"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-tenant-admin-shell]')).toHaveCount(0);
});

test('Unauthorized Tenant Admin deep links are cleared without exposing the settings shell', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('conference_demo_role_v1', 'employee');
  });
  await page.goto('/#tenant-admin/users');

  await expect(page.locator('html')).toHaveAttribute('data-app-build', /\S+/);
  await expect(page.locator('#demoRoleSwitch')).toHaveValue('employee');
  await expect(page.locator('#primaryNavigation button[data-view="tenantAdmin"]')).toHaveCount(0);
  await expect(page.locator('#primaryNavigation button[data-view="welcome"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-tenant-admin-shell]')).toHaveCount(0);
  await expect(page).not.toHaveURL(/#tenant-admin(?:\/|$)/);
});

test('asynchronous settings navigation focuses the final section heading', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const [{ createTenantAdminSettingsShell }, { defineTenantAdminSection }, { renderSectionLoading }] = await Promise.all([
      import('/src/tenant-admin/settings-shell.js'),
      import('/src/tenant-admin/section-contract.js'),
      import('/src/tenant-admin/section-presentation.js'),
    ]);
    const appRoot = document.createElement('div');
    document.body.appendChild(appRoot);
    const location = { hash: '#tenant-admin/overview' };
    const history = {
      replaceState(_state, _title, hash) {
        location.hash = hash;
      },
    };
    let finishLoading;
    const loading = new Promise((resolve) => { finishLoading = resolve; });
    const section = defineTenantAdminSection({
      id: 'organization',
      titleKey: 'tenantAdmin.organization.title',
      descriptionKey: 'tenantAdmin.organization.description',
      permission: 'tenant:configure',
      available: true,
      async render({ root }) {
        renderSectionLoading(root, 'tenantAdmin.organization.title');
        await loading;
        const heading = document.createElement('h2');
        heading.tabIndex = -1;
        heading.textContent = 'Loaded organization';
        root.replaceChildren(heading);
      },
    });
    const shell = createTenantAdminSettingsShell({
      appRoot,
      setPageHeading() {},
      sections: [section],
      history,
      location,
    });

    shell.render();
    shell.navigate('organization');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const focusedWhileLoading = document.activeElement?.textContent || '';
    finishLoading();
    await loading;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const finalHeading = appRoot.querySelector('[data-tenant-admin-section-content] h2');
    const response = {
      focusedWhileLoading,
      finalText: finalHeading?.textContent || '',
      finalFocused: document.activeElement === finalHeading,
    };
    appRoot.remove();
    return response;
  });

  expect(result.focusedWhileLoading).not.toBe('Organisation');
  expect(result.finalText).toBe('Loaded organization');
  expect(result.finalFocused).toBe(true);
});
