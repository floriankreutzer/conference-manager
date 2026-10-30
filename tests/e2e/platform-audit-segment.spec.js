import { expect,test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { microsoftOperationChallenge } from '../support/platform-microsoft-operation-fixture.js';

const ORIGIN='https://ops-int.example.com',ID='11111111-1111-4111-8111-111111111111';
const state=Buffer.alloc(32,1).toString('base64url');
function payload(ownerRoles=false) {
  const value={ schemaVersion: 2,audit: { segmentId: ID,verification: 'verified',
    legacy: { eventCount: 124,verification: 'unavailable' } },items: [{ sequence: 125,operatorId: null,roles: [],permissions: [],
    assuranceLevel: 'offline_owner',targetTenantId: null,action: 'platform.operator.changed',targetType: 'platform_audit_segment',
    targetId: ID,previousState: null,newState: { integrityVersion: 2 },occurredAt: '2026-10-21T12:00:00.000Z',correlationId: ID,
    outcome: 'success',metadata: { operation: 'audit_segment_genesis',legacyVerification: 'unavailable' },retentionClass: 'recovery' }] };
  if (ownerRoles) Object.assign(value.items[0],{ targetType: 'platform_owner_roles',
    previousState: { roleCount: 2,securityVersion: 6 },newState: { roleCount: 4,securityVersion: 7,scopeMode: 'all' },
    metadata: { operation: 'owner_all_platform_roles',environment: 'int',deploymentEpoch: ID,
      approvalReference: 'owner-role-test',sessionsRevoked: 1,transactionsRevoked: 0 } });
  return value;
}
async function setup(page,{ forged=false,eventCount=1,emptyContinuation=false,changedContext=null,ownerRoles=false,
  microsoft=false,statusFailure=false }={}) {
  const exports=[],cursors=[];
  await page.addInitScript(()=>{
    const bytes=length=>new Uint8Array(length).fill(1).buffer;
    Object.defineProperty(navigator,'credentials',{ configurable: true,value: { async get() {
      const encoded=btoa(String.fromCharCode(...new Uint8Array(bytes(32)))).replace(/=+$/,'');
      return { id: encoded,rawId: bytes(32),type: 'public-key',response: { clientDataJSON: bytes(64),
        authenticatorData: bytes(37),signature: bytes(72),userHandle: bytes(32) },getClientExtensionResults: ()=>({}) };
    } } });
  });
  await page.route(`${ORIGIN}/**`,async route=>{
    const request=route.request(),url=new URL(request.url());let body,code=200;
    if (!url.pathname.startsWith('/api/')) {
      await route.fulfill({ response: await route.fetch({ url: `https://127.0.0.1:4173${url.pathname}${url.search}` }) });return;
    }
    if (url.pathname==='/api/v1/platform/session') {
      body={ operatorId: ID,roles: ['platform_security_auditor'],permissions: ['platform:tenant:read','platform:diagnostics:read',
        'platform:diagnostics:sensitive','platform:audit:read','platform:audit:export','platform:runtime:read'],
      assurance: { level: 'mfa',authenticatedAt: '2099-01-01T00:00:00.000Z' },expiresAt: '2099-01-01T04:00:00.000Z',
      stepUpExpiresAt: null,csrfToken: 'C'.repeat(43) };
    } else if (url.pathname==='/api/v1/platform/auth/passkey/configuration') {
      if (microsoft) { code=404;body={ error: { code: 'PLATFORM_NOT_FOUND' } }; }
      else body={ mode: 'application_passkey',environment: 'int',minimumPasskeys: 2,requestId: ID };
    } else if (url.pathname==='/api/v1/platform/auth/microsoft/operation/configuration') {
      body={ mode: 'microsoft_mfa',environment: 'int' };
    } else if (url.pathname==='/api/v1/platform/auth/microsoft/operation/status') {
      code=statusFailure ? 503 : 200;body=statusFailure ? { error: { code: 'UNAVAILABLE' } } : { status: 'pending',requestId: ID };
    } else if (url.pathname==='/api/v1/platform/tenants') {
      body={ schemaVersion: 1,snapshotAt: '2026-10-21T12:00:00.000Z',items: [],nextCursor: null };
    } else if (url.pathname==='/api/v1/platform/audit/events') {
      const before=url.searchParams.get('beforeSequence');cursors.push(before);body=payload(ownerRoles);
      const genesis=body.items[0];
      body.items=Array.from({ length: eventCount },(_,index)=>{
        const sequence=124+eventCount-index;
        return sequence===125 ? genesis : { ...genesis,sequence,assuranceLevel: 'unverified',
          action: 'platform.authentication.failed',targetType: 'authentication',targetId: 'platform',outcome: 'failure',
          retentionClass: 'security',newState: null,metadata: { reasonCode: 'identity_unmapped' } };
      }).filter(item=>before===null || item.sequence<Number(before)).slice(0,100);
      if (before!==null && emptyContinuation) body.items=[];
      if (before!==null && changedContext==='segment') body.audit.segmentId='22222222-2222-4222-8222-222222222222';
      if (before!==null && changedContext==='legacy') body.audit.legacy.eventCount=123;
      if (before!==null && changedContext==='schema') body={ schemaVersion: 1,items: [] };
      if (forged) body.audit.legacy.verification='verified';
    } else if (url.pathname==='/api/v1/platform/audit/exports') {
      exports.push({ url: request.url(),headers: request.headers() });
      if (!request.headers()['x-platform-passkey-proof'] && !request.headers()['x-platform-microsoft-proof']) {
        code=428;body=microsoft ? microsoftOperationChallenge(ORIGIN) : { status: 'passkey_required',state,requestId: ID,options: { challenge: state,
          rpId: 'ops-int.example.com',allowCredentials: [{ id: state,type: 'public-key' }],userVerification: 'required' } };
      } else body=payload(ownerRoles);
    } else { code=404;body={ error: { code: 'PLATFORM_NOT_FOUND' } }; }
    await route.fulfill({ status: code,contentType: 'application/json',body: JSON.stringify(body) });
  });
  await page.goto(`${ORIGIN}/platform-admin/`);
  await page.locator('[data-platform-admin-fleet-view="platform-audit"]').click();return { exports,cursors };
}

test('current audit warning is localized, reflows and exports unavailable legacy context only after exact proof',async({ page })=>{
  const { exports }=await setup(page);
  await expect(page.getByText(/Für die 124 älteren Ereignisse/)).toBeVisible();
  const control=page.getByRole('button',{ name: 'Bis zu 100 aktuelle Ereignisse exportieren' });
  await control.focus();await expect(control).toBeFocused();
  const downloaded=page.waitForEvent('download');await page.keyboard.press('Enter');
  const download=await downloaded;
  expect(JSON.parse(await readFile(await download.path(),'utf8'))).toEqual(payload());
  expect(exports).toHaveLength(2);expect(exports[0].url).toBe(exports[1].url);
  expect(exports[1].headers['x-platform-passkey-proof']).toBeTruthy();
  await page.evaluate(async()=>{ const i18n=await import('/src/core/i18n.js');i18n.setLanguage('en');
    window.dispatchEvent(new CustomEvent('conference-language-changed')); });
  await expect(page.getByText(/Signature verification is unavailable for the 124 older events/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});

for (const locale of ['de','en']) {
  test(`cancelled Microsoft audit export preserves verified events and keyboard focus: ${locale}`,async({ page })=>{
    const { exports }=await setup(page,{ microsoft: true });let downloads=0;page.on('download',()=>downloads++);
    if (locale==='en') await page.evaluate(async()=>{ const { setLanguage }=await import('/src/core/i18n.js');setLanguage('en'); });
    await page.setViewportSize({ width: 375,height: 812 });
    const control=page.getByRole('button',{ name: locale==='de' ? 'Bis zu 100 aktuelle Ereignisse exportieren' : 'Export up to 100 current events' });
    await control.focus();await control.press('Enter');
    const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await dialog.press('Escape');
    await expect(dialog).toHaveCount(0);await expect(control).toBeEnabled();await expect(control).toBeFocused();
    await expect(page.locator('#mainContent').getByRole('status').getByText(locale==='de'
      ? 'Der Vorgang wurde abgebrochen. Sie können es erneut versuchen.' : 'The action was cancelled. You can try again.',{ exact: true })).toBeVisible();
    await expect(page.locator('.platform-admin-audit-list > li')).toHaveCount(1);
    await expect(page.locator('.platform-admin-error[role="alert"]')).toHaveCount(0);
    expect(exports).toHaveLength(1);expect(downloads).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  });
}
test('failed Microsoft status is a confirmation failure and preserves the independently verified audit',async({ page })=>{
  const { exports }=await setup(page,{ microsoft: true,statusFailure: true });
  // Exercise the actual polling listener without opening a real provider page.
  await page.getByRole('button',{ name: 'Bis zu 100 aktuelle Ereignisse exportieren' }).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await dialog.getByRole('link').evaluate(link=>{ link.addEventListener('click',event=>event.preventDefault());link.click(); });
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.platform-admin-audit-list > li')).toHaveCount(1);
  await expect(page.locator('.platform-admin-error[role="alert"]')).toHaveCount(0);
  await expect(page.locator('#mainContent').getByRole('status').getByText('Der Schritt konnte nicht abgeschlossen werden. Laden Sie den aktuellen Stand erneut oder melden Sie sich neu an.',{ exact: true })).toBeVisible();
  await expect(page.getByText('Der Vorgang wurde abgebrochen. Sie können es erneut versuchen.',{ exact: true })).toHaveCount(0);
  expect(exports).toHaveLength(1);
});

test('owner all-role upgrade receipt stays readable and exportable in the current signed segment',async({ page })=>{
  await setup(page,{ ownerRoles: true });
  await expect(page.locator('.platform-admin-audit-list > li')).toHaveCount(1);
  await expect(page.locator('.platform-admin-error[role="alert"]')).toHaveCount(0);
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{ name: 'Bis zu 100 aktuelle Ereignisse exportieren' }).click();
  expect(JSON.parse(await readFile(await (await downloaded).path(),'utf8'))).toEqual(payload(true));
});

test('invented legacy verification fails closed without a verified badge or export',async({ page })=>{
  await setup(page,{ forged: true });await expect(page.locator('.platform-admin-error[role="alert"]')).toBeVisible();
  await expect(page.getByRole('button',{ name: /100.*exportieren/ })).toHaveCount(0);
  await expect(page.getByText(/Die Signaturen des aktuellen Audit-Abschnitts/)).toHaveCount(0);
});

for (const emptyContinuation of [false,true]) {
  test(`audit pagination uses the last bounded page and stops without repeated cursors: empty=${emptyContinuation}`,async({ page })=>{
    const { cursors }=await setup(page,{ eventCount: 201,emptyContinuation });
    const entries=page.locator('.platform-admin-audit-list > li'),next=page.locator('.platform-admin-pagination button');
    await expect(entries).toHaveCount(100);await next.click();
    if (emptyContinuation) { await expect(entries).toHaveCount(100);await expect(next).toHaveCount(0); }
    else {
      await expect(entries).toHaveCount(200);await next.click();await expect(entries).toHaveCount(201);
      await expect(next).toHaveCount(0);
    }
    expect(cursors).toEqual(emptyContinuation ? [null,'226'] : [null,'226','126']);
  });
}

for (const changedContext of ['segment','legacy','schema']) {
  test(`audit continuation rejects changed ${changedContext} context without relabeling retained events`,async({ page })=>{
    await setup(page,{ eventCount: 201,changedContext });
    await expect(page.locator('.platform-admin-audit-list > li')).toHaveCount(100);
    await page.locator('.platform-admin-pagination button').click();
    await expect(page.locator('.platform-admin-error[role="alert"]')).toBeVisible();
    await expect(page.locator('.platform-admin-audit-list > li')).toHaveCount(0);
    await expect(page.getByText(/Die Signaturen des aktuellen Audit-Abschnitts/)).toHaveCount(0);
    await expect(page.getByRole('button',{ name: /100.*exportieren/ })).toHaveCount(0);
  });
}

for (const language of ['de','en']) test(`loaded audit filter discloses its scope and preserves technical detail in ${language}`,async({ page })=>{
  const { cursors,exports }=await setup(page,{ eventCount: 2 });
  await page.evaluate(async value=>{ const { setLanguage }=await import('/src/core/i18n.js');setLanguage(value); },language);
  const rows=page.locator('.platform-admin-audit-row');
  await expect(rows).toHaveCount(2);
  const search=page.locator('#platformAdminAuditLocalSearch');
  await expect(page.getByText(language==='de' ? /keine vollständige Serversuche/ : /not a complete server search/)).toBeVisible();
  const readsBefore=cursors.length;
  await search.fill('platform.operator.changed');
  await expect(page.locator('.platform-admin-audit-row:visible')).toHaveCount(1);
  await expect(page.locator('.platform-admin-audit-row:visible details')).not.toHaveAttribute('open','');
  await search.fill('no-matching-loaded-event');
  await expect(page.locator('.platform-admin-audit-row:visible')).toHaveCount(0);
  await search.fill('');await expect(page.locator('.platform-admin-audit-row:visible')).toHaveCount(2);
  const details=rows.last().locator('details');await details.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(details.locator('code')).toBeVisible();
  expect(cursors).toHaveLength(readsBefore);expect(exports).toHaveLength(0);
});
