import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = name => JSON.parse(readFileSync(new URL(`../support/${name}-fixture.json`, import.meta.url), 'utf8'));
const permissions = ['platform:tenant:read','platform:readiness:read','platform:integration-health:read',
  'platform:diagnostics:read','platform:entitlement:read','platform:metering:read','platform:runtime:read',
  'platform:diagnostics:sensitive','platform:recovery:execute','platform:audit:read','platform:session:revoke',
  'platform:operator:manage','platform:break-glass:manage'];

test('protected insight views retain DE/EN mobile navigation without a Tenant or Demo requests', async ({ page }) => {
  const requests = [], pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let providerAvailable = true, runtimeAvailable = false;
  await page.route('**/api/v1/platform/**', async route => {
    const path = new URL(route.request().url()).pathname; requests.push(path);
    let status = 200, body;
    if (path === '/api/v1/platform/session') body = {
      operatorId: '00000000-0000-4000-8000-000000000101', roles: ['platform_support_reader','platform_security_admin'], permissions,
      assurance: { level: 'mfa', authenticatedAt: '2099-01-01T00:00:00.000Z' },
      expiresAt: '2099-01-01T04:00:00.000Z', stepUpExpiresAt: null, csrfToken: 'c'.repeat(43),
    };
    else if (path === '/api/v1/platform/auth/passkey/configuration') {
      body = { mode: 'application_passkey', environment: 'int', minimumPasskeys: 1,
        requestId: '00000000-0000-4000-8000-000000000102' };
    } else if (path === '/api/v1/platform/tenants') {
      body = { schemaVersion: 1, snapshotAt: '2026-10-23T12:00:00.000Z', items: [], nextCursor: null };
    } else if (path === '/api/v1/platform/insights/providers') {
      if (providerAvailable) { body = fixture('provider-usage'); body.accessMode = 'application_passkey'; }
      else { status = 503; body = { error: { code: 'PLATFORM_INSIGHT_SOURCE_UNAVAILABLE' } }; }
    } else if (path === '/api/v1/platform/insights/product-delivery') {
      body = fixture('product-delivery'); body.accessMode = 'application_passkey'; body.environment = 'production';
      if (runtimeAvailable) {
        const runtimeProduct={ ...fixture('product-runtime'),environment:'production',accessMode:'application_passkey',
          sourceContext:{ runtimeEnvironment:'int',dataProfile:'synthetic',securityEpochDigest:'a'.repeat(64) } };
        body={ schemaVersion:2,storedReport:body,runtimeProduct };
        expect(new URL(route.request().url()).search).toBe('?schemaVersion=2');
      }
    } else { status = 404; body = { error: { code: 'PLATFORM_NOT_FOUND' } }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/platform-admin/');
  const provider = page.locator('[data-platform-admin-fleet-view="providers"]');
  const product = page.locator('[data-platform-admin-fleet-view="product-delivery"]');
  await expect(provider).toBeVisible(); await expect(product).toBeVisible();
  await provider.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[data-platform-provider]')).toHaveCount(4);
  await expect(page.locator('#viewTitle')).toBeFocused();
  await product.click(); await expect(page.locator('[data-product-delivery-report]')).toBeVisible();
  await expect(page.getByText('Berichtskontext: Produktion · beobachtete Deployment-Umgebung siehe Plattformbetrieb', { exact: true })).toBeVisible();
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
  await expect(product).toContainText('Product');
  await expect(provider).toContainText('Providers');
  await expect(page.getByText('Report context: Production · see Platform runtime for the observed deployment environment', { exact: true })).toBeVisible();
  runtimeAvailable = true;await page.reload();
  await expect(page.getByText(/Synthetic INT data: these values come from test workflows/)).toBeVisible();
  await page.locator('[data-insights-tab="usage"]').click();
  await expect(page.locator('[data-product-outcomes] [data-product-metric="request_started"] strong')).toHaveText('2');
  await expect(page.locator('[data-product-outcomes]')).toContainText('From the protected INT collection');
  for (const width of [320,1280]) { await page.setViewportSize({ width,height:900 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); }
  providerAvailable = false;
  await page.reload(); await page.locator('[data-platform-admin-fleet-view="providers"]').click();
  await expect(page.locator('.platform-admin-error')).toBeVisible();
  expect(requests.some(path => path.includes('/demo/'))).toBe(false);
  expect(pageErrors).toEqual([]);
});
