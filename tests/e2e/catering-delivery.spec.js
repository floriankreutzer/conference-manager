import { expect, test } from '@playwright/test';
import { installCateringDeliveryFixture as install, cateringOrderOriginal as original } from './support/catering-delivery-fixture.js';

for (const language of ['de','en']) {
  test(`Manager explicitly queues approved source and reads manual deferral without claiming transmission in ${language}`, async ({ page }, testInfo) => {
    const fixture = await install(page, { language });
    const region = page.getByRole('region', { name: language === 'de' ? 'Lieferbearbeitung' : 'Delivery processing' });
    const enqueue = region.getByRole('button', { name: language === 'de'
      ? 'Freigegebene Version zur Bearbeitung einreihen' : 'Queue approved version for processing' });
    await expect(enqueue).toBeEnabled(); await enqueue.focus(); await page.keyboard.press('Enter');
    await expect(region.getByRole('heading', { name: language === 'de' ? 'Zur Bearbeitung eingereiht' : 'Queued for processing' })).toBeVisible();
    expect(fixture.writes).toEqual([{ schemaVersion: 1, orderId: original.order.orderId,
      expectedOrderVersion: 1, expectedStateRevision: 3, expectedQuoteRevision: 1 }]);
    await expect(page.getByRole('button', { name: language === 'de'
      ? 'Aktuellen Stand laden und Entwurf verwerfen' : 'Load current state and discard draft' })).toBeFocused();
    fixture.defer();
    const reload = region.getByRole('button', { name: language === 'de' ? 'Stand aktualisieren' : 'Refresh state' });
    await reload.focus(); await page.keyboard.press('Enter');
    await expect(region.getByRole('heading', { name: language === 'de' ? 'Manuelle Nachverfolgung erforderlich' : 'Manual follow-up required' }))
      .toBeVisible();
    await expect(region.getByText(language === 'de'
      ? 'Eine manuelle Nachverfolgung ist erforderlich. Dieser Eintrag bestätigt keinen manuellen Versand.'
      : 'Manual follow-up is required. This entry does not confirm manual transmission.')).toBeVisible();
    await expect(reload).toBeFocused();
    await expect(region.getByRole('button', { name: language === 'de' ? 'Weitere Einträge' : 'More entries' })).toBeDisabled();
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (viewport.width === 390) await region.screenshot({ path: testInfo.outputPath('delivery-phone.png') });
    }
    expect(fixture.writes).toHaveLength(1);
  });
}

test('enqueue conflict blocks all writes until explicit authoritative order reload', async ({ page }) => {
  const fixture = await install(page, { failure: 409 });
  const enqueue = page.getByRole('button', { name: 'Freigegebene Version zur Bearbeitung einreihen' });
  await expect(enqueue).toBeEnabled(); await enqueue.click();
  await expect(enqueue).toBeDisabled();
  await expect(page.getByText('Der Stand wurde geändert. Laden Sie ihn neu und prüfen Sie das Angebot erneut.')).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Aktuellen Stand laden und Entwurf verwerfen' }).click();
  await expect(enqueue).toBeEnabled(); expect(fixture.writes).toHaveLength(1);
});

test('failed job reads cannot enable enqueue and rollout-off leaves order review available', async ({ page }) => {
  await install(page, { readFailure: true });
  await expect(page.getByText('Der Bearbeitungsstand konnte nicht geladen werden. Laden Sie ihn erneut, bevor Sie die Version einreihen.'))
    .toBeVisible();
  await expect(page.getByRole('button', { name: 'Freigegebene Version zur Bearbeitung einreihen' })).toBeDisabled();
  await install(page, { enabled: false });
  await expect(page.getByRole('region', { name: 'Lieferbearbeitung' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Lieferantenangebot erfassen' })).toBeVisible();
});

test('provider rejection keeps approved historical quote without presenting renewed initial-order approval', async ({ page }) => {
  await install(page, { rejected: true });
  await expect(page.getByRole('region', { name: 'Bestelldetails' }).getByText('Abgelehnt', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rückmeldung verarbeitet; Lieferstatus oben prüfen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lieferantenangebot erfassen' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Kosten von .* freigeben/ })).toHaveCount(0);
});

test('late processing reads cannot repaint a detached Manager tab', async ({ page }) => {
  const fixture = await install(page);
  const reload = page.getByRole('button', { name: 'Stand aktualisieren' });
  await expect(reload).toBeEnabled(); fixture.holdReads(); await reload.click();
  await page.locator('#managerTab-BOOKINGS').click(); fixture.releaseRead();
  await expect(page.locator('#managerTab-BOOKINGS')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Lieferbearbeitung' })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
});
