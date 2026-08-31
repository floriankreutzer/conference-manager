import { expect, test } from '@playwright/test';
import { applicationProjectionPayload } from './fixtures/application-projections.js';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '20000000-0000-4000-8000-000000000002';
const REQUEST_ID = '50000000-0000-4000-8000-000000000005';
const CSRF_TOKEN = 'customer-demo-csrf-token-0000000000000001';
const TENANTS = Object.freeze([
  { id: TENANT_A, displayName: 'Northwind', lifecycleStatus: 'active', lifecycleRevision: 1 },
  { id: TENANT_B, displayName: 'Contoso', lifecycleStatus: 'ready', lifecycleRevision: 1 },
]);

const SHARED_REQUEST = Object.freeze({
  schemaVersion: 1,
  version: 1,
  id: REQUEST_ID,
  roomId: 'room-a',
  status: 'Submitted',
  statusReason: null,
  startsAt: '2099-09-15T07:00:00.000Z',
  endsAt: '2099-09-15T08:00:00.000Z',
  internalParticipants: 4,
  externalParticipants: 2,
  statusChangedAt: '2026-08-30T08:00:00.000Z',
  createdAt: '2026-08-30T08:00:00.000Z',
  updatedAt: '2026-08-30T08:00:00.000Z',
  details: null,
  pricing: null,
  configurationRevisions: null,
  policy: null,
  allocations: null,
});

function catalogPage(section) {
  const entries = {
    sites: [{ id: 'berlin', name: 'Berlin', active: true, timeZone: 'Europe/Berlin' }],
    rooms: [{
      id: 'room-a',
      siteId: 'berlin',
      name: 'Atlas',
      capacity: 12,
      active: true,
      price: { amountMinor: 0, currency: 'EUR' },
    }],
    services: [],
    cateringPackages: [],
    cateringItems: [],
    costCenters: [],
  }[section] || [];
  return {
    schemaVersion: 2,
    configurationRevisions: {
      organization: 1,
      locations: 1,
      catalogue: 1,
      bookingPolicies: 1,
      costAllocation: 1,
    },
    bookingPolicy: {
      policyVersionId: 'policy-1',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      evaluatedAt: '2026-08-30T08:00:00.000Z',
      rules: {
        minimumLeadTimeMinutes: 0,
        maximumAdvanceMinutes: 527_040,
        cancellationWindowMinutes: 0,
        changeWindowMinutes: 0,
        maximumParticipants: 500,
        allowedSiteIds: [],
        allowedRoomIds: [],
        allowedServiceIds: [],
      },
    },
    organization: { defaultCurrency: 'EUR' },
    costAllocation: { allocationRequired: false },
    context: 'customer_demo_regression',
    section,
    entries,
    page: { limit: 10, complete: true, nextCursor: null },
  };
}

function authority({ tenantId, persona }) {
  const roles = ['employee'];
  const permissions = ['request:read', 'request:cancel'];
  if (persona === 'conference_manager') {
    roles.push('conference_manager');
    permissions.push('request:manage');
  }
  if (persona === 'tenant_admin') {
    roles.push('tenant_admin');
    permissions.push(
      'tenant:configure',
      'tenant:users:manage',
      'tenant:integrations:manage',
      'tenant:audit:read',
    );
  }
  return {
    user: {
      id: tenantId === TENANT_A
        ? '30000000-0000-4000-8000-000000000003'
        : '40000000-0000-4000-8000-000000000004',
    },
    tenant: {
      id: tenantId,
      status: tenantId === TENANT_A ? 'active' : 'ready',
    },
    roles,
    permissions,
    session: { expiresAt: '2099-12-31T23:59:59.000Z' },
    csrfToken: CSRF_TOKEN,
    demo: { persona },
    requestId: REQUEST_ID,
  };
}

async function installCustomerDemoControlPlane(page, initial = {}) {
  let context = {
    tenantId: initial.tenantId || TENANT_A,
    persona: initial.persona || 'employee',
  };
  const contextMutations = [];

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/demo/session' && request.method() === 'GET') {
      await route.fulfill({ json: authority(context) });
      return;
    }
    if (path === '/api/v1/demo/tenants' && request.method() === 'GET') {
      await route.fulfill({ json: { tenants: TENANTS, requestId: REQUEST_ID } });
      return;
    }
    if (path === '/api/v1/demo/session/context' && request.method() === 'PUT') {
      const body = request.postDataJSON();
      contextMutations.push({ body, csrfToken: request.headers()['x-csrf-token'] });
      if (initial.rejectContext) {
        await route.fulfill({ status: 503, json: { code: 'DEMO_UNAVAILABLE' } });
        return;
      }
      context = { tenantId: body.tenantId, persona: body.persona };
      await route.fulfill({ json: authority(context) });
      return;
    }
    if (path === '/api/v1/application/profile' && request.method() === 'GET') {
      const label = context.persona === 'conference_manager' ? 'Demo Manager' : 'Demo Employee';
      await route.fulfill({ json: { schemaVersion: 1, profile: { displayName: label } } });
      return;
    }
    if (path === '/api/v1/application/catalog' && request.method() === 'GET') {
      const section = new URL(request.url()).searchParams.get('section');
      await route.fulfill({ json: catalogPage(section) });
      return;
    }
    if (path === '/api/v1/application/requests' && request.method() === 'GET') {
      await route.fulfill({
        json: {
          schemaVersion: 2,
          asOf: '2026-08-30T08:00:00.000Z',
          requests: [SHARED_REQUEST],
          page: { limit: 10, complete: true, nextCursor: null },
        },
      });
      return;
    }
    const optionalProjection = applicationProjectionPayload(new URL(request.url()));
    if (
      optionalProjection !== null
      && ['/api/v1/application/site-info', '/api/v1/application/notifications'].includes(path)
    ) {
      await route.fulfill({ json: optionalProjection });
      return;
    }
    if (path === '/api/v1/tenant/users' && request.method() === 'GET') {
      await route.fulfill({ json: { users: [], nextAfterId: null, requestId: REQUEST_ID } });
      return;
    }
    if (path === '/api/v1/tenant/presentation' && request.method() === 'GET') {
      await route.fulfill({
        json: {
          schemaVersion: 1,
          revision: 1,
          presentation: {
            displayName: 'Conference Manager',
            defaultLocale: 'de-DE',
            defaultCurrency: 'EUR',
            branding: { logoPreset: 'product-default', accentToken: 'default' },
          },
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
  });

  return { contextMutations };
}

test('Customer Demo context controls submit Tenant and persona intent to the server', async ({ page }) => {
  const fixture = await installCustomerDemoControlPlane(page);
  await page.goto('/');

  const panel = page.locator('[data-demo-security]');
  const tenant = page.getByLabel('Demo-Tenant');
  const persona = page.getByLabel('Demo-Persona');
  const apply = page.getByRole('button', { name: 'Demo-Kontext anwenden' });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('aria-label', 'Demo-Modus');
  await expect(tenant).toHaveValue(TENANT_A);
  await expect(persona).toHaveValue('employee');
  await expect(tenant.locator('option')).toHaveCount(2);
  await expect(page.locator('#primaryNavigation button[data-view="manager"]')).toHaveCount(0);

  await tenant.selectOption(TENANT_B);
  await persona.selectOption('conference_manager');
  await apply.focus();
  const reloaded = page.waitForEvent('load');
  await page.keyboard.press('Enter');
  await reloaded;

  expect(fixture.contextMutations).toEqual([{
    body: { tenantId: TENANT_B, persona: 'conference_manager' },
    csrfToken: CSRF_TOKEN,
  }]);
  await expect(tenant).toHaveValue(TENANT_B);
  await expect(persona).toHaveValue('conference_manager');
  await expect(page.locator('#primaryNavigation button[data-view="manager"]')).toHaveCount(1);
  await expect(page.locator('#primaryNavigation button[data-view="tenantAdmin"]')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-tenant-presentation-revision', '1');
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => (
    key !== 'conference_language_v1'
  )))).toEqual([]);
});

test('Customer Demo API failure is visible and never falls back to browser business state', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('conference_demo_role_v1', 'manager');
    localStorage.setItem('conference_user_profile_v1', JSON.stringify({
      displayName: 'Forged Browser Manager',
    }));
    localStorage.setItem('conference_requests', JSON.stringify([{
      id: 'forged-browser-request',
      title: 'Forged Browser Request',
    }]));
  });
  await page.route('**/api/v1/demo/session', (route) => route.fulfill({
    status: 503,
    json: { code: 'DEMO_UNAVAILABLE' },
  }));

  await page.goto('/');

  await expect(page.locator('#viewTitle')).toHaveText('Sichere Anmeldung nicht verfügbar');
  await expect(page.locator('[data-demo-security]')).toContainText(
    'Der gemeinsame Demo-Server ist nicht verfügbar. Es wird kein lokaler Ersatz verwendet.',
  );
  await expect(page.getByLabel('Demo-Tenant')).toBeDisabled();
  await expect(page.getByLabel('Demo-Persona')).toBeDisabled();
  await expect(page.locator('#primaryNavigation button[data-view="manager"]')).toHaveCount(0);
  await expect(page.getByText('Forged Browser Manager')).toHaveCount(0);
  await expect(page.getByText('Forged Browser Request')).toHaveCount(0);
});

test('server-owned request remains visible across Employee and Conference Manager personas', async ({ page }) => {
  await installCustomerDemoControlPlane(page);
  await page.goto('/');

  const requestsNavigation = page.locator('#primaryNavigation button[data-view="requests"]');
  await requestsNavigation.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#viewTitle')).toBeFocused();
  await expect(page.getByText(`Anfrage ${SHARED_REQUEST.id}`)).toBeVisible();

  await page.getByLabel('Demo-Persona').selectOption('conference_manager');
  const reload = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Demo-Kontext anwenden' }).click();
  await reload;
  await page.locator('#primaryNavigation button[data-view="manager"]').click();

  await expect(page.getByText(`Anfrage ${SHARED_REQUEST.id}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prüfung starten' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => (
    key !== 'conference_language_v1'
  )))).toEqual([]);
});

test('Tenant Admin Demo navigation is authorized, keyboard operable and responsive', async ({ page }) => {
  await installCustomerDemoControlPlane(page, { persona: 'tenant_admin' });
  await page.goto('/');

  const tenantAdminNavigation = page.locator('#primaryNavigation button[data-view="tenantAdmin"]');
  await tenantAdminNavigation.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#viewTitle')).toBeFocused();
  await expect(page.locator('[data-tenant-admin-shell]')).toBeVisible();

  for (const sectionId of [
    'organization',
    'locations',
    'catalog',
    'booking-policies',
    'cost-allocation',
    'users',
    'microsoft365',
    'audit',
    'capabilities',
  ]) {
    await expect(page.locator(`[data-tenant-admin-section="${sectionId}"]`)).toHaveCount(1);
  }

  const usersNavigation = page.locator('[data-tenant-admin-section="users"]');
  await usersNavigation.focus();
  await page.keyboard.press('Enter');
  const usersHeading = page.locator('[data-tenant-admin-section-content="users"] h2');
  await expect(usersHeading).toHaveText('Benutzer & Rollen');
  await expect(usersHeading).toBeFocused();
  await expect(page).toHaveURL(/#tenant-admin\/users$/);

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test('Customer Demo context failure invalidates controls and exposes an accessible error', async ({ page }) => {
  await installCustomerDemoControlPlane(page, { rejectContext: true });
  await page.goto('/');

  const panel = page.locator('[data-demo-security]');
  await page.getByLabel('Demo-Persona').selectOption('conference_manager');
  await page.getByRole('button', { name: 'Demo-Kontext anwenden' }).click();

  await expect(panel.locator('[role="status"]')).toContainText(
    'Bitte laden Sie die Anwendung neu und versuchen Sie es erneut.',
  );
  await expect(page.getByLabel('Demo-Tenant')).toBeDisabled();
  await expect(page.getByLabel('Demo-Persona')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Demo-Kontext anwenden' })).toBeDisabled();
});

test('Customer Demo shell remains semantic, localized and contained', async ({ page }, testInfo) => {
  await installCustomerDemoControlPlane(page);
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('aside')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('nav')).toHaveCount(1);
  await expect(page.locator('[onclick], [onerror], [onload], [style]')).toHaveCount(0);
  await expect(page.getByLabel('Demo-Tenant')).toHaveAccessibleName('Demo-Tenant');
  await expect(page.getByLabel('Demo-Persona')).toHaveAccessibleName('Demo-Persona');

  const shell = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    duplicateIds: [...document.querySelectorAll('[id]')]
      .map((element) => element.id)
      .filter((id, index, ids) => ids.indexOf(id) !== index),
  }));
  expect(shell.duplicateIds).toEqual([]);
  expect(shell.scrollWidth).toBeLessThanOrEqual(shell.clientWidth + 1);
  if (testInfo.project.name === 'webkit-mobile') {
    await expect(page.locator('[data-demo-security]')).toBeVisible();
  }

  await page.locator('#primaryNavigation button[aria-haspopup="dialog"]').click();
  await page.locator('#profileLanguage').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByLabel('Demo tenant')).toBeVisible();
  await expect(page.getByLabel('Demo persona')).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['conference_language_v1']);
});

test('Production composition loads no Customer Demo controls or endpoints', async ({ page }) => {
  const demoRequests = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/v1/demo/')) demoRequests.push(path);
    await route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } });
  });
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      response,
      body: body
        .replace(
          '<meta name="conference-runtime" content="demo">',
          '<meta name="conference-runtime" content="production">',
        )
        .replace(
          './src/platform/demo-bootstrap.js?v=20260830-77',
          './src/platform/production-bootstrap.js?v=20260830-77',
        ),
    });
  });

  await page.goto('/');

  await expect(page.locator('[data-demo-security]')).toHaveCount(0);
  await expect(page.locator('#demoTenantSwitch')).toHaveCount(0);
  await expect(page.locator('#demoPersonaSwitch')).toHaveCount(0);
  expect(demoRequests).toEqual([]);
});
