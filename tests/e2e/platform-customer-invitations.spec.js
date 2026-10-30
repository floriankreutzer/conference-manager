import { test,expect } from '@playwright/test';
const id=n=>`a4000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const CSRF='C'.repeat(43),state='S'.repeat(43);
async function fixture(page,{ lostCreation=false }={}) {
  const configured=new URL(test.info().project.use.baseURL);
  if (configured.protocol!=='https:' || configured.hostname!=='127.0.0.1') throw new Error('LOOPBACK_FIXTURE_REQUIRED');
  const origin=configured.origin,writes=[],requests=[];let items=[],lost=lostCreation,listStatus=200;
  const html=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/styles.css">
    <link rel="stylesheet" href="/assets/platform-admin.css"></head><body><main id="fixture"></main></body></html>`;
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if (url.origin!==origin) { await route.abort('blockedbyclient');throw new Error('UNEXPECTED_NON_LOOPBACK_REQUEST'); }
    if (url.pathname==='/') { await route.fulfill({ contentType: 'text/html',body: html });return; }
    if (url.pathname==='/test-reflow.css') { await route.fulfill({ contentType: 'text/css',body: 'html { font-size: 200%; }' });return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue();return; }
    expect(request.headers()['x-csrf-token']).toBe(CSRF);requests.push({ path: url.pathname,query: url.search,method: request.method() });
    if (!request.headers()['x-platform-passkey-proof']) {
      await route.fulfill({ status: 428,contentType: 'application/json',body: JSON.stringify({ status: 'passkey_required',
        state,options: { challenge: state },requestId: id(99) }) });return;
    }
    if (request.method()==='GET' && url.pathname===`/api/v1/platform/tenants/${id(1)}/invitations` && listStatus!==200) {
      await route.fulfill({ status: listStatus,contentType: 'application/json',body: JSON.stringify({ error: { code: 'PLATFORM_UNAVAILABLE' } }) });return;
    }
    const value=request.method()==='GET' ? null : request.postDataJSON();let body;
    if (value) writes.push({ path: url.pathname,value,key: request.headers()['idempotency-key'] });
    const tenant={ id: id(1),displayName: 'Synthetic customer',status: 'onboarding' };
    if (url.pathname==='/api/v1/platform/tenants' && value) {
      if (!items.length) items=[...value.invitations,{ recipient: 'Owner@example.test',roles: ['tenant_admin'],locale: 'de' }]
        .map((person,index)=>({ id: id(index+2),revision: 1,...person,state: 'pending',delivery: 'queued',expiresAt: '2026-12-01T12:00:00.000Z' }));
      if (lost) { lost=false;await route.abort('failed');return; }
      body={ schemaVersion: 1,outcome: writes.length>1 ? 'idempotent' : 'updated',tenant,invitations: items };
    } else if (url.pathname===`/api/v1/platform/tenants/${id(1)}/invitations` && !value) body={ schemaVersion: 1,items };
    else {
      const match=url.pathname.match(/^\/api\/v1\/platform\/tenants\/([a-f0-9-]+)\/invitations\/([a-f0-9-]+)(\/reissue)?$/);
      if (!match || !value) throw new Error('UNEXPECTED_API_ROUTE');
      expect(match[1]).toBe(id(1));const item=items.find(row=>row.id===match[2]);expect(value.expectedRevision).toBe(item.revision);
      item.revision++;item.state=match[3] ? 'pending' : 'revoked';item.delivery=match[3] ? 'queued' : 'cancelled';
      body={ schemaVersion: 1,outcome: 'updated',invitation: item };
    }
    await route.fulfill({ status: 200,contentType: 'application/json',body: JSON.stringify(body) });
  });
  await page.goto(origin);
  await page.evaluate(async ({ csrf,tenantId })=>{
    const { createPlatformPasskeyOperationsClient }=await import('/src/platform-admin/production/passkey-operations-client.js');
    const { createPlatformCustomerInvitationApi }=await import('/src/platform-admin/customer-invitation-api.js');
    const { createPlatformInvitationPresentation }=await import('/src/platform-admin/customer-invitations-presentation.js');
    const { setLanguage }=await import('/src/core/i18n.js');setLanguage('de');
    const transport=createPlatformPasskeyOperationsClient({ csrfTokenProvider: ()=>csrf,refreshSession: async()=>true,
      browser: { async authenticate() {
        if (globalThis.cancelInvitationProof) {
          globalThis.cancelInvitationProof=false;throw Object.assign(new Error(),{ code: 'PLATFORM_PASSKEY_BROWSER_CANCELLED' });
        }
        return { id: 'synthetic-test-assertion' };
      } } });
    const api=createPlatformCustomerInvitationApi({ apiClient: transport });
    const presentation=createPlatformInvitationPresentation({ api });
    const operator={ permissions: ['platform:invitation:manage'],assurance: { level: 'mfa' } };
    const root=document.getElementById('fixture');let selected='fleet';
    const tenant={ id: tenantId,displayName: 'Synthetic customer',lifecycleState: 'onboarding' };
    const render=()=>{
      presentation.beginRender({ key: selected });
      root.replaceChildren(selected==='fleet' ? presentation.renderCreateControl({ operator,operationProofAvailable: true,
        isCurrent: ()=>selected==='fleet',onCreated: async()=>{ selected='tenant';render(); } })
        : presentation.renderTenantPanel({ tenant,operator,operationProofAvailable: true,isCurrent: ()=>selected==='tenant' }));
    };
    globalThis.platformInvitationFixture={ render,language: value=>{ setLanguage(value);render(); },stop: ()=>presentation.clear() };
    render();
  },{ csrf: CSRF,tenantId: id(1) });return { writes,requests,setListStatus: value=>{ listStatus=value; } };
}
async function fillCreation(page) {
  await page.getByRole('button',{ name: 'Mandant anlegen',exact: true }).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading')).toHaveCount(1);
  await dialog.getByRole('textbox',{ name: 'Mandanten-Anzeigename *',exact: true }).fill('Synthetic customer');
  await dialog.getByRole('button',{ name: 'Person hinzufügen',exact: true }).click();
  const person=dialog.getByRole('group',{ name: 'Person 1',exact: true });
  await person.getByRole('textbox',{ name: 'E-Mail-Adresse *',exact: true }).fill('Person@example.test');
  await person.getByRole('checkbox',{ name: 'Conference Manager',exact: true }).check();
  await dialog.getByRole('textbox',{ name: 'Betriebliche Begründung *',exact: true }).fill('Synthetic customer onboarding');
  await dialog.getByRole('textbox',{ name: 'Anzeigename zur Bestätigung erneut eingeben * Muss exakt mit dem Anzeigenamen übereinstimmen.',exact: true }).fill('Synthetic customer');
  return dialog;
}
test('owner-inclusive creation, list and per-person resend/revoke use exact fresh proofs and explicit reasons',async ({ page })=>{
  const f=await fixture(page);const dialog=await fillCreation(page);
  await dialog.getByRole('button',{ name: 'Kunden anlegen und Einladungen vormerken',exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{ name: 'Aktuellen Stand laden',exact: true }).click();
  const person=page.getByRole('article').filter({ has: page.getByRole('heading',{ name: 'Person@example.test',exact: true }) });
  await expect(person).toBeVisible();await expect(page.getByRole('heading',{ name: 'Owner@example.test',exact: true })).toBeVisible();
  for (const operation of ['Erneut senden','Widerrufen']) {
    await person.getByRole('button',{ name: new RegExp(`Einladung für Person@example.test ${operation==='Widerrufen' ? 'widerrufen' : 'erneut senden'}`) }).click();
    const confirmation=page.getByRole('dialog');await confirmation.getByRole('textbox',{ name: 'Betriebliche Begründung *',exact: true }).fill('Explicit synthetic reason');
    await confirmation.getByRole('button',{ name: operation,exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('status').getByText('Die Einladungen können bearbeitet werden.',{ exact: true })).toBeVisible();
    const state=operation==='Widerrufen' ? 'Widerrufen' : 'Annahme steht aus';
    await expect(person.locator('p').filter({ hasText: new RegExp(`^${state}$`) })).toBeVisible();
  }
  expect(f.writes).toHaveLength(3);expect(f.writes[0].value.invitations).toHaveLength(1);
  expect(f.writes[1].value.expectedRevision).toBe(1);expect(f.writes[2].value.expectedRevision).toBe(2);
  expect(f.requests.filter(row=>row.method==='GET')).toHaveLength(6,'each list is explicitly challenged and retried once');
});
for (const locale of ['de','en']) {
  for (const [status,copy] of [
    [401,{ de: 'Ihre Sitzung ist nicht gültig oder abgelaufen. Melden Sie sich erneut an.',en: 'Your session is invalid or expired. Sign in again.' }],
    [403,{ de: 'Der Zugriff wurde verweigert. Prüfen Sie Ihre Berechtigungen und die Kundenauswahl.',en: 'Access was denied. Check your permissions and customer selection.' }],
    [404,{ de: 'Einladungen sind für diese Kundenauswahl derzeit nicht verfügbar. Prüfen Sie die Kundenauswahl oder wenden Sie sich an den Plattformverantwortlichen.',
      en: 'Invitations are currently unavailable for this customer selection. Check the selected customer or contact the platform owner.' }],
  ]) {
    test(`invitation access feedback distinguishes HTTP${status} and requires explicit recovery: ${locale}`,async({ page })=>{
      const f=await fixture(page),dialog=await fillCreation(page);
      await dialog.getByRole('button',{ name: 'Kunden anlegen und Einladungen vormerken',exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await page.evaluate(value=>globalThis.platformInvitationFixture.language(value),locale);
      f.setListStatus(status);
      const refresh=page.getByRole('button',{ name: locale==='de' ? 'Aktuellen Stand laden' : 'Load current status',exact: true });
      await refresh.focus();await refresh.press('Enter');
      await expect(page.getByRole('alert').locator('p')).toHaveText(copy[locale]);
      const add=page.getByRole('button',{ name: locale==='de' ? 'Person hinzufügen' : 'Add a person',exact: true });
      await expect(add).toBeDisabled();
      expect(f.requests.filter(row=>row.method==='GET')).toHaveLength(2);
      expect(f.writes).toHaveLength(1);
      await page.setViewportSize({ width: 320,height: 900 });
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      f.setListStatus(200);await refresh.focus();await refresh.press('Enter');
      await expect(add).toBeEnabled();await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByRole('heading',{ name: 'Person@example.test',exact: true })).toBeVisible();
      expect(f.requests.filter(row=>row.method==='GET')).toHaveLength(4);
      expect(f.writes).toHaveLength(1);
    });
  }
  test(`cancelled invitation read is neutral and cannot enable issuance before refresh: ${locale}`,async({ page })=>{
    const f=await fixture(page),dialog=await fillCreation(page);
    await dialog.getByRole('button',{ name: 'Kunden anlegen und Einladungen vormerken',exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.evaluate(value=>{ globalThis.platformInvitationFixture.language(value);globalThis.cancelInvitationProof=true; },locale);
    const refresh=page.getByRole('button',{ name: locale==='de' ? 'Aktuellen Stand laden' : 'Load current status',exact: true });
    await refresh.click();
    await expect(page.getByRole('status').getByText(locale==='de'
      ? 'Die Bestätigung wurde abgebrochen. Es wird keine Aktion automatisch wiederholt.'
      : 'Confirmation was cancelled. No action is retried automatically.',{ exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button',{ name: locale==='de' ? 'Person hinzufügen' : 'Add a person',exact: true })).toBeDisabled();
    expect(f.writes).toHaveLength(1);expect(f.requests.filter(row=>row.method==='GET')).toHaveLength(1);
    await page.setViewportSize({ width: 320,height: 900 });await refresh.focus();await refresh.press('Enter');
    await expect(page.getByRole('heading',{ name: 'Person@example.test',exact: true })).toBeVisible();
    await expect(page.getByRole('button',{ name: locale==='de' ? 'Person hinzufügen' : 'Add a person',exact: true })).toBeEnabled();
    expect(f.writes).toHaveLength(1);expect(f.requests.filter(row=>row.method==='GET')).toHaveLength(3);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  });
}
test('lost creation result retains the exact command for explicit retry and keeps drafts through translation',async ({ page })=>{
  const f=await fixture(page,{ lostCreation: true });const dialog=await fillCreation(page);
  await dialog.getByRole('button',{ name: 'Kunden anlegen und Einladungen vormerken',exact: true }).click();
  await expect(dialog.getByRole('button',{ name: 'Dieselbe Anfrage erneut prüfen',exact: true })).toBeVisible();
  await page.evaluate(()=>globalThis.platformInvitationFixture.language('en'));
  await expect(dialog.getByRole('textbox',{ name: 'Tenant display name *',exact: true })).toHaveValue('Synthetic customer');
  await dialog.getByRole('button',{ name: 'Check the same request again',exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);expect(f.writes).toHaveLength(2);
  expect(f.writes[0]).toEqual(f.writes[1]);
});
test('unknown creation retry keeps the original committed command when its later proof is cancelled',async({ page })=>{
  const f=await fixture(page,{ lostCreation: true }),dialog=await fillCreation(page);
  await dialog.getByRole('button',{ name: 'Kunden anlegen und Einladungen vormerken',exact: true }).click();
  const retry=dialog.getByRole('button',{ name: 'Dieselbe Anfrage erneut prüfen',exact: true });await expect(retry).toBeVisible();
  await page.evaluate(()=>{ globalThis.cancelInvitationProof=true; });await retry.click();
  await expect(retry).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('Das Ergebnis ist unklar.');
  expect(f.writes).toHaveLength(1);
  await retry.click();await expect(dialog).toHaveCount(0);
  expect(f.writes).toHaveLength(2);expect(f.writes[0]).toEqual(f.writes[1]);
});
test('creation editor remains keyboard usable and contained at narrow, desktop and doubled-text sizes',async ({ page })=>{
  await fixture(page);const dialog=await fillCreation(page);
  for (const width of [320,1280]) {
    await page.setViewportSize({ width,height: 900 });
    expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  await page.addStyleTag({ url: '/test-reflow.css' });await page.setViewportSize({ width: 320,height: 900 });
  expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
  await dialog.getByRole('textbox',{ name: 'Mandanten-Anzeigename *',exact: true }).focus();await page.keyboard.press('Tab');
  await expect(dialog.getByRole('textbox',{ name: 'E-Mail-Adresse *',exact: true })).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button',{ name: 'Mandant anlegen',exact: true })).toBeFocused();
});
