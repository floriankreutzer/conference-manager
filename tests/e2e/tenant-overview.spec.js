import { expect, test } from '@playwright/test';

for (const language of ['de', 'en']) {
  test(`CO-309: setup overview guards unavailable sections and keeps task navigation in ${language}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async (lang) => {
      const { createTenantAdminSettingsShell } = await import('/src/tenant-admin/settings-shell.js');
      const { setLanguage } = await import('/src/core/i18n.js');
      setLanguage(lang);
      window.overviewReads = [];
      const section = (id, available, fails = false) => ({ id, available,
        titleKey: `tenantAdmin.${id}.title`, descriptionKey: `tenantAdmin.${id}.description`,
        async loadOverview() {
          window.overviewReads.push(id);
          if (fails) throw new Error('TEST_UNAVAILABLE');
          return { summary: 'Current configuration', tasks: ['Published guest information missing'] };
        },
        render({ root }) {
          const heading = document.createElement('h2'); heading.tabIndex = -1; heading.textContent = id;
          root.appendChild(heading);
        },
      });
      document.body.replaceChildren(); const root = document.createElement('main'); document.body.appendChild(root);
      const app = createTenantAdminSettingsShell({ appRoot: root, setPageHeading() {},
        sections: [section('locations', true), section('organization', true, true), section('users', false)] });
      app.render();
    }, language);
    await expect(page.locator('.tenant-setup-tasks li')).toHaveCount(2);
    expect(await page.evaluate(() => window.overviewReads)).toEqual(['locations', 'organization']);
    await expect(page.locator('.tenant-setup-summaries')).toContainText(language === 'de' ? 'Status derzeit nicht verfügbar.' : 'Status currently unavailable.');
    await expect(page.locator('.tenant-setup-tasks')).not.toContainText('TEST_UNAVAILABLE');
    const task = page.locator('.tenant-setup-tasks button').first();
    await task.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('h2')).toHaveText('locations');
    await expect(page.locator('h2')).toBeFocused();
    await page.locator('[data-tenant-admin-section="overview"]').click();
    await expect(page.locator('.tenant-setup-tasks li')).toHaveCount(2);
    for (const width of [390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
