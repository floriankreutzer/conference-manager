import { expect, test } from '@playwright/test';

const SESSION_USER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_USER_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = '33333333-3333-4333-8333-333333333333';
const CSRF_TOKEN = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

function jsonBody(value) {
  return JSON.stringify(value);
}

async function configureProductionRuntime(page) {
  await page.route('**/', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const body = source.replace(
      /(<meta\s+name="conference-runtime"\s+content=")[^"]+("\s*\/?>)/i,
      '$1production$2',
    );
    await route.fulfill({
      response,
      body,
      headers: {
        ...response.headers(),
        'content-length': String(Buffer.byteLength(body)),
      },
    });
  });

  await page.route('**/api/v1/session', async (route) => {
    const body = jsonBody({
      user: { id: SESSION_USER_ID },
      tenant: { id: TENANT_ID, status: 'active' },
      roles: ['employee', 'tenant_admin'],
      permissions: [
        'request:read',
        'request:cancel',
        'tenant:configure',
        'tenant:users:manage',
        'tenant:integrations:manage',
        'tenant:audit:read',
      ],
      session: { expiresAt: '2027-08-25T18:00:00.000Z' },
      csrfToken: CSRF_TOKEN,
      requestId: 'session-request',
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      headers: { 'content-length': String(Buffer.byteLength(body)) },
      body,
    });
  });

  await page.route('**/api/v1/tenant/users?**', async (route) => {
    const body = jsonBody({
      users: [{
        id: TARGET_USER_ID,
        displayName: 'Pilot Conference User',
        active: true,
        roles: ['employee', 'conference_manager'],
      }],
      nextAfterId: null,
      requestId: 'tenant-user-list',
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      headers: { 'content-length': String(Buffer.byteLength(body)) },
      body,
    });
  });
}

test('Tenant Admin navigation and role mutation remain server-authoritative and keyboard operable', async ({ page }) => {
  await configureProductionRuntime(page);
  let mutation = null;
  await page.route(`**/api/v1/tenant/users/${TARGET_USER_ID}/roles`, async (route) => {
    mutation = {
      headers: route.request().headers(),
      body: route.request().postDataJSON(),
      method: route.request().method(),
      url: route.request().url(),
    };
    const body = jsonBody({
      user: {
        id: TARGET_USER_ID,
        displayName: 'Pilot Conference User',
        active: true,
        roles: ['employee', 'conference_manager', 'tenant_admin'],
      },
      requestId: 'tenant-user-update',
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      headers: { 'content-length': String(Buffer.byteLength(body)) },
      body,
    });
  });

  await page.goto('/');
  const tenantNavigation = page.locator('[data-view="tenantUsers"]');
  await expect(tenantNavigation).toBeVisible();
  await tenantNavigation.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByText('Pilot Conference User')).toBeVisible();
  const tenantAdmin = page.getByLabel(/Tenant Admin/);
  await tenantAdmin.check();
  const saveButton = page.locator(`[data-user-id="${TARGET_USER_ID}"]`);
  await expect(saveButton).toBeEnabled();
  await saveButton.focus();
  await page.keyboard.press('Enter');

  await expect.poll(() => mutation).not.toBeNull();
  expect(mutation.method).toBe('PUT');
  expect(mutation.url).not.toContain('tenantId');
  expect(mutation.headers['x-csrf-token']).toBe(CSRF_TOKEN);
  expect(mutation.body).toEqual({ roles: ['conference_manager', 'tenant_admin'] });
  await expect(page.getByText(/Rollen wurden gespeichert|Roles have been saved/)).toBeVisible();
});

test('Tenant role administration remains usable without horizontal page overflow on iPhone-sized viewports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await configureProductionRuntime(page);
  await page.goto('/');
  await page.locator('[data-view="tenantUsers"]').click();
  await expect(page.getByText('Pilot Conference User')).toBeVisible();

  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  await expect(page.getByLabel(/Tenant Admin/)).toBeVisible();
  await expect(page.locator(`[data-user-id="${TARGET_USER_ID}"]`)).toBeVisible();
});
