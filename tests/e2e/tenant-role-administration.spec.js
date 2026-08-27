import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://conference.test';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = '33333333-3333-4333-8333-333333333333';
const CSRF_TOKEN = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function sessionPayload(roles = ['employee', 'tenant_admin']) {
  const permissions = ['request:read', 'request:cancel'];
  if (roles.includes('conference_manager')) permissions.push('request:manage');
  if (roles.includes('tenant_admin')) {
    permissions.push(
      'tenant:configure',
      'tenant:users:manage',
      'tenant:integrations:manage',
      'tenant:audit:read',
    );
  }
  return {
    user: { id: ADMIN_ID },
    tenant: { id: TENANT_ID, status: 'active' },
    roles,
    permissions,
    session: { expiresAt: '2026-09-24T12:00:00.000Z' },
    csrfToken: CSRF_TOKEN,
  };
}

function presentationPayload() {
  return {
    schemaVersion: 1,
    revision: 1,
    presentation: {
      displayName: 'Conference Manager',
      defaultLocale: 'de-DE',
      defaultCurrency: 'EUR',
      branding: { logoPreset: 'product-default', accentToken: 'default' },
    },
  };
}

function initialUsers() {
  return [
    {
      id: ADMIN_ID,
      displayName: 'Alex Admin',
      active: true,
      roles: ['employee', 'tenant_admin'],
      lifecycle: { status: 'active', version: 1 },
      identityProvider: { linked: true, linkedAt: '2026-08-20T08:00:00.000Z' },
      lastSignInAt: '2026-08-27T07:45:00.000Z',
      requestOwnership: { openRequestCount: 1, ownershipPreservedOnDisable: true },
    },
    {
      id: USER_ID,
      displayName: 'Casey User',
      active: true,
      roles: ['employee'],
      lifecycle: { status: 'active', version: 3 },
      identityProvider: { linked: false, linkedAt: null },
      lastSignInAt: null,
      requestOwnership: { openRequestCount: 2, ownershipPreservedOnDisable: true },
    },
  ];
}

async function productionHtml() {
  const source = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  return source
    .replace(
      '<meta name="conference-runtime" content="demo">',
      '<meta name="conference-runtime" content="production">',
    )
    .replace("connect-src 'none'", "connect-src 'self'");
}

async function installProductionFixture(page, {
  roles = ['employee', 'tenant_admin'],
  conflictOnUpdate = false,
} = {}) {
  let users = initialUsers();
  const writes = [];
  const accessWrites = [];
  const reads = [];

  await page.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/api/v1/session') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(sessionPayload(roles)),
      });
      return;
    }

    if (url.pathname === '/api/v1/tenant/presentation' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(presentationPayload()),
      });
      return;
    }

    if (url.pathname === '/api/v1/tenant/users' && request.method() === 'GET') {
      reads.push(Object.fromEntries(url.searchParams));
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ users, nextAfterId: null, requestId: ADMIN_ID }),
      });
      return;
    }

    if (url.pathname === `/api/v1/tenant/users/${USER_ID}/access` && request.method() === 'PUT') {
      const body = request.postDataJSON();
      accessWrites.push({ csrf: request.headers()['x-csrf-token'], body });
      users = users.map((user) => user.id === USER_ID
        ? {
          ...user,
          active: body.active,
          lifecycle: {
            status: body.active ? 'active' : 'disabled',
            version: user.lifecycle.version + 1,
          },
        }
        : user);
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          user: users.find((user) => user.id === USER_ID),
          requestId: ADMIN_ID,
        }),
      });
      return;
    }

    if (url.pathname === `/api/v1/tenant/users/${USER_ID}/roles` && request.method() === 'PUT') {
      const body = request.postDataJSON();
      writes.push({
        csrf: request.headers()['x-csrf-token'],
        body,
      });
      if (conflictOnUpdate) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({ error: { code: 'TENANT_ADMIN_REQUIRED' } }),
        });
        return;
      }
      users = users.map((user) => user.id === USER_ID
        ? { ...user, roles: ['employee', ...body.roles] }
        : user);
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          user: (({ id, displayName, active, roles: userRoles }) => ({
            id,
            displayName,
            active,
            roles: userRoles,
          }))(users.find((user) => user.id === USER_ID)),
          requestId: ADMIN_ID,
        }),
      });
      return;
    }

    let relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!relativePath) relativePath = 'index.html';
    const filePath = path.resolve(ROOT, relativePath);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
      await route.fulfill({ status: 404, body: 'Not found' });
      return;
    }
    try {
      const body = relativePath === 'index.html'
        ? Buffer.from(await productionHtml(), 'utf8')
        : await readFile(filePath);
      await route.fulfill({ status: 200, contentType: contentType(filePath), body });
    } catch {
      await route.fulfill({ status: 404, body: 'Not found' });
    }
  });

  return { writes, accessWrites, reads };
}

async function openTenantAdministration(page) {
  await page.goto(`${ORIGIN}/`);
  const nav = page.locator('[data-view="tenantAdmin"]');
  await expect(nav).toBeVisible();
  await nav.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#viewTitle')).toBeFocused();
  await page.locator('[data-tenant-admin-section="users"]').click();
  await expect(page.locator('[data-tenant-admin-section-content="users"] h2')).toHaveText('Benutzer & Rollen');
  await expect(page.locator(
    '[data-tenant-admin-section-content="users"] .tenant-operations-result-status',
  )).toHaveText('2 Benutzer geladen.');
}

test('Tenant Admin manages elevated roles through the production API with CSRF and keyboard focus', async ({ page }) => {
  const fixture = await installProductionFixture(page);
  await openTenantAdministration(page);

  const selfCard = page.locator(`[data-tenant-user-id="${ADMIN_ID}"]`);
  await expect(selfCard.getByRole('checkbox', { name: 'Tenant Admin' })).toBeDisabled();
  await expect(selfCard.getByText('Ihre eigenen erhöhten Rollen können hier nicht geändert werden.')).toBeVisible();

  const userCard = page.locator(`[data-tenant-user-id="${USER_ID}"]`);
  await expect(userCard.getByText('Basisrolle: Mitarbeiter')).toBeVisible();
  const managerRole = userCard.getByRole('checkbox', { name: 'Conference Manager' });
  await managerRole.check();
  const save = userCard.locator('[data-tenant-role-action="save"]');
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page.locator('#toast')).toContainText('Rollen gespeichert.');
  const updatedUserCard = page.locator(`[data-tenant-user-id="${USER_ID}"]`);
  await expect(updatedUserCard.getByRole('checkbox', { name: 'Conference Manager' })).toBeChecked();
  await expect(updatedUserCard.locator('[data-tenant-role-action="save"]')).toBeDisabled();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toEqual({
    csrf: CSRF_TOKEN,
    body: { roles: ['conference_manager'] },
  });

  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noOverflow).toBe(true);
});

test('Tenant Admin lifecycle is keyboard operable, server-authoritative, and responsive', async ({ page }) => {
  const fixture = await installProductionFixture(page);
  await page.setViewportSize({ width: 375, height: 760 });
  await openTenantAdministration(page);

  const search = page.locator('#tenant-user-search');
  await search.fill('Casey');
  await search.press('Enter');
  await expect.poll(() => fixture.reads.at(-1)?.search).toBe('Casey');

  const userCard = page.locator(`[data-tenant-user-id="${USER_ID}"]`);
  await expect(userCard.getByText(/2 offene Anfragen/)).toBeVisible();
  const disable = userCard.locator('[data-tenant-user-lifecycle-action="disable"]');
  await disable.focus();
  await page.keyboard.press('Enter');

  const updated = page.locator(`[data-tenant-user-id="${USER_ID}"]`);
  await expect(updated).toBeFocused();
  await expect(updated.getByText('Deaktiviert', { exact: true })).toBeVisible();
  await expect(updated.locator('[data-tenant-user-lifecycle-action="reactivate"]')).toBeVisible();
  expect(fixture.accessWrites).toEqual([{
    csrf: CSRF_TOKEN,
    body: { active: false, expectedVersion: 3 },
  }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('role conflicts are localized, announced and return focus to the failed save action', async ({ page }) => {
  await installProductionFixture(page, { conflictOnUpdate: true });
  await openTenantAdministration(page);

  const userCard = page.locator(`[data-tenant-user-id="${USER_ID}"]`);
  await userCard.getByRole('checkbox', { name: 'Tenant Admin' }).check();
  const save = userCard.locator('[data-tenant-role-action="save"]');
  await save.click();

  await expect(userCard.getByText(/Mindestens ein aktiver Tenant Admin muss erhalten bleiben/)).toBeVisible();
  await expect(save).toBeFocused();
  await expect(page.locator('#alertRegion')).toContainText('Mindestens ein aktiver Tenant Admin muss erhalten bleiben');
});

test('Tenant Admin navigation is server-session scoped and DE/EN copy stays functional', async ({ page }) => {
  await installProductionFixture(page, { roles: ['employee', 'conference_manager'] });
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('[data-view="tenantAdmin"]')).toHaveCount(0);

  await page.unroute(`${ORIGIN}/**`);
  await installProductionFixture(page);
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="tenantAdmin"]').click();
  await page.locator('[data-tenant-admin-section="users"]').click();
  await page.getByRole('button', { name: 'Profil' }).click();
  await page.locator('#profileLanguage').selectOption('en');
  await expect(page.locator('[data-tenant-admin-section-content="users"] h2')).toHaveText('Users & roles');
  await expect(page.getByText('Baseline role: Employee').first()).toBeVisible();

  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noOverflow).toBe(true);
});
