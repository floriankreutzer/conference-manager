import { expect, test } from '@playwright/test';

async function openManager(page) {
  await page.locator('#demoRoleSwitch').selectOption('manager');
  await expect(page.locator('#demoRoleSwitch')).toHaveValue('manager');
  const managerNav = page.locator('#primaryNavigation button[data-view="manager"]');
  await expect(managerNav).toBeVisible();
  await managerNav.click();
  await expect(page.locator('.manager-tabs')).toBeVisible();
  await expect(page.locator('.manager-surface')).toBeVisible();
}

async function expectEqualControlHeights(locator) {
  const boxes = await locator.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
  expect(boxes.length).toBeGreaterThan(1);
  expect(new Set(boxes).size).toBe(1);
}

async function expectNoPageHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const date = new Date().toISOString().slice(0, 10);
    localStorage.setItem('conference_requests', JSON.stringify([{
      id: 'CR-RESP-001',
      title: 'Responsive Manager Test',
      location: 'Berlin',
      date,
      start: '10:00',
      end: '12:00',
      roomId: 'BER-321',
      status: 'Confirmed',
      calendarStatus: 'Confirmed',
      participants: 8,
      internalParticipants: 8,
      externalParticipants: 0,
      serviceIds: ['host'],
      quantities: {},
      allocations: [{ costCenter: 'CC-RESP', percent: 100 }],
      estimatedCost: 80,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statusHistory: [],
    }]));
  });
  await page.goto('/');
});

test('manager tabs and quick filters use a consistent control system without escaping the content column', async ({ page }) => {
  await openManager(page);
  await expectEqualControlHeights(page.locator('.manager-tabs button'));
  await expectEqualControlHeights(page.locator('.manager-quick-filters button'));

  const bounds = await page.evaluate(() => {
    const main = document.querySelector('#mainContent')?.getBoundingClientRect();
    const manager = document.querySelector('.manager-surface')?.getBoundingClientRect();
    return main && manager ? {
      mainLeft: main.left,
      mainRight: main.right,
      managerLeft: manager.left,
      managerRight: manager.right,
    } : null;
  });
  expect(bounds).not.toBeNull();
  expect(bounds.managerLeft).toBeGreaterThanOrEqual(bounds.mainLeft - 1);
  expect(bounds.managerRight).toBeLessThanOrEqual(bounds.mainRight + 1);
  await expectNoPageHorizontalOverflow(page);
});

test('room planning contains wide timeline content internally and defaults to list on mobile', async ({ page }) => {
  await openManager(page);
  await page.getByRole('button', { name: 'Raumplanung', exact: true }).click();
  await expect(page.locator('[data-feature-parity="room-plan"]')).toBeVisible();

  const viewport = page.viewportSize();
  const isMobile = Boolean(viewport && viewport.width <= 760);
  const listButton = page.locator('[data-room-plan-view="LIST"]');
  const timelineButton = page.locator('[data-room-plan-view="TIMELINE"]');

  if (isMobile) await expect(listButton).toHaveAttribute('aria-pressed', 'true');
  await expectEqualControlHeights(page.locator('.room-plan-view button'));
  await expectNoPageHorizontalOverflow(page);

  await timelineButton.click();
  await expect(timelineButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.room-timeline')).toBeVisible();
  await expectNoPageHorizontalOverflow(page);

  if (isMobile) {
    const timelineDimensions = await page.locator('.room-timeline').evaluate((node) => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    }));
    expect(timelineDimensions.scrollWidth).toBeGreaterThan(timelineDimensions.clientWidth);
  }
});

test('report tables become contained mobile cards while desktop keeps semantic tables visible', async ({ page }) => {
  await openManager(page);
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(page.locator('[data-feature-parity="reports"]')).toBeVisible();

  const viewport = page.viewportSize();
  const isMobile = Boolean(viewport && viewport.width <= 760);
  const reportTable = page.locator('.report-card .data-table').first();
  await expect(reportTable).toBeAttached();

  if (isMobile) {
    await expect(reportTable).toBeHidden();
    const cards = page.locator('.report-card .responsive-table-cards').first();
    await expect(cards).toBeVisible();
    await expect(cards.locator('.responsive-table-card').first()).toContainText('Berlin');
  } else {
    await expect(reportTable).toBeVisible();
  }

  await expectNoPageHorizontalOverflow(page);
});
