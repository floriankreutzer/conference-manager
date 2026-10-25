import { expect,test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createProtectedCustomerHtml } from '../../scripts/protected-customer-html.mjs';
const ID='ba000000-0000-4000-8000-000000000001',TENANT='ba000000-0000-4000-8000-000000000002';
const CSRF='c'.repeat(64),ROOT='/api/v1/auth/owner';
async function setup(page,{ existing=false,lostLogout=false,expired=false }={}) {
  const configured=new URL(test.info().project.use.baseURL);
  if (configured.protocol!=='https:' || configured.hostname!=='127.0.0.1') throw new Error('LOOPBACK_FIXTURE_REQUIRED');
  const origin=configured.origin,html=createProtectedCustomerHtml({
    source: await readFile(new URL('../../index.html',import.meta.url),'utf8'),
    customerOrigin: origin,platformOrigin: 'https://127.0.0.1:4174',environment: 'int',microsoftEnabled: true,ownerAccessEnabled: true,
  });
  const writes=[],reads=[];let authenticated=existing,cookiePresent=existing,completed=false;
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if (url.origin!==origin) { await route.abort('blockedbyclient');throw new Error('UNEXPECTED_NON_LOOPBACK_REQUEST'); }
    if (url.pathname==='/') { await route.fulfill({ contentType: 'text/html',body: html });return; }
    if (url.pathname==='/test-reflow.css') {
      await route.fulfill({ contentType: 'text/css',body: 'html { font-size: 200%; }' });return;
    }
    if (!url.pathname.startsWith('/api/')) { await route.continue();return; }
    if (request.method()==='GET') reads.push(url.pathname);
    else writes.push({ path: url.pathname,body: request.postData(),headers: request.headers(),navigation: request.isNavigationRequest() });
    let status=200,response;
    if (url.pathname==='/api/v1/session') {
      if (!authenticated) status=401;
      else response={ user: { id: ID },tenant: { id: TENANT,status: 'onboarding' },roles: ['employee','tenant_admin'],
        permissions: ['request:read','request:cancel','tenant:configure','tenant:users:manage','tenant:integrations:manage','tenant:audit:read'],
        session: { expiresAt: new Date(Date.now()+3600000).toISOString() },csrfToken: 's'.repeat(43),requestId: ID };
    } else if (url.pathname===`${ROOT}/confirmation`) {
      if (expired || completed) status=401;
      else response={ tenantId: TENANT,tenantName: 'Customer',role: 'tenant_admin',accountSwitchRequired: cookiePresent,csrfToken: CSRF,requestId: ID };
    } else if (url.pathname===`${ROOT}/logout`) {
      if (request.headers()['x-csrf-token']!==CSRF || request.postData()!=='{}') status=403;
      else { cookiePresent=false;authenticated=false;if (lostLogout) { await route.abort('failed');return; }status=204; }
    } else if (url.pathname===`${ROOT}/complete`) {
      const form=new URLSearchParams(request.postData());
      if (cookiePresent || form.size!==1 || form.get('csrfToken')!==CSRF || completed) status=409;
      else { completed=true;authenticated=true;
        await route.continue();return;
      }
    } else status=url.pathname.endsWith('/email/pending') ? 401 : 404;
    if (status>=400) response={ error: { code: 'AUTHENTICATION_REJECTED',requestId: ID } };
    await route.fulfill({ status,contentType: 'application/json',...(status===204 ? {} : { body: JSON.stringify(response) }) });
  });
  await page.goto(`${origin}/?auth=owner_confirmation`);return { writes,reads };
}

test('Owner Customer confirmation uses real native POST navigation after keyboard approval, with bilingual reflow and no stored proof',async({ page })=>{
  const f=await setup(page);
  await expect(page.getByRole('button',{ name: 'Kundenanwendung öffnen',exact: true })).toBeVisible();expect(f.writes).toHaveLength(0);
  await expect(page.getByText('Kunde: Customer. Rolle: Tenant Admin.',{ exact: true })).toBeVisible();
  await page.getByRole('combobox',{ name: 'Sprache',exact: true }).selectOption('en');
  await expect(page.getByRole('combobox',{ name: 'Language',exact: true })).toBeFocused();
  await page.addStyleTag({ url: '/test-reflow.css' });
  for (const width of [320,1280]) { await page.setViewportSize({ width,height: 900 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); }
  await page.getByRole('button',{ name: 'Open customer application',exact: true }).focus();
  const completed=page.waitForResponse(response=>response.url()===`${test.info().project.use.baseURL}${ROOT}/complete`
    && response.status()===303);
  await Promise.all([page.waitForEvent('domcontentloaded'),completed,page.keyboard.press('Enter')]);
  await expect(page.getByRole('button',{ name: 'Profile',exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(1);expect(f.writes[0].path).toBe(`${ROOT}/complete`);expect(f.writes[0].navigation).toBe(true);
  expect(f.writes[0].headers['content-type']).toContain('application/x-www-form-urlencoded');
  expect([...new URLSearchParams(f.writes[0].body)]).toEqual([['csrfToken',CSRF]]);
  const storage=await page.evaluate(()=>JSON.stringify({ local: Object.entries(localStorage),session: Object.entries(sessionStorage) }));
  expect(storage).not.toContain(CSRF);expect(f.writes.some(value=>value.path.endsWith('/logout'))).toBe(false);
});

test('existing customer sign-in requires an explicit current-session logout and a separate final confirmation',async({ page })=>{
  const f=await setup(page,{ existing: true });
  await expect(page.getByRole('button',{ name: 'Aktuelles Kundenkonto abmelden',exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(0);expect(await page.getByRole('button',{ name: 'Kundenanwendung öffnen',exact: true }).count()).toBe(0);
  await page.getByRole('button',{ name: 'Aktuelles Kundenkonto abmelden',exact: true }).click();
  await expect(page.getByRole('heading',{ name: 'Owner-Kundenzugang',exact: true })).toBeFocused();
  await expect(page.getByRole('button',{ name: 'Kundenanwendung öffnen',exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(1);expect(f.writes[0].path).toBe(`${ROOT}/logout`);expect(f.writes[0].navigation).toBe(false);
  expect(f.writes[0].body).toBe('{}');expect(f.writes[0].headers['x-csrf-token']).toBe(CSRF);
  const completed=page.waitForResponse(response=>response.url()===`${test.info().project.use.baseURL}${ROOT}/complete`
    && response.status()===303);
  await Promise.all([page.waitForEvent('domcontentloaded'),completed,
    page.getByRole('button',{ name: 'Kundenanwendung öffnen',exact: true }).click()]);
  await expect(page.getByRole('button',{ name: 'Profil',exact: true })).toBeVisible();
  expect(f.writes.map(value=>value.path)).toEqual([`${ROOT}/logout`,`${ROOT}/complete`]);
});

test('uncertain logout requires an independent state check and expired approval cannot send completion',async({ page })=>{
  const f=await setup(page,{ existing: true,lostLogout: true });
  await page.getByRole('button',{ name: 'Aktuelles Kundenkonto abmelden',exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('keine Aktion automatisch wiederholt');
  expect(f.writes).toHaveLength(1);await page.getByRole('button',{ name: 'Aktuellen Status prüfen',exact: true }).click();
  await expect(page.getByRole('button',{ name: 'Kundenanwendung öffnen',exact: true })).toBeVisible();expect(f.writes).toHaveLength(1);
  const g=await setup(page,{ expired: true });await expect(page.getByRole('button',{ name: 'Kundenzugang neu starten',exact: true })).toBeVisible();
  expect(await page.getByRole('button',{ name: 'Kundenanwendung öffnen',exact: true }).count()).toBe(0);expect(g.writes).toHaveLength(0);
});
