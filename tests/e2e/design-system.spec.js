import { expect, test } from '@playwright/test';

const rgb = {
  bordeaux: 'rgb(122, 31, 61)',
  camelSurface: 'rgb(245, 238, 230)',
};

async function expectNoPageHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

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

test('semantic typography keeps Manrope on display surfaces and Inter on functional UI', async ({ page }) => {
  await page.goto('/');

  const typography = await page.evaluate(async () => {
    const styles = getComputedStyle(document.documentElement);
    const loadedFaces = await document.fonts.load('700 1rem "Manrope"');
    return {
      display: styles.getPropertyValue('--font-family-display').trim(),
      functional: styles.getPropertyValue('--font-family-sans').trim(),
      loadedFaces: loadedFaces.map((face) => ({ family: face.family, status: face.status })),
    };
  });

  expect(typography.display).toContain('Manrope');
  expect(typography.display).toContain('Inter');
  expect(typography.functional).toContain('Inter');
  expect(typography.loadedFaces.length).toBeGreaterThan(0);
  expect(typography.loadedFaces.every((face) => face.status === 'loaded')).toBe(true);

  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.locator('.brand-mark')).toHaveCSS('font-family', /Manrope/);
  await expect(page.locator('.brand strong')).toHaveCSS('font-family', /Manrope/);
  await expect(page.locator('.topbar h1')).toHaveCSS('font-family', /Manrope/);
  await expect(page.locator('.topbar h1')).toHaveCSS('font-weight', '700');
  await expect(page.locator('.welcome-hero h2')).toHaveCSS('font-family', /Manrope/);
  await expect(page.locator('.welcome-hero h2')).toHaveCSS('font-weight', '700');
  await expect(page.locator('.kpi strong').first()).toHaveCSS('font-family', /Manrope/);
  await expect(page.locator('#primaryNavigation button').first()).toHaveCSS('font-family', /Inter/);

  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await expect(page.locator('.section-heading h2').first()).toHaveCSS('font-family', /Manrope/);
  await expect(page.locator('.section-heading h2').first()).toHaveCSS('font-weight', '600');
  await expect(page.locator('.field-label').first()).toHaveCSS('font-family', /Inter/);
  await expect(page.locator('.wizard-actions button.primary').first()).toHaveCSS('font-family', /Inter/);
});

test('display typography reflows across languages and representative responsive widths', async ({ page }) => {
  const viewports = [
    { name: 'phone-landscape', width: 844, height: 390 },
    { name: 'tablet', width: 1024, height: 768 },
    { name: 'large-desktop', width: 1600, height: 1000 },
    { name: 'desktop-200-percent-reflow', width: 640, height: 450 },
  ];

  await page.goto('/');

  for (const language of ['de', 'en']) {
    await page.evaluate((value) => localStorage.setItem('conference_language_v1', value), language);

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.locator('.welcome-hero h2')).toBeVisible();
      await expect(page.locator('.topbar h1')).toBeVisible();
      await expectNoPageHorizontalOverflow(page);

      const clipping = await page.evaluate(() => {
        const selectors = ['.topbar h1', '.topbar p', '.welcome-hero h2', '.welcome-hero p'];
        return selectors.map((selector) => {
          const element = document.querySelector(selector);
          return {
            selector,
            clippedInline: element ? element.scrollWidth > element.clientWidth + 1 : true,
            clippedBlock: element ? element.scrollHeight > element.clientHeight + 1 : true,
          };
        });
      });

      for (const entry of clipping) {
        expect(entry.clippedInline, `${language}/${viewport.name} ${entry.selector} inline clipping`).toBe(false);
        expect(entry.clippedBlock, `${language}/${viewport.name} ${entry.selector} block clipping`).toBe(false);
      }
    }
  }
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
  await expect(camelKpi.locator('strong')).toHaveCSS('font-family', /Manrope/);

  const activeTab = page.locator('.manager-tabs button[aria-pressed="true"]');
  await expect(activeTab).toHaveCSS('background-color', 'rgb(23, 23, 23)');
  await expect(activeTab).toHaveCSS('font-family', /Inter/);
});
