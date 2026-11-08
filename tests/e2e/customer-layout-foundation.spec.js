import { expect, test } from '@playwright/test';

for (const language of ['de', 'en']) {
  test(`CO-315 shared layout keeps dark-surface focus and long dialog actions readable in ${language}`, async ({ page }, testInfo) => {
    await page.route('**/layout-fixture', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/styles.css">'
        + '<link rel="stylesheet" href="/assets/app-layout.css"></head><body>'
        + '<div class="app-shell"><aside class="sidebar"><nav><button id="open" class="nav-item active" aria-current="page"></button></nav></aside>'
        + '<div class="content-shell"><header class="topbar"><h1></h1><p></p></header><main><div id="app"><section class="card"><h2></h2></section></div></main></div></div></body></html>',
    }));
    await page.goto('/layout-fixture');
    await page.evaluate(async (lang) => {
      const { openDialog, button } = await import('/src/core/ui.js');
      document.documentElement.lang = lang;
      const label = lang === 'de' ? 'Organisation und Konferenzeinstellungen verwalten' : 'Manage organization and conference settings';
      document.querySelector('h1').textContent = label;
      document.querySelector('h2').textContent = label;
      document.querySelector('.topbar p').textContent = label.repeat(4);
      const trigger = document.querySelector('#open');
      trigger.textContent = label;
      trigger.addEventListener('click', () => {
        const stay = button(lang === 'de'
          ? 'Hier bleiben und die noch nicht gespeicherten Organisationseinstellungen weiter bearbeiten'
          : 'Stay here and continue editing organization settings that have not yet been saved', { className: 'primary' });
        const discard = button(lang === 'de' ? 'Änderungen verwerfen' : 'Discard changes');
        const dialog = openDialog({ title: label, actions: [stay, discard] });
        stay.addEventListener('click', () => dialog.close());
        discard.addEventListener('click', () => dialog.close());
      });
    }, language);
    for (const width of [390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      const trigger = page.locator('#open');
      await trigger.focus();
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveCSS('outline-color', 'rgb(255, 255, 255)');
      const geometry = await page.evaluate(() => ({
        title: document.querySelector('h1').getBoundingClientRect().left,
        content: document.querySelector('#app').getBoundingClientRect().left,
        fits: document.documentElement.scrollWidth <= innerWidth,
      }));
      expect(geometry.fits).toBe(true);
      expect(Math.abs(geometry.title - geometry.content)).toBeLessThanOrEqual(1);
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      const first = dialog.getByRole('button').first();
      await expect(first).toBeFocused();
      expect(await first.evaluate((node) => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight)).toBe(true);
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button').last()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await testInfo.attach(`layout-${language}-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
  });
}
