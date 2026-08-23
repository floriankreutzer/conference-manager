import { expect, test } from '@playwright/test';

const futureIsoDate = (days = 35) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

async function fillSchedule(page) {
  await page.locator('#title').fill('End User Ready Workshop');
  await page.locator('#location').selectOption('Berlin');
  await page.locator('#date').fill(futureIsoDate());
  await page.locator('#start').fill('09:00');
  await page.locator('#end').fill('11:00');
  await page.locator('#internalParticipants').fill('6');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('first-use hierarchy is personalized and marked end-user ready', async ({ page }) => {
  await expect(page.locator('meta[name="conference-end-user-readiness"]')).toHaveAttribute('content', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-identity-bootstrap-build', '2026.08.23.01');
  await expect(page.locator('#viewTitle')).toHaveText('Start');
  await expect(page.locator('#welcomeHeading')).toHaveText('Willkommen, Florian.');
  await expect(page.locator('#primaryNavigation button[data-view="employee"]')).toHaveText('Neue Konferenz');
});

test('production presentation never inherits the demo identity or demo controls', async ({ page }) => {
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
  await expect(page.locator('[data-demo-security]')).toHaveCount(0);
  await expect(page.locator('#sidebarFooter')).toBeHidden();
  await expect(page.locator('#welcomeHeading')).toHaveText('Willkommen');
  await expect(page.locator('#primaryNavigation button[aria-haspopup="dialog"]')).toHaveText('Profil');
  await expect(page.locator('body')).not.toContainText('Florian Kreutzer');
});

test('step-one primary action is full-width on mobile without changing desktop flow', async ({ page }, testInfo) => {
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await expect(page.locator('[data-step-panel="1"]')).toBeVisible();

  const actions = page.locator('[data-step-panel="1"] .wizard-actions');
  const next = actions.locator('button.primary');
  await expect(next).toBeVisible();

  if (testInfo.project.name === 'webkit-mobile') {
    const actionBox = await actions.boundingBox();
    const nextBox = await next.boundingBox();
    expect(actionBox).not.toBeNull();
    expect(nextBox).not.toBeNull();
    expect(nextBox.width).toBeGreaterThan(actionBox.width * 0.9);
  }

  await fillSchedule(page);
  await next.click();
  await expect(page.locator('[data-step-panel="2"]')).toBeVisible();
  const refresh = page.locator('[data-step-panel="2"] .section-heading button');
  await expect(refresh).toHaveText('Aktualisieren');
  await expect(refresh).toHaveAttribute('aria-label', 'Raumverfügbarkeit aktualisieren');
});
