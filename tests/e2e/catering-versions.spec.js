import { expect, test } from '@playwright/test';
import { MANAGER_SETTINGS_MESSAGES } from '../../src/core/i18n-manager-settings-messages.js';
import { installCateringVersionFixture } from './support/catering-version-fixture.js';

function text(language) {
  return (key, values = {}) => MANAGER_SETTINGS_MESSAGES[language][key].replace(/\{(\w+)\}/g, (_, name) => values[name]);
}
async function prepare(page, options = {}) {
  const language = options.language || 'de'; const t = text(language);
  const fixture = await installCateringVersionFixture(page, options);
  const region = page.getByRole('region', { name: t('cateringVersions.title'), exact: true });
  await expect(region.getByText(t('cateringVersions.loaded'), { exact: true })).toBeVisible();
  return { fixture, region, t };
}
async function propose(region, t, operation = 'exception') {
  await region.getByRole('combobox', { name: `${t('cateringVersions.operation')} *`, exact: true }).selectOption(operation);
  await region.getByLabel(`${t('cateringVersions.reason')} *`, { exact: true }).fill('Synthetic supplier cost review');
  await region.getByRole('button', { name: t('cateringVersions.save'), exact: true }).focus();
}
async function record(page, t, kind, positions) {
  const manual = page.getByRole('region', { name: t('cateringManual.title'), exact: true });
  await manual.getByRole('combobox', { name: `${t('cateringManual.channel')} *`, exact: true }).selectOption('telephone');
  await manual.getByLabel(`${t('cateringManual.reference')} *`, { exact: true }).fill('Synthetic supplier #2');
  const occurred = await page.evaluate(() => new Date(Date.now() - 1000).toISOString().slice(0, -1)
    .replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1').replace(/:00$/, ''));
  await manual.getByLabel(`${t('cateringManual.occurredInput')} *`, { exact: true }).fill(occurred);
  if (kind === 'receipt') for (const position of positions) {
    await manual.getByRole('combobox', { name: `${position.name} *`, exact: true }).selectOption('confirmed');
  }
  await manual.getByLabel(`${t(`cateringManual.attest.${kind}`)} *`, { exact: true }).check();
  await manual.getByRole('button', { name: t('cateringManual.save'), exact: true }).click();
}
for (const language of ['de','en']) {
  test(`Manager reviews a nonbinding replacement and preserves historical commitment until complete supplier confirmation in ${language}`,
    async ({ page }, testInfo) => {
      const { fixture, region, t } = await prepare(page, { language });
      const original = JSON.stringify(fixture.history.get(1).order);
      await propose(region, t); await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: t('cateringOrders.manualQuote'), exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: t('cateringOrders.reload'), exact: true })).toBeFocused();
      expect(fixture.writes).toHaveLength(1);
      expect(fixture.writes[0]).toMatchObject({ schemaVersion: 1, expectedOrderVersion: 1, expectedStateRevision: 6,
        expectedRequestVersion: 2, expectedAssignmentRevision: 3, operation: 'exception' });
      expect(Object.keys(fixture.writes[0]).sort()).toEqual(['schemaVersion','commandId','expectedOrderVersion','expectedStateRevision',
        'expectedRequestVersion','expectedAssignmentRevision','operation','justification'].sort());
      await expect(region.getByText(language === 'de' ? /^Wirksame Version 1:/ : /^Effective version 1:/)).toBeVisible();
      await region.getByRole('button', { name: t('cateringVersions.open', { version: 1 }), exact: true }).click();
      await expect(page.getByText(t('cateringVersions.historical'), { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: fixture.current.order.title, exact: true })).toBeFocused();
      await expect(page.getByRole('heading', { name: t('cateringOrders.manualQuote'), exact: true })).toHaveCount(0);
      await expect(page.getByRole('region', { name: t('cateringDelivery.title'), exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: t('cateringVersions.current'), exact: true }).click();
      await expect(page.getByRole('heading', { name: t('cateringOrders.manualQuote'), exact: true })).toBeVisible();
      const quote = page.locator('form').filter({ has: page.getByRole('heading', { name: t('cateringOrders.manualQuote'), exact: true }) });
      await quote.getByLabel(`${t('cateringOrders.amount')} *`, { exact: true }).fill('15.50');
      await quote.getByLabel(`${t('cateringOrders.expiry')} *`, { exact: true }).fill('2030-01-01T12:00');
      await quote.getByRole('button', { name: t('cateringOrders.saveQuote'), exact: true }).click();
      await page.getByRole('button', { name: language === 'de' ? /^Kosten von .* freigeben$/ : /^Approve cost of / }).click();
      await expect(region.getByText(language === 'de' ? /^Wirksame Version 1:/ : /^Effective version 1:/)).toBeVisible();
      await page.getByRole('button', { name: t('cateringDelivery.enqueue'), exact: true }).click();
      await record(page, t, 'transmitted', fixture.current.order.positions);
      await expect(page.getByRole('heading', { name: t('cateringManual.kind.receipt'), exact: true })).toBeVisible();
      await expect(region.getByText(language === 'de' ? /^Wirksame Version 1:/ : /^Effective version 1:/)).toBeVisible();
      await record(page, t, 'receipt', fixture.current.order.positions);
      await expect(region.getByText(language === 'de' ? /^Wirksame Version 2:/ : /^Effective version 2:/)).toBeVisible();
      expect(fixture.writes.slice(1).every((command) => command.expectedOrderVersion === 2)).toBe(true);
      expect(JSON.stringify(fixture.history.get(1).order)).toBe(original);
      const refresh = region.getByRole('button', { name: t('cateringVersions.reload'), exact: true });
      await refresh.focus(); await page.keyboard.press('Enter'); await expect(refresh).toBeFocused();
      for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (viewport.width === 390) await region.screenshot({ path: testInfo.outputPath('version-review-phone.png') });
      }
    });
}

test('version read failures and stale snapshots hide proposals, while uncertain writes block all order writes until reload',
  async ({ page }) => {
    const { fixture, region, t } = await prepare(page, { failure: 409 });
    const refresh = region.getByRole('button', { name: t('cateringVersions.reload'), exact: true });
    await propose(region, t); await refresh.click(); await expect(refresh).toBeEnabled();
    await expect(region.getByLabel(`${t('cateringVersions.reason')} *`, { exact: true })).toHaveValue('Synthetic supplier cost review');
    fixture.failReads(503); await refresh.click();
    await expect(region.getByText(t('cateringVersions.error'), { exact: true })).toBeVisible();
    await expect(region.locator('form')).toHaveCount(0); expect(fixture.writes).toHaveLength(0);
    fixture.failReads(null); fixture.setStale(true); await refresh.click();
    await expect(region.getByText(t('cateringVersions.stale'), { exact: true })).toBeVisible();
    await expect(region.locator('form')).toHaveCount(0);
    fixture.setStale(false); await refresh.click(); await propose(region, t); await page.keyboard.press('Enter');
    await expect(page.getByText(t('cateringOrders.conflict'), { exact: true })).toBeVisible();
    expect(fixture.writes).toHaveLength(1);
    await expect(region.getByRole('button', { name: t('cateringVersions.save'), exact: true })).toBeDisabled();
    await page.getByRole('button', { name: t('cateringOrders.reload'), exact: true }).click();
    await expect(region.getByRole('button', { name: t('cateringVersions.save'), exact: true })).toBeEnabled();
    expect(fixture.writes).toHaveLength(1);
  });

test('conference cancellation offers explicit supplier cancellation without changing the existing confirmed order', async ({ page }) => {
  const { fixture, region, t } = await prepare(page);
  fixture.changeConference('Cancelled');
  await region.getByRole('button', { name: t('cateringVersions.reload'), exact: true }).click();
  const operation = region.getByRole('combobox', { name: `${t('cateringVersions.operation')} *`, exact: true });
  await expect(operation.locator('option')).toHaveCount(2);
  expect(fixture.current.state.status).toBe('confirmed');
  await propose(region, t, 'cancel'); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: t('cateringOrders.manualQuote'), exact: true })).toBeVisible();
  expect(fixture.current.operation).toBe('cancel'); expect(fixture.current.state.status).toBe('pending_quote');
  await expect(region.getByText(/^Wirksame Version 1:/)).toBeVisible();
});

test('a newer confirmed conference enables a separate proposal bound to the current request source', async ({ page }) => {
  const { fixture, region, t } = await prepare(page);
  fixture.changeConference();
  await region.getByRole('button', { name: t('cateringVersions.reload'), exact: true }).click();
  await propose(region, t, 'change'); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: t('cateringOrders.manualQuote'), exact: true })).toBeVisible();
  expect(fixture.writes[0]).toMatchObject({ expectedRequestVersion: 3, expectedAssignmentRevision: 3, operation: 'change' });
  expect(fixture.current.order.requestVersion).toBe(3);
  expect(fixture.current.state.status).toBe('pending_quote');
  await expect(region.getByText(/^Wirksame Version 1:/)).toBeVisible();
});

test('late version responses cannot repaint a detached tab and authority failures lock the workspace', async ({ page }) => {
  const { fixture, region, t } = await prepare(page);
  const refresh = region.getByRole('button', { name: t('cateringVersions.reload'), exact: true });
  await expect(refresh).toBeEnabled(); fixture.holdReads(); await refresh.click();
  await page.locator('#managerTab-BOOKINGS').click(); fixture.releaseReads();
  await expect(region).toHaveCount(0);
  await page.getByRole('tab', { name: 'Catering-Bestellungen', exact: true }).click();
  await page.getByRole('button', { name: /Bestellung .* öffnen/ }).click();
  await expect(refresh).toBeEnabled(); fixture.failReads(401); await refresh.click();
  await expect(page.locator('html')).toHaveAttribute('data-session-locked', 'true');
  expect(fixture.writes).toHaveLength(0);
});
