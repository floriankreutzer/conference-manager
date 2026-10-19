import { expect,test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ORIGIN = 'https://catalogue-review-editor.test';
async function install(page,{ language = 'de',capacity = false } = {}) {
  await page.route(`${ORIGIN}/**`,async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html',body: `<!doctype html><html lang="${language}">
      <head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/tokens.css">
      <link rel="stylesheet" href="/assets/styles.css"></head><body><h1>Synthetic catalogue review editor</h1>
      <button id="show-items">Items</button><button id="show-packages">Packages</button><main id="app"></main>
      <script type="module">
      import { createCateringPublicationEditor } from '/src/manager/catering-publication-editor.js';
      import { createCateringPublicationReview } from '/src/manager/catering-publication-review.js';
      import { nextStableCatalogueId } from '/src/manager/business-settings-application.js';
      import { setLanguage } from '/src/core/i18n.js';
      setLanguage('${language}');
      const id = n => 'e0000000-0000-4000-8000-'+String(n).padStart(12,'0');
      const price = amountMinor => ({ amountMinor,currency: 'EUR' });
      const item = { id: 'source-coffee',name: 'Received coffee',description: null,providerPrice: price(250) };
      const bundle = { id: 'source-break',name: 'Received break',description: null,providerPrice: null,itemIds: ['source-coffee'],
        variants: [{ id: 'source-standard',name: 'Received standard',description: null,providerPrice: price(0) }] };
      const common = (id,name) => ({ id,name,description: null,price: price(700),active: true,order: 0,siteIds: [],roomIds: [] });
      const existing = ${capacity} ? Array.from({ length: 20 },(_,i) => ({ id: i===0 ? 'our-standard' : 'retained-'+i,
        name: 'Existing variant '+i,description: null,price: price(1000),active: true,order: i }))
        : [{ id: 'our-standard',name: 'Existing standard',description: null,price: price(1000),active: true,order: 0 }];
      const draft = createCateringPublicationReview({ current: { schemaVersion: 1,integrationId: id(3),canReview: true,
        reviewRevision: 1,sourceRevision: 1,configurationRevision: 1,catalogueRevision: 2,assignmentRevision: 1,publicationRevision: 1 },
        canonical: { revision: 2,catalogue: { cateringItems: [common('our-coffee','Existing coffee'),common('other-fruit','Other fruit')],
          cateringPackages: [{ ...common('our-break','Existing break'),itemIds: ['our-coffee'],variants: existing }] } },
        assignments: { revision: 1,currentCatalogueRevision: 2,assignedCatalogueRevision: 2,stale: false,assignments: [
          { kind: 'item',entryId: 'our-coffee',integrationId: id(3) },{ kind: 'item',entryId: 'other-fruit',integrationId: id(4) },
          { kind: 'package',entryId: 'our-break',integrationId: id(3) }] },
        bindings: [{ kind: 'item',entryId: 'our-coffee',sourceId: 'source-coffee',variants: [] },
          { kind: 'package',entryId: 'our-break',sourceId: ${capacity} ? 'source-break' : 'earlier-break',
            variants: [{ entryId: 'our-standard',sourceId: 'source-standard' }] }] });
      window.submissions=[];
      const editor = createCateringPublicationEditor({ draft,prefix: 'review-fixture',defaultCurrency: 'EUR',createId: nextStableCatalogueId,
        locations: { sites: [{ id: 'site-a',name: 'Synthetic site',active: true }],
          rooms: [{ id: 'room-a',name: 'Synthetic room',active: true }] },
        onSubmit: async command => { window.submissions.push(command); },onCancel: () => document.getElementById('app').replaceChildren() });
      document.getElementById('app').append(editor.root); editor.showPage('item',[item]);
      document.getElementById('show-items').onclick=()=>editor.showPage('item',[item]);
      document.getElementById('show-packages').onclick=()=>editor.showPage('package',[bundle]);
      window.ready=true;
      </script></body></html>` });
    const file = path.resolve(ROOT,`.${url.pathname}`);
    if (!file.startsWith(`${ROOT}${path.sep}`) || !/\.(js|css)$/.test(file)) return route.abort();
    try { return route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript',body: await readFile(file) }); }
    catch { return route.fulfill({ status: 404,body: '' }); }
  });
  await page.goto(ORIGIN); await page.waitForFunction(() => window.ready === true);
}
const copy = (language) => language === 'de' ? { decision: 'Entscheidung',price: 'Verkaufspreis je Einheit',
  add: 'Zur Freigabe auswählen',reason: 'Begründung der Prüfung',preview: 'Auswirkungen prüfen',save: 'Entscheidung speichern',
  attest: 'Ich habe die Inhalte, Verkaufspreise und Auswirkungen dieser Entscheidung geprüft.',effects: 'Auswirkungen der Entscheidung' }
  : { decision: 'Decision',price: 'Selling price per unit',add: 'Select for publication',reason: 'Review justification',
    preview: 'Review effects',save: 'Save decision',attest: 'I have reviewed the content, selling prices and effects of this decision.',
    effects: 'Decision effects' };
for (const language of ['de','en']) test(`${language} explicit publication separates costs and selling prices, reviews variants/omissions and reflows`,
  async ({ page }) => {
    await install(page,{ language }); const words=copy(language);
    await page.getByRole('combobox',{ name: new RegExp('^'+words.decision+'(?:\\s|$)') }).selectOption('published');
    await page.getByRole('button',{ name: words.add,exact: true }).click();
    const item = page.locator('[data-review-source-kind="item"]');
    await expect(item.getByLabel(words.price)).toHaveValue(language === 'de' ? '7,00' : '7.00');
    await expect(item.getByRole('option',{ name: 'Other fruit' })).toHaveCount(0);
    await item.getByLabel(words.price).fill(language === 'de' ? '9,25' : '9.25');
    await page.locator('#show-packages').click(); await page.getByRole('button',{ name: words.add,exact: true }).click();
    const bundle = page.locator('[data-review-source-kind="package"]');
    await expect(bundle.getByLabel(words.price).first()).toHaveValue('');
    await bundle.getByLabel(words.price).first().fill('12,00');
    await bundle.getByLabel(language === 'de' ? 'Variante übernehmen: Received standard' : 'Include variant: Received standard').check();
    await expect(bundle.getByLabel(words.price).nth(1)).toHaveValue(''); await bundle.getByLabel(words.price).nth(1).fill('15,50');
    await page.getByLabel(words.reason).fill('Synthetic deliberate review of content, prices and retired offers');
    await page.getByRole('button',{ name: words.save,exact: true }).click();
    expect(await page.evaluate(() => window.submissions.length)).toBe(0);
    await page.getByRole('button',{ name: words.preview,exact: true }).click();
    await expect(page.getByRole('heading',{ name: words.effects,exact: true })).toBeFocused();
    await expect(page.getByRole('listitem').filter({ hasText: /^Existing break$/ })).toBeVisible();
    const attestation = page.getByLabel(words.attest,{ exact: false }); await expect(attestation).toBeEnabled();
    await expect(attestation).not.toBeChecked(); await attestation.check();
    await page.getByRole('button',{ name: words.save,exact: true }).click();
    const commands = await page.evaluate(() => window.submissions); expect(commands).toHaveLength(1);
    expect(commands[0].items[0].price).toEqual({ amountMinor: 925,currency: 'EUR' });
    expect(commands[0].packages[0].price.amountMinor).toBe(1200); expect(commands[0].packages[0].variants[0].price.amountMinor).toBe(1550);
    expect(JSON.stringify(commands[0])).not.toMatch(/providerPrice|tenantId|actorUserId/);
    for (const viewport of [{ width: 320,height: 720 },{ width: 844,height: 390 }]) {
      await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    }
    if (language === 'de') { await page.setViewportSize({ width: 320,height: 720 });
      await page.screenshot({ path: '/tmp/saas4-publication-editor-de-phone.png',fullPage: true }); }
  });

test('rejection retains the existing publication and changed reasoning requires a fresh preview and attestation',async ({ page }) => {
  await install(page); const words=copy('de');
  await page.getByRole('combobox',{ name: new RegExp('^'+words.decision+'(?:\\s|$)') }).selectOption('rejected');
  await page.getByLabel(words.reason).fill('Synthetic initial rejection rationale');
  await page.getByRole('button',{ name: words.preview,exact: true }).click();
  await expect(page.getByText('Der bisher veröffentlichte Katalog bleibt bestehen.',{ exact: true })).toBeVisible();
  const attest=page.getByLabel(words.attest,{ exact: false }); await attest.check();
  await page.getByLabel(words.reason).fill('Synthetic corrected rejection rationale');
  await expect(attest).not.toBeChecked(); await expect(attest).toBeDisabled();
  await page.getByRole('button',{ name: words.save,exact: true }).click(); expect(await page.evaluate(() => window.submissions)).toEqual([]);
  await page.getByRole('button',{ name: words.preview,exact: true }).click(); await attest.check();
  await page.getByRole('button',{ name: words.save,exact: true }).click();
  const command=(await page.evaluate(() => window.submissions))[0]; expect(command.decision).toBe('rejected');
  expect(command.items).toEqual([]); expect(command.packages).toEqual([]);
  expect(command.justification).toBe('Synthetic corrected rejection rationale');
});
test('package components need explicit review, and full retained variant history offers existing targets without deleting history',async ({ page }) => {
  await install(page,{ capacity: true }); const words=copy('de');
  await page.getByRole('combobox',{ name: new RegExp('^'+words.decision+'(?:\\s|$)') }).selectOption('published');
  await page.locator('#show-packages').click(); await page.getByRole('button',{ name: words.add,exact: true }).click();
  const bundle=page.locator('[data-review-source-kind="package"]');
  await bundle.getByLabel('Variante übernehmen: Received standard').check();
  const targets=bundle.getByLabel('Zieleintrag im Verkaufskatalog');
  await expect(targets.nth(1).getByRole('option',{ name: 'Neuen Eintrag anlegen',exact: true })).toHaveJSProperty('disabled',true);
  await expect(bundle.getByLabel(words.price).nth(1)).toHaveValue('10,00');
  await page.getByLabel(words.reason).fill('Synthetic existing variant and component review');
  await page.getByRole('button',{ name: words.preview,exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('auch alle enthaltenen Artikel');
  await expect(page.getByLabel(words.attest,{ exact: false })).toBeDisabled();
  expect(await page.evaluate(() => window.submissions)).toEqual([]);
  await page.locator('#show-items').click(); await page.getByRole('button',{ name: words.add,exact: true }).click();
  await page.getByRole('button',{ name: words.preview,exact: true }).click();
  await page.getByLabel(words.attest,{ exact: false }).check(); await page.getByRole('button',{ name: words.save,exact: true }).click();
  const command=(await page.evaluate(() => window.submissions))[0];
  expect(command.packages[0].variants[0].entryId).toBe('our-standard'); expect(command.items).toHaveLength(1);
});
