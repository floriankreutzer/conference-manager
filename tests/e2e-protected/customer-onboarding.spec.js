import { test,expect } from '@playwright/test';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildProtectedFrontendArtifacts } from '../../scripts/protected-frontend-artifacts.mjs';
import { createQualifiedProtectedEdge } from './support/qualified-edge.mjs';
import { installQualifiedAuthenticator } from './support/browser-authenticator.mjs';

const FRONTEND_ROOT=fileURLToPath(new URL('../../',import.meta.url));

test('actual qualified different-site roots bind native handoff, local onboarding and current private Room images',async({ browser,browserName })=>{
  const apiRoot=process.env.CM_PROTECTED_API_ROOT,certificateDirectory=process.env.CM_PROTECTED_CERTIFICATE_DIRECTORY;
  const apiCommit=process.env.CM_PROTECTED_API_COMMIT,frontendCommit=process.env.CM_PROTECTED_FRONTEND_COMMIT;
  if (!apiRoot || !certificateDirectory || !/^[a-f0-9]{40}$/.test(apiCommit ?? '') || !/^[a-f0-9]{40}$/.test(frontendCommit ?? '')) {
    throw new Error('PROTECTED_BROWSER_RUNNER_REQUIRED');
  }
  const { createProtectedBrowserRuntimeFixture }=await import(pathToFileURL(`${apiRoot}/tests-db/support/protected-browser-runtime-fixture.js`));
  let runtime,edge,context,artifactsWritten=false;
  try {
    const built=await buildProtectedFrontendArtifacts({ root: FRONTEND_ROOT,apiCommit,frontendCommit,environment: 'int',
      customerOrigin: 'https://app-int.example.test',platformOrigin: 'https://ops-int.example.com',syntheticEnabled: true });
    const { stdout }=await promisify(execFile)(process.execPath,
      ['scripts/build-protected-frontend.mjs',`${apiRoot}/.protected-frontend`],{ cwd: FRONTEND_ROOT,
        env: { ...process.env,PROTECTED_API_COMMIT: apiCommit,PROTECTED_FRONTEND_COMMIT: frontendCommit,
          PROTECTED_ENVIRONMENT: 'int',PROTECTED_CUSTOMER_ORIGIN: 'https://app-int.example.test',
          PROTECTED_PLATFORM_ORIGIN: 'https://ops-int.example.com',PROTECTED_SYNTHETIC_ENABLED: 'true',
          PROTECTED_PRESENTATION_MICROSOFT_ENABLED: 'false',PROTECTED_PRESENTATION_INVITATIONS_ENABLED: 'false' },
        timeout: 30000,maxBuffer: 65536 });artifactsWritten=true;
    expect(JSON.parse(stdout)).toEqual({ apiCommit,frontendCommit,manifestSha256: built.manifestDigests });
    runtime=await createProtectedBrowserRuntimeFixture({ apiCommit,frontendCommit,hostedFrontend: built.manifestDigests });
    edge=await createQualifiedProtectedEdge({ root: FRONTEND_ROOT,ports: runtime.ports,certificateDirectory,artifactDigests: built.digests });
    context=await browser.newContext({ proxy: { server: edge.proxy },ignoreHTTPSErrors: false,
      viewport: browserName==='webkit' ? { width: 390,height: 844 } : { width: 1280,height: 900 } });
    const parts=runtime.initialSetCookie.split(';').map(part=>part.trim()),index=parts[0].indexOf('=');
    const cookiePath=parts.find(part=>part.startsWith('Path='))?.slice(5),sameSite=parts.find(part=>part.startsWith('SameSite='))?.slice(9);
    if (index<1 || !cookiePath || sameSite!=='Strict' || parts.some(part=>part.startsWith('Domain='))) {
      throw new Error('PROTECTED_BROWSER_INITIAL_COOKIE_INVALID');
    }
    await context.addCookies([{ name: parts[0].slice(0,index),value: parts[0].slice(index+1),
      domain: new URL(edge.origins.platform).hostname,path: cookiePath,secure: true,httpOnly: true,sameSite }]);
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.name));
    const authenticator=await installQualifiedAuthenticator({ context,page,browserName,keys: runtime.keys });
    const origins=edge.origins;
    await page.goto(`${origins.platform}/platform-admin/`);
    await page.getByRole('button',{ name: 'Eigene Testmandanten',exact: true }).click();
    await page.getByRole('button',{ name: 'Testmandanten anlegen',exact: true }).click();
    await page.getByRole('button',{ name: 'Anlegen mit Passkey bestätigen',exact: true }).click();
    await expect(page.getByRole('button',{ name: 'Fabrikam verwalten',exact: true })).toBeVisible();
    const platformDocument=await page.evaluate(()=>({ origin: location.origin,secure: isSecureContext }));
    expect(platformDocument).toEqual({ origin: origins.platform,secure: true });
    async function handoff(slot,role) {
      await page.goto(`${origins.customer}/`);
      await page.getByRole('button',{ name: 'Als Plattform-Operator testen',exact: true }).click();
      await expect(page.getByRole('combobox',{ name: 'Testmandant',exact: true })).toBeVisible();
      expect(await page.evaluate(()=>location.origin)).toBe(origins.platform);
      await page.getByRole('combobox',{ name: 'Testmandant',exact: true }).selectOption(slot);
      await page.getByRole('combobox',{ name: 'Kundenrolle',exact: true }).selectOption(role);
      await page.getByRole('button',{ name: 'Browserwechsel mit Passkey freigeben',exact: true }).click();
      await expect(page.getByRole('button',{ name: 'Testzugang öffnen',exact: true })).toBeVisible();
      expect(await page.evaluate(()=>location.origin)).toBe(origins.customer);
      await page.getByRole('button',{ name: 'Testzugang öffnen',exact: true }).click();
      const profileButton=page.locator('#primaryNavigation button[aria-haspopup="dialog"]');
      await expect(profileButton).toBeVisible();
      await expect(profileButton).toHaveAttribute('aria-label',role==='employee' ? /^Angemeldeter Benutzer .+/ : 'Profil');
    }
    await handoff('fabrikam','tenant_admin');
    await page.getByRole('button',{ name: 'Kalender und Onboarding',exact: true }).click();
    const group=page.getByRole('group',{ name: 'Räume für den Import auswählen' });
    await expect(group.getByRole('checkbox')).toHaveCount(2);
    await group.getByRole('checkbox').nth(0).check();await group.getByRole('checkbox').nth(1).check();
    await page.getByRole('button',{ name: 'Ausgewählte Räume importieren',exact: true }).click();
    await page.getByRole('button',{ name: 'Einrichtung abschließen',exact: true }).click();
    await page.getByRole('button',{ name: 'Testmandanten aktivieren',exact: true }).click();
    await expect(page.getByRole('link',{ name: 'Anwendung öffnen',exact: true })).toBeVisible();
    await expect(page.getByRole('button',{ name: 'Microsoft 365',exact: true })).toHaveCount(0);
    const customerState=await page.evaluate(async()=>{
      const response=await fetch('/api/v1/session'),value=await response.json();
      return { status: response.status,tenantStatus: value.tenant.status,roles: value.roles };
    });expect(customerState.status).toBe(200);expect(customerState.tenantStatus).toBe('active');
    expect(customerState.roles).toEqual(['employee','tenant_admin']);
    const cookies=await context.cookies([`${origins.customer}/api/v1/session`,`${origins.platform}/api/v1/platform/session`]);
    const namespaces=cookies.filter(cookie=>cookie.httpOnly && cookie.secure).map(cookie=>({
      name: cookie.name,domain: cookie.domain,path: cookie.path,sameSite: cookie.sameSite }));
    expect(namespaces.some(cookie=>cookie.domain===new URL(origins.customer).hostname
      && cookie.path==='/api' && cookie.sameSite==='Lax')).toBe(true);
    expect(namespaces.some(cookie=>cookie.domain===new URL(origins.platform).hostname
      && cookie.path==='/api/v1/platform' && cookie.sameSite==='Strict')).toBe(true);
    await page.getByRole('button',{ name: 'Profil',exact: true }).click();
    await page.getByRole('dialog').getByRole('button',{ name: 'Logout',exact: true }).click();
    await expect(page.getByRole('button',{ name: 'Als Plattform-Operator testen',exact: true })).toBeVisible();
    await handoff('northwind','employee');
    await page.locator('[data-view="employee"]').click();
    const date=new Date();date.setUTCDate(date.getUTCDate()+14);
    while (date.getUTCDay()!==2) date.setUTCDate(date.getUTCDate()+1);
    await page.locator('#productionTitle').fill('Qualified browser image acceptance');
    await page.locator('#productionDate').fill(date.toISOString().slice(0,10));
    await page.locator('#productionStart').fill('09:00');await page.locator('#productionEnd').fill('10:00');
    await page.locator('#productionInternal').fill('1');await page.locator('#productionExternal').fill('0');
    await page.getByRole('button',{ name: 'Weiter',exact: true }).click();
    await expect(page.getByRole('radio').first()).toBeVisible();
    await page.getByRole('button',{ name: 'Raumbilder anzeigen',exact: true }).first().click();
    const preview=page.getByRole('dialog');await expect(preview.getByRole('img').first()).toBeVisible();
    expect(await preview.getByRole('img').first().evaluate(image=>image.complete && image.naturalWidth>0)).toBe(true);
    const storageClean=await page.evaluate(()=>!/(?:csrfToken|browserToken|refresh_token|access_token|approval_proof)/i
      .test(JSON.stringify({ local: Object.entries(localStorage),session: Object.entries(sessionStorage) })));
    expect(storageClean).toBe(true);
    const traffic=edge.evidence();
    expect(traffic.requests.some(event=>event.surface==='platform' && event.path==='/api/v1/platform/auth/delegation/arrive'
      && event.method==='GET' && event.status===303 && event.fetchSite==='cross-site' && !event.cookiePresent)).toBe(true);
    expect(traffic.requests.filter(event=>event.path==='/api/v1/auth/delegation/callback' && event.method==='GET'
      && event.status===303 && event.fetchSite==='cross-site')).toHaveLength(2);
    expect(traffic.requests.filter(event=>event.path==='/api/v1/auth/delegation/complete' && event.method==='POST'
      && event.status===303 && event.fetchSite==='same-origin')).toHaveLength(2);
    expect(traffic.requests.some(event=>event.path.startsWith('/api/v1/tenant/catalogue-media/') && event.status===200)).toBe(true);
    expect(traffic.requests.some(event=>event.path.includes('/demo/'))).toBe(false);expect(traffic.deniedConnects).toBe(0);
    const evidence=await runtime.evidence();
    expect(evidence.tenants.some(tenant=>tenant.slot==='fabrikam' && tenant.status==='active' && tenant.rooms===2)).toBe(true);
    expect(evidence.tenantChainsVerified).toBe(3);expect(errors).toEqual([]);
    console.log('PROTECTED_QUALIFIED_BROWSER_EVIDENCE',JSON.stringify({ engine: browserName,authenticator: authenticator.mode,
      actualOrigins: origins,refs: evidence.refs,artifacts: traffic.artifacts,tenantChainsVerified: evidence.tenantChainsVerified,
      tenants: evidence.tenants,requests: traffic.requests.length,crossSiteCompletions: 2,
      scope: 'initial canonical MFA fixture; Microsoft primary, physical keys and operating cutover unproved' }));
  } catch (error) {
    // Fixed paths/status codes and test bridge counters only. Never include
    // callback queries, headers, cookies, request/response bodies or DOM forms.
    if (edge) console.log('PROTECTED_QUALIFIED_BROWSER_FAILURE',JSON.stringify({ engine: browserName,
      traffic: edge.evidence(),scope: 'no auth material captured' }));
    throw error;
  } finally {
    try { await context?.close(); } finally { try { await edge?.close(); } finally {
      try { await runtime?.close(); } finally { if (artifactsWritten) await rm(`${apiRoot}/.protected-frontend`,{ recursive: true,force: true }); }
    } }
  }
});
