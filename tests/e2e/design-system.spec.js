import { expect, test } from '@playwright/test';

const rgb = {
  bordeaux: 'rgb(122, 31, 61)',
  camelSurface: 'rgb(245, 238, 230)',
};

test('central design tokens drive Bordeaux actions and Camel surfaces', async ({ page }) => {
  await page.goto('/');

  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      primary: styles.getPropertyValue('--brand-primary').trim(),
      secondary: styles.getPropertyValue('--brand-secondary').trim(),
      camelSurface: styles.getPropertyValue('--color-surface-camel').trim(),
      radius: styles.getPropertyValue('--radius-xs').trim(),
    };
  });

  expect(tokens.primary).toBe('#7A1F3D');
  expect(tokens.secondary).toBe('#C29A6B');
  expect(tokens.camelSurface).toBe('#F5EEE6');
  expect(tokens.radius).toBe('2px');

  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  const primary = page.locator('.wizard-actions button.primary').first();
  await expect(primary).toBeVisible();
  await expect(primary).toHaveCSS('background-color', rgb.bordeaux);

  const participantSurface = page.locator('.participant-total');
  await expect(participantSurface).toBeVisible();
  await expect(participantSurface).toHaveCSS('background-color', rgb.camelSurface);
});

test('manager dashboard keeps its strong information architecture while using the refined visual system', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('conference_demo_role_v1', 'manager'));
  await page.goto('/');
  await page.locator('#primaryNavigation button[data-view="manager"]').click();

  const overview = page.locator('[data-feature-manager-overview]');
  await expect(overview).toBeVisible();
  await expect(overview.locator('.manager-parity-kpi')).toHaveCount(4);
  await expect(overview.locator('.manager-quick-filters')).toBeVisible();

  const camelKpi = overview.locator('.manager-parity-kpi').nth(1);
  await expect(camelKpi).toHaveCSS('background-color', rgb.camelSurface);

  const activeTab = page.locator('.manager-tabs button[aria-pressed="true"]');
  await expect(activeTab).toHaveCSS('background-color', 'rgb(23, 23, 23)');
});
