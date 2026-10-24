import { expect,test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { asProductionHtml } from './fixtures/production-html.js';

const ID='f3000000-0000-4000-8000-000000000001';
const OTHER='f3000000-0000-4000-8000-000000000002',CSRF='a'.repeat(64),NEXT='b'.repeat(64);
async function setup(page,{ wrongCode=false,lostSelection=false,pauseVerify=false,choiceFailure=false } = {}) {
  const configured=new URL(test.info().project.use.baseURL);
  if (configured.protocol!=='https:' || configured.hostname!=='127.0.0.1') throw new Error('LOOPBACK_FIXTURE_REQUIRED');
  const ORIGIN=configured.origin;
  const html=asProductionHtml(await readFile(new URL('../../index.html',import.meta.url),'utf8'));
  let phase=null,authenticated=false,releaseVerification,failChoices=choiceFailure;const writes=[],reads=[];
  const verified=new Promise(resolve => { releaseVerification=resolve; });
  const proof=() => ({ status: phase==='choices' ? 'membership_required' : 'code_required',requestId: ID,
    csrfToken: phase==='choices' ? NEXT : CSRF,expiresAt: new Date(Date.now()+300000).toISOString() });
  await page.route('**/*',async route => {
    const request=route.request(),url=new URL(request.url());
    if (url.origin!==ORIGIN) {
      await route.abort('blockedbyclient');throw new Error('UNEXPECTED_NON_LOOPBACK_REQUEST');
    }
    if (url.pathname==='/') { await route.fulfill({ contentType: 'text/html',body: html });return; }
    if (url.pathname==='/test-reflow.css') {
      await route.fulfill({ contentType: 'text/css',body: 'html { font-size: 200%; }' });return;
    }
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();return;
    }
    let status=200,body;
    if (request.method()==='GET') reads.push(url.pathname);
    else writes.push({ path: url.pathname,body: request.postDataJSON(),headers: request.headers() });
    if (url.pathname==='/api/v1/session') {
      if (!authenticated) { status=401;body={ error: { code: 'UNAUTHENTICATED',requestId: ID } }; }
      else body={ user: { id: ID },tenant: { id: OTHER,status: 'onboarding' },roles: ['employee','tenant_admin'],
        permissions: ['request:read','request:cancel','tenant:configure','tenant:users:manage',
          'tenant:integrations:manage','tenant:audit:read'],session: { expiresAt: new Date(Date.now()+3600000).toISOString() },
        csrfToken: 'c'.repeat(43),requestId: ID };
    } else if (url.pathname.endsWith('/email/pending')) {
      if (!phase) { status=401;body={ error: { code: 'AUTHENTICATION_REJECTED',requestId: ID } }; } else body=proof();
    } else if (url.pathname.endsWith('/email/challenges')) { phase='code';status=202;body=proof(); }
    else if (url.pathname.endsWith('/email/verify')) {
      if (pauseVerify) await new Promise(resolve => {
        const timer=setTimeout(resolve,5000);verified.then(() => { clearTimeout(timer);resolve(); });
      });
      if (wrongCode) { status=401;body={ error: { code: 'AUTHENTICATION_REJECTED',requestId: ID } }; }
      else { phase='choices';body=proof(); }
    } else if (url.pathname.endsWith('/email/choices')) {
      if (failChoices) { failChoices=false;status=503;body={ error: { code: 'UNAVAILABLE',requestId: ID } }; }
      else body={ status: 'membership_required',requestId: ID,
        items: [{ membershipId: ID,displayName: '<Synthetic invited organisation>' }] };
    } else if (url.pathname.endsWith('/email/selection')) {
      authenticated=true;
      if (lostSelection) { await route.abort('failed');return; } status=204;
    } else { status=404;body={ error: { code: 'NOT_FOUND',requestId: ID } }; }
    await route.fulfill({ status,contentType: 'application/json',...(status===204 ? {} : { body: JSON.stringify(body) }) });
  });
  await page.goto(ORIGIN);await expect(page.getByLabel('E-Mail-Adresse',{ exact: true })).toBeVisible();
  return { writes,reads,releaseVerification,async start() {
    await page.getByLabel('E-Mail-Adresse',{ exact: true }).fill('Invited@example.com');
    await page.getByLabel('E-Mail-Adresse',{ exact: true }).press('Enter');
    await expect(page.getByRole('heading',{ name: 'E-Mail-Code eingeben' })).toBeFocused();
  } };
}

test('invited email login is keyboard usable and keeps leading zeroes, current CSRF and an explicit organisation choice',async ({ page }) => {
  const f=await setup(page);await f.start();
  const code=page.getByLabel('Achtstelliger Code');await expect(code).toHaveAttribute('autocomplete','one-time-code');
  await expect(code).toHaveAttribute('inputmode','numeric');await expect(code).toHaveAttribute('maxlength','8');
  await code.fill('00123456');await code.press('Enter');
  await expect(page.getByRole('heading',{ name: 'Organisation auswählen' })).toBeFocused();
  await expect(page.getByRole('combobox',{ name: 'Organisation',exact: true })).toHaveValue('');
  expect(f.writes.filter(write => write.path.endsWith('/selection'))).toHaveLength(0);
  expect(f.writes.find(write => write.path.endsWith('/verify')).body).toEqual({ code: '00123456' });
  expect(f.writes.find(write => write.path.endsWith('/verify')).headers['x-csrf-token']).toBe(CSRF);
  await page.getByRole('combobox',{ name: 'Organisation',exact: true }).selectOption(ID);
  await page.getByRole('button',{ name: 'Organisation öffnen' }).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{ name: 'Profil',exact: true })).toBeVisible();
  const selected=f.writes.filter(write => write.path.endsWith('/selection'));expect(selected).toHaveLength(1);
  expect(selected[0].body).toEqual({ membershipId: ID });expect(selected[0].headers['x-csrf-token']).toBe(NEXT);
  expect(f.reads.filter(path => path==='/api/v1/session').length).toBeGreaterThanOrEqual(3);
  const storage=await page.evaluate(() => JSON.stringify({ local: Object.entries(localStorage),session: Object.entries(sessionStorage) }));
  expect(storage).not.toMatch(/Invited@example|00123456|csrf|membershipId|browserToken/);
});

test('code form preserves language/focus, clears submitted secrets, reports errors and reflows with enlarged text',async ({ page }) => {
  const f=await setup(page,{ wrongCode: true,pauseVerify: true });await f.start();
  await page.getByLabel('Achtstelliger Code').fill('0012');
  await page.getByRole('combobox',{ name: 'Sprache',exact: true }).selectOption('en');
  await expect(page.getByRole('combobox',{ name: 'Language',exact: true })).toBeFocused();
  await expect(page.getByLabel('Eight-digit code')).toHaveValue('0012');
  await page.getByLabel('Eight-digit code').fill('00123456');await page.getByLabel('Eight-digit code').press('Enter');
  await expect(page.getByRole('main').getByRole('status')).toBeFocused();
  expect(await page.locator('#customerAuthCode').count()).toBe(0);f.releaseVerification();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Sign-in could not be confirmed');
  await expect(page.getByLabel('Eight-digit code')).toBeFocused();
  await expect(page.getByLabel('Eight-digit code')).toHaveValue('');
  await expect(page.getByLabel('Eight-digit code')).toHaveAttribute('aria-invalid','true');
  await page.evaluate(() => {
    const link=document.createElement('link');link.rel='stylesheet';link.href='/test-reflow.css';document.head.appendChild(link);
  });
  for (const width of [320,1280]) {
    await page.setViewportSize({ width,height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('button',{ name: 'Different email address or new code' }).click();
  await expect(page.getByLabel('Email address',{ exact: true })).toBeVisible();
  expect(f.writes.filter(write => write.path.endsWith('/challenges'))).toHaveLength(1);
});

test('a failed choice read and reload recover proved choices without resending or reverifying the code',async ({ page }) => {
  const f=await setup(page,{ choiceFailure: true });await f.start();
  await page.getByLabel('Achtstelliger Code').fill('00123456');await page.getByLabel('Achtstelliger Code').press('Enter');
  await expect(page.getByRole('button',{ name: 'Anmeldung fortsetzen',exact: true })).toBeVisible();
  await page.getByRole('button',{ name: 'Anmeldung fortsetzen',exact: true }).click();
  await expect(page.getByRole('combobox',{ name: 'Organisation',exact: true })).toBeVisible();
  await page.reload();await expect(page.getByRole('combobox',{ name: 'Organisation',exact: true })).toBeVisible();
  expect(f.writes.filter(write => write.path.endsWith('/verify'))).toHaveLength(1);
  expect(f.writes.filter(write => write.path.endsWith('/challenges'))).toHaveLength(1);
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(await page.getByRole('option').allTextContents()).toContain('<Synthetic invited organisation>');
});

test('a lost selection response offers session verification and never repeats committed acceptance',async ({ page }) => {
  const f=await setup(page,{ lostSelection: true });await f.start();
  await page.getByLabel('Achtstelliger Code').fill('00123456');await page.getByLabel('Achtstelliger Code').press('Enter');
  await page.getByRole('combobox',{ name: 'Organisation',exact: true }).selectOption(ID);
  await page.getByRole('button',{ name: 'Organisation öffnen' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Die Auswahl wird nicht erneut gesendet');
  await page.getByRole('button',{ name: 'Anmeldung prüfen',exact: true }).click();
  await expect(page.getByRole('button',{ name: 'Profil',exact: true })).toBeVisible();
  expect(f.writes.filter(write => write.path.endsWith('/selection'))).toHaveLength(1);
});

for (const language of ['de','en']) {
  test(`Tenant audit distinguishes issue, reissue and revocation in ${language}`,async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async lang => {
      const { createAuditSection }=await import('/src/tenant-admin/sections/audit/index.js');
      const { createTenantAuditApi }=await import('/src/platform/tenant-audit-api.js');
      const { setLanguage }=await import('/src/core/i18n.js');setLanguage(lang);
      const identity='f3000000-0000-4000-8000-000000000001';
      const api=createTenantAuditApi({ apiClient: { async request() { return {
        events: ['issued','reissued','revoked'].map((status,index) => ({ id: String(3-index),category: 'configuration',
          action: 'tenant.onboarding.invited',actor: { userId: null },target: { type: 'customer_invitation',id: identity },
          outcome: 'success',occurredAt: '2026-10-20T08:00:00.000Z',correlationId: identity,
          change: { before: null,after: { revision: index+1,status } } })),nextBeforeId: null,
        window: { from: '2026-10-01T00:00:00.000Z',to: '2026-10-20T12:00:00.000Z' },requestId: identity,
      }; } } });
      document.body.replaceChildren();const root=document.createElement('main');document.body.appendChild(root);
      const section=createAuditSection({ adapter: api });
      const render=() => section.render({ root,isCurrent: () => true,rerender: render });await render();
    },language);
    for (const disclosure of await page.locator('.tenant-audit-change > summary').all()) {
      await disclosure.focus();await page.keyboard.press('Enter');
    }
    for (const text of language==='de' ? ['Einladung erstellt','Erneut eingeladen','Widerrufen']
      : ['Invitation created','Invited again','Revoked']) await expect(page.getByText(text,{ exact: true })).toBeVisible();
    expect(await page.locator('main').innerText()).not.toMatch(/recipient|Invited@example|undefined/);
  });
}
