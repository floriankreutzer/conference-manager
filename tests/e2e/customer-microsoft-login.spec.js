import { expect,test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { asProductionHtml } from './fixtures/production-html.js';
const ID='ba000000-0000-4000-8000-000000000001',TENANT='ba000000-0000-4000-8000-000000000002';
const FLOW_CSRF='c'.repeat(64),SESSION_CSRF='s'.repeat(43),ROOT='/api/v1/auth/microsoft';
async function setup(page,{ ceremony='membership',lostConfirmation=false,reauthentication=false }={}) {
  const configured=new URL(test.info().project.use.baseURL);
  if (configured.protocol!=='https:' || configured.hostname!=='127.0.0.1') throw new Error('LOOPBACK_FIXTURE_REQUIRED');
  const origin=configured.origin,html=asProductionHtml(await readFile(new URL('../../index.html',import.meta.url),'utf8'));
  let authenticated=ceremony!=='membership',linked=false;const writes=[],reads=[];
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if (url.origin!==origin) { await route.abort('blockedbyclient');throw new Error('UNEXPECTED_NON_LOOPBACK_REQUEST'); }
    if (url.pathname==='/') { await route.fulfill({ contentType: 'text/html',body: html });return; }
    if (url.pathname==='/src/platform/production-bootstrap.js') {
      // The deployment flag stays OFF. This isolated fixture composes the actual
      // production modules explicitly, with synthetic API and navigation ports.
      await route.fulfill({ contentType: 'text/javascript',body: `
        import { bootstrapCustomerApplication } from '/src/app.js';
        import { RUNTIME_MODE } from '/src/core/security-policy.js';
        import { bootstrapInvitedCustomerAuthentication } from '/src/platform/customer-authentication/bootstrap.js';
        globalThis.__msNavigations=[];
        await bootstrapCustomerApplication({ runtimeMode: RUNTIME_MODE.PRODUCTION,
          authenticationBootstrap: options=>bootstrapInvitedCustomerAuthentication({ ...options,
            microsoftAuthenticationEnabled: true,navigate: url=>globalThis.__msNavigations.push(url) }) });
      ` });return;
    }
    if (url.pathname==='/test-reflow.css') {
      await route.fulfill({ contentType: 'text/css',body: 'html { font-size: 200%; }' });return;
    }
    if (!url.pathname.startsWith('/api/')) { await route.continue();return; }
    const body=request.postDataJSON();
    if (request.method()==='GET') reads.push(url.pathname);
    else writes.push({ path: url.pathname,body,headers: request.headers() });
    let status=200,response;
    if (url.pathname==='/api/v1/session') {
      if (request.method()==='DELETE') {
        if (request.headers()['x-csrf-token']!==SESSION_CSRF) status=403;
        else { authenticated=false;status=204; }
      } else if (!authenticated) { status=401; }
      else response={ user: { id: ID },tenant: { id: TENANT,status: 'onboarding' },roles: ['employee','tenant_admin'],
        permissions: ['request:read','request:cancel','tenant:configure','tenant:users:manage','tenant:integrations:manage','tenant:audit:read'],
        session: { expiresAt: new Date(Date.now()+3600000).toISOString() },csrfToken: SESSION_CSRF,requestId: ID };
    } else if (url.pathname===`${ROOT}/choices`) response={ status: 'membership_required',csrfToken: FLOW_CSRF,requestId: ID,
      items: [{ membershipId: ID,displayName: '<Synthetic invited organisation>' }] };
    else if (url.pathname===`${ROOT}/selection`) {
      if (request.headers()['x-csrf-token']!==FLOW_CSRF || JSON.stringify(body)!==JSON.stringify({ membershipId: ID })) status=403;
      else { authenticated=true;status=204; }
    } else if (url.pathname===`${ROOT}/link/confirmation`) response={ status: 'link_confirmation_required',csrfToken: FLOW_CSRF,requestId: ID };
    else if (url.pathname===`${ROOT}/link/status`) response={ status: 'account',microsoftLinked: linked,
      emailReauthenticationRequired: reauthentication || linked,requestId: ID };
    else if (url.pathname===`${ROOT}/link/start`) response={
      authorizationUrl: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?state=synthetic',requestId: ID };
    else if (url.pathname===`${ROOT}/link/confirm`) {
      if (request.headers()['x-csrf-token']!==FLOW_CSRF || JSON.stringify(body)!==JSON.stringify({ confirm: true })) status=403;
      else { linked=true;if (lostConfirmation) { await route.abort('failed');return; }status=204; }
    } else { status=url.pathname.endsWith('/email/pending') ? 401 : 404; }
    if (status>=400) response={ error: { code: 'AUTHENTICATION_REJECTED',requestId: ID } };
    await route.fulfill({ status,contentType: 'application/json',...(status===204 ? {} : { body: JSON.stringify(response) }) });
  });
  const query=ceremony==='membership' ? '?auth=microsoft_membership_required'
    : ceremony==='link' ? '?auth=microsoft_link_confirmation_required' : '';
  await page.goto(`${origin}/${query}`);return { writes,reads };
}
test('Microsoft continuation requires explicit organization choice and safely renders server labels with no email/code replay',async({ page })=>{
  const f=await setup(page);const select=page.getByRole('combobox',{ name: 'Organisation',exact: true });
  await expect(select).toBeVisible();await expect(select).toHaveValue('');
  expect(f.writes).toHaveLength(0);expect(f.reads.some(path=>path.includes('/email/'))).toBe(false);
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  await select.selectOption(ID);await page.getByRole('button',{ name: 'Organisation öffnen' }).focus();
  await Promise.all([page.waitForEvent('domcontentloaded'),page.keyboard.press('Enter')]);
  await expect(page.getByRole('button',{ name: 'Profil',exact: true })).toBeVisible();
  const selected=f.writes.filter(value=>value.path.endsWith('/selection'));expect(selected).toHaveLength(1);
  expect(selected[0].body).toEqual({ membershipId: ID });expect(selected[0].headers['x-csrf-token']).toBe(FLOW_CSRF);
  expect(f.reads.filter(path=>path==='/api/v1/session').length).toBeGreaterThanOrEqual(3);
});
test('explicit account linking supports keyboard, DE/EN and enlarged-text reflow and never confirms on callback arrival',async({ page })=>{
  const f=await setup(page,{ ceremony: 'link' });
  await expect(page.getByRole('button',{ name: 'Microsoft-Konto verknüpfen',exact: true })).toBeVisible();
  expect(f.writes.filter(value=>value.path.endsWith('/link/confirm'))).toHaveLength(0);
  await page.getByRole('combobox',{ name: 'Sprache',exact: true }).selectOption('en');
  await expect(page.getByRole('combobox',{ name: 'Language',exact: true })).toBeFocused();
  await page.addStyleTag({ url: '/test-reflow.css' });
  for (const width of [320,1280]) {
    await page.setViewportSize({ width,height: 900 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('button',{ name: 'Link Microsoft account',exact: true }).focus();
  await Promise.all([page.waitForEvent('domcontentloaded'),page.keyboard.press('Enter')]);
  await expect(page.getByRole('button',{ name: 'Profile',exact: true })).toBeVisible();
  const confirmed=f.writes.filter(value=>value.path.endsWith('/link/confirm'));expect(confirmed).toHaveLength(1);
  expect(confirmed[0].body).toEqual({ confirm: true });expect(confirmed[0].headers['x-csrf-token']).toBe(FLOW_CSRF);
  await page.getByRole('button',{ name: 'Profile',exact: true }).click();
  await expect(page.getByText('A Microsoft account is linked for your current sign-in.',{ exact: true })).toBeVisible();
  const storage=await page.evaluate(()=>JSON.stringify({ local: Object.entries(localStorage),session: Object.entries(sessionStorage) }));
  expect(storage).not.toMatch(/csrf|browserToken|membershipId|providerUser|synthetic-code/);
});
test('an ambiguous confirmation reads current account state and never repeats the identity-link mutation',async({ page })=>{
  const f=await setup(page,{ ceremony: 'link',lostConfirmation: true });
  await page.getByRole('button',{ name: 'Microsoft-Konto verknüpfen',exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Bestätigung wird nicht erneut gesendet');
  await expect(page.getByRole('button',{ name: 'Microsoft-Konto verknüpfen',exact: true })).toHaveCount(0);
  await page.getByRole('button',{ name: 'Verknüpfungsstatus prüfen',exact: true }).click();
  await expect(page.getByText('Für Ihre aktuelle Anmeldung ist ein Microsoft-Konto verbunden.',{ exact: true })).toBeVisible();
  expect(f.writes.filter(value=>value.path.endsWith('/link/confirm'))).toHaveLength(1);
  expect(f.reads.filter(path=>path.endsWith('/link/status'))).toHaveLength(1);
});
test('profile uses authoritative fresh-email status and reauthentication requires its own explicit session action',async({ page })=>{
  const f=await setup(page,{ ceremony: 'profile',reauthentication: true });
  await page.getByRole('button',{ name: 'Profil',exact: true }).click();
  await expect(page.getByRole('button',{ name: 'Microsoft-Konto bestätigen',exact: true })).toHaveCount(0);
  await expect(page.getByText('Melden Sie sich zuerst erneut mit einem E-Mail-Code an.',{ exact: false })).toBeVisible();
  expect(f.writes).toHaveLength(0);
  await Promise.all([page.waitForEvent('domcontentloaded'),
    page.getByRole('button',{ name: 'Abmelden und mit E-Mail-Code anmelden',exact: true }).click()]);
  await expect(page.getByLabel('E-Mail-Adresse',{ exact: true })).toBeVisible();
  expect(f.writes.filter(value=>value.path==='/api/v1/session')).toHaveLength(1);
  expect(f.writes[0].headers['x-csrf-token']).toBe(SESSION_CSRF);
  expect(f.writes.some(value=>value.path.includes('/link/start') || value.path.includes('/email/challenges'))).toBe(false);
});
