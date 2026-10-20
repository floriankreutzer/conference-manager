import { test,expect } from '@playwright/test';

const id=n => `c3000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const CSRF='a'.repeat(43);
async function fixture(page,{ lostMutation=false,lostIssue=false } = {}) {
  const configured=new URL(test.info().project.use.baseURL);
  if (configured.protocol!=='https:' || configured.hostname!=='127.0.0.1') throw new Error('LOOPBACK_FIXTURE_REQUIRED');
  const origin=configured.origin,writes=[];let items=[],missIssue=lostIssue,missMutation=lostMutation;
  const html=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/styles.css">
    <link rel="stylesheet" href="/assets/app-layout.css"><link rel="stylesheet" href="/assets/tenant-admin-settings.css">
    <link rel="stylesheet" href="/assets/tenant-admin-operations.css"></head><body><main id="fixture"></main></body></html>`;
  await page.route('**/*',async route => {
    const request=route.request(),url=new URL(request.url());
    if (url.origin!==origin) { await route.abort('blockedbyclient');throw new Error('UNEXPECTED_NON_LOOPBACK_REQUEST'); }
    if (url.pathname==='/') { await route.fulfill({ contentType: 'text/html',body: html });return; }
    if (url.pathname==='/test-reflow.css') {
      await route.fulfill({ contentType: 'text/css',body: 'html { font-size: 200%; }' });return;
    }
    if (!url.pathname.startsWith('/api/')) { await route.continue();return; }
    const value=request.method()==='GET' ? null : request.postDataJSON();let body;
    if (value) {
      expect(request.headers()['x-csrf-token']).toBe(CSRF);writes.push({ path: url.pathname,value });
    }
    if (url.pathname==='/api/v1/tenant/invitations' && value) {
      if (!items.length) items=value.invitations.map((entry,index) => ({ id: id(index+1),revision: 1,...entry,
        state: 'pending',delivery: 'queued',expiresAt: '2026-12-01T12:00:00.000Z' }));
      if (missIssue) { missIssue=false;await route.abort('failed');return; }
      body={ invitations: items,requestId: id(99) };
    } else if (url.pathname==='/api/v1/tenant/invitations') body={ invitations: items,requestId: id(99) };
    else {
      const match=url.pathname.match(/^\/api\/v1\/tenant\/invitations\/([a-f0-9-]+)\/(reissue|revoke)$/);
      if (!match) throw new Error('UNEXPECTED_API_ROUTE');
      const item=items.find(row => row.id===match[1]);expect(value.expectedRevision).toBe(item.revision);
      item.revision++;item.state=match[2]==='revoke' ? 'revoked' : 'pending';
      item.delivery=match[2]==='revoke' ? 'cancelled' : 'queued';
      if (missMutation) { missMutation=false;await route.abort('failed');return; }
      body={ invitation: item,requestId: id(99) };
    }
    await route.fulfill({ status: value && url.pathname==='/api/v1/tenant/invitations' ? 201 : 200,
      contentType: 'application/json',body: JSON.stringify(body) });
  });
  await page.goto(origin);
  await page.evaluate(async ({ csrf,userId }) => {
    const { createUsersSection }=await import('/src/tenant-admin/sections/users/index.js');
    const { createApiClient }=await import('/src/core/api-client.js');
    const { createCustomerInvitationClient }=await import('/src/platform/customer-invitations/client.js');
    const { setLanguage }=await import('/src/core/i18n.js');setLanguage('de');
    const section=createUsersSection({ context: { userId: () => userId,isDemoRuntime: () => false },adapter: {
      async listUsers() { return { users: [],nextAfterId: null }; },async setRoles() { throw new Error('UNEXPECTED_ROLES'); },
      async setAccess() { throw new Error('UNEXPECTED_ACCESS'); },
      invitations: createCustomerInvitationClient({ apiClient: createApiClient({ csrfTokenProvider: () => csrf }) }),
    } });
    const root=document.getElementById('fixture');
    const render=async locale => {
      if (locale) setLanguage(locale);await section.render({ root,isCurrent: () => true,rerender: () => void render() });
    };
    globalThis.invitationFixture={ render };await render();
  },{ csrf: CSRF,userId: id(98) });
  await expect(page.getByText('Der aktuelle Einladungsstand ist geladen.')).toBeVisible();return { writes };
}

test('Tenant Admin invites several people with separate roles, resends and revokes through closed commands',async ({ page }) => {
  const f=await fixture(page);const first=page.getByRole('group',{ name: 'Person 1',exact: true });
  await first.getByRole('textbox',{ name: 'E-Mail-Adresse',exact: true }).fill('Admin@example.com');
  await first.getByRole('checkbox',{ name: 'Tenant Admin',exact: true }).check();
  const add=page.getByRole('button',{ name: 'Weitere Person hinzufügen' });await add.focus();await add.press('Enter');
  const second=page.getByRole('group',{ name: 'Person 2',exact: true });
  await expect(second.getByRole('textbox',{ name: 'E-Mail-Adresse',exact: true })).toBeFocused();
  await second.getByRole('textbox',{ name: 'E-Mail-Adresse',exact: true }).fill('Employee@example.com');
  await second.getByRole('combobox',{ name: 'Sprache der Einladung',exact: true }).selectOption('en');
  await page.getByRole('button',{ name: 'Einladungen senden',exact: true }).click();
  await expect(page.getByRole('heading',{ name: 'Personen einladen',exact: true })).toBeFocused();
  expect(f.writes[0].value.invitations).toEqual([{ recipient: 'Admin@example.com',roles: ['tenant_admin'],locale: 'de' },
    { recipient: 'Employee@example.com',roles: [],locale: 'en' }]);
  await page.getByRole('button',{ name: 'Einladung für Admin@example.com erneut senden',exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(2);expect(f.writes[1].value).toEqual({ expectedRevision: 1 });
  await page.getByRole('button',{ name: 'Einladung für Admin@example.com widerrufen',exact: true }).click();
  await expect(page.getByRole('article',{ name: 'Admin@example.com',exact: true })).toContainText('Einladung wurde widerrufen');
  expect(f.writes[2].value).toEqual({ expectedRevision: 2 });
  await expect(page.getByRole('button',{ name: 'Einladung für Admin@example.com erneut senden',exact: true })).toHaveCount(0);
});

test('language rerender preserves drafts, native labels and bounded mobile/text reflow',async ({ page }) => {
  await fixture(page);await page.getByRole('textbox',{ name: 'E-Mail-Adresse',exact: true }).fill('Draft@example.com');
  await page.evaluate(() => globalThis.invitationFixture.render('en'));
  await expect(page.getByRole('textbox',{ name: 'Email address',exact: true })).toHaveValue('Draft@example.com');
  await expect(page.getByRole('heading',{ name: 'Invite people',exact: true })).toBeVisible();
  await page.addStyleTag({ url: '/test-reflow.css' });
  for (const width of [320,1280]) {
    await page.setViewportSize({ width,height: 900 });
    const geometry=await page.evaluate(() => ({ fits: document.documentElement.scrollWidth<=innerWidth+1,
      overflow: [...document.querySelectorAll('*')].filter(node => node.getBoundingClientRect().right>innerWidth+1)
        .slice(0,12).map(node => ({ tag: node.tagName,className: node.className,width: node.getBoundingClientRect().width,
          right: node.getBoundingClientRect().right })) }));
    expect(geometry.fits,JSON.stringify(geometry.overflow)).toBe(true);
    await expect(page.getByRole('button',{ name: 'Send invitations',exact: true })).toBeVisible();
  }
  await page.getByRole('button',{ name: 'Add another person',exact: true }).click();
  await expect(page.getByRole('group',{ name: 'Person 2',exact: true }).getByRole('textbox',{ name: 'Email address' })).toBeFocused();
  await page.getByRole('button',{ name: 'Remove person 2',exact: true }).click();
  await expect(page.getByRole('textbox',{ name: 'Email address',exact: true })).toBeFocused();
});

test('lost issue response offers the same command ID and lost mutation response only refreshes current state',async ({ page }) => {
  const f=await fixture(page,{ lostIssue: true,lostMutation: true });
  await page.getByRole('textbox',{ name: 'E-Mail-Adresse',exact: true }).fill('Recovery@example.com');
  await page.getByRole('button',{ name: 'Einladungen senden',exact: true }).click();
  await page.getByRole('button',{ name: 'Diesen Einladungsauftrag erneut prüfen',exact: true }).click();
  await expect(page.getByRole('button',{ name: 'Einladung für Recovery@example.com erneut senden' })).toBeVisible();
  expect(f.writes.length).toBe(2);expect(f.writes[0].value).toEqual(f.writes[1].value);
  await page.getByRole('button',{ name: 'Einladung für Recovery@example.com erneut senden' }).click();
  await expect(page.getByRole('button',{ name: 'Einladung für Recovery@example.com erneut senden' })).toBeDisabled();
  await page.getByRole('button',{ name: 'Aktuellen Stand laden',exact: true }).click();
  await expect(page.getByRole('button',{ name: 'Einladung für Recovery@example.com erneut senden' })).toBeEnabled();
  expect(f.writes.length).toBe(3);
});
