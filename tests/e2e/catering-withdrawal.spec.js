import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { MANAGER_SETTINGS_MESSAGES } from '../../src/core/i18n-manager-settings-messages.js';
import { installCateringVersionFixture } from './support/catering-version-fixture.js';

const text = (language) => (key) => MANAGER_SETTINGS_MESSAGES[language][key];
async function prepare(page, language = 'de') {
  const fixture = await installCateringVersionFixture(page, { language, unsent: true }); const t = text(language);
  const region = page.getByRole('region', { name: t('cateringWithdrawal.title'), exact: true });
  await expect(region.getByText(t('cateringWithdrawal.loaded'), { exact: true })).toBeVisible();
  return { fixture, region, t };
}
async function fill(region, t) {
  await region.getByLabel(`${t('cateringWithdrawal.reason')} *`, { exact: true }).fill('Synthetic local withdrawal');
  await region.getByLabel(`${t('cateringWithdrawal.attest')} *`, { exact: true }).check();
}
for (const language of ['de','en']) {
  test(`first physical replacement CSV and print identify a new supplier order without recording transmission in ${language}`,
    async ({ page }, testInfo) => {
      const { fixture, region, t } = await prepare(page, language); await fill(region, t);
      await region.getByRole('button', { name: t('cateringWithdrawal.save'), exact: true }).click();
      const versions = page.getByRole('region', { name: t('cateringVersions.title'), exact: true });
      await versions.getByRole('combobox', { name: `${t('cateringVersions.operation')} *`, exact: true }).selectOption('change');
      await versions.getByLabel(`${t('cateringVersions.reason')} *`, { exact: true }).fill('Synthetic replacement document');
      await versions.getByRole('button', { name: t('cateringVersions.save'), exact: true }).click();
      await expect(page.getByRole('heading', { name: t('cateringOrders.manualQuote'), exact: true })).toBeVisible();
      const before = fixture.writes.length;
      const downloading = page.waitForEvent('download');
      await page.getByRole('button', { name: t('cateringDocuments.csv'), exact: true }).click();
      const download = await downloading; const csvPath = testInfo.outputPath('first-order.csv'); await download.saveAs(csvPath);
      const csv = await readFile(csvPath, 'utf8');
      expect(csv.split('\r\n')[0]).toContain('"business_operation"');
      expect(csv.split('\r\n')[1].split(',')[4]).toBe('"initial"');
      expect(csv.split('\r\n')[1].endsWith('"change"')).toBe(true);
      const opening = page.waitForEvent('popup');
      await page.getByRole('button', { name: t('cateringDocuments.pdf'), exact: true }).click(); const popup = await opening;
      await expect(popup.getByRole('button', { name: t('cateringDocuments.print'), exact: true })).toBeEnabled();
      await expect(popup.getByText(t('cateringWithdrawal.firstDelivery'), { exact: true })).toBeVisible();
      await expect(popup.getByText(t('cateringDelivery.operation.initial'), { exact: true })).toBeVisible();
      expect(await popup.evaluate(() => window.opener === null)).toBe(true);
      if (testInfo.project.name.includes('chromium')) {
        const pdf = testInfo.outputPath('first-order.pdf'); await popup.pdf({ path: pdf, format: 'A4', printBackground: true });
        expect((await readFile(pdf)).subarray(0,5).toString()).toBe('%PDF-');
      }
      await popup.screenshot({ path: testInfo.outputPath('first-order-print.png'), fullPage: true }); await popup.close();
      expect(fixture.writes).toHaveLength(before); expect(fixture.current.state.status).toBe('pending_quote');
    });
  test(`Manager attests local withdrawal and reviews a fresh first supplier order with immutable history in ${language}`,
    async ({ page }, testInfo) => {
      const { fixture, region, t } = await prepare(page, language); const original = JSON.stringify(fixture.current.order);
      const attest = region.getByLabel(`${t('cateringWithdrawal.attest')} *`, { exact: true });
      await expect(attest).not.toBeChecked();
      await region.getByLabel(`${t('cateringWithdrawal.reason')} *`, { exact: true }).fill('Synthetic local withdrawal');
      await region.getByRole('button', { name: t('cateringWithdrawal.save'), exact: true }).click();
      expect(fixture.writes).toHaveLength(0); await attest.check();
      await region.screenshot({ path: testInfo.outputPath('withdrawal-form-phone.png') });
      await region.getByRole('button', { name: t('cateringWithdrawal.save'), exact: true }).focus(); await page.keyboard.press('Enter');
      await expect(region.getByText(t('cateringWithdrawal.attestationRecorded'), { exact: true })).toBeVisible();
      expect(fixture.writes).toHaveLength(1);
      expect(fixture.writes[0]).toMatchObject({ expectedOrderVersion: 1, expectedStateRevision: 1, attestNotTransmitted: true });
      expect(Object.keys(fixture.writes[0]).sort()).toEqual(['schemaVersion','commandId','expectedOrderVersion',
        'expectedStateRevision','justification','attestNotTransmitted'].sort());
      await expect(page.getByRole('heading', { name: t('cateringOrders.manualQuote'), exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: t('cateringOrders.reload'), exact: true })).toBeFocused();
      for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (viewport.width === 390) await region.screenshot({ path: testInfo.outputPath('withdrawal-phone.png') });
      }
      const versions = page.getByRole('region', { name: t('cateringVersions.title'), exact: true });
      await versions.getByRole('combobox', { name: `${t('cateringVersions.operation')} *`, exact: true }).selectOption('change');
      await expect(versions.getByRole('option', { name: t('cateringWithdrawal.replacement'), exact: true })).toHaveCount(1);
      await versions.getByLabel(`${t('cateringVersions.reason')} *`, { exact: true }).fill('Synthetic reviewed replacement');
      await versions.getByRole('button', { name: t('cateringVersions.save'), exact: true }).click();
      await expect(page.getByRole('heading', { name: t('cateringOrders.manualQuote'), exact: true })).toBeVisible();
      expect(fixture.current.schemaVersion).toBe(2); expect(fixture.current.deliveryOperation).toBe('initial');
      expect(fixture.current.operation).toBe('change'); expect(fixture.current.quote).toBeNull(); expect(fixture.current.decision).toBeNull();
      await versions.getByRole('button', { name: language === 'de' ? 'Version 1 ansehen' : 'View version 1', exact: true }).click();
      await expect(page.getByText(t('cateringVersions.historical'), { exact: true })).toBeVisible();
      await expect(region.locator('form')).toHaveCount(0); await expect(region.getByText('Synthetic local withdrawal', { exact: true })).toBeVisible();
      expect(JSON.stringify(fixture.history.get(1).order)).toBe(original);
      await page.getByRole('button', { name: t('cateringVersions.current'), exact: true }).click();
      const quote = page.locator('form').filter({ has: page.getByRole('heading', { name: t('cateringOrders.manualQuote'), exact: true }) });
      await quote.getByLabel(`${t('cateringOrders.amount')} *`, { exact: true }).fill('14.50');
      await quote.getByLabel(`${t('cateringOrders.expiry')} *`, { exact: true }).fill('2030-01-01T12:00');
      await quote.getByRole('button', { name: t('cateringOrders.saveQuote'), exact: true }).click();
      await page.getByRole('button', { name: language === 'de' ? /^Kosten von .* freigeben$/ : /^Approve cost of / }).click();
      await page.getByRole('button', { name: t('cateringDelivery.enqueue'), exact: true }).click();
      const manual = page.getByRole('region', { name: t('cateringManual.title'), exact: true });
      for (const kind of ['transmitted','receipt']) {
        await manual.getByRole('combobox', { name: `${t('cateringManual.channel')} *`, exact: true }).selectOption('telephone');
        await manual.getByLabel(`${t('cateringManual.reference')} *`, { exact: true }).fill('Synthetic first physical order');
        await manual.getByLabel(`${t('cateringManual.occurredInput')} *`, { exact: true })
          .fill(await page.evaluate(() => new Date(Date.now() - 1000).toISOString().slice(0,-1).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1').replace(/:00$/, '')));
        await manual.getByLabel(`${t('cateringManual.occurredInput')} *`, { exact: true }).press('Tab');
        if (kind === 'receipt') for (const position of fixture.current.order.positions) {
          await manual.getByRole('combobox', { name: `${position.name} *`, exact: true }).selectOption('confirmed');
        }
        await manual.getByLabel(`${t(`cateringManual.attest.${kind}`)} *`, { exact: true }).check();
        await manual.getByRole('button', { name: t('cateringManual.save'), exact: true }).click();
        await expect(page.getByRole('button', { name: t('cateringOrders.reload'), exact: true })).toBeFocused();
      }
      await expect(versions.getByText(language === 'de' ? /^Wirksame Version 2:/ : /^Effective version 2:/)).toBeVisible();
      await expect(region.locator('form')).toHaveCount(0);
      expect(fixture.writes.slice(2).every((command) => command.expectedOrderVersion === 2)).toBe(true);
    });
}

test('withdrawal refresh preserves a valid draft but failed and stale reads remove only withdrawal forms', async ({ page }) => {
  const { fixture, region, t } = await prepare(page); await fill(region, t);
  const refresh = region.getByRole('button', { name: t('cateringWithdrawal.reload'), exact: true });
  await refresh.focus(); await page.keyboard.press('Enter'); await expect(refresh).toBeFocused();
  await expect(region.getByLabel(`${t('cateringWithdrawal.reason')} *`, { exact: true })).toHaveValue('Synthetic local withdrawal');
  await expect(region.getByLabel(`${t('cateringWithdrawal.attest')} *`, { exact: true })).toBeChecked();
  fixture.failWithdrawalReads(503); await refresh.click();
  await expect(region.getByText(t('cateringWithdrawal.error'), { exact: true })).toBeVisible();
  await expect(region.locator('form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: t('cateringOrders.saveQuote'), exact: true })).toBeEnabled();
  fixture.failWithdrawalReads(null); fixture.staleWithdrawal(true); await refresh.click();
  await expect(region.getByText(t('cateringVersions.stale'), { exact: true })).toBeVisible();
  await expect(region.locator('form')).toHaveCount(0); expect(fixture.writes).toHaveLength(0);
  fixture.staleWithdrawal(false); fixture.blockWithdrawal(true); await refresh.click();
  await expect(region.getByText(t('cateringWithdrawal.unavailable'), { exact: true })).toBeVisible();
  await expect(region.locator('form')).toHaveCount(0);
});

test('an uncertain local withdrawal locks parent writes until authoritative reload and cannot be cleared by panel reads', async ({ page }) => {
  const { fixture, region, t } = await prepare(page); fixture.failWithdrawals(409); await fill(region, t);
  await region.getByRole('button', { name: t('cateringWithdrawal.save'), exact: true }).click();
  await expect(page.getByText(t('cateringOrders.conflict'), { exact: true })).toBeVisible();
  await expect(region.getByRole('button', { name: t('cateringWithdrawal.reload'), exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: t('cateringOrders.saveQuote'), exact: true })).toBeDisabled();
  expect(fixture.writes).toHaveLength(1);
  await page.getByRole('button', { name: t('cateringOrders.reload'), exact: true }).click();
  await expect(region.getByRole('button', { name: t('cateringWithdrawal.save'), exact: true })).toBeEnabled();
  await expect(region.getByLabel(`${t('cateringWithdrawal.attest')} *`, { exact: true })).not.toBeChecked();
  expect(fixture.writes).toHaveLength(1);
});

test('late withdrawal reads cannot paint a detached workspace and authority errors lock the session', async ({ page }) => {
  const { fixture, region, t } = await prepare(page);
  const refresh = region.getByRole('button', { name: t('cateringWithdrawal.reload'), exact: true });
  fixture.holdWithdrawals(); await refresh.click(); await page.locator('#managerTab-BOOKINGS').click(); fixture.releaseWithdrawals();
  await expect(region).toHaveCount(0);
  await page.getByRole('tab', { name: 'Catering-Bestellungen', exact: true }).click();
  await page.getByRole('button', { name: /Bestellung .* öffnen/ }).click(); await expect(refresh).toBeEnabled();
  fixture.failWithdrawalReads(401); await refresh.click();
  await expect(page.locator('html')).toHaveAttribute('data-session-locked', 'true'); expect(fixture.writes).toHaveLength(0);
});
