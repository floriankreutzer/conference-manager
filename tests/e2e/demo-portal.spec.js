import { expect, test } from '@playwright/test';

const CUSTOMER = 'https://conference-manager-demo.onrender.com';
const PLATFORM = 'https://conference-manager-ops-demo.onrender.com';

test('static launchpad reflows at a 200% equivalent desktop width and at phone width', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));

  // 1280 CSS pixels at 200% browser zoom leave about 640 CSS pixels for layout.
  // Viewport reduction tests that reflow contract; it does not assert the browser zoom setting.
  for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/demo-portal/');
    await expect(page.getByRole('heading', { name: 'Conference Manager Demo' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Launch Customer Demo' })).toHaveAttribute('href', CUSTOMER);
    await expect(page.getByRole('link', { name: 'Launch Platform Demo' })).toHaveAttribute('href', PLATFORM);
    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      gridDisplay: getComputedStyle(document.querySelector('.launch-grid')).display,
      columns: getComputedStyle(document.querySelector('.launch-grid')).gridTemplateColumns.split(' ').length,
      actions: [...document.querySelectorAll('.launch-action')].map((link) => {
        const rect = link.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      }),
    }));
    expect(layout.documentWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.gridDisplay).toBe('grid');
    expect(layout.columns).toBe(1);
    for (const action of layout.actions) {
      expect(action.left).toBeGreaterThanOrEqual(0);
      expect(action.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
      expect(action.width).toBeGreaterThan(0);
    }
  }

  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Launch Customer Demo' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Launch Platform Demo' })).toBeFocused();

  expect(requests.every((url) => new URL(url).pathname.startsWith('/demo-portal/'))).toBe(true);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});
