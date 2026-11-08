import { expect, test } from '@playwright/test';

test('CO-306 native validation reveals every invalid editor without losing first-invalid focus', async ({ page }) => {
  await page.route('**/catalogue-editor-fixture', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>',
  }));
  await page.goto('/catalogue-editor-fixture');
  await page.evaluate(async () => {
    const { createCatalogueEditorList } = await import('/src/manager/catalogue-editor-list.js');
    const { el, field, button } = await import('/src/core/ui.js');
    const editors = ['First', 'Second', 'Third'].map((name, index) => {
      const control = el('input', { value: name, attrs: { required: true } });
      return { controls: { name: control }, node: field({ id: `name-${index}`, label: name, control }) };
    });
    const list = createCatalogueEditorList({ id: 'catalogue', editors });
    const form = el('form', {}, [list.node, button('Save', { type: 'submit' })]);
    form.addEventListener('submit', (event) => event.preventDefault());
    document.body.append(form);
  });
  await page.locator('#name-0').fill('');
  await page.locator('summary').nth(1).click();
  await page.locator('#name-1').fill('');
  await page.locator('#catalogue-search').fill('Third');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#catalogue-search')).toHaveValue('');
  await expect(page.locator('#name-0')).toBeVisible();
  await expect(page.locator('#name-1')).toBeVisible();
  await expect(page.locator('#name-0')).toBeFocused();
  await page.locator('summary').nth(2).click();
  await expect(page.locator('#name-2')).toBeVisible();
  await expect(page.locator('#name-0')).toBeHidden();
});
