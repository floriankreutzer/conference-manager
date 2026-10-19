import { expect,test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ORIGIN='https://catalogue-publication.test';
const id=(n)=>`e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const time='2026-10-19T12:00:00.000Z';
const terms={ minimumLeadTimeMinutes: 120,minimumOrderValue: null,changeCutoffMinutes: null,cancelCutoffMinutes: 0 };
const product=(n)=>({ id: `supplier-${n}`,name: `Synthetic received item ${n}`,description: null,
  providerPrice: n===0 ? null : { amountMinor: 250,currency: 'EUR' } });
const common=(n)=>({ id: `our-${n}`,name: `Synthetic old item ${n}`,description: null,
  price: { amountMinor: 700,currency: 'EUR' },active: true,order: n,siteIds: [],roomIds: [] });
async function install(page,{ language='de',writeStatus=0,delayWrite=false,delayDetail=false,
  corruptPage=false,corruptBasis=false,authorityStatus=0,blocked=false,navigation=false,enabled=true }={}) {
  const calls=[]; let saved=null; let release; const pending=new Promise(resolve=>{ release=resolve; });
  const base='/api/v1/tenant/catering/provider-catalogues';
  const context=()=>({ schemaVersion: 1,integrationId: id(3),providerId: 'manual_catering',configurationRevision: 2,
    sourceRevision: 1,reviewRevision: saved ? 2 : 1,publicationRevision: saved?.decision==='published' ? 2 : 1,
    publishedSourceRevision: 1,catalogueRevision: saved?.decision==='published' ? 3 : 2,
    assignmentRevision: saved?.decision==='published' ? 2 : 1,canReview: !blocked });
  const oldReview={ revision: 1,sourceRevision: 1,configurationRevision: 1,catalogueRevision: 2,assignmentRevision: 1,
    publicationRevision: 1,decision: 'published',justification: 'Synthetic earlier publication',recordedAt: time };
  await page.route(`${ORIGIN}/**`,async route=>{
    const request=route.request(); const url=new URL(request.url());
    const json=(value,status=200)=>route.fulfill({ status,contentType: 'application/json',body: JSON.stringify(value) });
    if (url.pathname.startsWith('/api/')) {
      calls.push({ method: request.method(),path: url.pathname,query: url.search,body: request.method()==='POST' ? request.postDataJSON() : null });
      if (request.method()==='POST') {
        if (delayWrite) await pending;
        if (writeStatus) return json({ code: 'SYNTHETIC_WRITE_FAILURE' },writeStatus);
        saved=request.postDataJSON(); const state=context();
        return json({ schemaVersion: 1,commandId: saved.commandId,replayed: false,decision: saved.decision,reviewRevision: 2,
          publicationRevision: state.publicationRevision,catalogueRevision: state.catalogueRevision,
          assignmentRevision: state.assignmentRevision,recordedAt: time });
      }
      if (url.pathname===base) return json({ schemaVersion: 1,connections: [{ integrationId: id(3),providerId: 'manual_catering',
        configurationRevision: 2,currentRevision: 1,canReceive: true }],nextAfterIntegrationId: null });
      if (url.pathname.endsWith('/review')) {
        const after=url.searchParams.get('afterEntryId'); let entries=Array.from({ length: 7 },(_,n)=>({
          kind: 'item',entryId: `our-${n}`,sourceId: `supplier-${n}`,variants: [] }));
        if (saved?.decision==='published') entries=saved.items.map(x=>({ kind: 'item',entryId: x.entryId,sourceId: x.sourceId,variants: [] }));
        const start=after ? entries.findIndex(x=>x.entryId===after)+1 : 0; const slice=entries.slice(start,start+5);
        const state=context(); if (corruptBasis && after) state.configurationRevision=3;
        return json({ ...state,bindings: slice,nextAfterBinding: start+5<entries.length
          ? { kind: 'item',entryId: slice.at(-1).entryId } : null });
      }
      if (url.pathname.endsWith('/reviews')) return json({ schemaVersion: 1,integrationId: id(3),currentRevision: saved ? 2 : 1,
        revisions: [...(saved ? [{ ...oldReview,revision: 2,configurationRevision: 2,decision: saved.decision,
          justification: saved.justification,publicationRevision: context().publicationRevision,
          catalogueRevision: context().catalogueRevision,assignmentRevision: context().assignmentRevision }] : []),oldReview],
        nextBeforeRevision: null });
      if (url.pathname.endsWith('/revisions/1')) {
        if (delayDetail) await pending;
        if (authorityStatus) return json({ code: 'AUTHENTICATION_REQUIRED' },authorityStatus);
        const section=url.searchParams.get('section'); const after=url.searchParams.get('afterEntryId');
        const corrupt=corruptPage && after; if (corrupt) corruptPage=false;
        return json({ schemaVersion: 1,integrationId: id(3),providerId: 'manual_catering',revision: 1,configurationRevision: corrupt ? 2 : 1,
          reference: 'Synthetic immutable supplier receipt',recordedAt: time,sourceVersion: null,terms,itemCount: 7,packageCount: 0,
          section,entries: section==='packages' ? [] : after ? [product(5),product(6)] : Array.from({ length: 5 },(_,n)=>product(n)),
          nextAfterEntryId: section==='packages' || after ? null : 'supplier-4' });
      }
      return json({ schemaVersion: 1,integrationId: id(3),providerId: 'manual_catering',configurationRevision: 2,currentRevision: 1,
        canReceive: true,revisions: [{ revision: 1,configurationRevision: 1,reference: 'Synthetic immutable supplier receipt',recordedAt: time,
          summary: { sourceVersion: null,itemCount: 7,packageCount: 0,terms } }],nextBeforeRevision: null });
    }
    if (url.pathname==='/') return route.fulfill({ contentType: 'text/html',body: `<!doctype html><html lang="${language}">
      <head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/tokens.css">
      <link rel="stylesheet" href="/assets/styles.css"></head><body><h1 id="viewTitle" tabindex="-1">Synthetic publication fixture</h1><main id="app"></main>
      <button id="leave">Leave fixture</button><script type="module">
      import { renderCateringCataloguePublications } from '/src/manager/catering-publication-application.js';
      import { createCateringCataloguePublicationApi } from '/src/platform/catering-catalogue-publication-api.js';
      import { createCateringProviderCatalogueApi } from '/src/platform/catering-provider-catalogue-api.js';
      import { featureFlags } from '/src/platform/feature-flags.js';
      import { nextStableCatalogueId,catalogueDefaultCurrency,createManagerBusinessSettingsApplication } from '/src/manager/business-settings-application.js';
      import { setLanguage } from '/src/core/i18n.js';
      setLanguage('${language}'); let active=true;
      document.getElementById('leave').onclick=()=>{ active=false; document.getElementById('app').replaceChildren(); };
      const client={ async request(path,options={}) {
        const response=await fetch('/api/'+path,{ method: options.method || 'GET',headers: { 'content-type': 'application/json' },
          body: options.body ? JSON.stringify(options.body) : undefined }); const value=await response.json();
        if (!response.ok) throw Object.assign(new Error('Synthetic API failure'),{ code: 'HTTP_'+response.status,serverCode: value.code });
        return value;
      } };
      const items=${JSON.stringify(Array.from({length:7},(_,n)=>common(n)))};
      const adapter={ ...createCateringCataloguePublicationApi({ apiClient: client }),...createCateringProviderCatalogueApi({ apiClient: client }),
        async loadAssignments() { const context=await client.request('v1/tenant/catering/provider-catalogues/${id(3)}/review');
          return { revision: context.assignmentRevision,currentCatalogueRevision: context.catalogueRevision,
            assignedCatalogueRevision: context.catalogueRevision,stale: false,
            assignments: items.map(x=>({ kind: 'item',entryId: x.id,integrationId: '${id(3)}' })) }; } };
      const options={ root: document.getElementById('app'),adapter,createId: nextStableCatalogueId,
        defaultCurrencyFor: catalogueDefaultCurrency,catalogue: { async loadCatalogue() {
          const context=await client.request('v1/tenant/catering/provider-catalogues/${id(3)}/review');
          return { revision: context.catalogueRevision,catalogue: { cateringItems: items,cateringPackages: [] } }; } },
        locations: { async loadLocations() { return { configuration: { sites: [],rooms: [] } }; } },isCurrent: ()=>active,
        onAuthorityFailure: ()=>{ document.getElementById('app').replaceChildren(); document.documentElement.dataset.locked='true'; } };
      if (${navigation}) {
        const application=createManagerBusinessSettingsApplication({appRoot:options.root,
          setPageHeading:title=>{document.getElementById('viewTitle').textContent=title;},
          catalogue:{...options.catalogue,saveCatalogue:async()=>{},listCatalogueHistory:async()=>({revisions:[]})},
          locations:{...options.locations,saveLocations:async()=>{},listLocationsHistory:async()=>({revisions:[]})},
          cateringAssignments:{...adapter,featureFlags:featureFlags.forServerCateringCatalogue(${enabled})},
          onAuthorityFailure:options.onAuthorityFailure});
        await application.renderManagerSettings();
      } else await renderCateringCataloguePublications(options);
      window.ready=true;
      </script></body></html>` });
    const file=path.resolve(ROOT,`.${url.pathname}`);
    if (!file.startsWith(`${ROOT}${path.sep}`) || !/\.(js|css)$/.test(file)) return route.abort();
    try { return route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript',body: await readFile(file) }); }
    catch { return route.fulfill({ status: 404,body: '' }); }
  });
  await page.goto(ORIGIN); await page.waitForFunction(()=>window.ready===true);
  return { calls,release };
}
const words=(language='de')=>language==='de' ? { connection: 'Lieferantenverbindung',decision: /^Entscheidung(?:\s|$)/,
  price: 'Verkaufspreis je Einheit',add: 'Zur Freigabe auswählen',reason: 'Begründung der Prüfung',preview: 'Auswirkungen prüfen',
  attest: 'Ich habe die Inhalte, Verkaufspreise und Auswirkungen dieser Entscheidung geprüft.',save: 'Entscheidung speichern',
  reload: 'Prüfung verwerfen und Stand neu laden',next: 'Weitere Quelleinträge' } : { connection: 'Supplier connection',decision: /^Decision(?:\s|$)/,
  price: 'Selling price per unit',add: 'Select for publication',reason: 'Review justification',preview: 'Review effects',
  attest: 'I have reviewed the content, selling prices and effects of this decision.',save: 'Save decision',
  reload: 'Discard review and reload current state',next: 'More source entries' };
async function choose(page,language='de') {
  await page.getByLabel(words(language).connection).selectOption(id(3));
  await expect(page.locator('[data-catering-publication-editor]')).toBeVisible();
}
async function proposal(page,{ language='de',decision='published' }={}) {
  const w=words(language); await page.getByRole('combobox',{ name: w.decision }).selectOption(decision);
  if (decision==='published') {
    await page.getByRole('button',{ name: w.add,exact: true }).first().click();
    await page.locator('[data-review-source-kind]').getByLabel(w.price).fill('0');
  }
  await page.getByLabel(w.reason).fill('Synthetic deliberate catalogue review');
  await page.getByRole('button',{ name: w.preview,exact: true }).click(); await page.getByLabel(w.attest).check();
}
for (const language of ['de','en']) test(`${language} review uses complete retained bindings, immutable receipt metadata and deliberate zero-price publication`,async ({page})=>{
  const f=await install(page,{ language }); await choose(page,language); const w=words(language);
  expect(f.calls.some(c=>c.query.includes('afterEntryId=our-4'))).toBe(true);
  await proposal(page,{ language });
  await expect(page.getByRole('listitem').filter({ hasText: /^Synthetic old item 6$/ })).toBeVisible();
  await page.getByRole('button',{ name: w.save,exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText(language==='de' ? 'Prüfung 2 wurde gespeichert.' : 'Review 2 was saved.');
  const posts=f.calls.filter(c=>c.method==='POST'); expect(posts).toHaveLength(1);
  expect(posts[0].body.items[0].price).toEqual({ amountMinor: 0,currency: 'EUR' });
  expect(posts[0].body.expectedConfigurationRevision).toBe(2); expect(posts[0].body.expectedSourceRevision).toBe(1);
  expect(JSON.stringify(posts[0].body)).not.toMatch(/providerPrice|tenantId|actorUserId/);
  await page.setViewportSize({width:320,height:720}); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('read-only source paging preserves selected commercial input and rejection retains the previous publication',async ({page})=>{
  const f=await install(page); await choose(page); const w=words(); await proposal(page);
  const price=page.locator('[data-review-source-kind]').getByLabel(w.price); await price.fill('12,34');
  await page.getByRole('button',{name:w.next,exact:true}).click();
  await expect(page.getByRole('heading',{name:'Synthetic received item 6',exact:true})).toBeVisible(); await expect(price).toHaveValue('12,34');
  await page.getByRole('combobox',{name:w.decision}).selectOption('rejected');
  await page.getByRole('button',{name:w.preview,exact:true}).click(); await page.getByLabel(w.attest).check();
  await page.getByRole('button',{name:w.save,exact:true}).click(); await expect(page.getByRole('status')).toHaveText('Prüfung 2 wurde gespeichert.');
  expect(f.calls.filter(c=>c.method==='POST')[0].body.items).toEqual([]);
});
for (const writeStatus of [409,503]) test(`HTTP${writeStatus} write remains locked until explicit history reload, without automatic POST retry`,async ({page})=>{
  const f=await install(page,{writeStatus}); await choose(page); await proposal(page); const w=words();
  await page.getByRole('button',{name:w.save,exact:true}).click();
  await expect(page.getByRole('status')).toContainText('nicht eindeutig bestätigt'); await expect(page.getByLabel(w.reason)).toBeDisabled();
  await expect(page.getByRole('button',{name:w.next,exact:true})).toBeDisabled(); expect(f.calls.filter(c=>c.method==='POST')).toHaveLength(1);
  await page.getByRole('button',{name:w.reload,exact:true}).click(); await expect(page.getByLabel(w.reason)).toBeEnabled();
  await expect(page.getByLabel(w.reason)).toHaveValue(''); expect(f.calls.filter(c=>c.method==='POST')).toHaveLength(1);
});
for (const writeStatus of [400,413]) test(`known HTTP${writeStatus} pre-write denial retains editable commercial input`,async ({page})=>{
  const f=await install(page,{writeStatus}); await choose(page); await proposal(page); const w=words();
  await page.getByRole('button',{name:w.save,exact:true}).click();
  await expect(page.getByRole('status')).toContainText(writeStatus===413 ? 'zu groß' : 'Prüfen Sie');
  await expect(page.getByLabel(w.reason)).toBeEnabled(); await expect(page.getByLabel(w.reason)).toHaveValue('Synthetic deliberate catalogue review');
  expect(f.calls.filter(c=>c.method==='POST')).toHaveLength(1);
});
test('pending write excludes further source reads and detached completion cannot restore or focus the view',async ({page})=>{
  const f=await install(page,{delayWrite:true}); await choose(page); await proposal(page); const w=words();
  await page.getByRole('button',{name:w.save,exact:true}).click(); await expect(page.getByLabel(w.reason)).toBeDisabled();
  const count=f.calls.length; await expect(page.getByRole('button',{name:w.next,exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:w.reload,exact:true})).toBeDisabled(); expect(f.calls.length).toBe(count);
  const completed=page.waitForResponse(response=>response.request().method()==='POST');
  await page.locator('#leave').click(); f.release(); await (await completed).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve))); await expect(page.locator('#app')).toBeEmpty(); await expect(page.locator('#leave')).toBeFocused();
  expect(f.calls.filter(c=>c.method==='POST')).toHaveLength(1);
});
for (const authorityStatus of [401,403]) test(`HTTP${authorityStatus} preparation removes source/history and calls the authority owner`,async ({page})=>{
  const f=await install(page,{authorityStatus}); await page.getByLabel(words().connection).selectOption(id(3));
  await expect(page.locator('html')).toHaveAttribute('data-locked','true'); await expect(page.locator('#app')).toBeEmpty();
  expect(f.calls.filter(c=>c.method==='POST')).toHaveLength(0);
});
test('inconsistent later binding page fails closed before any editor or write is exposed',async ({page})=>{
  const f=await install(page,{corruptBasis:true}); await page.getByLabel(words().connection).selectOption(id(3));
  await expect(page.getByRole('status')).toContainText('nicht sicher geladen'); await expect(page.locator('[data-catering-publication-editor]')).toHaveCount(0);
  expect(f.calls.filter(c=>c.method==='POST')).toHaveLength(0);
});
test('inconsistent immutable source page locks an existing draft and reload recovers without POST',async ({page})=>{
  const f=await install(page,{corruptPage:true}); await choose(page); const w=words(); await proposal(page);
  await page.getByRole('button',{name:w.next,exact:true}).click(); await expect(page.getByRole('status')).toContainText('nicht sicher geladen');
  await expect(page.getByLabel(w.reason)).toBeDisabled(); await page.getByRole('button',{name:w.reload,exact:true}).click();
  await expect(page.getByLabel(w.reason)).toBeEnabled(); expect(f.calls.filter(c=>c.method==='POST')).toHaveLength(0);
});
test('unavailable publication keeps the Manager review history readable without a decision form',async ({page})=>{
  const f=await install(page,{blocked:true}); await page.getByLabel(words().connection).selectOption(id(3));
  await expect(page.getByRole('status')).toContainText('noch nicht freigegeben');
  await expect(page.getByText('Synthetic earlier publication',{exact:true})).toBeVisible();
  await expect(page.locator('[data-catering-publication-editor]')).toHaveCount(0); expect(f.calls.filter(c=>c.method==='POST')).toHaveLength(0);
});

for (const language of ['de','en']) test(`${language} business settings composes catalogue-review navigation behind the existing server flag`,async({page})=>{
  const f=await install(page,{language,navigation:true});
  expect(f.calls.filter(c=>c.path==='/api/v1/tenant/catering/provider-catalogues')).toHaveLength(0);
  const nav=page.getByRole('button',{name:language==='de' ? 'Katalogfreigaben' : 'Catalogue review',exact:true});
  await nav.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:language==='de' ? 'Lieferantenkatalog prüfen und freigeben' : 'Review and publish supplier catalogue',exact:true})).toBeFocused();
  await choose(page,language);
  expect(f.calls.filter(c=>c.path==='/api/v1/tenant/catering/provider-catalogues')).toHaveLength(1);
});
test('disabled business-settings flag exposes no publication navigation or source reads',async({page})=>{
  const f=await install(page,{navigation:true,enabled:false});
  await expect(page.getByRole('button',{name:'Katalogfreigaben',exact:true})).toHaveCount(0);
  expect(f.calls.filter(c=>c.path.startsWith('/api/v1/tenant/catering/provider-catalogues') && !c.path.endsWith('/review'))).toHaveLength(0);
});
