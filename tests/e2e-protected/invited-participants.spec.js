import { test,expect } from '@playwright/test';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildProtectedFrontendArtifacts } from '../../scripts/protected-frontend-artifacts.mjs';
import { createQualifiedProtectedEdge } from './support/qualified-edge.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));

test('actual invited participants use Microsoft-approved Platform invitations and role-owned three-customer browser workflows',
async({ browser,browserName })=>{
  const apiRoot=process.env.CM_PROTECTED_API_ROOT,certificateDirectory=process.env.CM_PROTECTED_CERTIFICATE_DIRECTORY;
  const apiCommit=process.env.CM_PROTECTED_API_COMMIT,frontendCommit=process.env.CM_PROTECTED_FRONTEND_COMMIT;
  if (!apiRoot || !certificateDirectory || ![apiCommit,frontendCommit].every(value=>/^[a-f0-9]{40}$/.test(value ?? ''))) {
    throw new Error('PARTICIPANT_BROWSER_RUNNER_REQUIRED');
  }
  const { createProtectedOwnerBrowserRuntimeFixture }=await import(pathToFileURL(
    `${apiRoot}/tests-db/support/protected-owner-browser-runtime-fixture.js`));
  let runtime,edge,context,written=false,failed=false;
  try {
    const origins={ customer: 'https://app-int.example.test',platform: 'https://ops-int.example.com' };
    const built=await buildProtectedFrontendArtifacts({ root: ROOT,apiCommit,frontendCommit,environment: 'int',
      customerOrigin: origins.customer,platformOrigin: origins.platform,syntheticEnabled: true,
      microsoftEnabled: true,invitationsEnabled: true,ownerAccessEnabled: true });
    const { stdout }=await promisify(execFile)(process.execPath,['scripts/build-protected-frontend.mjs',`${apiRoot}/.protected-frontend`],{
      cwd: ROOT,env: { ...process.env,PROTECTED_API_COMMIT: apiCommit,PROTECTED_FRONTEND_COMMIT: frontendCommit,
        PROTECTED_ENVIRONMENT: 'int',PROTECTED_CUSTOMER_ORIGIN: origins.customer,PROTECTED_PLATFORM_ORIGIN: origins.platform,
        PROTECTED_SYNTHETIC_ENABLED: 'true',PROTECTED_PRESENTATION_MICROSOFT_ENABLED: 'true',
        PROTECTED_PRESENTATION_INVITATIONS_ENABLED: 'true',PROTECTED_OWNER_CUSTOMER_ACCESS_ENABLED: 'true' },
      timeout: 30000,maxBuffer: 65536 });written=true;
    expect(JSON.parse(stdout)).toEqual({ apiCommit,frontendCommit,manifestSha256: built.manifestDigests });
    runtime=await createProtectedOwnerBrowserRuntimeFixture({ apiCommit,frontendCommit,hostedFrontend: built.manifestDigests,participants: true });
    edge=await createQualifiedProtectedEdge({ root: ROOT,ports: runtime.ports,certificateDirectory,
      artifactDigests: built.digests,isolatedMicrosoft: true });
    context=await browser.newContext({ proxy: { server: edge.proxy },ignoreHTTPSErrors: false,
      viewport: browserName==='webkit' ? { width: 390,height: 844 } : { width: 1280,height: 900 } });
    const parts=runtime.initialSetCookie.split(';').map(part=>part.trim()),pair=parts[0],split=pair.indexOf('=');
    if (split<1 || !parts.includes('Path=/api/v1/platform') || !parts.includes('SameSite=Strict')
      || parts.some(part=>part.startsWith('Domain='))) throw new Error('PARTICIPANT_BROWSER_PLATFORM_COOKIE_INVALID');
    await context.addCookies([{ name: pair.slice(0,split),value: pair.slice(split+1),domain: new URL(origins.platform).hostname,
      path: '/api/v1/platform',secure: true,httpOnly: true,sameSite: 'Strict' }]);
    await context.addInitScript(()=>{ Object.defineProperty(navigator,'credentials',{ configurable: true,value: {
      get() { throw new Error('PARTICIPANT_APPLICATION_PASSKEY_FORBIDDEN'); },
      create() { throw new Error('PARTICIPANT_APPLICATION_ENROLLMENT_FORBIDDEN'); },
    } }); });
    const page=await context.newPage(),errors=[],identities=[];page.on('pageerror',error=>errors.push(error.name));
    async function approveMicrosoft() {
      const approval=page.getByRole('dialog',{ name: 'Aktion mit Microsoft bestätigen',exact: true });
      await expect(approval).toBeVisible();const element=await approval.elementHandle();
      const opened=context.waitForEvent('page');
      await approval.getByRole('link',{ name: 'Mit Microsoft anmelden',exact: true }).press('Enter');
      const provider=await opened;expect(await provider.evaluate(()=>opener===null)).toBe(true);
      await provider.getByRole('link',{ name: 'Confirm isolated Microsoft fixture',exact: true }).click();
      await element.waitForElementState('hidden',{ timeout: 15000 });
    }
    await page.goto(origins.platform+'/platform-admin/');
    await page.getByRole('button',{ name: 'Eigene Testmandanten',exact: true }).click();
    await page.getByRole('button',{ name: 'Testmandanten anlegen',exact: true }).click();
    await page.getByRole('button',{ name: 'Anlegen bestätigen',exact: true }).click();await approveMicrosoft();
    await expect(page.getByRole('button',{ name: 'Fabrikam verwalten',exact: true })).toBeVisible();
    const participants=[{ slot: 'northwind',name: 'Northwind',role: null },
      { slot: 'contoso',name: 'Contoso',role: 'Conference Manager' },{ slot: 'fabrikam',name: 'Fabrikam',role: 'Tenant Operator' }];
    for (const [index,person] of participants.entries()) {
      if (index) await page.getByRole('button',{ name: 'Eigene Testmandanten',exact: true }).click();
      await page.getByRole('button',{ name: `${person.name} verwalten`,exact: true }).click();
      await page.locator('[data-platform-admin-navigate="lifecycle"]').click();
      const panel=page.locator('.platform-admin-invitations');await expect(panel).toBeVisible();
      await panel.getByRole('button',{ name: 'Aktuellen Stand laden',exact: true }).click();await approveMicrosoft();
      await expect(panel.getByRole('button',{ name: 'Person hinzufügen',exact: true })).toBeEnabled();
      await panel.getByRole('button',{ name: 'Person hinzufügen',exact: true }).click();
      const entry=panel.getByRole('group',{ name: 'Person 1',exact: true });
      await entry.getByRole('textbox',{ name: 'E-Mail-Adresse *',exact: true }).fill(`${person.slot}@example.test`);
      if (person.role) await entry.getByRole('checkbox',{ name: person.role,exact: true }).check();
      await panel.getByRole('textbox',{ name: 'Betriebliche Begründung *',exact: true }).fill('Isolated explicit participant acceptance');
      await panel.getByRole('button',{ name: 'Einladungen vormerken',exact: true }).click();await approveMicrosoft();
      // The controller independently refreshes the committed list with its own
      // exact read proof. Neither approval nor the mutation is replayed.
      await approveMicrosoft();
      await expect(panel.getByRole('heading',{ name: `${person.slot}@example.test`,exact: true })).toBeVisible();
    }
    let northwindRequest=null;
    for (const person of participants) {
      await page.goto(origins.customer+'/');
      await page.getByRole('textbox',{ name: 'E-Mail-Adresse',exact: true }).fill(`${person.slot}@example.test`);
      await page.getByRole('button',{ name: 'Code anfordern',exact: true }).click();
      const codeInput=page.getByRole('textbox',{ name: 'Achtstelliger Code',exact: true });await expect(codeInput).toBeVisible();
      const code=await runtime.mailboxCode(`${person.slot}@example.test`);
      const wrong=(code[0]==='0' ? '1' : '0')+code.slice(1);
      await codeInput.fill(wrong);await page.getByRole('button',{ name: 'Code bestätigen',exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Die Anmeldung konnte nicht bestätigt werden.');
      await codeInput.fill(code);await page.getByRole('button',{ name: 'Code bestätigen',exact: true }).click();
      const organisation=page.getByRole('combobox',{ name: 'Organisation',exact: true });
      await expect(organisation.locator('option')).toHaveCount(2);await organisation.selectOption({ index: 1 });
      await page.getByRole('button',{ name: 'Organisation öffnen',exact: true }).click();
      await expect(page.locator('#primaryNavigation button[aria-haspopup="dialog"]')).toBeVisible();
      const current=await page.evaluate(async()=>{
        const response=await fetch('/api/v1/session'),value=await response.json();
        return { status: response.status,tenantId: value.tenant.id,userId: value.user.id,roles: value.roles };
      });expect(current.status).toBe(200);identities.push(current);
      expect(current.roles).toEqual(person.slot==='northwind' ? ['employee']
        : ['employee',person.slot==='contoso' ? 'conference_manager' : 'tenant_admin']);
      if (person.slot==='northwind') {
        await page.locator('[data-view="employee"]').click();
        const date=new Date(Date.now()+28*86400000);while ([0,6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate()+1);
        await page.locator('#productionTitle').fill('Invited participant browser booking');
        await page.locator('#productionDate').fill(date.toISOString().slice(0,10));
        await page.locator('#productionEndDate').fill(date.toISOString().slice(0,10));
        await page.locator('#productionStart').fill('09:00');await page.locator('#productionEnd').fill('10:00');
        await page.locator('#productionInternal').fill('1');await page.locator('#productionExternal').fill('0');
        const next=page.getByRole('button',{ name: 'Weiter',exact: true });await next.click();
        await expect(page.locator('input[name="productionRoomChoice"]')).toHaveCount(10);
        await page.locator('input[name="productionRoomChoice"]').first().check();
        await page.getByRole('button',{ name: 'Raumverfügbarkeit prüfen',exact: true }).click();
        await expect(next).toBeEnabled();await next.click();await next.click();
        await page.getByRole('radio',{ name: 'Kein Catering-Paket',exact: true }).check();await next.click();
        await page.getByRole('button',{ name: 'Kostenstelle hinzufügen',exact: true }).click();
        const allocation=page.locator('#productionAllocationCenter-0');
        await expect(allocation.locator('option')).toHaveCount(7);await allocation.selectOption({ index: 1 });
        await page.locator('#productionAllocationPercent-0').fill('100');await next.click();
        const submitted=page.waitForResponse(response=>response.request().method()==='POST'
          && new URL(response.url()).pathname==='/api/v1/application/requests');
        await page.getByRole('button',{ name: 'Anfrage absenden',exact: true }).click();expect((await submitted).status()).toBe(201);
        const card=page.locator('[data-production-request-id]').filter({ hasText: 'Invited participant browser booking' });
        await expect(card).toHaveCount(1);northwindRequest=await card.getAttribute('data-production-request-id');
        const persisted=await page.evaluate(async id=>{
          const response=await fetch(`/api/v1/requests/${id}`),value=await response.json();
          return { status: response.status,title: value.request.details.title };
        },northwindRequest);
        expect(persisted).toEqual({ status: 200,title: 'Invited participant browser booking' });
      } else if (person.slot==='contoso') {
        expect(await page.evaluate(async id=>(await fetch(`/api/v1/requests/${id}`)).status,northwindRequest)).toBe(404);
        await page.locator('[data-view="manager"]').click();
        await page.getByRole('tab',{ name: 'Anfragen & Buchungen',exact: true }).click();
        const cards=page.locator('[data-production-request-id]');await expect(cards).toHaveCount(3);
        const card=cards.first(),id=await card.getAttribute('data-production-request-id');
        await card.getByRole('button',{ name: 'Bestätigen',exact: true }).click();
        const completed=page.waitForResponse(response=>response.request().method()==='POST'
          && new URL(response.url()).pathname===`/api/v1/requests/${id}/transitions`);
        await page.getByRole('dialog').getByRole('button',{ name: 'Bestätigen',exact: true }).click();
        expect((await completed).status()).toBe(200);await expect(card).toContainText('Bestätigt');
        const persisted=await page.evaluate(async requestId=>{
          const response=await fetch(`/api/v1/requests/${requestId}`),value=await response.json();
          return { status: response.status,requestStatus: value.request.status };
        },id);expect(persisted).toEqual({ status: 200,requestStatus: 'Confirmed' });
      } else {
        await page.locator('[data-view="tenantAdmin"]').click();
        await page.getByRole('button',{ name: 'Kalender und Onboarding',exact: true }).click();
        const group=page.getByRole('group',{ name: 'Räume für den Import auswählen' });
        await expect(group.getByRole('checkbox')).toHaveCount(2);
        await group.getByRole('checkbox').nth(0).check();await group.getByRole('checkbox').nth(1).check();
        await page.getByRole('button',{ name: 'Ausgewählte Räume importieren',exact: true }).click();
        await page.getByRole('button',{ name: 'Einrichtung abschließen',exact: true }).click();
        await page.getByRole('button',{ name: 'Testmandanten aktivieren',exact: true }).click();
        await expect(page.getByRole('link',{ name: 'Anwendung öffnen',exact: true })).toBeVisible();
        await expect(page.getByRole('button',{ name: 'Microsoft 365',exact: true })).toHaveCount(0);
        const active=await page.evaluate(async()=>{
          const response=await fetch('/api/v1/session'),value=await response.json();
          return { status: response.status,tenantStatus: value.tenant.status };
        });expect(active).toEqual({ status: 200,tenantStatus: 'active' });
      }
      expect(await page.evaluate(()=>!/(?:csrfToken|browserToken|access_token|refresh_token|approval_proof)/i
        .test(JSON.stringify({ local: Object.entries(localStorage),session: Object.entries(sessionStorage) })))).toBe(true);
      await page.locator('#primaryNavigation button[aria-haspopup="dialog"]').click();
      await page.getByRole('dialog').getByRole('button',{ name: 'Logout',exact: true }).click();
      await expect(page.getByRole('textbox',{ name: 'E-Mail-Adresse',exact: true })).toBeVisible();
    }
    expect(new Set(identities.map(row=>row.tenantId)).size).toBe(3);expect(new Set(identities.map(row=>row.userId)).size).toBe(3);
    const evidence=await runtime.evidence();expect(evidence.application_keys).toBe(0);
    expect(evidence.participants).toEqual({ registered: 3,accepted: 3 });expect(edge.evidence().deniedConnects).toBe(0);
    expect(errors).toEqual([]);
    console.log('PARTICIPANT_BROWSER_ACCEPTANCE '+JSON.stringify({ browser: browserName,apiCommit,frontendCommit,
      invited: 3,accepted: 3,employeeBooking: true,managerDecision: true,onboardingActive: true,
      crossTenantDenied: true,auditsVerified: true,provider: 'isolated-msal-and-local-calendar',actualMail: false }));
  } catch (error) { failed=true;throw error; }
  finally {
    let cleanupFailed=false;
    for (const cleanup of [()=>context?.close(),()=>edge?.close(),()=>runtime?.close(),
      ()=>written ? rm(`${apiRoot}/.protected-frontend`,{ recursive: true,force: true }) : undefined]) {
      try { await cleanup(); } catch { cleanupFailed=true; }
    }
    if (cleanupFailed) { if (!failed) throw new Error('PARTICIPANT_BROWSER_CLEANUP_FAILED');console.error('PARTICIPANT_BROWSER_CLEANUP_FAILED'); }
  }
});
