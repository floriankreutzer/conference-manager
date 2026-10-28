import { test,expect } from '@playwright/test';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildProtectedFrontendArtifacts } from '../../scripts/protected-frontend-artifacts.mjs';
import { createQualifiedProtectedEdge } from './support/qualified-edge.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));

test('actual owner roots retain attributable identity across all roles with explicit Microsoft and account-switch browser custody',
async({ browser,browserName })=>{
  const apiRoot=process.env.CM_PROTECTED_API_ROOT,certificateDirectory=process.env.CM_PROTECTED_CERTIFICATE_DIRECTORY;
  const apiCommit=process.env.CM_PROTECTED_API_COMMIT,frontendCommit=process.env.CM_PROTECTED_FRONTEND_COMMIT;
  if (!apiRoot || !certificateDirectory || ![apiCommit,frontendCommit].every(value=>/^[a-f0-9]{40}$/.test(value ?? ''))) {
    throw new Error('OWNER_PROTECTED_BROWSER_RUNNER_REQUIRED');
  }
  const { createProtectedOwnerBrowserRuntimeFixture }=await import(pathToFileURL(
    `${apiRoot}/tests-db/support/protected-owner-browser-runtime-fixture.js`));
  let runtime,edge,context,written=false;
  try {
    const origins={ customer: 'https://app-int.example.test',platform: 'https://ops-int.example.com' };
    const built=await buildProtectedFrontendArtifacts({ root: ROOT,apiCommit,frontendCommit,environment: 'int',
      customerOrigin: origins.customer,platformOrigin: origins.platform,microsoftEnabled: true,ownerAccessEnabled: true });
    const { stdout }=await promisify(execFile)(process.execPath,['scripts/build-protected-frontend.mjs',`${apiRoot}/.protected-frontend`],{
      cwd: ROOT,env: { ...process.env,PROTECTED_API_COMMIT: apiCommit,PROTECTED_FRONTEND_COMMIT: frontendCommit,
        PROTECTED_ENVIRONMENT: 'int',PROTECTED_CUSTOMER_ORIGIN: origins.customer,PROTECTED_PLATFORM_ORIGIN: origins.platform,
        PROTECTED_SYNTHETIC_ENABLED: 'false',PROTECTED_PRESENTATION_MICROSOFT_ENABLED: 'true',
        PROTECTED_PRESENTATION_INVITATIONS_ENABLED: 'false',PROTECTED_OWNER_CUSTOMER_ACCESS_ENABLED: 'true' },
      timeout: 30000,maxBuffer: 65536 });written=true;
    expect(JSON.parse(stdout)).toEqual({ apiCommit,frontendCommit,manifestSha256: built.manifestDigests });
    runtime=await createProtectedOwnerBrowserRuntimeFixture({ apiCommit,frontendCommit,hostedFrontend: built.manifestDigests });
    edge=await createQualifiedProtectedEdge({ root: ROOT,ports: runtime.ports,certificateDirectory,artifactDigests: built.digests,isolatedMicrosoft: true });
    context=await browser.newContext({ proxy: { server: edge.proxy },ignoreHTTPSErrors: false,
      viewport: browserName==='webkit' ? { width: 390,height: 844 } : { width: 1280,height: 900 } });
    const parts=runtime.initialSetCookie.split(';').map(part=>part.trim()),pair=parts[0],split=pair.indexOf('=');
    const path=parts.find(part=>part.startsWith('Path='))?.slice(5);
    if (split<1 || path!=='/api/v1/platform' || !parts.includes('SameSite=Strict') || parts.some(part=>part.startsWith('Domain='))) {
      throw new Error('OWNER_BROWSER_INITIAL_COOKIE_INVALID');
    }
    await context.addCookies([{ name: pair.slice(0,split),value: pair.slice(split+1),domain: new URL(origins.platform).hostname,
      path,secure: true,httpOnly: true,sameSite: 'Strict' }]);
    // The closed TLS edge serves only the isolated external provider document.
    // All callbacks, status, approvals and admissions remain actual API roots.
    await context.addInitScript(()=>{ Object.defineProperty(navigator,'credentials',{ configurable: true,value: {
      get() { throw new Error('OWNER_APPLICATION_PASSKEY_FORBIDDEN'); },create() { throw new Error('OWNER_APPLICATION_PASSKEY_FORBIDDEN'); },
    } }); });
    const page=await context.newPage(),errors=[],users=[];page.on('pageerror',error=>errors.push(error.name));
    const roles=['employee','conference_manager','tenant_admin'];
    for (const [index,role] of roles.entries()) {
      await page.goto(origins.customer+'/?auth=owner_start');
      const begin=page.getByRole('button',{ name: /^(Über die Plattform fortfahren|Continue through the platform)$/ });
      await expect(begin).toBeVisible();const startsBefore=edge.evidence().requests.filter(event=>event.path==='/api/v1/auth/owner/start').length;
      expect(startsBefore).toBe(index);await begin.focus();await page.keyboard.press('Enter');
      const owner=page.getByRole('dialog',{ name: 'Kundenanwendung als Owner öffnen',exact: true });await expect(owner).toBeVisible();
      const target=owner.getByRole('combobox',{ name: 'Kunde',exact: true });
      await expect(target.getByRole('option',{ name: 'Suspended Customer',exact: true })).toHaveCount(0);
      await target.selectOption({ label: 'Owner browser Customer' });await owner.getByRole('combobox',{ name: 'Rolle',exact: true }).selectOption(role);
      await owner.getByRole('button',{ name: 'Mit Microsoft bestätigen und fortfahren',exact: true }).click();
      const approval=page.getByRole('dialog',{ name: 'Aktion mit Microsoft bestätigen',exact: true });await expect(approval).toBeVisible();
      const open=context.waitForEvent('page');await approval.getByRole('link',{ name: 'Mit Microsoft anmelden',exact: true }).press('Enter');
      const provider=await open;expect(await provider.evaluate(()=>opener===null)).toBe(true);
      await provider.getByRole('link',{ name: 'Confirm isolated Microsoft fixture',exact: true }).click();
      const finish=page.getByRole('button',{ name: /^(Kundenanwendung öffnen|Open customer application)$/ });
      if (index>0) {
        const logout=page.getByRole('button',{ name: /^(Aktuelles Kundenkonto abmelden|Sign out the current customer account)$/ });
        await expect(logout).toBeVisible();await expect(finish).toHaveCount(0);await logout.click();
      }
      await expect(finish).toBeVisible();expect(new URL(page.url()).origin).toBe(origins.customer);
      if (index===0) {
        await page.getByRole('combobox',{ name: 'Sprache',exact: true }).selectOption('en');
        await expect(page.getByText('Customer: Owner browser Customer. Role: Employee.',{ exact: true })).toBeVisible();
        await page.evaluate(()=>{ document.documentElement.style.fontSize='200%'; });await page.setViewportSize({ width: 320,height: 900 });
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await page.evaluate(()=>{ document.documentElement.style.fontSize=''; });
        await page.setViewportSize(browserName==='webkit' ? { width: 390,height: 844 } : { width: 1280,height: 900 });
      }
      await finish.focus();await page.keyboard.press('Enter');
      try { await expect(page.locator('#primaryNavigation button[aria-haspopup="dialog"]')).toBeVisible(); }
      catch (error) {
        const traffic=edge.evidence();
        console.error('OWNER_BROWSER_EDGE_DIAGNOSTIC '+JSON.stringify({ role,eventCount: traffic.requests.length,errors,
          failures: traffic.requests.filter(event=>event.status>=400).map(event=>({
            path: event.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi,':id'),status: event.status,errorCode: event.errorCode ?? null,
          })) }));
        const state=await page.evaluate(async()=>{
          const response=await fetch('/api/v1/session'),body=await response.text();let value={},validation='not_authenticated';
          try { value=JSON.parse(body); } catch { validation='non_json_response'; }
          if (response.ok) try { const { validateProductionSession }=await import('/src/platform/production-session.js');
            validateProductionSession(value);validation='accepted'; } catch (failure) {
            validation=typeof failure.code==='string' && /^[A-Z_]{1,80}$/.test(failure.code) ? failure.code : 'unknown';
          }
          return { sessionStatus: response.status,validation,userVersion: typeof value.user?.id==='string' ? value.user.id[14] : null,
            authenticationReady: document.documentElement.dataset.authenticationReady==='true',
            heading: document.querySelector('h1')?.textContent.slice(0,120) ?? null,
            subheading: document.querySelector('h2')?.textContent.slice(0,120) ?? null };
        }).catch(()=>({ diagnostic: 'unavailable' }));
        console.error('OWNER_BROWSER_PROJECTION_DIAGNOSTIC '+JSON.stringify({ role,...state,errors,
          requests: edge.evidence().requests.filter(event=>event.status>=400).map(event=>({
            path: event.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi,':id'),status: event.status,errorCode: event.errorCode ?? null,
          })) }));throw error;
      }
      const session=await page.evaluate(async()=>{ const response=await fetch('/api/v1/session'),value=await response.json();
        return { status: response.status,userId: value.user?.id,roles: value.roles }; });
      expect(session.status).toBe(200);expect(session.roles).toEqual(role==='employee' ? ['employee'] : ['employee',role]);
      users.push(session.userId);await provider.close();
      if (index<roles.length-1) edge.compactStaticEvidence();
    }
    expect(new Set(users).size).toBe(1);expect(typeof users[0]).toBe('string');expect(errors).toEqual([]);
    expect(await page.evaluate(()=>!/(?:csrfToken|browserToken|refresh_token|access_token|approval_proof)/i
      .test(JSON.stringify({ local: Object.entries(localStorage),session: Object.entries(sessionStorage) })))).toBe(true);
    const traffic=edge.evidence();
    expect(traffic.staticCompactions).toBe(2);expect(traffic.completedStatic.customer).toBeGreaterThan(0);
    expect(traffic.completedStatic.platform).toBeGreaterThan(0);
    for (const [path,method,site,count] of [['/api/v1/platform/auth/microsoft/operation/callback','GET','cross-site',3],
      ['/api/v1/platform/auth/owner/approve','POST','same-origin',3],['/api/v1/auth/owner/callback','GET','cross-site',3],
      ['/api/v1/auth/owner/complete','POST','same-origin',3]]) {
      expect(traffic.requests.filter(event=>event.path===path && event.method===method && event.status===303 && event.fetchSite===site)).toHaveLength(count);
    }
    expect(traffic.deniedConnects).toBe(0);expect(traffic.providerDocuments).toBe(3);const evidence=await runtime.evidence();
    expect(evidence).toMatchObject({ application_keys: 0,own_bindings: 1,distinct_own_users: 1,consumed_flows: 3,
      ordinary_user_grants: 0,tenantChainVerified: true,platformChainVerified: true });
    console.log('OWNER_PROTECTED_BROWSER_EVIDENCE '+JSON.stringify({ engine: browserName,...evidence,
      scope: 'actual roots and browser custody; initial MFA and provider network isolated; real Microsoft/device unproved' }));
  } finally {
    let failed=false;for (const close of [()=>context?.close(),()=>edge?.close(),()=>runtime?.close()]) {
      try { await close(); } catch { failed=true; }
    }
    if (written) try { await rm(`${apiRoot}/.protected-frontend`,{ recursive: true,force: true }); } catch { failed=true; }
    if (failed) throw new Error('OWNER_PROTECTED_BROWSER_CLEANUP_FAILED');
  }
});
