import { expect, test } from '@playwright/test';

test('document shell uses semantic landmarks and unique identifiers', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', /^(de|en)$/);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('aside')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('nav')).not.toHaveCount(0);
  await expect(page.locator('[onclick], [onerror], [onload], [style]')).toHaveCount(0);

  const duplicateIds = await page.evaluate(() => {
    const counts = new Map();
    for (const element of document.querySelectorAll('[id]')) {
      counts.set(element.id, (counts.get(element.id) || 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  });
  expect(duplicateIds).toEqual([]);
});

test('request form controls expose accessible names and native input constraints', async ({ page }) => {
  await page.goto('/');
  await page.locator('#primaryNavigation button[data-view="employee"]').click();

  const controls = page.locator('#app input:visible, #app select:visible, #app textarea:visible, #app button:visible');
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await expect(controls.nth(index)).toHaveAccessibleName(/\S/);
  }

  await expect(page.locator('#internalParticipants')).toHaveAttribute('min', '0');
  await expect(page.locator('#internalParticipants')).toHaveAttribute('max', '500');
  await expect(page.locator('#externalParticipants')).toHaveAttribute('min', '0');
  await expect(page.locator('#externalParticipants')).toHaveAttribute('max', '500');
});

test('validation exposes invalid state and an assertive announcement', async ({ page }) => {
  await page.goto('/');
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await page.locator('#app button').filter({ hasText: /Weiter|Next/ }).first().click();

  await expect(page.locator('#title')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#alertRegion')).not.toHaveText('');
  await expect(page.locator('#title')).toBeFocused();
});
