import { expect, test } from '@playwright/test';

const ACTIVE_TENANT_ID = '10000000-0000-4000-8000-000000000004';
const REQUEST_ID = '20000000-0000-4000-8000-000000000001';
const CSRF_TOKEN = 'c'.repeat(43);

const ROLE_PROJECTIONS = Object.freeze({
  support_reader: Object.freeze({
    role: 'platform_support_reader',
    permissions: [
      'platform:tenant:read', 'platform:readiness:read', 'platform:integration-health:read',
      'platform:diagnostics:read', 'platform:entitlement:read', 'platform:metering:read',
      'platform:runtime:read',
    ],
    assurance: 'mfa',
  }),
  tenant_operator: Object.freeze({
    role: 'platform_tenant_operator',
    permissions: [
      'platform:tenant:read', 'platform:readiness:read', 'platform:integration-health:read',
      'platform:diagnostics:read', 'platform:entitlement:read', 'platform:metering:read',
      'platform:runtime:read', 'platform:invitation:manage', 'platform:lifecycle:manage',
      'platform:entitlement:manage', 'platform:quota:manage',
    ],
    assurance: 'step_up',
  }),
});

function demoSession(persona) {
  const projection = ROLE_PROJECTIONS[persona];
  const stepUpExpiresAt = projection.assurance === 'step_up'
    ? '2099-01-01T00:05:00.000Z'
    : null;
  return {
    operatorId: persona === 'support_reader'
      ? '00000000-0000-4000-8000-000000000101'
      : '00000000-0000-4000-8000-000000000102',
    roles: [projection.role],
    permissions: projection.permissions,
    assurance: { level: projection.assurance, authenticatedAt: '2099-01-01T00:00:00.000Z' },
    expiresAt: '2099-01-01T04:00:00.000Z',
    stepUpExpiresAt,
    csrfToken: CSRF_TOKEN,
    demo: { persona },
    requestId: REQUEST_ID,
  };
}

function directoryPayload({ lifecycleStatus = 'active', revision = 3 } = {}) {
  return {
    schemaVersion: 1,
    snapshotAt: '2026-08-01T08:00:00.000Z',
    items: [{
      tenantId: ACTIVE_TENANT_ID,
      displayName: 'Dune Collective',
      lifecycle: { status: lifecycleStatus, revision },
      onboardingState: 'complete',
      identityState: 'active',
      invitation: { id: null, state: 'none', revision: null, expiresAt: null },
      updatedAt: '2026-08-01T08:00:00.000Z',
    }],
    nextCursor: null,
  };
}

async function installDemoRoutes(page, { initialPersona = 'support_reader' } = {}) {
  const state = { persona: initialPersona, lifecycleStatus: 'active', revision: 3, requests: [] };
  await page.route('**/api/v1/platform/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const entry = {
      path,
      method: request.method(),
      headers: request.headers(),
      body: request.postDataJSON(),
    };
    state.requests.push(entry);

    if (path === '/api/v1/platform/demo/session' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(demoSession(state.persona)) });
      return;
    }
    if (path === '/api/v1/platform/demo/session/persona' && request.method() === 'PUT') {
      state.persona = entry.body?.persona;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(demoSession(state.persona)) });
      return;
    }
    if (path === '/api/v1/platform/demo/reset' && request.method() === 'POST') {
      state.persona = 'support_reader';
      state.lifecycleStatus = 'active';
      state.revision = 3;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          seedVersion: 'saas-3.5-shared-demo-v1',
          checksum: 'b'.repeat(64),
          requestId: '20000000-0000-4000-8000-000000000002',
        }),
      });
      return;
    }
    if (path === '/api/v1/platform/tenants' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(directoryPayload(state)) });
      return;
    }
    if (path === `/api/v1/platform/tenants/${ACTIVE_TENANT_ID}/lifecycle/transitions` && request.method() === 'POST') {
      state.lifecycleStatus = entry.body?.targetStatus;
      state.revision += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: 1,
          outcome: 'updated',
          lifecycle: {
            tenantId: ACTIVE_TENANT_ID,
            status: state.lifecycleStatus,
            revision: state.revision,
            changedAt: '2026-08-01T08:01:00.000Z',
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'NOT_FOUND' } }),
    });
  });
  return state;
}

function demoRoleSelect(page) {
  return page.locator('select[aria-label]').filter({ has: page.locator('option[value="tenant_operator"]') });
}

test('Demo bootstraps from the server session and fleet without browser authority', async ({ page }) => {
  const state = await installDemoRoutes(page);
  await page.addInitScript(() => {
    localStorage.setItem('platform_admin_demo_v1', JSON.stringify({ role: 'platform_security_admin' }));
    sessionStorage.setItem('platform_admin_demo_session', 'browser-authority-must-be-ignored');
  });
  await page.goto('/platform-admin-demo/');

  await expect(page.locator('meta[name="conference-runtime"]')).toHaveAttribute('content', 'demo');
  await expect(page.locator('meta[name="platform-demo-data"]')).toHaveAttribute('content', 'synthetic-server-backed');
  await expect(page.locator('#runtimeNotice')).toHaveAttribute('data-platform-admin-runtime', 'demo');
  await expect(page.locator('.platform-admin-fleet-card')).toHaveCount(1);
  await expect(page.locator('.platform-admin-fleet-card')).toContainText('Dune Collective');
  await expect(demoRoleSelect(page)).toHaveValue('support_reader');
  expect(state.requests.map(({ path, method }) => `${method} ${path}`)).toEqual([
    'GET /api/v1/platform/demo/session',
    'GET /api/v1/platform/tenants',
  ]);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({
    platform_admin_demo_v1: JSON.stringify({ role: 'platform_security_admin' }),
  });
});

test('Demo persona and lifecycle intents carry CSRF and mutation idempotency evidence', async ({ page }) => {
  const state = await installDemoRoutes(page);
  await page.goto('/platform-admin-demo/');
  await demoRoleSelect(page).selectOption('tenant_operator');
  await expect(demoRoleSelect(page)).toHaveValue('tenant_operator');
  await page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`).click();
  await page.locator('[data-platform-admin-navigate="lifecycle"]').click();
  await page.locator('[data-platform-action="suspend"]').click();
  await page.locator('#platformAdminActionReason').fill('Automated shared Demo lifecycle exercise');
  await page.locator('[data-platform-admin-confirm-action="suspend"]').click();
  await expect(page.locator('[data-platform-admin-section="lifecycle"] [data-state="suspended"]')).toBeVisible();

  const personaIntent = state.requests.find(({ path }) => path.endsWith('/demo/session/persona'));
  expect(personaIntent).toMatchObject({ method: 'PUT', body: { persona: 'tenant_operator' } });
  expect(personaIntent.headers['x-csrf-token']).toBe(CSRF_TOKEN);
  const lifecycleIntent = state.requests.find(({ path }) => path.endsWith('/lifecycle/transitions'));
  expect(lifecycleIntent).toMatchObject({
    method: 'POST',
    body: {
      targetStatus: 'suspended',
      expectedRevision: 3,
      reason: 'Automated shared Demo lifecycle exercise',
      confirmation: { action: 'tenant.lifecycle.transition', tenantId: ACTIVE_TENANT_ID },
    },
  });
  expect(lifecycleIntent.headers['x-csrf-token']).toBe(CSRF_TOKEN);
  expect(lifecycleIntent.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
});

test('Demo reset is a confirmed server intent and restores the server-issued baseline', async ({ page }) => {
  const state = await installDemoRoutes(page, { initialPersona: 'tenant_operator' });
  await page.goto('/platform-admin-demo/');
  await expect(demoRoleSelect(page)).toHaveValue('tenant_operator');
  await page.locator('[data-platform-admin-demo-reset]').click();
  const resetDialog = page.getByRole('dialog');
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByRole('button', { name: /reset|zurücksetzen/i }).click();
  await expect(demoRoleSelect(page)).toHaveValue('support_reader');
  await expect(page).toHaveURL(/#fleet$/);

  const resetIntent = state.requests.find(({ path }) => path.endsWith('/demo/reset'));
  expect(resetIntent).toMatchObject({ method: 'POST', body: { confirm: true } });
  expect(resetIntent.headers['x-csrf-token']).toBe(CSRF_TOKEN);
  expect(state.requests.filter(({ path }) => path.endsWith('/demo/session'))).toHaveLength(2);
});

test('Demo fails closed when its session or fleet contract is unavailable', async ({ page }) => {
  await page.route('**/api/v1/platform/demo/session', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'DEMO_RUNTIME_UNAVAILABLE' } }),
  }));
  await page.goto('/platform-admin-demo/');
  await expect(page.locator('.platform-admin-session-gate')).toBeVisible();
  await expect(page.locator('.platform-admin-fleet-card')).toHaveCount(0);
  await expect(page.locator('[data-platform-admin-demo-reset]')).toHaveCount(0);

  await page.unrouteAll({ behavior: 'wait' });
  await page.route('**/api/v1/platform/demo/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(demoSession('support_reader')),
  }));
  await page.route('**/api/v1/platform/tenants?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ tenants: [] }),
  }));
  await page.goto('/platform-admin-demo/');
  await expect(page.locator('.platform-admin-error')).toBeVisible();
  await expect(page.locator('.platform-admin-fleet-card')).toHaveCount(0);
});

test('Demo shell keeps semantic, keyboard, focus, and responsive smoke guarantees', async ({ page }) => {
  await installDemoRoutes(page);
  await page.goto('/platform-admin-demo/');
  await expect(page.locator('nav')).toHaveCount(1);
  await expect(page.locator('main#mainContent')).toHaveCount(1);
  await expect(page.locator('h1#viewTitle')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#skipLink')).toBeFocused();
  await expect(page.locator('#skipLink')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#mainContent$/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const unnamedButtons = await page.locator('button').evaluateAll((buttons) => (
    buttons.filter((button) => !button.textContent?.trim() && !button.getAttribute('aria-label')).length
  ));
  expect(unnamedButtons).toBe(0);
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
      permissions: ROLE_PROJECTIONS.tenant_operator.permissions,
      assurance: { level: 'mfa', authenticatedAt: '2099-01-01T00:00:00.000Z' },
      expiresAt: '2099-01-01T01:00:00.000Z',
      stepUpExpiresAt: null,
      csrfToken: CSRF_TOKEN,
    }),
  }));
  await page.route('**/api/v1/platform/tenants?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(directoryPayload()),
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
      permissions: ROLE_PROJECTIONS.tenant_operator.permissions,
      assurance: { level: 'mfa', authenticatedAt: '2099-01-01T00:00:00.000Z' },
      expiresAt: '2099-01-01T01:00:00.000Z',
      stepUpExpiresAt: null,
      csrfToken: CSRF_TOKEN,
    }),
  }));
  const directoryRequests = [];
  await page.route('**/api/v1/platform/tenants?*', async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    directoryRequests.push(cursor);
    if (!cursor) await new Promise((resolve) => setTimeout(resolve, 200));
    const tenant = directoryPayload().items[0];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 1,
        snapshotAt: '2026-08-01T08:00:00.000Z',
        items: [{
          ...tenant,
          tenantId: cursor ? '10000000-0000-4000-8000-000000000005' : ACTIVE_TENANT_ID,
          displayName: cursor ? 'Elm Partners' : 'Dune Collective',
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
