import { expect,test } from '@playwright/test';

const tenantId='10000000-0000-4000-8000-000000000004';
async function setup(page,status) {
  const requests=[];
  await page.route('**/api/v1/platform/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;requests.push({ path,method: request.method() });
    let code=200,body;
    if (path==='/api/v1/platform/session') body={
      operatorId: '00000000-0000-4000-8000-000000000101',roles: ['platform_support_reader','platform_security_admin'],
      permissions: ['platform:tenant:read','platform:runtime:read','platform:readiness:read','platform:integration-health:read',
        'platform:diagnostics:read','platform:diagnostics:sensitive','platform:recovery:execute','platform:audit:read',
        'platform:session:revoke','platform:operator:manage','platform:break-glass:manage','platform:entitlement:read','platform:metering:read'],
      assurance: { level: 'mfa',authenticatedAt: '2099-01-01T00:00:00.000Z' },
      expiresAt: '2099-01-01T04:00:00.000Z',stepUpExpiresAt: null,csrfToken: 'c'.repeat(43),
    };
    else if (path==='/api/v1/platform/auth/passkey/configuration') body={ mode: 'application_passkey',environment: 'int',
      minimumPasskeys: 1,requestId: '00000000-0000-4000-8000-000000000102' };
    else if (path==='/api/v1/platform/tenants') body={ schemaVersion: 1,snapshotAt: '2026-10-30T12:00:00.000Z',items: [{
      tenantId,displayName: 'Private customer fixture',lifecycle: { status: 'active',revision: 1 },onboardingState: 'complete',
      identityState: 'active',invitation: { id: null,state: 'none',revision: null,expiresAt: null },updatedAt: '2026-10-30T12:00:00.000Z',
    }],nextCursor: null };
    else { code=['/api/v1/platform/insights/providers','/api/v1/platform/runtime/deployments'].includes(path) ? status : 404;
      body={ error: { code: code===401 ? 'PLATFORM_UNAUTHORIZED' : 'PLATFORM_FORBIDDEN' } }; }
    await route.fulfill({ status: code,contentType: 'application/json',body: JSON.stringify(body) });
  });
  await page.goto('/platform-admin/');
  await expect(page.getByText('Private customer fixture',{ exact: true })).toBeVisible();
  return requests;
}

for (const view of ['providers','runtime-status']) test(`401 from ${view} removes the session shell and cached customer data`,async({ page })=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const requests=await setup(page,401);
  await page.locator(`[data-platform-admin-fleet-view="${view}"]`).click();
  const entry=page.locator('[data-authentication-surface="platform"]');
  await expect(entry.getByRole('heading',{ name: 'Sitzung beendet',exact: true })).toBeVisible();
  await expect(entry.locator('main')).toBeFocused();
  await expect(page.locator('body')).not.toContainText('Private customer fixture');
  await expect(page.locator('#platformAdminSecurityTitle')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-authentication-ready','true');
  const count=requests.length;
  await page.evaluate(()=>{ location.hash='#fleet'; });
  await entry.getByRole('combobox').selectOption('en');
  await expect(entry.getByRole('heading',{ name: 'Session ended',exact: true })).toBeVisible();
  await expect(entry).toContainText('they will not be retried automatically');
  expect(requests).toHaveLength(count);
  expect(requests.every(request=>request.method==='GET')).toBe(true);
  expect(errors).toEqual([]);
});

test('403 remains a resource denial and preserves the authenticated workspace',async({ page })=>{
  await setup(page,403);
  await page.locator('[data-platform-admin-fleet-view="runtime-status"]').click();
  await expect(page.locator('.platform-admin-error')).toBeVisible();
  await expect(page.locator('[data-authentication-surface="platform"]')).toHaveCount(0);
  await expect(page.locator('#platformAdminSecurityTitle')).toBeVisible();
  await page.evaluate(()=>{ location.hash='#fleet'; });
  await expect(page.getByText('Private customer fixture',{ exact: true })).toBeVisible();
});
