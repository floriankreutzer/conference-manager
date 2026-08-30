import { expect, test } from '@playwright/test';

const ACTIVE_TENANT_ID = '10000000-0000-4000-8000-000000000004';
const RECOVERY_TENANT_ID = '10000000-0000-4000-8000-000000000005';

test('isolated Platform Admin Demo discloses synthetic local-only data and makes no API requests', async ({ page }) => {
  const apiRequests = [];
  const externalRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiRequests.push(request.url());
    if (url.origin !== 'https://127.0.0.1:4173') externalRequests.push(request.url());
  });

  await page.goto('/platform-admin-demo/');
  await expect(page.locator('meta[name="conference-runtime"]')).toHaveAttribute('content', 'demo');
  await expect(page.locator('meta[name="platform-demo-data"]')).toHaveAttribute('content', 'synthetic-local-only');
  await expect(page.locator('#runtimeNotice')).toHaveAttribute('data-platform-admin-runtime', 'demo');
  await expect(page.locator('#runtimeNotice')).toContainText(/synthetic|synthetische/i);
  await expect(page.locator('.platform-admin-fleet-card')).toHaveCount(6);
  await expect(page.locator('[data-platform-admin-demo-reset]')).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('Demo role permissions, confirmation, persistence, and isolated reset are reproducible', async ({ page }) => {
  await page.goto('/platform-admin-demo/');
  await page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`).click();
  await page.locator('[data-platform-admin-navigate="lifecycle"]').click();
  await expect(page.locator('[data-platform-action="suspend"]')).toHaveCount(0);

  await page.locator('select[aria-label]').filter({ has: page.locator('option[value="tenant_operator"]') }).selectOption('tenant_operator');
  await expect(page.locator('[data-platform-action="suspend"]')).toBeVisible();
  await page.locator('[data-platform-action="suspend"]').click();
  await page.locator('#platformAdminActionReason').fill('Synthetic incident exercise');
  await page.locator('[data-platform-admin-confirm-action="suspend"]').click();
  await expect(page.locator('[data-platform-admin-section="lifecycle"] [data-state="suspended"]')).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-platform-admin-section="lifecycle"] [data-state="suspended"]')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('unrelated_acceptance_key', 'preserve-me'));
  await page.locator('[data-platform-admin-demo-reset]').click();
  await expect(page).toHaveURL(/#fleet$/);
  await expect(page.locator('.platform-admin-fleet-card').filter({
    has: page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`),
  })).toContainText(/Active|Aktiv/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('unrelated_acceptance_key'))).toBe('preserve-me');
});

test('recovery controls require the simulated step-up Security Admin', async ({ page }) => {
  await page.goto(`/platform-admin-demo/#tenant=${RECOVERY_TENANT_ID}&section=recovery`);
  await page.locator('select[aria-label]').filter({ has: page.locator('option[value="tenant_operator"]') }).selectOption('tenant_operator');
  await expect(page.locator('[data-platform-admin-recovery-preview="tenant-reactivation"]')).toHaveCount(0);
  await page.locator('select[aria-label]').filter({ has: page.locator('option[value="security_admin"]') }).selectOption('security_admin');
  await expect(page.locator('[data-platform-admin-recovery-preview="tenant-reactivation"]')).toBeVisible();
});

test('Demo role changes clear privileged resources and canonical metering remains available', async ({ page }) => {
  await page.goto('/platform-admin-demo/');
  const role = page.locator('select[aria-label]').filter({ has: page.locator('option[value="security_auditor"]') });
  await role.selectOption('security_auditor');
  await page.locator('[data-platform-admin-fleet-view="platform-audit"]').click();
  await expect(page.locator('.platform-admin-audit-list')).toBeVisible();

  await role.selectOption('support_reader');
  await expect(page.locator('.platform-admin-fleet-card')).toHaveCount(6);
  await expect(page.locator('.platform-admin-audit-list')).toHaveCount(0);

  await role.selectOption('tenant_operator');
  await page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`).click();
  await page.locator('[data-platform-admin-navigate="metering"]').click();
  await expect(page.locator('[data-platform-admin-section="metering"]')).toBeVisible();
  await expect(page.locator('[data-platform-admin-quota]')).not.toHaveCount(0);
  await expect(page.locator('.platform-admin-error')).toHaveCount(0);
});

test('Demo direct entitlement application uses the aggregate entitlement revision', async ({ page }) => {
  await page.goto('/platform-admin-demo/');
  await page.locator('select[aria-label]').filter({ has: page.locator('option[value="tenant_operator"]') }).selectOption('tenant_operator');
  await page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`).click();
  await page.locator('[data-platform-admin-navigate="entitlements"]').click();
  await page.locator('.platform-admin-entitlement-option').filter({ hasText: 'microsoft.calendar.write' })
    .locator('input[type="checkbox"]').click();
  await page.locator('.platform-admin-entitlement-form button[type="submit"]').click();
  await page.locator('[data-platform-admin-apply-entitlements="direct"]').click();
  await page.locator('#platformAdminResourceReason').fill('Synthetic entitlement exercise');
  await page.locator('#platformAdminResourceConfirmation').fill('Dune Collective');
  await page.locator('dialog button.danger').click();
  await expect(page.locator('.platform-admin-error')).toHaveCount(0);
  await expect(page.locator('[data-platform-admin-section="entitlements"]')).toBeVisible();
});

test('Production entry fails closed on an insecure or unavailable operator session', async ({ page }) => {
  const apiRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await page.goto('/platform-admin/');
  await expect(page.locator('meta[name="conference-runtime"]')).toHaveAttribute('content', 'production');
  await expect(page.locator('#runtimeNotice')).toHaveAttribute('data-platform-admin-runtime', 'production');
  await expect(page.locator('.platform-admin-session-gate')).toBeVisible();
  await expect(page.locator('.platform-admin-fleet-card')).toHaveCount(0);
  await expect(page.locator('[data-platform-admin-demo-reset]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('platform_admin_demo_v1'))).toBeNull();
  expect(apiRequests).toEqual(['https://127.0.0.1:4173/api/v1/platform/session']);
});

test('Production privileged actions start only the fixed step-up route and require fresh confirmation', async ({ page }) => {
  await page.route('**/api/v1/platform/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      operatorId: '00000000-0000-4000-8000-000000000102',
      roles: ['platform_tenant_operator'],
      permissions: [
        'platform:tenant:read',
        'platform:readiness:read',
        'platform:integration-health:read',
        'platform:diagnostics:read',
        'platform:entitlement:read',
        'platform:metering:read',
        'platform:runtime:read',
        'platform:invitation:manage',
        'platform:lifecycle:manage',
        'platform:entitlement:manage',
        'platform:quota:manage',
      ],
      assurance: { level: 'mfa', authenticatedAt: '2099-01-01T00:00:00.000Z' },
      expiresAt: '2099-01-01T01:00:00.000Z',
      stepUpExpiresAt: null,
      csrfToken: 'c'.repeat(43),
    }),
  }));
  await page.route('**/api/v1/platform/tenants?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      schemaVersion: 1,
      snapshotAt: '2026-08-01T08:00:00.000Z',
      items: [{
        tenantId: ACTIVE_TENANT_ID,
        displayName: 'Dune Collective',
        lifecycle: { status: 'active', revision: 3 },
        onboardingState: 'complete',
        identityState: 'active',
        invitation: { id: null, state: 'none', revision: null, expiresAt: null },
        updatedAt: '2026-08-01T08:00:00.000Z',
      }],
      nextCursor: null,
    }),
  }));
  const stepUpRequest = page.waitForRequest((request) => (
    new URL(request.url()).pathname === '/api/v1/platform/auth/microsoft/step-up'
  ));
  await page.route('**/api/v1/platform/auth/microsoft/step-up', (route) => route.abort());

  await page.goto('/platform-admin/');
  await page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`).click();
  await page.locator('[data-platform-admin-navigate="lifecycle"]').click();
  await expect(page.locator('[data-platform-action="suspend"]')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  await page.getByRole('button', { name: /step-up|erhöhte bestätigung/i }).click();
  const request = await stepUpRequest;
  expect(request.method()).toBe('GET');
  expect(new URL(request.url()).search).toBe('');
});

test('Production directory survives ordinary renders and exposes every cursor page', async ({ page }) => {
  await page.route('**/api/v1/platform/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      operatorId: '00000000-0000-4000-8000-000000000102',
      roles: ['platform_tenant_operator'],
      permissions: [
        'platform:tenant:read',
        'platform:readiness:read',
        'platform:integration-health:read',
        'platform:diagnostics:read',
        'platform:entitlement:read',
        'platform:metering:read',
        'platform:runtime:read',
        'platform:invitation:manage',
        'platform:lifecycle:manage',
        'platform:entitlement:manage',
        'platform:quota:manage',
      ],
      assurance: { level: 'mfa', authenticatedAt: '2099-01-01T00:00:00.000Z' },
      expiresAt: '2099-01-01T01:00:00.000Z',
      stepUpExpiresAt: null,
      csrfToken: 'c'.repeat(43),
    }),
  }));
  const directoryRequests = [];
  await page.route('**/api/v1/platform/tenants?*', async (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get('cursor');
    directoryRequests.push(cursor);
    if (!cursor) await new Promise((resolve) => setTimeout(resolve, 200));
    const suffix = cursor ? '5' : '4';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 1,
        snapshotAt: '2026-08-01T08:00:00.000Z',
        items: [{
          tenantId: `10000000-0000-4000-8000-00000000000${suffix}`,
          displayName: cursor ? 'Elm Partners' : 'Dune Collective',
          lifecycle: { status: 'active', revision: 3 },
          onboardingState: 'complete',
          identityState: 'active',
          invitation: { id: null, state: 'none', revision: null, expiresAt: null },
          updatedAt: '2026-08-01T08:00:00.000Z',
        }],
        nextCursor: cursor ? null : 'next_page',
      }),
    });
  });

  await page.goto('/platform-admin/');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('conference-language-changed')));
  await expect(page.locator('.platform-admin-fleet-card')).toHaveCount(1);
  await page.locator('[data-platform-admin-directory-next]').click();
  await expect(page.locator('.platform-admin-fleet-card')).toHaveCount(2);
  expect(directoryRequests).toEqual([null, 'next_page']);
});
