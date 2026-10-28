import { expect,test } from '@playwright/test';
import { MICROSOFT_OPERATION_ID as ID,MICROSOFT_OPERATION_STATE as state,
  microsoftOperationChallenge } from '../support/platform-microsoft-operation-fixture.js';

const ORIGIN='https://127.0.0.1:4173';
const TENANT='22222222-2222-4222-8222-222222222222';
const BASE='/api/v1/platform/auth/microsoft/operation';
const permissions=['platform:tenant:read','platform:readiness:read','platform:integration-health:read',
  'platform:diagnostics:read','platform:entitlement:read','platform:metering:read','platform:runtime:read',
  'platform:invitation:manage','platform:lifecycle:manage','platform:entitlement:manage','platform:quota:manage'];
async function setup(page,context) {
  const writes=[],callbacks=[];let status='active',revision=3,sessionReads=0,verified=false,statusReads=0;
  const reset=await context.request.post(ORIGIN+'/__cm-ms-cookie-evidence/reset',{ headers: { Origin: ORIGIN } });
  expect(reset.status()).toBe(200);
  await context.addCookies([{ name: 'cm_platform_session',value: 'synthetic-normal-session',
    domain: '127.0.0.1',path: '/api/v1/platform',secure: true,httpOnly: true,sameSite: 'Strict' }]);
  await context.route('https://login.microsoftonline.com/**',async route=>{
    const url=new URL(route.request().url());expect(url.searchParams.get('state')).toBe(state);
    const callback=ORIGIN+BASE+'/callback?state='+state+'&code=synthetic-provider-code';
    await route.fulfill({ status: 200,contentType: 'text/html',headers: {
      'Cross-Origin-Opener-Policy': 'same-origin','Referrer-Policy': 'no-referrer','Cache-Control': 'no-store',
    },body: '<!doctype html><html lang="en"><title>Isolated provider fixture</title><main>'
      +'<a href="'+callback+'">Confirm synthetic Microsoft fixture</a></main></html>' });
  });
  await context.route(`${ORIGIN}/**`,async route=>{
    const request=route.request(),url=new URL(request.url());let body,code=200;const headers={};
    if (!url.pathname.startsWith('/api/')) {
      const upstream=await route.fetch({ url: `https://127.0.0.1:4173${url.pathname}${url.search}` });
      await route.fulfill({ response: upstream });return;
    }
    if (url.pathname===BASE+'/callback') {
      callbacks.push(await request.allHeaders());verified=true;
      // WebKit cannot fulfill redirects; the actual loopback TLS fixture owns303.
      await route.continue();return;
    }
    if (url.pathname===BASE+'/complete') {
      await route.fulfill({ status: 200,contentType: 'text/html',headers: { 'Cross-Origin-Opener-Policy': 'same-origin' },
        body: '<!doctype html><html lang="en"><title>Return to application</title><main>Return to the application.</main></html>' });return;
    }
    if (url.pathname==='/api/v1/platform/session') {
      sessionReads++;body={ operatorId: ID,roles: ['platform_tenant_operator'],permissions,
        assurance: { level: 'mfa',authenticatedAt: '2099-01-01T00:00:00.000Z' },expiresAt: '2099-01-01T04:00:00.000Z',
        stepUpExpiresAt: null,csrfToken: (sessionReads>1 ? 'N' : 'C').repeat(43) };
    } else if (url.pathname==='/api/v1/platform/auth/passkey/configuration') {
      code=404;body={ error: { code: 'PLATFORM_NOT_FOUND' } };
    } else if (url.pathname===BASE+'/configuration') {
      body={ mode: 'microsoft_mfa',environment: 'int' };
    } else if (url.pathname===BASE+'/status') {
      statusReads++;expect(request.method()).toBe('POST');expect(request.postDataJSON()).toEqual({ state });
      expect(request.headers()['x-csrf-token']).toBe('C'.repeat(43));
      body={ status: verified ? 'verified' : 'pending',requestId: ID };
    } else if (url.pathname==='/api/v1/platform/tenants' && request.method()==='GET') {
      body={ schemaVersion: 1,snapshotAt: '2026-10-24T12:00:00.000Z',items: [{ tenantId: TENANT,
        displayName: 'Synthetic customer',lifecycle: { status,revision },onboardingState: 'complete',identityState: 'active',
        invitation: { id: null,state: 'none',revision: null,expiresAt: null },updatedAt: '2026-10-24T12:00:00.000Z' }],nextCursor: null };
    } else if (url.pathname===`/api/v1/platform/tenants/${TENANT}/lifecycle/transitions`) {
      const requestHeaders=await request.allHeaders();writes.push({ headers: requestHeaders,body: request.postDataJSON(),url: request.url() });
      if (!requestHeaders['x-platform-microsoft-proof']) {
        code=428;body=microsoftOperationChallenge(ORIGIN);
        await context.addCookies([{ name: 'cm_platform_ms_operation',value: `${state}.${state}`,
          domain: '127.0.0.1',path: '/api/v1/platform',secure: true,httpOnly: true,sameSite: 'Strict' }]);
        headers['Set-Cookie']=`cm_platform_ms_operation_tx=${state}.${state}; Path=${BASE}/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=120`;
      } else {
        expect(verified).toBe(true);expect(requestHeaders['x-platform-microsoft-proof']).toBe(state);
        // Observe native cookie transfer at the real receiving TLS server.
        // WebKit's interception metadata may omit a Cookie header entirely.
        status='suspended';revision++;
        await route.continue();return;
      }
    } else { code=404;body={ error: { code: 'PLATFORM_NOT_FOUND' } }; }
    await route.fulfill({ status: code,contentType: 'application/json',headers,body: JSON.stringify(body) });
  });
  await page.goto(`${ORIGIN}/platform-admin/`);
  await page.locator(`[data-platform-admin-tenant="${TENANT}"]`).click();
  await page.locator('[data-platform-admin-navigate="lifecycle"]').click();
  return { writes,callbacks,statusReads: ()=>statusReads,sessionReads: ()=>sessionReads,
    receiverEvidence: async()=>{ const result=await context.request.get(ORIGIN+'/__cm-ms-cookie-evidence');
      expect(result.status()).toBe(200);return result.json(); } };
}
async function requestAction(page) {
  await page.locator('[data-platform-action="suspend"]').click();
  await page.getByRole('dialog').getByRole('textbox',{ name: /^Betriebliche Begründung/ }).fill('Synthetic Microsoft operation approval');
  await page.locator('[data-platform-admin-confirm-action="suspend"]').click();
}
test('Microsoft confirmation survives different-site COOP isolation and executes only the original exact request',async({ page,context })=>{
  const f=await setup(page,context);await requestAction(page);
  const dialog=page.locator('dialog[aria-labelledby="platformMicrosoftOperationTitle"]');
  await expect(dialog).toBeVisible();await expect(dialog).toHaveAccessibleName('Aktion mit Microsoft bestätigen');
  const link=dialog.getByRole('link',{ name: 'Mit Microsoft anmelden' });
  await expect(link).toBeFocused();await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel',/noopener/);
  const summary=dialog.locator('[data-microsoft-operation-context]');
  await expect(summary.locator('dd')).toHaveText(['Kunden sperren','Synthetic customer']);
  await expect(dialog).toContainText('aus Sicherheitsgründen');
  await expect(dialog).toContainText('nur bei gültigem Nachweis');
  await page.evaluate(async()=>{ const { setLanguage }=await import('/src/core/i18n.js');setLanguage('en'); });
  await expect(dialog).toHaveAccessibleName('Confirm action with Microsoft');
  await expect(summary.locator('dd')).toHaveText(['Suspend customer','Synthetic customer']);
  await expect(dialog).toContainText('only if the proof and your authorization remain valid');
  for (const width of [320,1280]) {
    await page.setViewportSize({ width,height: 900 });
    expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  await page.evaluate(async()=>{ const { setLanguage }=await import('/src/core/i18n.js');setLanguage('de'); });
  await expect(dialog).toHaveAccessibleName('Aktion mit Microsoft bestätigen');
  await expect(link).toBeFocused();
  const opened=context.waitForEvent('page');await link.press('Enter');const provider=await opened;
  await provider.waitForLoadState();expect(await provider.evaluate(()=>window.opener===null)).toBe(true);
  await provider.getByRole('link',{ name: 'Confirm synthetic Microsoft fixture' }).click();
  await expect(provider).toHaveURL(ORIGIN+BASE+'/complete');
  await expect(page.locator('[data-platform-action="reactivate"]')).toBeVisible();
  // Read closed counters directly from the actual TLS receiver, independently
  // of WebKit's incomplete intercepted request/redirect-response metadata.
  expect(await f.receiverEvidence()).toEqual({ schemaVersion: 1,callbackAccepted: 1,callbackRejected: 0,
    operationAccepted: 1,operationRejected: 0 });
  expect(f.writes).toHaveLength(2);expect(f.writes[0].url).toBe(f.writes[1].url);expect(f.writes[0].body).toEqual(f.writes[1].body);
  expect(f.writes[0].headers['idempotency-key']).toBe(f.writes[1].headers['idempotency-key']);
  expect(f.writes[1].headers['x-platform-passkey-proof']).toBeUndefined();expect(f.sessionReads()).toBe(2);
  expect(f.callbacks).toHaveLength(1);
  expect(f.statusReads()).toBeGreaterThan(0);
  expect(await page.evaluate(()=>JSON.stringify(localStorage)+JSON.stringify(sessionStorage))).not.toContain(state);await provider.close();
});
test('Microsoft confirmation reflows, translates while open and cancels by Escape without executing',async({ page,context })=>{
  const f=await setup(page,context);await page.setViewportSize({ width: 375,height: 812 });await requestAction(page);
  await expect(page.getByRole('dialog',{ name: 'Aktion mit Microsoft bestätigen' })).toBeVisible();
  await page.evaluate(async()=>{ const { setLanguage }=await import('/src/core/i18n.js');setLanguage('en'); });
  const dialog=page.getByRole('dialog',{ name: 'Confirm action with Microsoft' });await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link',{ name: 'Sign in with Microsoft' })).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await dialog.press('Escape');await expect(dialog).toHaveCount(0);
  expect(f.writes).toHaveLength(1);expect(f.callbacks).toHaveLength(0);expect(f.statusReads()).toBe(0);
  expect(f.sessionReads()).toBe(1);await expect(page.locator('[data-platform-action="reactivate"]')).toHaveCount(0);
});
