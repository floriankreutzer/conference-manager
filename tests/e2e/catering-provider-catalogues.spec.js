import { expect,test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ORIGIN = 'https://supplier-catalogue.test';
const id = (n) => `d0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const terms = { minimumLeadTimeMinutes: 120,minimumOrderValue: null,changeCutoffMinutes: null,cancelCutoffMinutes: 0 };
const item = (n) => ({ id: `item-${n}`,name: `Synthetic supplier item ${n}`,description: 'Synthetic supplier description',
  providerPrice: n === 0 ? null : { amountMinor: 250,currency: 'EUR' } });
async function install(page,{ language = 'de',failDetails = false,delay = false,corruptDetails = false,
  manual = false,delayWrite = false,uncertainWrite = false,rejectWrite = 0 } = {}) {
  const calls = []; let saved = null; let release; const pending = new Promise((resolve) => { release = resolve; });
  await page.route(`${ORIGIN}/**`,async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const json = (value,status = 200) => route.fulfill({ status,contentType: 'application/json',body: JSON.stringify(value) });
    if (url.pathname.startsWith('/api/')) {
      calls.push({ method: request.method(),path: url.pathname,query: url.search,
        body: request.method() === 'POST' ? request.postDataJSON() : null });
      if (request.method() === 'POST') {
        if (rejectWrite) return json({ code: 'SYNTHETIC_REJECTED_BEFORE_WRITE' },rejectWrite);
        if (delayWrite) await pending; saved = request.postDataJSON();
        return uncertainWrite ? json({ code: 'SYNTHETIC_RESPONSE_LOST' },503) : json({ schemaVersion: 1,
          commandId: saved.commandId,revision: 2,configurationRevision: 2,replayed: false,recordedAt: '2026-10-19T00:00:00.000Z' });
      }
      if (url.pathname === '/api/v1/tenant/catering/provider-catalogues') {
        return json({ schemaVersion: 1,connections: [{ integrationId: id(1),providerId: 'manual_catering',
          configurationRevision: 2,currentRevision: saved ? 2 : 1,canReceive: manual }],nextAfterIntegrationId: null });
      }
      if (url.pathname.endsWith('/revisions/1')) {
        if (delay) await pending;
        if (failDetails) return json({ code: 'AUTHENTICATION_REQUIRED' },401);
        const section = url.searchParams.get('section'); const after = url.searchParams.get('afterEntryId');
        const configurationRevision = corruptDetails ? 2 : 1; corruptDetails = false;
        return json({ schemaVersion: 1,integrationId: id(1),providerId: 'manual_catering',revision: 1,configurationRevision,
          reference: 'Synthetic received supplier list',recordedAt: '2026-10-19T00:00:00.000Z',sourceVersion: null,terms,
          itemCount: 6,packageCount: 0,section,
          entries: section === 'packages' ? [] : after ? [item(5)] : Array.from({ length: 5 },(_,n) => item(n)),
          nextAfterEntryId: section === 'packages' || after ? null : 'item-4' });
      }
      return json({ schemaVersion: 1,integrationId: id(1),providerId: 'manual_catering',configurationRevision: 2,
        currentRevision: saved ? 2 : 1,canReceive: manual,revisions: [
          ...(saved ? [{ revision: 2,configurationRevision: 2,reference: saved.reference,recordedAt: '2026-10-19T00:00:00.000Z',
            summary: { sourceVersion: saved.source.sourceVersion,itemCount: saved.source.items.length,
              packageCount: saved.source.packages.length,terms: saved.source.terms } }] : []),
          { revision: 1,configurationRevision: 1,
          reference: 'Synthetic received supplier list',recordedAt: '2026-10-19T00:00:00.000Z',
          summary: { sourceVersion: null,itemCount: 6,packageCount: 0,terms } }],nextBeforeRevision: null });
    }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html',body: `<!doctype html><html lang="${language}">
      <head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/tokens.css">
      <link rel="stylesheet" href="/assets/styles.css"></head><body><h1>Supplier catalogue fixture</h1><main id="app"></main>
      <button id="leave">Leave fixture</button><script type="module">
      import { renderCateringProviderCatalogues } from '/src/manager/catering-source-application.js';
      import { createCateringProviderCatalogueApi } from '/src/platform/catering-provider-catalogue-api.js';
      import { setLanguage } from '/src/core/i18n.js';
      setLanguage('${language}'); let active = true;
      document.getElementById('leave').addEventListener('click',() => { active = false; document.getElementById('app').replaceChildren(); });
      const adapter = createCateringProviderCatalogueApi({ apiClient: { async request(path,options = {}) {
        const response = await fetch('/api/'+path,{ method: options.method || 'GET',
          headers: { 'content-type': 'application/json' },body: options.body ? JSON.stringify(options.body) : undefined });
        const value = await response.json();
        if (!response.ok) throw Object.assign(new Error('Synthetic API error'),{ code: 'HTTP_'+response.status,serverCode: value.code });
        return value;
      } } });
      await renderCateringProviderCatalogues({ root: document.getElementById('app'),adapter,isCurrent: () => active,
        onAuthorityFailure: () => { document.getElementById('app').replaceChildren(); document.documentElement.dataset.locked = 'true'; } });
      window.ready = true;
      </script></body></html>` });
    const file = path.resolve(ROOT,`.${url.pathname}`);
    if (!file.startsWith(`${ROOT}${path.sep}`) || !/\.(js|css)$/.test(file)) return route.abort();
    try { return route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript',body: await readFile(file) }); }
    catch { return route.fulfill({ status: 404,body: '' }); }
  });
  await page.goto(ORIGIN); await page.waitForFunction(() => window.ready === true);
  return { calls,release };
}
for (const language of ['de','en']) test(`${language} Manager reads historical catalogue costs and terms with bounded pages, focus and phone reflow`,
  async ({ page }) => {
    const fixture = await install(page,{ language });
    const connection = page.getByLabel(language === 'de' ? 'Lieferantenverbindung' : 'Supplier connection');
    await connection.selectOption(id(1));
    await expect(page.getByRole('status')).toHaveText(language === 'de' ? 'Eingangshistorie geladen.' : 'Receipt history loaded.');
    await expect(page.getByText(language === 'de' ? 'Neue Eingänge sind derzeit nicht möglich.' : 'New receipts are currently unavailable.',
      { exact: false })).toBeVisible();
    const historyNext = page.getByRole('button',{ name: language === 'de' ? 'Ältere Eingänge' : 'Earlier receipts' });
    await expect(historyNext).toBeDisabled();
    await page.getByRole('button',{ name: language === 'de' ? 'Eingang 1 ansehen' : 'View receipt 1' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading',{ name: language === 'de' ? 'Katalogeingang 1' : 'Catalogue receipt 1',level: 3 })).toBeFocused();
    await expect(page.getByRole('heading',{ name: 'Synthetic supplier item 0',exact: true })).toBeVisible();
    await expect(page.getByText(language === 'de' ? 'Einkaufspreis: Unbekannt' : 'Supplier cost: Unknown',{ exact: true })).toBeVisible();
    await expect(page.getByText(language === 'de' ? 'Einkaufspreis: 2,50 €' : 'Supplier cost: €2.50',{ exact: true }).first()).toBeVisible();
    await expect(historyNext).toBeDisabled();
    const next = page.getByRole('button',{ name: language === 'de' ? 'Weitere Produkte' : 'More products' });
    await next.click(); await expect(page.getByRole('heading',{ name: 'Synthetic supplier item 5',exact: true })).toBeVisible();
    await expect(next).toBeDisabled();
    await page.getByRole('button',{ name: language === 'de' ? 'Pakete' : 'Packages',exact: true }).click();
    await expect(page.getByText(language === 'de' ? 'Keine Produkte auf dieser Seite.' : 'No products on this page.',{ exact: true })).toBeVisible();
    await expect(next).toBeDisabled();
    await page.getByRole('button',{ name: language === 'de' ? 'Katalogstand neu laden' : 'Reload catalogue state' }).click();
    await expect(page.getByRole('heading',{ name: language === 'de' ? 'Eingangshistorie' : 'Received catalogue history' })).toBeFocused();
    expect(fixture.calls.every((call) => call.method === 'GET')).toBe(true);
    expect(fixture.calls.some((call) => call.query.includes('afterEntryId=item-4'))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 844,height: 390 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await connection.selectOption('');
    await expect(page.getByRole('heading',{ name: language === 'de' ? 'Eingangshistorie' : 'Received catalogue history' })).toHaveCount(0);
  });

test('session loss clears catalogue disclosure through the owning authority callback',async ({ page }) => {
  await install(page,{ failDetails: true }); await page.getByLabel('Lieferantenverbindung').selectOption(id(1));
  await page.getByRole('button',{ name: 'Eingang 1 ansehen' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-locked','true');
  await expect(page.locator('[data-catering-sources]')).toHaveCount(0);
});

test('late catalogue detail cannot repopulate a detached view or steal focus from the next view',async ({ page }) => {
  const fixture = await install(page,{ delay: true }); await page.getByLabel('Lieferantenverbindung').selectOption(id(1));
  await page.getByRole('button',{ name: 'Eingang 1 ansehen' }).click();
  await expect.poll(() => fixture.calls.some((call) => call.path.endsWith('/revisions/1'))).toBe(true);
  await page.getByRole('button',{ name: 'Leave fixture' }).click(); fixture.release();
  await expect(page.getByRole('button',{ name: 'Leave fixture' })).toBeFocused();
  await expect(page.locator('#app')).toBeEmpty();
});

test('contradictory immutable source metadata clears stale success and requires an explicit read recovery',async ({ page }) => {
  const fixture = await install(page,{ corruptDetails: true }); await page.getByLabel('Lieferantenverbindung').selectOption(id(1));
  await page.getByRole('button',{ name: 'Eingang 1 ansehen' }).click();
  await expect(page.getByRole('status')).toHaveText('Der Katalogstand konnte nicht verlässlich geladen werden. Laden Sie ihn erneut.');
  await expect(page.getByRole('heading',{ name: 'Synthetic supplier item 0' })).toHaveCount(0);
  await page.getByRole('button',{ name: 'Katalogstand neu laden' }).click();
  await page.getByRole('button',{ name: 'Eingang 1 ansehen' }).click();
  await expect(page.getByRole('heading',{ name: 'Synthetic supplier item 0',exact: true })).toBeVisible();
  expect(fixture.calls.filter((call) => call.path.endsWith('/revisions/1'))).toHaveLength(2);
  expect(fixture.calls.every((call) => call.method === 'GET')).toBe(true);
});

for (const language of ['de','en']) test(`${language} Manager records actual manual catalogue receipt with separate costs and deliberate attestation`,
  async ({ page }) => {
    const fixture = await install(page,{ language,manual: true,delayWrite: true });
    const word = (de,en) => language === 'de' ? de : en;
    await page.getByLabel(word('Lieferantenverbindung','Supplier connection')).selectOption(id(1));
    await page.getByRole('button',{ name: word('Lieferantenkatalogeingang erfassen','Record a received supplier catalogue') }).click();
    const form = page.locator('[data-catering-source-editor]');
    const reference = form.getByLabel(word('Beleg oder Bezug zum erhaltenen Lieferantenkatalog','Evidence or reference for the received supplier catalogue'));
    await expect(reference).toBeFocused(); await reference.fill('Synthetic actually received new supplier list');
    await form.getByRole('button',{ name: word('Artikel hinzufügen','Add item') }).click();
    const item = form.getByRole('group',{ name: word('Artikel 1','Item 1'),exact: true });
    await item.getByLabel(word('Artikel- oder Variantenreferenz beim Lieferanten','Supplier item or variant reference')).fill('coffee');
    await item.getByLabel(word('Name laut Lieferantenkatalog','Name in the supplier catalogue')).fill('Synthetic supplier coffee');
    await item.getByLabel(word('Einkaufspreis pro Einheit, falls bekannt','Supplier cost per unit, if known')).fill('2,50');
    await form.getByRole('button',{ name: word('Paket hinzufügen','Add package') }).click();
    const group = form.getByRole('group',{ name: word('Paket 1','Package 1'),exact: true });
    await group.getByLabel(word('Artikel- oder Variantenreferenz beim Lieferanten','Supplier item or variant reference'),{ exact: false }).first().fill('break');
    await group.getByLabel(word('Name laut Lieferantenkatalog','Name in the supplier catalogue'),{ exact: false }).first().fill('Synthetic supplier break');
    await group.getByRole('checkbox',{ name: 'Synthetic supplier coffee · coffee' }).check();
    await group.getByRole('button',{ name: word('Variante hinzufügen','Add variant') }).click();
    const variant = group.getByRole('group',{ name: word('Variante 1','Variant 1'),exact: true });
    await variant.getByLabel(word('Artikel- oder Variantenreferenz beim Lieferanten','Supplier item or variant reference')).fill('standard');
    await variant.getByLabel(word('Name laut Lieferantenkatalog','Name in the supplier catalogue')).fill('Synthetic standard variant');
    await variant.getByLabel(word('Einkaufspreis pro Einheit, falls bekannt','Supplier cost per unit, if known')).fill('0');
    const save = form.getByRole('button',{ name: word('Als ungeprüften Eingang speichern','Save as an unreviewed receipt') });
    await save.click(); expect(fixture.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    await form.getByRole('checkbox',{ name: word(
      'Ich bestätige, dass dieser Katalog mit diesen Inhalten tatsächlich vom Lieferanten eingegangen ist.',
      'I confirm that this catalogue with these contents was actually received from the supplier.') }).check();
    await save.focus(); await page.keyboard.press('Enter');
    await expect.poll(() => fixture.calls.filter((call) => call.method === 'POST').length).toBe(1);
    await expect(save).toBeDisabled(); await expect(reference).toBeDisabled();
    await expect(page.getByRole('button',{ name: word('Katalogstand neu laden','Reload catalogue state') })).toBeDisabled();
    const write = fixture.calls.find((call) => call.method === 'POST').body;
    expect(write).toMatchObject({ schemaVersion: 1,expectedRevision: 1,expectedConfigurationRevision: 2,attestReceivedFromSupplier: true,
      source: { sourceVersion: null,items: [{ id: 'coffee',providerPrice: { amountMinor: 250,currency: 'EUR' } }],
        packages: [{ id: 'break',providerPrice: null,itemIds: ['coffee'],variants: [{ id: 'standard',providerPrice: { amountMinor: 0,currency: 'EUR' } }] }],
        terms: { minimumLeadTimeMinutes: null,minimumOrderValue: null,changeCutoffMinutes: null,cancelCutoffMinutes: null } } });
    expect(write.source.items[0]).not.toHaveProperty('price'); expect(write).not.toHaveProperty('tenantId');
    fixture.release(); await expect(form).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText(word('Katalogeingang 2 gespeichert. Er ist noch nicht veröffentlicht.',
      'Catalogue receipt 2 saved. It has not been published.'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

test('uncertain manual receipt stays locked and does not retry until an explicit history read',async ({ page }) => {
  const fixture = await install(page,{ manual: true,uncertainWrite: true });
  await page.getByLabel('Lieferantenverbindung').selectOption(id(1));
  await page.getByRole('button',{ name: 'Lieferantenkatalogeingang erfassen' }).click();
  const form = page.locator('[data-catering-source-editor]');
  await form.getByLabel('Beleg oder Bezug zum erhaltenen Lieferantenkatalog').fill('Synthetic received empty catalogue');
  await form.getByRole('checkbox').check(); await form.getByRole('button',{ name: 'Als ungeprüften Eingang speichern' }).click();
  await expect(form.getByRole('button',{ name: 'Als ungeprüften Eingang speichern' })).toBeDisabled();
  await expect(form.getByRole('status')).toContainText('Speicherstand ist unklar');
  expect(fixture.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  await page.getByRole('button',{ name: 'Katalogstand neu laden' }).click();
  await expect(form).toHaveCount(0); await expect(page.getByRole('button',{ name: 'Eingang 2 ansehen' })).toBeVisible();
  expect(fixture.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
});

test('duplicate supplier references fail locally, preserve entered evidence and permit a deliberate corrected receipt',async ({ page }) => {
  const fixture = await install(page,{ manual: true }); await page.getByLabel('Lieferantenverbindung').selectOption(id(1));
  await page.getByRole('button',{ name: 'Lieferantenkatalogeingang erfassen' }).click();
  const form = page.locator('[data-catering-source-editor]');
  await form.getByLabel('Beleg oder Bezug zum erhaltenen Lieferantenkatalog').fill('Synthetic actual source with corrected references');
  for (const index of [1,2]) {
    await form.getByRole('button',{ name: 'Artikel hinzufügen' }).click();
    const row = form.getByRole('group',{ name: `Artikel ${index}`,exact: true });
    await row.getByLabel('Artikel- oder Variantenreferenz beim Lieferanten').fill('coffee');
    await row.getByLabel('Name laut Lieferantenkatalog').fill(`Synthetic item ${index}`);
  }
  await form.getByRole('checkbox').check(); await form.getByRole('button',{ name: 'Als ungeprüften Eingang speichern' }).click();
  await expect(form.getByRole('status')).toContainText('Prüfen Sie die Angaben');
  expect(fixture.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  await expect(form.getByLabel('Beleg oder Bezug zum erhaltenen Lieferantenkatalog')).toHaveValue('Synthetic actual source with corrected references');
  const second = form.getByRole('group',{ name: 'Artikel 2',exact: true });
  await second.getByLabel('Artikel- oder Variantenreferenz beim Lieferanten').fill('fruit');
  await page.screenshot({ path: '/tmp/saas4-source-editor-de-phone-recovered.png',fullPage: true });
  await form.getByRole('button',{ name: 'Als ungeprüften Eingang speichern' }).click(); await expect(form).toHaveCount(0);
  expect(fixture.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  expect(fixture.calls.find((call) => call.method === 'POST').body.source.items.every((entry) => entry.providerPrice === null)).toBe(true);
});

for (const status of [400,413]) test(`known${status} input rejection retains an editable draft without a success or automatic retry`,async ({ page }) => {
  const fixture = await install(page,{ manual: true,rejectWrite: status });
  await page.getByLabel('Lieferantenverbindung').selectOption(id(1));
  await page.getByRole('button',{ name: 'Lieferantenkatalogeingang erfassen' }).click();
  const form = page.locator('[data-catering-source-editor]');
  const reference = form.getByLabel('Beleg oder Bezug zum erhaltenen Lieferantenkatalog');
  await reference.fill('Synthetic source retained after known rejection'); await form.getByRole('checkbox').check();
  const save = form.getByRole('button',{ name: 'Als ungeprüften Eingang speichern' }); await save.click();
  await expect(form.getByRole('status')).toContainText(status === 413 ? 'zulässige Größe' : 'Prüfen Sie die Angaben');
  await expect(reference).toBeEnabled(); await expect(save).toBeEnabled();
  await expect(reference).toHaveValue('Synthetic source retained after known rejection');
  expect(fixture.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  await expect(page.getByRole('button',{ name: 'Eingang 2 ansehen' })).toHaveCount(0);
  await form.getByRole('button',{ name: 'Erfassung verwerfen' }).click(); await expect(form).toHaveCount(0);
  await expect(page.getByRole('button',{ name: 'Katalogstand neu laden' })).toBeFocused();
});
