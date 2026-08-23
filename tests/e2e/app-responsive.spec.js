import { expect, test } from '@playwright/test';

async function expectNoPageHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectEqualControlHeights(locator) {
  const boxes = await locator.evaluateAll((nodes) => nodes
    .filter((node) => !node.hidden && node.getClientRects().length)
    .map((node) => Math.round(node.getBoundingClientRect().height)));
  expect(boxes.length).toBeGreaterThan(1);
  expect(new Set(boxes).size).toBe(1);
}

async function expectContainedInViewport(page, selector) {
  const box = await page.locator(selector).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  });
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box.left).toBeGreaterThanOrEqual(-1);
  expect(box.right).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('welcome and global navigation use the same contained responsive layout', async ({ page }) => {
  await expect(page.locator('.welcome-hero')).toBeVisible();
  await expectContainedInViewport(page, '#app');
  await expectNoPageHorizontalOverflow(page);

  const visibleHeroButtons = page.locator('.welcome-hero .button-row button:visible');
  if (await visibleHeroButtons.count() > 1) await expectEqualControlHeights(visibleHeroButtons);

  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 760) {
    await expectEqualControlHeights(page.locator('.nav-list .nav-item'));
  }
});

test('employee request wizard keeps progress, controls and cards inside the viewport', async ({ page }) => {
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await expect(page.locator('.wizard-card')).toBeVisible();

  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 760) {
    await expect(page.locator('.ux-mobile-progress')).toBeVisible();
    await expect(page.locator('.stepper')).toBeHidden();
    await expect(page.locator('.stepper ol')).toBeHidden();
    await expectContainedInViewport(page, '.ux-mobile-progress');
  } else {
    await expect(page.locator('.ux-mobile-progress')).toBeHidden();
    await expect(page.locator('.stepper')).toBeVisible();
    await expect(page.locator('.stepper ol')).toBeVisible();
    await expectEqualControlHeights(page.locator('.stepper .step'));
  }

  await expectContainedInViewport(page, '.wizard-card');
  await expectNoPageHorizontalOverflow(page);
});

test('my requests toolbar and segmented controls follow the shared control system', async ({ page }) => {
  await page.locator('#primaryNavigation button[data-view="requests"]').click();
  await expect(page.locator('.toolbar')).toBeVisible();
  await expectContainedInViewport(page, '#app');

  const segmentedButtons = page.locator('.toolbar .segmented button');
  if (await segmentedButtons.count() > 1) await expectEqualControlHeights(segmentedButtons);
  await expectNoPageHorizontalOverflow(page);
});

test('profile dialog stays contained and uses consistent actions on small screens', async ({ page }) => {
  await page.locator('#primaryNavigation button[aria-haspopup="dialog"]').click();
  await expect(page.locator('dialog')).toBeVisible();
  await expectContainedInViewport(page, 'dialog');
  await expectNoPageHorizontalOverflow(page);

  const actions = page.locator('dialog .modal-actions button');
  if (await actions.count() > 1) await expectEqualControlHeights(actions);
});
