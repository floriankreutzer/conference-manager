import { test,expect } from '@playwright/test';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { buildProtectedFrontendArtifacts } from '../../scripts/protected-frontend-artifacts.mjs';
import { createQualifiedProtectedEdge } from './support/qualified-edge.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));

for (const journey of ['booking-decision','onboarding']) test(`actual invited participants use Microsoft-approved invitations for ${journey}`,
async({ browser,browserName })=>{
  const apiRoot=process.env.CM_PROTECTED_API_ROOT,certificateDirectory=process.env.CM_PROTECTED_CERTIFICATE_DIRECTORY;
  const apiCommit=process.env.CM_PROTECTED_API_COMMIT,frontendCommit=process.env.CM_PROTECTED_FRONTEND_COMMIT;
  if (!apiRoot || !certificateDirectory || ![apiCommit,frontendCommit].every(value=>/^[a-f0-9]{40}$/.test(value ?? ''))) {
    throw new Error('PARTICIPANT_BROWSER_RUNNER_REQUIRED');
  }
  const { createProtectedOwnerBrowserRuntimeFixture }=await import(pathToFileURL(
    `${apiRoot}/tests-db/support/protected-owner-browser-runtime-fixture.js`));
  let runtime,edge,context,page,written=false,failed=false,phase='setup',proofCapacityWaits=0,logoutOutcome=null;
  function checkpoint(value) { phase=value;console.log('PARTICIPANT_BROWSER_STAGE '+value); }
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
    await expect(runtime.waitForMicrosoftOperationCapacity(3)).rejects.toThrow('PARTICIPANT_BROWSER_PROOF_CAPACITY_INVALID');
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
    page=await context.newPage();const errors=[],identities=[];let delegatedContosoUser=null;page.on('pageerror',error=>errors.push(error.name));
    async function approveMicrosoft({ returnToCustomer=false }={}) {
      const approval=page.getByRole('dialog',{ name: 'Aktion mit Microsoft bestätigen',exact: true });
      await expect(approval).toBeVisible();const element=await approval.elementHandle();
      const opened=context.waitForEvent('page');
      await approval.getByRole('link',{ name: 'Mit Microsoft anmelden',exact: true }).press('Enter');
      const provider=await opened;expect(await provider.evaluate(()=>opener===null)).toBe(true);
      const confirm=()=>provider.getByRole('link',{ name: 'Confirm isolated Microsoft fixture',exact: true }).click();
      if (returnToCustomer) {
        await Promise.all([page.waitForURL(url=>url.origin===origins.customer && url.pathname==='/',{ timeout: 15000 }),confirm()]);
      } else await confirm();
      expect(await provider.evaluate(()=>location.origin+location.pathname))
        .toBe(origins.platform+'/api/v1/platform/auth/microsoft/operation/complete');
      await provider.close();await page.bringToFront();
      if (!returnToCustomer) await element.waitForElementState('hidden',{ timeout: 15000 });
    }
    checkpoint('generation');
    await page.goto(origins.platform+'/platform-admin/');
    await page.getByRole('button',{ name: 'Eigene Testmandanten',exact: true }).click();
    await page.getByRole('button',{ name: 'Testmandanten anlegen',exact: true }).click();
    await page.getByRole('button',{ name: 'Anlegen bestätigen',exact: true }).click();await approveMicrosoft();
    await expect(page.getByRole('button',{ name: 'Fabrikam verwalten',exact: true })).toBeVisible();
    const workspace=page.getByRole('dialog',{ name: 'Eigene Testmandanten',exact: true });
    for (const state of ['Northwind: Aktiv.','Contoso: Bereit.','Fabrikam: Onboarding.']) {
      await expect(workspace.getByText(state,{ exact: true })).toBeVisible();
    }
    async function activateContoso() {
      // Contoso starts ready. Its Manager cannot activate it or inherit Admin.
      // The operator performs that existing prerequisite through actual Admin custody.
      checkpoint('contoso-owner-activation');
      await page.goto(origins.customer+'/');
      await page.getByRole('button',{ name: 'Als Plattform-Operator testen',exact: true }).click();
      const tenant=page.getByRole('combobox',{ name: 'Testmandant',exact: true });await expect(tenant).toBeVisible();
      await tenant.selectOption('contoso');
      await page.getByRole('combobox',{ name: 'Kundenrolle',exact: true }).selectOption('tenant_admin');
      const capacity=await runtime.waitForMicrosoftOperationCapacity(1);if (capacity.waitedMs) proofCapacityWaits++;
      await page.getByRole('button',{ name: 'Browserwechsel freigeben',exact: true }).click();
      await approveMicrosoft({ returnToCustomer: true });
      const enter=page.getByRole('button',{ name: 'Testzugang öffnen',exact: true });await expect(enter).toBeVisible();await enter.click();
      await expect(page.locator('#primaryNavigation button[aria-haspopup="dialog"]')).toBeVisible();
      const before=await page.evaluate(async()=>{
        const response=await fetch('/api/v1/session'),value=await response.json();
        return { status: response.status,tenantStatus: value.tenant.status,roles: value.roles,userId: value.user.id };
      });expect(before.status).toBe(200);expect(before.tenantStatus).toBe('ready');
      expect(before.roles).toEqual(['employee','tenant_admin']);delegatedContosoUser=before.userId;
      await page.getByRole('button',{ name: 'Kalender und Onboarding',exact: true }).click();
      await page.getByRole('button',{ name: 'Testmandanten aktivieren',exact: true }).click();
      await page.getByRole('link',{ name: 'Anwendung öffnen',exact: true }).click();
      const profile=page.locator('#primaryNavigation button[aria-haspopup="dialog"]');await expect(profile).toBeVisible();
      await profile.click();await page.getByRole('dialog').getByRole('button',{ name: 'Logout',exact: true }).click();
      await expect(page.getByRole('textbox',{ name: 'E-Mail-Adresse',exact: true })).toBeVisible();
      await page.goto(origins.platform+'/platform-admin/');
      await page.getByRole('button',{ name: 'Eigene Testmandanten',exact: true }).click();
      await expect(page.getByRole('button',{ name: 'Contoso verwalten',exact: true })).toBeVisible();
    }
    const participants=journey==='booking-decision' ? [{ slot: 'northwind',name: 'Northwind',role: null },
      { slot: 'contoso',name: 'Contoso',role: 'Conference Manager' }]
      : [{ slot: 'fabrikam',name: 'Fabrikam',role: 'Tenant Operator' }];
    async function invite(person,index) {
      checkpoint(`invitation-navigation-${person.slot}`);
      if (index) await page.getByRole('button',{ name: 'Eigene Testmandanten',exact: true }).click();
      await page.getByRole('button',{ name: `${person.name} verwalten`,exact: true }).click();
      const lifecycle=page.locator('[data-platform-admin-navigate="lifecycle"]');
      await expect(lifecycle).toBeVisible();await lifecycle.click();
      const panel=page.locator('.platform-admin-invitations');await expect(panel).toBeVisible();
      checkpoint(`invitation-read-${person.slot}`);
      const readCapacity=await runtime.waitForMicrosoftOperationCapacity(1);
      if (readCapacity.waitedMs) proofCapacityWaits++;
      checkpoint(`invitation-read-ready-${person.slot}`);
      const reload=panel.getByRole('button',{ name: 'Aktuellen Stand laden',exact: true });
      await expect(reload).toBeEnabled();await reload.click();
      checkpoint(`invitation-read-proof-${person.slot}`);await approveMicrosoft();
      await expect(panel.getByRole('button',{ name: 'Person hinzufügen',exact: true })).toBeEnabled();
      await panel.getByRole('button',{ name: 'Person hinzufügen',exact: true }).click();
      const entry=panel.getByRole('group',{ name: 'Person 1',exact: true });
      await entry.getByRole('textbox',{ name: 'E-Mail-Adresse *',exact: true }).fill(`${person.slot}@example.test`);
      if (person.role) await entry.getByRole('checkbox',{ name: person.role,exact: true }).check();
      await panel.getByRole('textbox',{ name: 'Betriebliche Begründung *',exact: true }).fill('Isolated explicit participant acceptance');
      checkpoint(`invitation-issue-${person.slot}`);
      // Reserve both the mutation and its independent automatic list-read proof.
      const issueCapacity=await runtime.waitForMicrosoftOperationCapacity(2);
      if (issueCapacity.waitedMs) proofCapacityWaits++;
      checkpoint(`invitation-issue-ready-${person.slot}`);
      const issue=panel.getByRole('button',{ name: 'Einladungen vormerken',exact: true });
      await expect(issue).toBeEnabled();await issue.click();
      checkpoint(`invitation-issue-proof-${person.slot}`);await approveMicrosoft();
      // The controller independently refreshes the committed list with its own
      // exact read proof. Neither approval nor the mutation is replayed.
      checkpoint(`invitation-list-proof-${person.slot}`);await approveMicrosoft();
      await expect(panel.getByRole('heading',{ name: `${person.slot}@example.test`,exact: true })).toBeVisible();
    }
    let northwindRequest=null,lastCustomerUse=null,customerAddressWaitMs=0;
    for (const [index,person] of participants.entries()) {
      await invite(person,index);
      if (lastCustomerUse!==null) {
        const remaining=Math.max(0,60000-Math.max(0,Date.now()-lastCustomerUse));
        if (remaining) { checkpoint('customer-address-window');await delay(remaining);customerAddressWaitMs+=remaining; }
      }
      if (person.slot==='contoso') {
        await activateContoso();edge.compactStaticEvidence();
      } else if (person.slot==='fabrikam') edge.compactStaticEvidence();
      checkpoint(`customer-code-${person.slot}`);
      await page.goto(origins.customer+'/');
      await page.getByRole('textbox',{ name: 'E-Mail-Adresse',exact: true }).fill(`${person.slot}@example.test`);
      await page.getByRole('button',{ name: 'Code anfordern',exact: true }).click();
      const codeInput=page.getByRole('textbox',{ name: 'Achtstelliger Code',exact: true });await expect(codeInput).toBeVisible();
      checkpoint(`mailbox-read-${person.slot}`);
      const code=await runtime.mailboxCode(`${person.slot}@example.test`);
      const wrong=(code[0]==='0' ? '1' : '0')+code.slice(1);
      await codeInput.fill(wrong);await page.getByRole('button',{ name: 'Code bestätigen',exact: true }).click();
      await expect(page.locator('#customerAuthError')).toContainText('Die Anmeldung konnte nicht bestätigt werden.');
      await codeInput.fill(code);await page.getByRole('button',{ name: 'Code bestätigen',exact: true }).click();
      checkpoint(`customer-selection-${person.slot}`);
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
      checkpoint(`customer-workflow-${person.slot}`);
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
        expect(current.userId).not.toBe(delegatedContosoUser);
        checkpoint('customer-manager-foreign-read');
        expect(await page.evaluate(async id=>(await fetch(`/api/v1/requests/${id}`)).status,northwindRequest)).toBe(404);
        checkpoint('customer-manager-navigation');
        const navigation=page.locator('[data-view="manager"]');await expect(navigation).toBeVisible();await navigation.click();
        checkpoint('customer-manager-projection');
        const bookings=page.getByRole('tab',{ name: 'Anfragen & Buchungen',exact: true });
        await expect(bookings).toBeVisible();await bookings.click();
        const cards=page.locator('[data-production-request-id]');await expect(cards).toHaveCount(3);
        const card=cards.first(),id=await card.getAttribute('data-production-request-id');
        checkpoint('customer-manager-review');
        const review=card.getByRole('button',{ name: 'Bestätigen',exact: true });await expect(review).toBeEnabled();await review.click();
        checkpoint('customer-manager-confirm');
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
      checkpoint(`customer-logout-${person.slot}`);logoutOutcome=null;
      await page.locator('#primaryNavigation button[aria-haspopup="dialog"]').click();
      const revoked=page.waitForResponse(response=>response.request().method()==='DELETE'
        && response.url()===origins.customer+'/api/v1/session');
      const returned=page.waitForEvent('domcontentloaded',{ timeout: 15000 });
      await Promise.all([returned,revoked.then(response=>{
        logoutOutcome={ revoked: response.status() };expect(logoutOutcome.revoked).toBe(204);
      }),page.getByRole('dialog').getByRole('button',{ name: 'Logout',exact: true }).click()]);
      logoutOutcome.session=await page.evaluate(async()=>(await fetch('/api/v1/session',{ cache: 'no-store' })).status);
      expect(logoutOutcome.session).toBe(401);
      await expect(page.getByRole('textbox',{ name: 'E-Mail-Adresse',exact: true })).toBeVisible();
      if (person.slot==='northwind') {
        // Retain API/auth/document/failure/open evidence; compact only successful
        // immutable assets after the complete Customer phase, at most twice.
        edge.compactStaticEvidence();
        // The next invitation uses the real Microsoft capacity interval while
        // this shared client address is quiet. Wait any remainder before admission.
        lastCustomerUse=Date.now();await page.goto(origins.platform+'/platform-admin/');
      }
    }
    if (journey==='booking-decision') expect(proofCapacityWaits).toBeGreaterThan(0);else expect(proofCapacityWaits).toBe(0);
    expect(new Set(identities.map(row=>row.tenantId)).size).toBe(participants.length);
    expect(new Set(identities.map(row=>row.userId)).size).toBe(participants.length);
    checkpoint('evidence');
    const traffic=edge.evidence();expect(traffic.staticCompactions).toBe(participants.length);
    expect(traffic.completedStatic.platform).toBeGreaterThan(0);
    if (journey==='booking-decision') expect(traffic.completedStatic.customer).toBeGreaterThan(0);
    expect(traffic.requests.length).toBeLessThan(2000);
    const evidence=await runtime.evidence();expect(evidence.application_keys).toBe(0);
    expect(evidence.participants).toEqual({ registered: participants.length,accepted: participants.length });expect(edge.evidence().deniedConnects).toBe(0);
    expect(errors).toEqual([]);
    console.log('PARTICIPANT_BROWSER_ACCEPTANCE '+JSON.stringify({ browser: browserName,apiCommit,frontendCommit,
      journey,invited: participants.length,accepted: participants.length,proofCapacityWaits,customerAddressWaitMs,
      edge: { requests: traffic.requests.length,staticCompactions: traffic.staticCompactions,completedStatic: traffic.completedStatic },
      employeeBooking: journey==='booking-decision',managerDecision: journey==='booking-decision',onboardingActive: journey==='onboarding',
      crossTenantDenied: journey==='booking-decision',auditsVerified: true,provider: 'isolated-msal-and-local-calendar',actualMail: false }));
  } catch (error) {
    failed=true;console.error('PARTICIPANT_BROWSER_FAILURE '+phase);
    if (edge) {
      const traffic=edge.evidence();
      const pendingOrFailed=traffic.requests.filter(event=>event.path.startsWith('/api/') && (event.status===null || event.status>=400));
      console.error('PARTICIPANT_BROWSER_TRAFFIC '+JSON.stringify({ requests: traffic.requests.length,
        staticCompactions: traffic.staticCompactions,pendingOrFailed: pendingOrFailed.slice(-8).map(event=>({
          route: event.path.includes('/microsoft/operation/') ? 'microsoft-operation'
            : event.path.includes('/invitations') ? 'invitations' : event.path.includes('/auth/email') ? 'customer-email'
            : event.path.endsWith('/catalog') ? 'catalog' : event.path.endsWith('/room-context') ? 'room-context'
            : event.path.includes('/booking-change') ? 'booking-change' : event.path.includes('/requests') ? 'requests' : 'other-api',
          method: event.method,status: event.status,errorCode: event.errorCode ?? null,
        })) }));
    }
    if (phase.startsWith('customer-logout-')) {
      try {
        const view=await page.evaluate(()=>({
          language: ['de','en'].includes(document.documentElement.lang) ? document.documentElement.lang : 'other',
          email: Boolean(document.querySelector('#customerAuthEmail')),code: Boolean(document.querySelector('#customerAuthCode')),
          choices: Boolean(document.querySelector('#customerAuthOrganisation')),
          authenticationError: Boolean(document.querySelector('#customerAuthError')),
          authenticated: Boolean(document.querySelector('#primaryNavigation button[aria-haspopup="dialog"]')),
        }));
        console.error('PARTICIPANT_BROWSER_LOGOUT '+JSON.stringify({ outcome: logoutOutcome,view,edge: { requests: edge.evidence().requests.length,
          staticCompactions: edge.evidence().staticCompactions,completedStatic: edge.evidence().completedStatic } }));
      } catch { console.error('PARTICIPANT_BROWSER_LOGOUT_VIEW_UNAVAILABLE'); }
    }
    throw error;
  }
  finally {
    let cleanupFailed=false;
    for (const [index,cleanup] of [()=>context?.close(),()=>edge?.close(),
      ()=>written ? rm(`${apiRoot}/.protected-frontend`,{ recursive: true,force: true }) : undefined,()=>runtime?.close()].entries()) {
      if (failed) console.error('PARTICIPANT_BROWSER_CLEANUP_BEGIN '+index);
      try { await cleanup(); } catch { cleanupFailed=true; }
      if (failed) console.error('PARTICIPANT_BROWSER_CLEANUP_END '+index);
    }
    if (cleanupFailed) { if (!failed) throw new Error('PARTICIPANT_BROWSER_CLEANUP_FAILED');console.error('PARTICIPANT_BROWSER_CLEANUP_FAILED'); }
  }
});
