import { expect,test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createProtectedPlatformHtml } from '../../scripts/protected-platform-html.mjs';
import { platformOperatorFixture } from '../support/platform-admin-contract-fixtures.js';
import { microsoftOperationChallenge } from '../support/platform-microsoft-operation-fixture.js';
const uuid=index=>`ba000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const STATE=Buffer.alloc(32,1).toString('base64url'),CUSTOMER='https://127.0.0.1:4174';
function generation(index=1) {
  return { generationId: uuid(index+1),revision: 1,available: true,tenants: ['northwind','contoso','fabrikam'].map((slot,offset)=>({
    slot,tenantId: uuid(10*index+offset),status: ['active','ready','onboarding'][offset] })) };
}
async function setup(page,context,{ initial=false,pending=false,unknownCommit=false,reader=false,microsoft=false }={}) {
  const origin=test.info().project.use.baseURL;
  if (origin!=='https://127.0.0.1:4173') throw new Error('LOOPBACK_FIXTURE_REQUIRED');
  const html=createProtectedPlatformHtml({ source: await readFile(new URL('../../platform-admin/index.html',import.meta.url),'utf8'),
    customerOrigin: CUSTOMER,platformOrigin: origin,environment: 'int',syntheticEnabled: true });
  let verified=false;const base='/api/v1/platform/auth/microsoft/operation';
  if (microsoft) {
    await context.route('https://login.microsoftonline.com/**',route=>route.fulfill({ contentType: 'text/html',headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
    },body: '<!doctype html><html lang="en"><title>Isolated fixture</title><a href="'+origin+base
      +'/callback?state='+STATE+'&code=synthetic-code">Confirm synthetic Microsoft fixture</a></html>' }));
    await context.route(origin+base+'/callback?*',async route=>{
      verified=true;await route.continue();
    });
  }
  const writes=[],reads=[];let current=initial ? generation() : null,retained=initial ? 1 : 0,csrf='C'.repeat(43),authenticated=true;
  await context.addCookies([{ name: 'cm_fixture_platform',value: 'present',domain: '127.0.0.1',path: '/api/v1/platform',
    secure: true,httpOnly: true,sameSite: 'Strict' }]);
  await page.addInitScript(({ state })=>{
    const binary=size=>new Uint8Array(size).fill(1).buffer;
    Object.defineProperty(navigator,'credentials',{ configurable: true,value: { async get() {
      return { id: state,rawId: binary(32),type: 'public-key',authenticatorAttachment: 'platform',
        getClientExtensionResults: ()=>({}),response: { clientDataJSON: binary(64),authenticatorData: binary(37),
          signature: binary(72),userHandle: binary(32) } };
    } } });
  },{ state: STATE });
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if (url.origin===CUSTOMER && url.pathname==='/__cm-platform-handoff-result') { await route.continue();return; }
    if (url.origin!==origin) { await route.abort('blockedbyclient');throw new Error('UNEXPECTED_NON_LOOPBACK_REQUEST'); }
    if (url.pathname==='/platform-admin/' || url.pathname==='/') { await route.fulfill({ contentType: 'text/html',body: html });return; }
    if (url.pathname==='/src/platform-admin/production/synthetic-workspace/client.js' && !url.search) {
      // Production WebAuthn requires DNS/default HTTPS port. This isolated
      // loopback renderer fixture injects the qualified adapter plus software
      // credentials; it does not claim current-document/physical-key acceptance.
      await route.fulfill({ contentType: 'text/javascript',body: `
        import { createPlatformSyntheticWorkspaceClient as actual } from '/src/platform-admin/production/synthetic-workspace/client.js?actual=1';
        import { createPlatformPasskeyBrowser } from '/src/platform-admin/production/passkey-browser.js';
        export const createPlatformSyntheticWorkspaceClient=options=>actual({ ...options,
          browser: createPlatformPasskeyBrowser({ origin: 'https://platform.cm-transport.test' }) });
      ` });return;
    }
    if (url.pathname==='/test-reflow.css') { await route.fulfill({ contentType: 'text/css',body: 'html { font-size: 200%; }' });return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue();return; }
    const path=url.pathname,method=request.method();let status=200,value;
    if (method==='GET') reads.push(path);else writes.push({ path,body: request.postData(),headers: request.headers(),navigation: request.isNavigationRequest() });
    if (path==='/api/v1/platform/session') {
      if (!authenticated) status=401;
      else { const operator=platformOperatorFixture(reader ? 'platform_support_reader' : 'platform_tenant_operator');
        value={ operatorId: operator.id,roles: operator.roles,permissions: operator.permissions,
          assurance: { level: 'mfa',authenticatedAt: new Date().toISOString() },
          expiresAt: new Date(Date.now()+3600000).toISOString(),stepUpExpiresAt: null,csrfToken: csrf }; }
    } else if (path==='/api/v1/platform/auth/passkey/configuration') {
      if (microsoft) status=404;else value={ mode: 'application_passkey',environment: 'int',minimumPasskeys: 2,requestId: uuid(1) };
    } else if (path===base+'/configuration') {
      value={ mode: 'microsoft_mfa',environment: 'int' };
    } else if (path===base+'/status') {
      expect(microsoft).toBe(true);expect(request.postDataJSON()).toEqual({ state: STATE });
      value={ status: verified ? 'verified' : 'pending',requestId: uuid(1) };
    } else if (path==='/api/v1/platform/tenants') {
      value={ schemaVersion: 1,snapshotAt: new Date().toISOString(),items: [],nextCursor: null };
    } else if (path==='/api/v1/platform/synthetic/generation') value={ generation: current,retainedGenerations: retained,
      canReplace: true,replaceAfter: null,requestId: uuid(1) };
    else if (path==='/api/v1/platform/auth/delegation/intent') value=pending
      ? { status: 'confirmation_required',slots: ['northwind','contoso','fabrikam'],roles: ['employee','conference_manager','tenant_admin'],requestId: uuid(1) }
      : { status: 'none',requestId: uuid(1) };
    else if (path.endsWith('/options')) {
      verified=false;value=microsoft ? microsoftOperationChallenge(origin) : { status: 'passkey_required',state: STATE,requestId: uuid(1),
        options: { challenge: STATE,rpId: 'platform.cm-transport.test',allowCredentials: [{ id: STATE,type: 'public-key' }],
          userVerification: 'required' } };
    }
    else if (path==='/api/v1/platform/synthetic/generation/replace') {
      if (microsoft) { expect(verified).toBe(true);expect(request.postDataJSON().response).toBeUndefined(); }
      retained++;current=generation(retained);csrf='N'.repeat(43);
      if (unknownCommit) { authenticated=false;await route.abort('failed');return; }
      value={ status: 'generation_replaced',generation: current,csrfToken: csrf,requestId: uuid(1) };
    } else if (path==='/api/v1/platform/auth/delegation/approve') { await route.continue();return; }
    else status=404;
    if (status>=400) value={ error: { code: 'PLATFORM_NOT_FOUND',requestId: uuid(1) } };
    await route.fulfill({ status,contentType: 'application/json',body: JSON.stringify(value) });
  });
  await page.goto(`${origin}/platform-admin/`);return { writes,reads };
}

test('own generation creation/reset is explicit, signed per operation and keeps localized retained states and enlarged-text reflow',async({ page,context })=>{
  const f=await setup(page,context);
  await page.getByRole('button',{ name: 'Eigene Testmandanten',exact: true }).click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{ name: 'Testmandanten anlegen',exact: true }).click();expect(f.writes).toHaveLength(0);
  await dialog.getByRole('button',{ name: 'Anlegen bestätigen',exact: true }).click();
  await expect(dialog.getByText('Northwind: Aktiv.',{ exact: true })).toBeVisible();
  await expect(dialog.getByText('Contoso: Bereit.',{ exact: true })).toBeVisible();
  await expect(dialog.getByText('Fabrikam: Onboarding.',{ exact: true })).toBeVisible();
  const created=f.writes.filter(x=>x.path.endsWith('/replace'));expect(created).toHaveLength(1);
  expect(JSON.parse(created[0].body).expectedGenerationId).toBeNull();expect(JSON.parse(created[0].body).expectedRevision).toBe(0);
  await dialog.getByRole('button',{ name: 'Eigene Testmandanten zurücksetzen',exact: true }).click();
  expect(f.writes.filter(x=>x.path.endsWith('/replace'))).toHaveLength(1);
  await dialog.getByRole('button',{ name: 'Zurücksetzen bestätigen',exact: true }).focus();
  await page.keyboard.press('Enter');await expect(dialog.getByText('Aufbewahrte Generationen: 2 von 32.',{ exact: true })).toBeVisible();
  expect(f.writes.filter(x=>x.path.endsWith('/options'))).toHaveLength(2);
  expect(f.writes.filter(x=>x.path.endsWith('/replace'))).toHaveLength(2);
  await page.addStyleTag({ url: '/test-reflow.css' });
  for (const width of [320,1280]) { await page.setViewportSize({ width,height: 900 });
    const reflow=await page.evaluate(()=>({ fits: document.documentElement.scrollWidth<=innerWidth,
      width: innerWidth,scrollWidth: document.documentElement.scrollWidth,overflow: [...document.querySelectorAll('body *')]
        .filter(node=>node.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(node=>({ tag: node.tagName,className: node.className,
          right: node.getBoundingClientRect().right,text: node.textContent.slice(0,60) })) }));
    expect(reflow.fits,JSON.stringify(reflow)).toBe(true);
    expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true); }
});

test('signed intent resumes after login query is scrubbed and native approval uses a real fixed two-origin303 without issuing a Customer session',async({ page,context })=>{
  const f=await setup(page,context,{ initial: true,pending: true });const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();expect(f.writes).toHaveLength(0);
  await dialog.getByRole('combobox',{ name: 'Testmandant',exact: true }).selectOption('fabrikam');
  await dialog.getByRole('combobox',{ name: 'Kundenrolle',exact: true }).selectOption('tenant_admin');
  const redirect=page.waitForResponse(response=>response.url().endsWith('/api/v1/platform/auth/delegation/approve') && response.status()===303);
  await Promise.all([page.waitForURL(`${CUSTOMER}/__cm-platform-handoff-result`),redirect,
    dialog.getByRole('button',{ name: 'Browserwechsel freigeben',exact: true }).click()]);
  await expect(page.getByText('Native handoff fixture reached.',{ exact: true })).toBeVisible();
  const approvals=f.writes.filter(x=>x.path.endsWith('/approve'));expect(approvals).toHaveLength(1);expect(approvals[0].navigation).toBe(true);
  const form=new URLSearchParams(approvals[0].body);expect([...form.keys()]).toEqual(['csrfToken','payload']);
  expect(JSON.parse(form.get('payload')).role).toBe('tenant_admin');expect(JSON.parse(form.get('payload')).slot).toBe('fabrikam');
  expect((await context.cookies(CUSTOMER)).some(cookie=>cookie.name==='cm_session' || cookie.name==='cm_platform_session')).toBe(false);
});

test('unknown reset outcome requires current-session checking and a read-only operator receives no synthetic mutation surface',async({ page,context })=>{
  const f=await setup(page,context,{ unknownCommit: true });
  await page.getByRole('button',{ name: 'Eigene Testmandanten',exact: true }).click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{ name: 'Testmandanten anlegen',exact: true }).click();
  await dialog.getByRole('button',{ name: 'Anlegen bestätigen',exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('nicht sicher bestätigt');
  expect(f.writes.filter(x=>x.path.endsWith('/replace'))).toHaveLength(1);
  await dialog.getByRole('button',{ name: 'Aktuellen Zustand prüfen',exact: true }).click();
  await expect(dialog.getByRole('button',{ name: 'Mit Microsoft anmelden',exact: true })).toBeVisible();
  expect(f.writes.filter(x=>x.path.endsWith('/replace'))).toHaveLength(1);
  await dialog.getByRole('button',{ name: 'Schließen',exact: true }).click();
  const reader=await setup(page,context,{ reader: true });
  await expect(page.getByRole('button',{ name: 'Passkeys verwalten',exact: true })).toBeVisible();
  expect(await page.getByRole('button',{ name: 'Eigene Testmandanten',exact: true }).count()).toBe(0);
  expect(reader.reads.some(path=>path.includes('/synthetic/') || path.includes('/delegation/'))).toBe(false);
});

test('Microsoft synthetic workspace creates with explicit isolated confirmation and cancels reset without an application-key prompt',
async({ page,context })=>{
  const f=await setup(page,context,{ microsoft: true,pending: true });
  await expect(page.getByRole('button',{ name: 'Passkeys verwalten',exact: true })).toHaveCount(0);
  const workspace=page.getByRole('dialog',{ name: 'Eigene Testmandanten',exact: true });
  await workspace.getByRole('button',{ name: 'Testmandanten anlegen',exact: true }).click();
  await workspace.getByRole('button',{ name: 'Anlegen bestätigen',exact: true }).click();
  const confirmation=page.getByRole('dialog',{ name: 'Aktion mit Microsoft bestätigen',exact: true });
  await expect(confirmation).toBeVisible();const opened=context.waitForEvent('page');
  await confirmation.getByRole('link',{ name: 'Mit Microsoft anmelden',exact: true }).press('Enter');
  const provider=await opened;await provider.getByRole('link',{ name: 'Confirm synthetic Microsoft fixture' }).click();
  await expect(provider).toHaveURL('https://127.0.0.1:4173/api/v1/platform/auth/microsoft/operation/complete');
  await expect(workspace.getByText('Northwind: Aktiv.',{ exact: true })).toBeVisible();
  expect(f.writes.filter(x=>x.path.endsWith('/replace'))).toHaveLength(1);await provider.close();
  await workspace.getByRole('button',{ name: 'Eigene Testmandanten zurücksetzen',exact: true }).click();
  await workspace.getByRole('button',{ name: 'Zurücksetzen bestätigen',exact: true }).click();
  await expect(confirmation).toBeVisible();await confirmation.press('Escape');
  await expect(workspace.getByRole('alert')).toContainText('abgebrochen');
  expect(f.writes.filter(x=>x.path.endsWith('/replace'))).toHaveLength(1);
  expect(await workspace.textContent()).not.toMatch(/Passkey/i);
  await workspace.getByRole('button',{ name: 'Aktuellen Zustand prüfen',exact: true }).click();
  await workspace.getByRole('combobox',{ name: 'Testmandant',exact: true }).selectOption('fabrikam');
  await workspace.getByRole('combobox',{ name: 'Kundenrolle',exact: true }).selectOption('tenant_admin');
  await workspace.getByRole('button',{ name: 'Browserwechsel freigeben',exact: true }).click();
  await expect(confirmation).toBeVisible();const nextOpened=context.waitForEvent('page');
  await confirmation.getByRole('link',{ name: 'Mit Microsoft anmelden',exact: true }).press('Enter');
  const nextProvider=await nextOpened;
  await nextProvider.getByRole('link',{ name: 'Confirm synthetic Microsoft fixture' }).click();
  await page.waitForURL(`${CUSTOMER}/__cm-platform-handoff-result`);
  const approvals=f.writes.filter(x=>x.path.endsWith('/approve'));expect(approvals).toHaveLength(1);
  expect(approvals[0].navigation).toBe(true);const form=new URLSearchParams(approvals[0].body);
  expect(form.get('csrfToken')).toBe('N'.repeat(43));
  expect(JSON.parse(form.get('payload'))).toEqual({ generationId: generation().generationId,
    slot: 'fabrikam',role: 'tenant_admin',state: STATE });
  expect((await context.cookies(CUSTOMER)).some(cookie=>cookie.name==='cm_session')).toBe(false);await nextProvider.close();
});
