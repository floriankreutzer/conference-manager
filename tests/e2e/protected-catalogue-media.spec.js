import { test,expect } from '@playwright/test';

const PLAN='c6000000-0000-4000-8000-000000000091',IMAGE='c6000000-0000-4000-8000-000000000092';
const root='/api/v1/tenant/catalogue-media';
async function fixture(page,{ foreign=false }={}) {
  const origin=new URL(test.info().project.use.baseURL).origin,calls=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const entries=[{ id: PLAN,ownerKind: 'room_plan',ownerId: 'room-01',contentType: 'image/png',
    altText: 'Room plan',url: `${root}/${PLAN}` },
    { id: IMAGE,ownerKind: 'catering_item',ownerId: 'coffee',contentType: 'image/webp',
      altText: '<img src=x onerror=alert(1)>',url: foreign ? 'https://foreign.example/image' : `${root}/${IMAGE}` }];
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="conference-runtime" content="production">
    <meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/assets/tokens.css">
    <link rel="stylesheet" href="/assets/styles.css"><link rel="stylesheet" href="/assets/app-layout.css"></head>
    <body><h1 id="heading"></h1><main id="app"></main></body></html>`;
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if (url.origin!==origin) { await route.abort('blockedbyclient');throw new Error('UNEXPECTED_EXTERNAL_REQUEST'); }
    if (url.pathname==='/') { await route.fulfill({ contentType: 'text/html',body: html });return; }
    if (url.pathname.startsWith('/api/')) {
      calls.push({ path: url.pathname,method: request.method() });
      if (url.pathname===root) {
        await route.fulfill({ contentType: 'application/json',body: JSON.stringify({ assets: entries,requestId: PLAN }) });return;
      }
      if (url.pathname===`${root}/${IMAGE}` || url.pathname===`${root}/${PLAN}`) {
        // An actual private-image denial exercises UI error handling. The native
        // owned-root suite separately verifies valid seeded bytes/digests/304.
        await route.fulfill({ status: 403,contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'AUTHORIZATION_DENIED' } }) });return;
      }
      await route.fulfill({ status: 404,body: '' });return;
    }
    await route.continue();
  });
  await page.goto(origin);return { origin,calls,errors };
}

test('current catalogue paths preserve exact Room attachment and never request an external or Demo image',async ({ page })=>{
  const f=await fixture(page);
  const result=await page.evaluate(async()=>{
    const { createApiClient }=await import('/src/core/api-client.js');
    const { createCatalogueMediaApi }=await import('/src/core/catalogue-media-api.js');
    const { managedRoomMedia }=await import('/src/employee/room-media.js');
    const { el }=await import('/src/core/ui.js');
    const entries=await createCatalogueMediaApi({ apiClient: createApiClient() }).list();
    const map=new Map(entries.map(entry=>[`${entry.ownerKind}:${entry.ownerId}`,entry]));
    const room={ id: 'room-01',floorplanAssetId: entries[0].id,mediaAssetIds: [] };
    const selected=managedRoomMedia(room,map);document.getElementById('app').appendChild(el('img',{
      attrs: { src: selected.floorplan,alt: entries[0].altText } }));
    return { selected,detached: managedRoomMedia({ ...room,floorplanAssetId: null },map) };
  });
  expect(result.selected.floorplan).toBe(`${root}/${PLAN}`);expect(result.detached.floorplan).toBeNull();
  await expect(page.getByRole('img',{ name: 'Room plan' })).toHaveAttribute('src',`${f.origin}${root}/${PLAN}`);
  expect(f.calls.every(call=>call.method==='GET')).toBe(true);expect(f.calls.some(call=>call.path.includes('/demo/'))).toBe(false);
  expect(f.errors).toEqual([]);
});

test('Catalogue Manager shows current private catering image as inert alt text with no synthetic image mutation control',async ({ page })=>{
  const f=await fixture(page);
  await page.evaluate(async()=>{
    const { createApiClient }=await import('/src/core/api-client.js');
    const { createCatalogueMediaApi }=await import('/src/core/catalogue-media-api.js');
    const { createManagerBusinessSettingsApplication }=await import('/src/manager/business-settings-application.js');
    const { setLanguage }=await import('/src/core/i18n.js');setLanguage('en');
    const media=createCatalogueMediaApi({ apiClient: createApiClient() });
    const catalogue={ services: [],equipment: [],cateringPackages: [],roomPrices: [],cateringItems: [{
      id: 'coffee',name: 'Coffee',description: null,price: { amountMinor: 250,currency: 'EUR' },active: true,order: 1,
      siteIds: [],roomIds: [] }] };
    const noop=async()=>{},app=createManagerBusinessSettingsApplication({ appRoot: document.getElementById('app'),
      setPageHeading: title=>{ document.getElementById('heading').textContent=title; },onAuthorityFailure: ()=>false,
      locations: { async loadLocations() { return { revision: 1,configuration: { sites: [],rooms: [] } }; },
        saveLocations: noop,async listLocationsHistory() { return { revisions: [] }; } },
      catalogue: { async loadCatalogue() { return { revision: 1,catalogue }; },saveCatalogue: noop,
        async listCatalogueHistory() { return { revisions: [] }; },async listCatalogueMedia() { return { assets: await media.list() }; } },
    });await app.renderManagerSettings();
  });
  await page.getByRole('navigation').getByRole('button',{ name: 'Catering',exact: true }).click();
  const image=page.getByRole('img',{ name: '<img src=x onerror=alert(1)>' });
  await expect(image).toHaveAttribute('src',`${f.origin}${root}/${IMAGE}`);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);await expect(page.locator('img')).toHaveCount(1);
  for (const width of [320,1280]) {
    await page.setViewportSize({ width,height: 900 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  expect(f.calls.every(call=>call.method==='GET')).toBe(true);expect(f.errors).toEqual([]);
});

test('invalid catalogue image URL fails before any external, Demo or private byte request',async ({ page })=>{
  const f=await fixture(page,{ foreign: true });
  const result=await page.evaluate(async()=>{
    const { createApiClient }=await import('/src/core/api-client.js');
    const { createCatalogueMediaApi }=await import('/src/core/catalogue-media-api.js');
    try { await createCatalogueMediaApi({ apiClient: createApiClient() }).list();return 'unexpected'; }
    catch (error) { return error.message; }
  });
  expect(result).toBe('CATALOGUE_MEDIA_RESPONSE_INVALID');expect(f.calls).toEqual([{ path: root,method: 'GET' }]);
  await expect(page.locator('img')).toHaveCount(0);expect(f.errors).toEqual([]);
});
