import { readFile } from 'node:fs/promises';
import { asProductionHtml } from './fixtures/production-html.js';
import { test,expect } from '@playwright/test';

const ID='c6000000-0000-4000-8000-000000000099',CSRF='c'.repeat(43);
async function fixture(page,{ lostImport=false,hostileName=false }={}) {
  const origin=new URL(test.info().project.use.baseURL).origin,writes=[],errors=[];
  let revision=2,status='onboarding',lost=lostImport;const imported=new Set();
  const names={ workshop: hostileName ? '<img src=x onerror=alert(1)>' : 'Fabrikam Workshop',focus: 'Fabrikam Focus' };
  function view() {
    const roomCount=imported.size,ready=roomCount>0;
    return { mode: 'synthetic',provider: 'synthetic_calendar',microsoftConnection: 'not_applicable',tenantStatus: status,
      locationsRevision: revision,roomCount,boundRoomCount: roomCount,calendarWriteEntitled: true,requestId: ID,
      readiness: { ready,checks: { roomsImported: ready,calendarResourcesBound: ready,directoryEntitled: true,calendarEntitled: true } },
      candidates: ['workshop','focus'].map(key=>({ key,name: names[key],capacity: key==='workshop' ? 12 : 6,
        building: 'Fabrikam Campus',timeZone: 'Europe/Berlin',imported: imported.has(key) })) };
  }
  const html=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/styles.css">
    <link rel="stylesheet" href="/assets/app-layout.css"><link rel="stylesheet" href="/assets/tenant-admin-settings.css">
    <link rel="stylesheet" href="/assets/tenant-admin-operations.css"></head><body><main id="fixture"></main></body></html>`;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if (url.origin!==origin) { await route.abort('blockedbyclient');throw new Error('UNEXPECTED_EXTERNAL_REQUEST'); }
    if (url.pathname==='/') { await route.fulfill({ contentType: 'text/html',body: html });return; }
    if (url.pathname==='/test-reflow.css') {
      await route.fulfill({ contentType: 'text/css',body: 'html { font-size: 200%; }' });return;
    }
    if (!url.pathname.startsWith('/api/')) { await route.continue();return; }
    let body;if (url.pathname==='/api/v1/tenant/runtime') body={ mode: 'synthetic',provider: 'synthetic_calendar',requestId: ID };
    else if (url.pathname==='/api/v1/integrations/synthetic-calendar' && request.method()==='GET') body=view();
    else {
      expect(request.method()).toBe('POST');expect(request.headers()['x-csrf-token']).toBe(CSRF);
      const value=request.postDataJSON();writes.push({ path: url.pathname,value });expect(value.expectedRevision).toBe(revision);
      if (url.pathname==='/api/v1/integrations/synthetic-calendar/rooms/import') {
        expect(Object.keys(value).sort()).toEqual(['expectedRevision','selectedKeys']);
        for (const key of value.selectedKeys) imported.add(key);revision++;body={ ...view(),importedCount: value.selectedKeys.length };
        if (lost) { lost=false;await route.abort('failed');return; }
      } else if (url.pathname==='/api/v1/integrations/synthetic-calendar/lifecycle/transitions') {
        expect(Object.keys(value).sort()).toEqual(['expectedRevision','expectedStatus','targetStatus']);
        expect(value.expectedStatus).toBe(status);status=value.targetStatus;body=view();
      } else throw new Error('UNEXPECTED_API_ROUTE');
    }
    await route.fulfill({ contentType: 'application/json',body: JSON.stringify(body) });
  });
  await page.goto(origin);
  await page.evaluate(async csrf=>{
    const { createApiClient }=await import('/src/core/api-client.js');
    const { discoverProtectedSyntheticOnboarding }=await import('/src/platform/synthetic-onboarding-api.js');
    const { createSyntheticCalendarSection }=await import('/src/tenant-admin/sections/synthetic-calendar/index.js');
    const { setLanguage }=await import('/src/core/i18n.js');setLanguage('de');
    const adapter=await discoverProtectedSyntheticOnboarding({ apiClient: createApiClient({ csrfTokenProvider: ()=>csrf }) });
    const section=createSyntheticCalendarSection({ adapter }),root=document.getElementById('fixture');let generation=0;
    const render=async locale=>{
      if (locale) setLanguage(locale);const own=++generation;
      await section.render({ root,isCurrent: ()=>own===generation,rerender: ()=>void render() });
    };
    globalThis.syntheticOnboardingFixture={ render };await render();
  },CSRF);
  await expect(page.getByRole('heading',{ name: 'Bereitschaft des Testmandanten' })).toBeVisible();return { writes,errors };
}

async function selectRooms(page) {
  const group=page.getByRole('group',{ name: 'Räume für den Import auswählen' });
  const first=group.getByRole('checkbox').first();await first.focus();await first.press('Space');
  await group.getByRole('checkbox').nth(1).check();
}

test('local-calendar Admin imports selected rooms and explicitly completes ready-active with keyboard and focus',async ({ page })=>{
  const f=await fixture(page);expect(f.writes).toHaveLength(0);
  await expect(page.getByText(/Microsoft-Verbindung ist hierfür nicht erforderlich/)).toBeVisible();
  await expect(page.getByRole('button',{ name: 'Ausgewählte Räume importieren' })).toBeDisabled();
  await selectRooms(page);await page.getByRole('button',{ name: 'Ausgewählte Räume importieren' }).click();
  await expect(page.getByRole('heading',{ name: 'Kalender und Onboarding',exact: true })).toBeFocused();
  await expect(page.getByRole('group',{ name: 'Räume für den Import auswählen' })).toHaveCount(0);
  await page.getByRole('button',{ name: 'Einrichtung abschließen' }).click();
  await page.getByRole('button',{ name: 'Testmandanten aktivieren' }).click();
  await expect(page.getByRole('link',{ name: 'Anwendung öffnen' })).toHaveAttribute('href','/');
  expect(f.writes.map(row=>row.value)).toEqual([{ expectedRevision: 2,selectedKeys: ['focus','workshop'] },
    { expectedRevision: 3,expectedStatus: 'onboarding',targetStatus: 'ready' },
    { expectedRevision: 3,expectedStatus: 'ready',targetStatus: 'active' }]);expect(f.errors).toEqual([]);
});

test('unconfirmed writes lock further mutation until an explicit successful state read without retry',async ({ page })=>{
  const f=await fixture(page,{ lostImport: true });await selectRooms(page);
  await page.getByRole('button',{ name: 'Ausgewählte Räume importieren' }).click();
  await expect(page.getByText(/Das Ergebnis der Änderung ist nicht bestätigt/)).toBeVisible();
  await expect(page.getByRole('button',{ name: 'Ausgewählte Räume importieren' })).toBeDisabled();
  expect(f.writes).toHaveLength(1);
  await expect(page.getByRole('button',{ name: 'Aktuellen Zustand prüfen' })).toBeFocused();
  await page.getByRole('button',{ name: 'Aktuellen Zustand prüfen' }).click();
  await expect(page.getByRole('button',{ name: 'Einrichtung abschließen' })).toBeEnabled();
  expect(f.writes).toHaveLength(1);expect(f.errors).toEqual([]);
});

test('candidate text is inert and localized UI reflows at narrow widths with enlarged text',async ({ page })=>{
  const f=await fixture(page,{ hostileName: true });await page.getByRole('checkbox').first().check();
  await page.evaluate(()=>globalThis.syntheticOnboardingFixture.render('en'));
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  await expect(page.getByRole('heading',{ name: 'Calendar and onboarding',exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox').first()).toHaveAccessibleName(/<img src=x onerror=alert\(1\)>/);
  await expect(page.locator('img')).toHaveCount(0);await page.addStyleTag({ url: '/test-reflow.css' });
  for (const width of [320,1280]) {
    await page.setViewportSize({ width,height: 900 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await expect(page.getByRole('button',{ name: 'Import selected rooms' })).toBeVisible();
  }
  expect(f.writes).toHaveLength(0);expect(f.errors).toEqual([]);
});


async function composition(page,kind='synthetic') {
  const origin=new URL(test.info().project.use.baseURL).origin,calls=[],errors=[];
  const source=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  const html=asProductionHtml(source).replace('</head>',
    '<meta name="conference-protected-runtime" content="true"><meta name="conference-deployment-environment" content="int">'
      +'<meta name="conference-protected-synthetic" content="enabled"><meta name="conference-protected-invitations" content="enabled"></head>');
  const session={ user: { id: 'c6000000-0000-4000-8000-000000000001' },
    tenant: { id: 'c6000000-0000-4000-8000-000000000002',status: 'ready' },roles: ['employee','tenant_admin'],
    permissions: ['request:read','request:cancel','tenant:configure','tenant:users:manage','tenant:integrations:manage','tenant:audit:read'],
    session: { expiresAt: '2099-12-31T23:59:59.000Z' },csrfToken: CSRF };
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());if (url.origin!==origin) throw new Error('UNEXPECTED_EXTERNAL_REQUEST');
    if (url.pathname==='/') { await route.fulfill({ contentType: 'text/html',body: html });return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue();return; }
    calls.push(url.pathname);let body,status=200;
    if (url.pathname==='/api/v1/session') body=session;
    else if (url.pathname==='/api/v1/tenant/runtime') {
      if (kind==='unavailable') { status=503;body={ error: { code: 'PROTECTED_RUNTIME_VIEW_UNAVAILABLE' } }; }
      else body={ mode: kind,provider: kind==='real' ? 'microsoft365' : 'synthetic_calendar',requestId: ID };
    } else if (url.pathname==='/api/v1/integrations/synthetic-calendar') body={ mode: 'synthetic',provider: 'synthetic_calendar',
      requestId: ID,microsoftConnection: 'not_applicable',tenantStatus: 'ready',locationsRevision: 2,roomCount: 2,boundRoomCount: 2,
      calendarWriteEntitled: true,candidates: [],readiness: { ready: true,checks: { roomsImported: true,
        calendarResourcesBound: true,directoryEntitled: true,calendarEntitled: true } } };
    else if (url.pathname==='/api/v1/tenant/users') body={ users: [],nextAfterId: null,requestId: ID };
    else { status=404;body={ error: { code: 'NOT_FOUND' } }; }
    await route.fulfill({ status,contentType: 'application/json',body: JSON.stringify(body) });
  });
  await page.goto(origin+'/#tenant-admin/synthetic-calendar');return { calls,errors };
}

test('protected ready-Admin composition selects current local provider, preserves setup and hides real invitations',async ({ page })=>{
  const f=await composition(page);
  await expect(page.getByRole('heading',{ name: 'Kalender und Onboarding',level: 2,exact: true })).toBeVisible();
  await expect(page.getByRole('button',{ name: 'Testmandanten aktivieren' })).toBeVisible();
  await expect(page.getByRole('button',{ name: 'Microsoft 365',exact: true })).toHaveCount(0);
  expect(f.calls).not.toContain('/api/v1/application/requests');
  await page.getByRole('button',{ name: 'Benutzer & Rollen',exact: true }).click();
  await expect(page.getByText('Keine Benutzer vorhanden.',{ exact: true })).toBeVisible();
  await expect(page.getByRole('heading',{ name: 'Personen einladen',exact: true })).toHaveCount(0);
  expect(f.calls).not.toContain('/api/v1/tenant/invitations');expect(f.errors).toEqual([]);
});

test('REAL composition keeps Microsoft while unavailable classification never selects it as fallback',async ({ page })=>{
  await composition(page,'real');await expect(page.getByRole('button',{ name: 'Microsoft 365',exact: true })).toBeVisible();
  await expect(page.getByRole('button',{ name: 'Kalender und Onboarding',exact: true })).toHaveCount(0);
});

test('unknown protected provider state presents an error without Microsoft fallback or mutations',async ({ page })=>{
  const f=await composition(page,'unavailable');
  await expect(page.getByText(/Der aktuelle Kalenderzustand ist nicht verfügbar/)).toBeVisible();
  await expect(page.getByRole('button',{ name: 'Microsoft 365',exact: true })).toHaveCount(0);
  await expect(page.getByRole('button',{ name: 'Testmandanten aktivieren' })).toHaveCount(0);
  expect(f.calls).not.toContain('/api/v1/integrations/synthetic-calendar/lifecycle/transitions');expect(f.errors).toEqual([]);
});
