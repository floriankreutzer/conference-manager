import { expect, test } from '@playwright/test';
import { installCateringDeliveryFixture as install } from './support/catering-delivery-fixture.js';

const words = {
  de: { region: 'Manuelle Übermittlung und Rückmeldung', queue: 'Freigegebene Version zur Bearbeitung einreihen',
    channel: 'Kanal', reference: 'Vorgangsreferenz', occurred: 'Tatsächlicher Zeitpunkt (UTC)', save: 'Nachweis verbindlich erfassen',
    attestSent: 'Ich bestätige, dass diese Bestellversion bereits tatsächlich manuell übermittelt wurde.',
    attestReceipt: 'Ich bestätige, dass die gewählten Ergebnisse die tatsächlich erhaltene Lieferantenrückmeldung wiedergeben.',
    receipt: 'Lieferantenrückmeldung erfassen', reload: 'Nachweise aktualisieren',
    orderReload: 'Aktuellen Stand laden und Entwurf verwerfen', noEffective: 'Noch keine vollständig bestätigte Bestellversion.' },
  en: { region: 'Manual transmission and supplier response', queue: 'Queue approved version for processing',
    channel: 'Channel', reference: 'Business reference', occurred: 'Actual occurrence time (UTC)', save: 'Commit factual record',
    attestSent: 'I confirm that this order version has already been manually transmitted.',
    attestReceipt: 'I confirm that the selected outcomes match the supplier response actually received.',
    receipt: 'Record supplier response', reload: 'Refresh records',
    orderReload: 'Load current state and discard draft', noEffective: 'No fully confirmed order version yet.' },
};
async function prepare(page, options = {}) {
  const language = options.language || 'de'; const text = words[language];
  const fixture = await install(page, { extraPosition: true, ...options });
  await page.getByRole('button', { name: text.queue, exact: true }).click();
  const region = page.getByRole('region', { name: text.region, exact: true });
  return { fixture, region, text };
}
async function fill(page, region, text, kind = 'transmitted') {
  await region.getByRole('combobox', { name: `${text.channel} *`, exact: true }).selectOption('telephone');
  await region.getByLabel(`${text.reference} *`, { exact: true }).fill('Synthetic conversation #1');
  const occurred = await page.evaluate(() => new Date(Date.now() - 1000).toISOString().slice(0, -1)
    .replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1').replace(/:00$/, ''));
  await region.getByLabel(`${text.occurred} *`, { exact: true }).fill(occurred);
  await region.getByLabel(`${kind === 'transmitted' ? text.attestSent : text.attestReceipt} *`, { exact: true }).check();
}
for (const language of ['de','en']) {
  test(`Manager records actual manual transmission and complete outcomes separately without assuming supplier commitment in ${language}`,
    async ({ page }, testInfo) => {
      const { fixture, region, text } = await prepare(page, { language });
      await expect(region.getByText(text.noEffective, { exact: true })).toBeVisible();
      expect(fixture.manualWrites).toHaveLength(0);
      await fill(page, region, text);
      const reloadDraft = region.getByRole('button', { name: text.reload, exact: true });
      await reloadDraft.click();
      await expect(reloadDraft).toBeEnabled();
      await expect(region.getByLabel(`${text.reference} *`, { exact: true })).toHaveValue('Synthetic conversation #1');
      const save = region.getByRole('button', { name: text.save, exact: true });
      await save.focus(); await page.keyboard.press('Enter');
      await expect(region.getByRole('heading', { name: text.receipt, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: text.orderReload, exact: true })).toBeFocused();
      expect(fixture.manualWrites).toHaveLength(1);
      expect(fixture.manualWrites[0]).toMatchObject({ schemaVersion: 1, expectedOrderVersion: 1, expectedStateRevision: 4,
        kind: 'transmitted', channel: 'telephone', reference: 'Synthetic conversation #1', receipt: null });
      expect(Object.keys(fixture.manualWrites[0]).sort()).toEqual(['schemaVersion','commandId','expectedOrderVersion',
        'expectedStateRevision','kind','channel','reference','occurredAt','receipt'].sort());
      await expect(region.getByText(text.noEffective, { exact: true })).toBeVisible();
      const form = region.locator('form');
      for (const position of fixture.current.order.positions) await expect(form.getByRole('combobox', { name: `${position.name} *`, exact: true })).toHaveValue('');
      await fill(page, region, text, 'receipt');
      for (const [index, position] of fixture.current.order.positions.entries()) {
        await form.getByRole('combobox', { name: `${position.name} *`, exact: true }).selectOption(index === 0 ? 'confirmed' : 'substitution_proposed');
      }
      await save.click();
      await expect(region.getByText(text.noEffective, { exact: true })).toBeVisible();
      await expect(region.locator('form').getByLabel(`${text.reference} *`, { exact: true })).toHaveValue('');
      expect(fixture.current.state.status).toBe('partially_confirmed');
      await fill(page, region, text, 'receipt');
      for (const position of fixture.current.order.positions) await region.locator('form').getByRole('combobox', { name: `${position.name} *`, exact: true })
        .selectOption('confirmed');
      await save.click();
      await expect(region.getByText(language === 'de' ? 'Wirksame Bestellversion 1: Vom Lieferanten bestätigt' : 'Effective order version 1: Confirmed by supplier',
        { exact: true })).toBeVisible();
      expect(fixture.manualWrites).toHaveLength(3); expect(fixture.writes).toHaveLength(1);
      expect(JSON.stringify(fixture.manualWrites)).not.toMatch(/amountMinor|credential|tenantId|actorUserId|sessionId|unitPrice/);
      fixture.defer();
      await page.getByRole('region', { name: language === 'de' ? 'Lieferbearbeitung' : 'Delivery processing' })
        .getByRole('button', { name: language === 'de' ? 'Stand aktualisieren' : 'Refresh state', exact: true }).click();
      await expect(page.getByRole('heading', { name: language === 'de'
        ? 'Automatische Bearbeitung zurückgestellt' : 'Automatic processing deferred' })).toBeVisible();
      const refresh = region.getByRole('button', { name: text.reload, exact: true });
      await refresh.focus(); await page.keyboard.press('Enter'); await expect(refresh).toBeFocused();
      for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (viewport.width === 390) await region.screenshot({ path: testInfo.outputPath('manual-facts-phone.png') });
      }
    });
}

test('manual conflict disables factual and document writes until explicit source reload without replay', async ({ page }) => {
  const { fixture, region, text } = await prepare(page, { manualFailure: 409 });
  await fill(page, region, text); await region.getByRole('button', { name: text.save, exact: true }).click();
  await expect(region.getByRole('button', { name: text.save, exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'CSV herunterladen', exact: true })).toBeDisabled();
  expect(fixture.manualWrites).toHaveLength(1);
  fixture.failManualWrites(null); await page.getByRole('button', { name: text.orderReload, exact: true }).click();
  await expect(region.getByRole('button', { name: text.save, exact: true })).toBeEnabled();
  expect(fixture.manualWrites).toHaveLength(1);
});

test('manual read failure and malformed reference cannot create a factual write', async ({ page }) => {
  const { fixture, region, text } = await prepare(page, { manualReadFailure: 503 });
  await expect(region.locator('form')).toHaveCount(0); expect(fixture.manualWrites).toHaveLength(0);
  fixture.failManualReads(null); await region.getByRole('button', { name: text.reload, exact: true }).click();
  await fill(page, region, text); await region.getByLabel(`${text.reference} *`, { exact: true }).fill('https://synthetic.invalid');
  await region.getByRole('button', { name: text.save, exact: true }).click();
  await expect(region.getByLabel(`${text.reference} *`, { exact: true })).toBeFocused(); expect(fixture.manualWrites).toHaveLength(0);
});

test('manual authority loss locks the workspace and late history cannot repaint a detached tab', async ({ page }) => {
  const { fixture, region, text } = await prepare(page);
  const reload = region.getByRole('button', { name: text.reload, exact: true });
  await expect(reload).toBeEnabled(); fixture.holdManualReads(); await reload.click();
  await page.locator('#managerTab-BOOKINGS').click(); fixture.releaseManualReads();
  await expect(region).toHaveCount(0); expect(fixture.manualWrites).toHaveLength(0);
  const again = await prepare(page);
  await fill(page, again.region, again.text); again.fixture.failManualWrites(403);
  await again.region.getByRole('button', { name: again.text.save, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-session-locked', 'true');
  expect(again.fixture.manualWrites).toHaveLength(1);
});
