import { expect,test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createProtectedPlatformHtml } from '../../scripts/protected-platform-html.mjs';
import { platformOperatorFixture } from '../support/platform-admin-contract-fixtures.js';
import { microsoftOperationChallenge } from '../support/platform-microsoft-operation-fixture.js';
const uuid=n=>`ba000000-0000-4000-8000-${String(n).padStart(12,'0')}`,STATE=Buffer.alloc(32,1).toString('base64url');
const ORIGIN='https://127.0.0.1:4173',CUSTOMER='https://127.0.0.1:4174',BASE='/api/v1/platform/auth/microsoft/operation';
async function setup(page,context,{ pending=true,reader=false,syntheticPending=false,authHint='' }={}) {
  const html=createProtectedPlatformHtml({ source: await readFile(new URL('../../platform-admin/index.html',import.meta.url),'utf8'),
    customerOrigin: CUSTOMER,platformOrigin: ORIGIN,environment: 'int',microsoftEnabled: true,ownerAccessEnabled: true,syntheticEnabled: true });
  const writes=[],reads=[];let verified=false;
  await context.addCookies([{ name: 'cm_fixture_platform',value: 'present',domain: '127.0.0.1',path: '/api/v1/platform',
    secure: true,httpOnly: true,sameSite: 'Strict' }]);
  await context.route('https://login.microsoftonline.com/**',route=>route.fulfill({ contentType: 'text/html',headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
  },body: '<!doctype html><html lang="en"><title>Isolated provider fixture</title><a href="'+ORIGIN+BASE
    +'/callback?state='+STATE+'&code=synthetic-code">Confirm synthetic Microsoft fixture</a></html>' }));
  await context.route(ORIGIN+BASE+'/callback?*',async route=>{ verified=true;await route.continue(); });
  await page.addInitScript(()=>{ Object.defineProperty(navigator,'credentials',{ configurable: true,value: {
    get() { throw new Error('OWNER_APPLICATION_PASSKEY_FORBIDDEN'); },create() { throw new Error('OWNER_APPLICATION_PASSKEY_FORBIDDEN'); },
  } }); });
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    if (url.origin===CUSTOMER && path==='/__cm-platform-handoff-result') { await route.continue();return; }
    if (url.origin!==ORIGIN) { await route.abort('blockedbyclient');throw new Error('UNEXPECTED_NON_LOOPBACK_REQUEST'); }
    if (['/','/platform-admin/'].includes(path)) { await route.fulfill({ contentType: 'text/html',body: html });return; }
    if (path==='/test-reflow.css') { await route.fulfill({ contentType: 'text/css',body: 'html { font-size: 200%; }' });return; }
    if (!path.startsWith('/api/')) { await route.continue();return; }
    if (request.method()==='GET') reads.push(path);else writes.push({ path,body: request.postData(),navigation: request.isNavigationRequest() });
    let value,status=200;
    if (path==='/api/v1/platform/session') {
      const roleNames=reader ? ['platform_support_reader']
        : ['platform_support_reader','platform_tenant_operator','platform_security_auditor','platform_security_admin'];
      value={ operatorId: uuid(1),roles: roleNames,permissions: [...new Set(roleNames.flatMap(role=>platformOperatorFixture(role).permissions))],
        assurance: { level: 'mfa',authenticatedAt: new Date().toISOString() },expiresAt: new Date(Date.now()+3600000).toISOString(),
        stepUpExpiresAt: null,csrfToken: 'C'.repeat(43) };
    } else if (path==='/api/v1/platform/auth/passkey/configuration') status=404;
    else if (path===BASE+'/configuration') value={ mode: 'microsoft_mfa',environment: 'int' };
    else if (path===BASE+'/status') { expect(request.postDataJSON()).toEqual({ state: STATE });
      value={ status: verified ? 'verified' : 'pending',requestId: uuid(1) }; }
    else if (path==='/api/v1/platform/tenants') value={ schemaVersion: 1,snapshotAt: new Date().toISOString(),items: [],nextCursor: null };
    else if (path==='/api/v1/platform/synthetic/generation') value={ generation: null,retainedGenerations: 0,
      canReplace: true,replaceAfter: null,requestId: uuid(1) };
    else if (path==='/api/v1/platform/auth/delegation/intent') value=syntheticPending
      ? { status: 'confirmation_required',slots: ['northwind','contoso','fabrikam'],roles: ['employee','conference_manager','tenant_admin'],requestId: uuid(1) }
      : { status: 'none',requestId: uuid(1) };
    else if (path==='/api/v1/platform/auth/owner/intent') value={ status: pending ? 'confirmation_required' : 'none',
      customerStartUrl: CUSTOMER+'/?auth=owner_start',requestId: uuid(1),...(pending ? { tenants: [{
        tenantId: uuid(2),displayName: 'Customer',status: 'active' }],nextTenantId: null,
      roles: ['employee','conference_manager','tenant_admin'] } : {}) };
    else if (path==='/api/v1/platform/auth/owner/options') {
      expect(request.postDataJSON()).toEqual({ tenantId: uuid(2),role: 'conference_manager' });
      verified=false;value=microsoftOperationChallenge(ORIGIN);
    } else if (path==='/api/v1/platform/auth/owner/approve') { expect(verified).toBe(true);await route.continue();return; }
    else status=404;
    await route.fulfill({ status,contentType: 'application/json',body: JSON.stringify(value ?? { error: { code: 'PLATFORM_NOT_FOUND' } }) });
  });
  await page.goto(ORIGIN+'/platform-admin/'+authHint);return { writes,reads };
}
test('owner chooses current customer and role, explicitly confirms Microsoft and uses native state-only navigation',async({ page,context })=>{
  const f=await setup(page,context);const workspace=page.getByRole('dialog',{ name: 'Kundenanwendung als Owner öffnen',exact: true });
  await expect(workspace).toBeVisible();expect(f.writes).toHaveLength(0);
  await expect(page.getByRole('button',{ name: 'Passkeys verwalten',exact: true })).toHaveCount(0);
  await workspace.getByRole('combobox',{ name: 'Kunde',exact: true }).selectOption(uuid(2));
  await workspace.getByRole('combobox',{ name: 'Rolle',exact: true }).selectOption('conference_manager');
  await workspace.getByRole('button',{ name: 'Mit Microsoft bestätigen und fortfahren',exact: true }).focus();await page.keyboard.press('Enter');
  const confirmation=page.getByRole('dialog',{ name: 'Aktion mit Microsoft bestätigen',exact: true });
  await expect(confirmation).toBeVisible();const opened=context.waitForEvent('page');
  await confirmation.getByRole('link',{ name: 'Mit Microsoft anmelden',exact: true }).press('Enter');
  const provider=await opened;await provider.getByRole('link',{ name: 'Confirm synthetic Microsoft fixture' }).click();
  await page.waitForURL(CUSTOMER+'/__cm-platform-handoff-result');
  const approval=f.writes.filter(x=>x.path.endsWith('/approve'));expect(approval).toHaveLength(1);expect(approval[0].navigation).toBe(true);
  const form=new URLSearchParams(approval[0].body);expect([...form.keys()]).toEqual(['csrfToken','payload']);
  expect(JSON.parse(form.get('payload'))).toEqual({ tenantId: uuid(2),role: 'conference_manager',state: STATE });
  expect((await context.cookies(CUSTOMER)).some(cookie=>cookie.name==='cm_session')).toBe(false);await provider.close();
});
test('owner start is explicit, localized and reflows, while a reader receives no owner control or discovery',async({ page,context })=>{
  const f=await setup(page,context,{ pending: false });await page.getByRole('button',{ name: 'Owner-Kundenzugang',exact: true }).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('link',{ name: 'Zur Kundenanmeldung',exact: true }))
    .toHaveAttribute('href',CUSTOMER+'/?auth=owner_start');expect(f.writes).toHaveLength(0);
  await page.addStyleTag({ url: '/test-reflow.css' });
  for (const width of [320,1280]) { await page.setViewportSize({ width,height: 900 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true); }
  await dialog.getByRole('button',{ name: 'Schließen',exact: true }).click();
  const reader=await setup(page,context,{ reader: true });await expect(page.getByRole('button',{ name: 'Owner-Kundenzugang',exact: true })).toHaveCount(0);
  expect(reader.reads.some(path=>path.includes('/auth/owner/'))).toBe(false);expect(reader.writes).toHaveLength(0);
});
test('cancelling Microsoft leaves owner approval unsent until an independent status check',async({ page,context })=>{
  const f=await setup(page,context),dialog=page.getByRole('dialog',{ name: 'Kundenanwendung als Owner öffnen',exact: true });
  await dialog.getByRole('combobox',{ name: 'Kunde',exact: true }).selectOption(uuid(2));
  await dialog.getByRole('combobox',{ name: 'Rolle',exact: true }).selectOption('conference_manager');
  await dialog.getByRole('button',{ name: 'Mit Microsoft bestätigen und fortfahren',exact: true }).click();
  const confirmation=page.getByRole('dialog',{ name: 'Aktion mit Microsoft bestätigen',exact: true });
  await expect(confirmation).toBeVisible();await confirmation.press('Escape');
  await expect(dialog.getByRole('alert')).toContainText('abgebrochen');expect(f.writes.filter(x=>x.path.endsWith('/approve'))).toHaveLength(0);
  await dialog.getByRole('button',{ name: 'Aktuellen Status prüfen',exact: true }).click();
  await expect(dialog.getByRole('combobox',{ name: 'Kunde',exact: true })).toBeVisible();expect(f.writes.filter(x=>x.path.endsWith('/options'))).toHaveLength(1);
});

for (const [authHint,title] of [
  ['?auth=owner_intent','Kundenanwendung als Owner öffnen'],
  ['?auth=synthetic_intent','Eigene Testmandanten'],
  ['','Eigene Testmandanten'],
]) test(`only one pending access dialog resumes for ${authHint || 'ordinary navigation'}`,async({ page,context })=>{
  const f=await setup(page,context,{ syntheticPending: true,authHint });
  const dialog=page.getByRole('dialog',{ name: title,exact: true });
  await expect(dialog).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(1);
  await dialog.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  const other=title==='Eigene Testmandanten' ? 'Owner-Kundenzugang' : 'Eigene Testmandanten';
  await page.getByRole('button',{ name: other,exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);expect(f.writes).toHaveLength(0);
});
