import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installCateringDeliveryFixture as install } from './support/catering-delivery-fixture.js';

for (const language of ['de','en']) {
  test(`Manager CSV regeneration is version-bound, spreadsheet-safe and never records transmission in ${language}`, async ({ page }, testInfo) => {
    const fixture = await install(page, { language, documentText: '=HYPERLINK("https://synthetic.invalid")' });
    const exportButton = page.getByRole('button', { name: language === 'de' ? 'CSV herunterladen' : 'Download CSV' });
    await expect(exportButton).toBeEnabled();
    const documents = [];
    for (let index = 0; index < 2; index++) {
      const downloadPromise = page.waitForEvent('download');
      await exportButton.focus(); await page.keyboard.press('Enter');
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(`catering-${fixture.current.order.orderId}-v1.csv`);
      const path = testInfo.outputPath(`manual-order-${index}.csv`); await download.saveAs(path);
      const csv = await readFile(path, 'utf8'); documents.push(csv);
      expect(csv).toContain('"\'=HYPERLINK(""https://synthetic.invalid"")"');
      expect(csv).toContain('"summary"'); expect(csv).toContain('"position"'); expect(csv).toContain('"1250"');
      expect(csv).not.toMatch(/conferencePrice|unitPrice|conferenceLineTotalMinor|requester|allocations/);
      await expect(exportButton).toBeEnabled(); await expect(exportButton).toBeFocused();
    }
    expect(documents).toHaveLength(2); expect(fixture.writes).toHaveLength(0);
    expect(fixture.current.state.status).toBe('released');
    await expect(page.getByText(language === 'de' ? 'Dokument vorbereitet. Es wurde nichts versandt.' : 'Document prepared. Nothing was sent.'))
      .toBeVisible();
  });

  test(`Manager print document renders literal text under restrictive CSP and revalidates before printing in ${language}`, async ({ page }, testInfo) => {
    const malicious = '<img src="https://synthetic.invalid/image" onerror="window.bad=1">';
    const fixture = await install(page, { language, documentText: malicious });
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: language === 'de' ? 'PDF / Druckansicht öffnen' : 'Open PDF / print view' }).click();
    const popup = await popupPromise;
    const print = popup.getByRole('button', { name: language === 'de' ? 'Drucken / als PDF speichern' : 'Print / save as PDF' });
    await expect(print).toBeEnabled(); await expect(print).toBeFocused();
    await expect(popup.getByRole('heading', { name: malicious, exact: true })).toHaveCount(2);
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    expect(await popup.locator('img,script,iframe,form,a').count()).toBe(0);
    await expect(popup.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /script-src 'none'/);
    await expect(popup.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /connect-src 'none'/);
    await popup.evaluate(() => { window.printCalls = 0; window.print = () => { window.printCalls++; }; });
    const before = fixture.orderReads(); await print.focus(); await popup.keyboard.press('Enter');
    await expect.poll(() => fixture.orderReads()).toBe(before + 1);
    await expect.poll(() => popup.evaluate(() => window.printCalls)).toBe(1);
    expect(fixture.writes).toHaveLength(0);
    await popup.screenshot({ path: testInfo.outputPath('manual-print.png'), fullPage: true });
    if (testInfo.project.name.includes('chromium')) {
      const pdf = testInfo.outputPath('manual-order.pdf'); await popup.pdf({ path: pdf, format: 'A4', printBackground: true });
      const bytes = await readFile(pdf); expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(bytes.byteLength).toBeGreaterThan(1000); expect(bytes.byteLength).toBeLessThan(1_048_576);
      await testInfo.attach('manual-order-pdf', { path: pdf, contentType: 'application/pdf' });
    }
    fixture.current.order.orderVersion = 2;
    const closed = popup.waitForEvent('close'); await print.click(); await closed;
    await expect(page.getByText(language === 'de'
      ? 'Die angezeigte Bestellung ist nicht mehr aktuell. Laden Sie den aktuellen Stand, bevor Sie ein Dokument erstellen.'
      : 'The displayed order is no longer current. Load the current state before creating a document.')).toBeVisible();
    await expect(page.getByRole('button', { name: language === 'de' ? 'CSV herunterladen' : 'Download CSV' })).toBeDisabled();
    expect(fixture.writes).toHaveLength(0);
  });
}

test('manual export refuses stale source, closes blocked/invalid print preparation and cannot outlive its Manager tab', async ({ page }) => {
  const stale = await install(page); stale.current.state.revision++;
  await page.getByRole('button', { name: 'CSV herunterladen' }).click();
  await expect(page.getByText('Die angezeigte Bestellung ist nicht mehr aktuell. Laden Sie den aktuellen Stand, bevor Sie ein Dokument erstellen.'))
    .toBeVisible();
  expect(stale.writes).toHaveLength(0);
  const blocked = await install(page);
  await page.evaluate(() => { window.open = () => null; });
  const reads = blocked.orderReads(); await page.getByRole('button', { name: 'PDF / Druckansicht öffnen' }).click();
  await expect(page.getByText('Die Druckansicht konnte nicht geöffnet werden. Erlauben Sie das neue Fenster und versuchen Sie es erneut.')).toBeVisible();
  expect(blocked.orderReads()).toBe(reads);
  const late = await install(page); late.holdOrderReads();
  const before = late.orderReads(); await page.getByRole('button', { name: 'CSV herunterladen' }).click();
  await expect.poll(() => late.orderReads()).toBe(before + 1);
  await page.locator('#managerTab-BOOKINGS').click(); late.releaseOrderReads();
  await expect(page.getByRole('button', { name: 'CSV herunterladen' })).toHaveCount(0);
  expect(late.writes).toHaveLength(0);
});

test('manual document preflight authority loss clears the Manager surface without downloading or sending', async ({ page }) => {
  const fixture = await install(page); fixture.failOrderReads(403);
  let downloads = 0; page.on('download', () => { downloads++; });
  await page.getByRole('button', { name: 'CSV herunterladen' }).click();
  await expect(page.getByRole('button', { name: 'CSV herunterladen' })).toHaveCount(0);
  expect(downloads).toBe(0); expect(fixture.writes).toHaveLength(0);
});
