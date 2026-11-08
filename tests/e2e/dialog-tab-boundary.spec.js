import { test, expect } from '@playwright/test';

test('CO-315 native dialog cycles only visible enabled tab stops and restores its trigger', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { button, el, openDialog } = await import('/src/core/ui.js');
    document.body.replaceChildren();
    const trigger = button('Open test dialog', { id: 'testTrigger' });
    document.body.appendChild(trigger);
    trigger.addEventListener('click', () => {
      const content = el('section', {}, [
        el('input', { id: 'hiddenField', type: 'hidden' }),
        el('fieldset', { attrs: { disabled: 'disabled' } }, [el('input', { id: 'disabledField' })]),
        el('details', {}, [el('summary', { text: 'More information' }), el('input', { id: 'collapsedField' })]),
        button('Explicitly skipped', { attrs: { tabindex: '-1' } }),
      ]);
      const close = button('Close test dialog');
      const pending = button('Pending action', { disabled: true });
      const dialog = openDialog({ title: 'Dialog boundary test', content, actions: [close, pending] });
      close.addEventListener('click', () => dialog.close());
    });
  });
  const trigger = page.locator('#testTrigger');
  await trigger.click();
  const dialog = page.getByRole('dialog');
  const summary = dialog.locator('summary');
  const close = dialog.getByRole('button', { name: 'Close test dialog' });
  await close.focus();
  await page.keyboard.press('Tab');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await summary.click();
  await page.locator('#collapsedField').focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(summary).toBeFocused();
  // The pending action enters the tab order only after becoming enabled.
  await dialog.getByRole('button', { name: 'Pending action' }).evaluate(node => { node.disabled = false; });
  await close.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Pending action' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
