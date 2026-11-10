import { expect, test } from '@playwright/test';

for (const language of ['de', 'en']) {
  test(`CO-306 named choices retain selected values while filtering in ${language}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('conference_language_v1', value), language);
    await page.route('**/choice-fixture', (route) => route.fulfill({ contentType: 'text/html',
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>',
    }));
    await page.goto('/choice-fixture');
    await page.evaluate(async () => {
      const { namedSelectionField } = await import('/src/shared/named-selection-field.js');
      const { el } = await import('/src/core/ui.js');
      const control = el('select', { attrs: { multiple: true, size: '3' } });
      for (let index = 0; index < 18; index += 1) {
        const option = el('option', { value: `equipment-${index}`, text: `Equipment ${index}` });
        option.selected = index === 0 || index === 17;
        control.appendChild(option);
      }
      document.body.appendChild(namedSelectionField({ id: 'equipment', label: 'Equipment', control }));
    });
    const select = page.locator('#equipment');
    await expect(page.locator('.named-selection-values li')).toHaveText(['Equipment 0', 'Equipment 17']);
    await page.locator('#equipment-search').fill('Equipment 8');
    await expect(select).toHaveValues(['equipment-0', 'equipment-17']);
    await expect(select.locator('option:not([hidden])')).toHaveText(['Equipment 0', 'Equipment 8', 'Equipment 17']);
    await select.selectOption(['equipment-0', 'equipment-8', 'equipment-17']);
    await expect(page.locator('.named-selection-values li')).toHaveText(['Equipment 0', 'Equipment 8', 'Equipment 17']);
    await page.locator('#equipment-search').fill('No match');
    await expect(select).toHaveValues(['equipment-0', 'equipment-8', 'equipment-17']);
    await expect(select.locator('option')).toHaveCount(18);
    await page.locator('#equipment-search').fill('');
    await expect(select.locator('option:not([hidden])')).toHaveCount(18);
  });
}

test('CO-306 native validation reveals every invalid editor without losing first-invalid focus', async ({ page }) => {
  await page.route('**/catalogue-editor-fixture', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>',
  }));
  await page.goto('/catalogue-editor-fixture');
  await page.evaluate(async () => {
    const { createCatalogueEditorList } = await import('/src/shared/catalogue-editor-list.js');
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

for (const language of ['de', 'en']) {
  test(`CO-306 status and name filters retain hidden controls and reveal invalid fields (${language})`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('conference_language_v1', value), language);
    await page.route('**/catalogue-status-fixture', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>',
    }));
    await page.goto('/catalogue-status-fixture');
    await page.evaluate(async () => {
      const { createCatalogueEditorList } = await import('/src/shared/catalogue-editor-list.js');
      const { el, field, button } = await import('/src/core/ui.js');
      const editors = ['First', 'Second', 'Third'].map((name, index) => {
        const control = el('input', { value: name, attrs: { required: true } });
        return { active: index !== 1, controls: { name: control },
          node: field({ id: `name-${index}`, label: name, control }) };
      });
      const list = createCatalogueEditorList({ id: 'catalogue', editors,
        activeOf: (editor) => editor.active,
        summaryOf: () => ['<img src=x onerror=alert(1)>'],
      });
      const add = button('Add');
      add.addEventListener('click', () => {
        const control = el('input', { value: 'Fourth', attrs: { required: true } });
        list.add({ active: true, controls: { name: control },
          node: field({ id: 'name-3', label: 'Fourth', control }) }, { expanded: true });
      });
      const form = el('form', {}, [list.node, add, button('Save', { type: 'submit' })]);
      form.addEventListener('submit', (event) => event.preventDefault());
      document.body.append(form);
    });
    const search = page.locator('#catalogue-search');
    const status = page.locator('#catalogue-status');
    const rows = page.locator('.catalogue-editor-row');
    await expect(status.locator('option')).toHaveText(language === 'de'
      ? ['Alle', 'Aktiv', 'Inaktiv'] : ['All', 'Active', 'Inactive']);
    await expect(rows.first().locator('.catalogue-editor-summary')).toHaveText('<img src=x onerror=alert(1)>');
    await expect(page.locator('img')).toHaveCount(0);
    await status.selectOption('inactive');
    await expect(page.locator('.catalogue-editor-row:not([hidden]) .catalogue-editor-name')).toHaveText(['Second']);
    await search.fill('Third');
    await expect(page.locator('.catalogue-editor-row:not([hidden])')).toHaveCount(0);
    await expect(page.locator('input[required]')).toHaveCount(3);
    await page.locator('.catalogue-editor-list .toolbar button').click();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('');
    await expect(status).toHaveValue('all');
    await page.locator('#name-0').fill('');
    await rows.nth(1).locator(':scope > summary').click();
    await page.locator('#name-1').fill('');
    await status.selectOption('active');
    await search.fill('Third');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(status).toHaveValue('all');
    await expect(page.locator('#name-0')).toBeFocused();
    await expect(page.locator('#name-1')).toBeVisible();
    await rows.nth(2).locator(':scope > summary').click();
    await expect(page.locator('#name-2')).toBeVisible();
    await expect(page.locator('#name-0')).toBeHidden();
    await status.selectOption('inactive');
    await search.fill('No match');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(status).toHaveValue('all');
    await expect(page.locator('#name-3')).toBeVisible();
    await expect(page.locator('.catalogue-editor-row[open]')).toHaveCount(1);
    await expect(page.locator('input[required]')).toHaveCount(4);
  });
}
