import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

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

test('private provider cards show dated usage, native meters, thresholds and unknown billing in both languages', async ({ page }) => {
  await installDemoRoutes(page);
  const report = {
    schemaVersion: 1, collectionMode: 'operator_snapshot', accessMode: 'shared_owner_password',
    evaluatedAt: '2026-10-17T00:00:00.000Z', observedAt: '2026-10-15T00:00:00.000Z',
    periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-11-01T00:00:00.000Z', freshness: 'stale',
    alertDelivery: 'not_configured', costState: 'unknown',
    neon: { plan: 'launch_v3', source: 'neon_control_plane', referenceBasis: 'published_launch_model',
      referenceObservedAt: '2026-10-01T00:00:00.000Z', usedBytes: 260_000_000_000,
      referenceBytes: 500_000_000_000, projectedBytes: 575_714_285_715, utilizationPercent: 52,
      projectedUtilizationPercent: 115.14, crossedThresholds: [50], projectedExhaustion: true,
      anomalyState: 'insufficient_baseline' }, render: { usageState: 'unknown_monthly_usage' },
    github: { usageState: 'unknown_billing_usage' },
  };
  let reads = 0;
  await page.route('**/api/v1/platform/demo/provider-usage', async (route) => {
    expect(route.request().method()).toBe('GET');
    expect(new URL(route.request().url()).search).toBe('');
    expect(route.request().postData()).toBeNull();
    reads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
  });
  await page.goto('/platform-admin-demo/');
  const open = page.locator('[data-platform-admin-fleet-view="providers"]');
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-platform-provider-report]')).toBeVisible();
  await expect(page.locator('#viewTitle')).toBeFocused();
  await expect(page.locator('meter')).toHaveAttribute('value', '260000000000');
  await expect(page.locator('label[for="platformProviderNeonMeter"]')).toContainText('52');
  await expect(page.locator('[data-platform-provider="neon"]')).toContainText('keine Ausgabensperre');
  await expect(page.locator('[data-platform-provider="render"]')).toContainText('Unbekannt');
  await expect(page.locator('[data-platform-provider="github"]')).toContainText('Unbekannt');
  await expect(page.locator('.platform-admin-provider-thresholds [data-tone="critical"]')).toHaveCount(1);
  await expect(page.locator('[data-platform-provider-report]')).toContainText('veraltet');
  await expect(page.locator('[data-platform-provider-report]')).toContainText('keine Warn-E-Mails');
  await page.locator('select[aria-label="Sprache"]').selectOption('en');
  await expect(page.locator('#viewTitle')).toHaveText('Providers & usage');
  await expect(page.locator('[data-platform-provider="render"]')).toContainText('Unknown');
  await expect(page.locator('[data-platform-provider-report]')).toContainText('Snapshot stale');
  await page.locator('[data-platform-provider-refresh]').click();
  await expect(page.locator('[data-platform-provider-report]')).toBeVisible();
  expect(reads).toBe(2);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('Provider snapshots age across navigation without automatic reads and retain expiry/refresh focus', async ({ page }) => {
  let report = JSON.parse(readFileSync(new URL('../support/provider-usage-fixture.json', import.meta.url), 'utf8'));
  await page.clock.install({ time: new Date(report.evaluatedAt) });
  await installDemoRoutes(page);
  let reads = 0;
  await page.route('**/api/v1/platform/demo/provider-usage', async (route) => {
    reads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
  });
  await page.goto('/platform-admin-demo/');
  const providers = page.locator('[data-platform-admin-fleet-view="providers"]');
  const status = page.locator('[data-platform-provider-freshness]');
  await providers.click(); await expect(status).toHaveAttribute('data-platform-provider-freshness', 'fresh');
  const directory = page.locator('[data-platform-admin-fleet-view="directory"]');
  await directory.click(); await focusAfterNavigationTransition(page, directory);
  await page.clock.fastForward(43_200_001);
  await expect(directory).toBeFocused(); expect(reads).toBe(1);
  await providers.click(); await expect(status).toHaveAttribute('data-platform-provider-freshness', 'stale');
  expect(reads).toBe(1);
  // A separately saved newer operator extract becomes available before a manual reload.
  report = JSON.parse(readFileSync(new URL('../support/provider-usage-refreshed-fixture.json', import.meta.url), 'utf8'));
  const refresh = page.locator('[data-platform-provider-refresh]');
  await focusAfterNavigationTransition(page, refresh); await page.keyboard.press('Enter');
  await expect(status).toHaveAttribute('data-platform-provider-freshness', 'fresh');
  await expect(page.locator('#viewTitle')).toBeFocused(); expect(reads).toBe(2);
  await refresh.focus(); await page.clock.fastForward(86_400_001); await page.clock.runFor(20);
  await expect(status).toHaveAttribute('data-platform-provider-freshness', 'stale');
  await expect(page.locator('#viewTitle')).toBeFocused(); expect(reads).toBe(2);
});

test('private provider failures retry safely and malformed provider payloads do not render', async ({ page }) => {
  await installDemoRoutes(page);
  let malformed = false;
  await page.route('**/api/v1/platform/demo/provider-usage', (route) => route.fulfill({
    status: malformed ? 200 : 404, contentType: 'application/json',
    body: JSON.stringify(malformed ? { ownerEmail: 'private@example.invalid' } : { error: { code: 'PLATFORM_NOT_FOUND' } }),
  }));
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="providers"]').click();
  await expect(page.getByRole('heading', { name: 'Anbieterübersicht nicht verfügbar' })).toBeVisible();
  malformed = true;
  await page.locator('[data-platform-provider-refresh]').click();
  await expect(page.getByRole('heading', { name: 'Anbieterübersicht nicht verfügbar' })).toBeVisible();
  await expect(page.locator('meter')).toHaveCount(0);
  await expect(page.locator('#app')).not.toContainText('private@example.invalid');
});


test('private product and delivery shows genuine unknowns, weekly trends, keyboard details and locale changes', async ({ page }, testInfo) => {
  await installDemoRoutes(page);
  let report = JSON.parse(readFileSync(new URL('../support/product-delivery-fixture.json', import.meta.url), 'utf8'));
  let reads = 0;
  await page.route('**/api/v1/platform/demo/product-delivery', async (route) => {
    expect(route.request().method()).toBe('GET');
    expect(new URL(route.request().url()).search).toBe('');
    expect(route.request().postData()).toBeNull();
    reads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
  });
  await page.goto('/platform-admin-demo/');
  const open = page.locator('[data-platform-admin-fleet-view="product-delivery"]');
  await open.focus(); await page.keyboard.press('Enter');
  const view = page.locator('[data-product-delivery-report]');
  await expect(view).toBeVisible();
  await expect(page.locator('#viewTitle')).toBeFocused();
  await expect(view.locator('[data-product-metric="request_submitted"] strong')).toHaveText('Unbekannt');
  await expect(view.locator('[data-product-feedback]')).toContainText('noch nicht angebunden');
  await expect(view.locator('[data-product-delivery-component]')).toHaveCount(3);
  await expect(view.locator('[data-product-delivery-component="api"] details')).toHaveCount(4);
  const older = view.locator('[data-product-delivery-component="api"] details').nth(1);
  await older.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(older).toHaveAttribute('open', '');
  await expect(older.locator('[data-product-metric="change_failure_rate"] strong')).toHaveText('Unbekannt');
  const screenshot = testInfo.outputPath('product-delivery-overview.png');
  // WebKit limits a single image dimension to 32767px. Keep a viewport overview
  // and every metric card separately so the expanded mobile report is covered.
  await page.screenshot({ path: screenshot });
  await testInfo.attach('product-delivery-overview', { path: screenshot, contentType: 'image/png' });
  const evidenceCards = view.locator(':scope > section.card, [data-product-delivery-component]');
  for (let index = 0; index < await evidenceCards.count(); index += 1) {
    const path = testInfo.outputPath(`product-delivery-card-${index}.png`);
    await evidenceCards.nth(index).screenshot({ path });
    await testInfo.attach(`product-delivery-card-${index}`, { path, contentType: 'image/png' });
  }
  await page.locator('select[aria-label="Sprache"]').selectOption('en');
  await expect(page.locator('#viewTitle')).toHaveText('Product & delivery');
  await expect(view.locator('[data-product-metric="request_submitted"] strong')).toHaveText('Unknown');
  report = JSON.parse(readFileSync(new URL('../support/product-delivery-known-fixture.json', import.meta.url), 'utf8'));
  await page.locator('[data-product-delivery-refresh]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#viewTitle')).toBeFocused();
  await expect(view).toBeVisible();
  expect(reads).toBe(2);
  await expect(view.locator('[data-product-metric="request_submitted"] strong')).toHaveText('1');
  await expect(view.locator('[data-product-metric="recovery_failure_rate"] strong')).toHaveText('25%');
  const api = view.locator('[data-product-delivery-component="api"]');
  await expect(api.locator('details').first().locator('[data-product-metric="change_lead_time"] strong')).toHaveText('0.5 s');
  await page.locator('select[aria-label="Language"]').selectOption('de');
  await expect(api.locator('details').first().locator('[data-product-metric="change_lead_time"] strong')).toHaveText('0,5 s');
  await expect(view.locator('[data-product-metric="recovery_failure_rate"] strong')).toHaveText(/25\s%/u);
  expect(await api.locator('details[open] .platform-admin-definition-list > div').evaluateAll((rows) =>
    rows.every((row) => row.querySelector('dd').getBoundingClientRect().top
      >= row.querySelector('dt').getBoundingClientRect().bottom))).toBe(true);
  const knownScreenshot = testInfo.outputPath('product-delivery-known-api.png');
  await api.screenshot({ path: knownScreenshot });
  await testInfo.attach('product-delivery-known-api', { path: knownScreenshot, contentType: 'image/png' });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const enlargedScreenshot = testInfo.outputPath('product-delivery-text-200.png');
  await api.screenshot({ path: enlargedScreenshot });
  await testInfo.attach('product-delivery-text-200', { path: enlargedScreenshot, contentType: 'image/png' });
});

test('protected operator sources retain provenance, unknown feedback, keyboard details, locale and reflow', async ({ page }) => {
  await installDemoRoutes(page);
  const automatic = JSON.parse(readFileSync(new URL('../support/product-delivery-fixture.json', import.meta.url), 'utf8'));
  const sources = JSON.parse(readFileSync(new URL('../support/operations-sources-fixture.json', import.meta.url), 'utf8'));
  await page.route('**/api/v1/platform/demo/product-delivery', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(automatic),
  }));
  await page.route('**/api/v1/platform/demo/operations-sources', (route) => {
    expect(route.request().method()).toBe('GET'); expect(route.request().postData()).toBeNull();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sources) });
  });
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="product-delivery"]').click();
  const manual = page.locator('[data-operator-source="manual"]');
  const feedback = page.locator('[data-operator-source="feedback"]');
  await expect(manual).toContainText('Vom Betreiber bestätigt');
  await expect(feedback).toContainText('Unbekannt / unvollständig');
  await expect(feedback.locator('dd').first()).toHaveText('Unbekannt');
  const older = manual.locator('[data-product-delivery-component="api"] details').nth(1);
  await older.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(older).toHaveAttribute('open', '');
  await page.locator('select[aria-label="Sprache"]').selectOption('en');
  await expect(manual).toContainText('Operator-confirmed');
  await expect(feedback.locator('dd').first()).toHaveText('Unknown');
  await expect(page.locator('#app')).not.toContainText('synthetic-owner');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
});

test('final optional source authority failure suppresses the already fetched protected report', async ({ page }) => {
  await installDemoRoutes(page);
  const automatic = JSON.parse(readFileSync(new URL('../support/product-delivery-known-fixture.json', import.meta.url), 'utf8'));
  await page.route('**/api/v1/platform/demo/product-delivery', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(automatic),
  }));
  let status = 401;
  await page.route('**/api/v1/platform/demo/operations-sources', (route) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify({ error: { code: 'PLATFORM_FORBIDDEN' } }),
  }));
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="product-delivery"]').click();
  await expect(page.getByRole('heading', { name: 'Produktübersicht nicht verfügbar' })).toBeVisible();
  await expect(page.locator('[data-product-delivery-report]')).toHaveCount(0);
  status = 403;
  await page.locator('[data-product-delivery-refresh]').click();
  await expect(page.getByRole('heading', { name: 'Produktübersicht nicht verfügbar' })).toBeVisible();
  await expect(page.locator('[data-product-delivery-report]')).toHaveCount(0);
});

test('private product failures and forged content fail closed and Production refuses the Demo-only adapter', async ({ page }) => {
  await installDemoRoutes(page);
  let malformed = false;
  await page.route('**/api/v1/platform/demo/product-delivery', (route) => route.fulfill({
    status: malformed ? 200 : 404, contentType: 'application/json',
    body: JSON.stringify(malformed ? { customerFreeText: 'must-not-render-private-content' }
      : { error: { code: 'PLATFORM_NOT_FOUND' } }),
  }));
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="product-delivery"]').click();
  await expect(page.getByRole('heading', { name: 'Produktübersicht nicht verfügbar' })).toBeVisible();
  malformed = true;
  await page.locator('[data-product-delivery-refresh]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#viewTitle')).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Produktübersicht nicht verfügbar' })).toBeVisible();
  await expect(page.locator('[data-product-delivery-report]')).toHaveCount(0);
  await expect(page.locator('#app')).not.toContainText('must-not-render-private-content');
  const refusal = await page.evaluate(async () => {
    const { createPlatformAdminApplication } = await import('/src/platform-admin/application.js');
    try { createPlatformAdminApplication({ runtime: 'production', productDelivery: { async load() {} } }); }
    catch (error) { return error.message; }
    return null;
  });
  expect(refusal).toBe('PLATFORM_ADMIN_PRODUCT_DELIVERY_INVALID');
});


async function focusAfterNavigationTransition(page, navigation) {
  // Navigation deliberately transfers focus on the next animation frame. Let
  // that contract finish before simulating the user's subsequent focus move.
  await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  await expect(page.locator('#viewTitle')).toBeFocused();
  await navigation.focus();
}

test('slow Product navigation deduplicates its pending read and retains keyboard focus across refresh', async ({ page }) => {
  await installDemoRoutes(page);
  const report = JSON.parse(readFileSync(new URL('../support/product-delivery-fixture.json', import.meta.url), 'utf8'));
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  let reads = 0;
  await page.route('**/api/v1/platform/demo/product-delivery', async (route) => {
    reads += 1;
    await blocked;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
  });
  await page.goto('/platform-admin-demo/');
  const product = page.locator('[data-platform-admin-fleet-view="product-delivery"]');
  const request = page.waitForRequest('**/api/v1/platform/demo/product-delivery');
  await product.click(); await request;
  const directory = page.locator('[data-platform-admin-fleet-view="directory"]');
  await directory.click(); await product.click();
  await expect(page.locator('#app [role="status"]')).toBeVisible();
  expect(reads).toBe(1);
  await directory.click(); await focusAfterNavigationTransition(page, directory);
  const response = page.waitForResponse('**/api/v1/platform/demo/product-delivery');
  release(); await (await response).finished();
  await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  await expect(directory).toBeFocused();
  await product.click();
  await expect(page.locator('[data-product-delivery-report]')).toBeVisible();
  expect(reads).toBe(1);
  await page.locator('[data-product-delivery-refresh]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[data-product-delivery-report]')).toBeVisible();
  await expect(page.locator('#viewTitle')).toBeFocused();
  expect(reads).toBe(2);
});


test('Product cache ages on revisit and evicts retained data in a long-lived visible tab', async ({ page }) => {
  const known = JSON.parse(readFileSync(new URL('../support/product-delivery-known-fixture.json', import.meta.url), 'utf8'));
  const expired = JSON.parse(readFileSync(new URL('../support/product-delivery-expired-fixture.json', import.meta.url), 'utf8'));
  const start = Date.parse(known.evaluatedAt); const day = 86_400_000;
  await page.clock.install({ time: new Date(start) });
  await installDemoRoutes(page);
  let serverTime = start; let reads = 0;
  await page.route('**/api/v1/platform/demo/product-delivery', async (route) => {
    reads += 1;
    const report = serverTime - start >= 30 * day ? expired
      : { ...known, evaluatedAt: new Date(serverTime).toISOString(),
        freshness: serverTime - start >= day ? 'stale' : 'fresh' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
  });
  await page.goto('/platform-admin-demo/');
  const product = page.locator('[data-platform-admin-fleet-view="product-delivery"]');
  const view = page.locator('[data-product-delivery-report]');
  await product.click(); await expect(view).toBeVisible(); expect(reads).toBe(1);
  const directory = page.locator('[data-platform-admin-fleet-view="directory"]');
  await directory.click(); await focusAfterNavigationTransition(page, directory);
  serverTime += day;
  await page.clock.fastForward(day);
  expect(reads).toBe(1);
  await expect(directory).toBeFocused();
  await product.click(); await expect(view).toBeVisible(); expect(reads).toBe(2);
  await expect(view.locator('[role="status"][data-tone="critical"]')).toBeVisible();
  await view.locator('[data-product-delivery-refresh]').focus();
  // The browser clock accepts bounded signed-32-bit durations. Advance each
  // daily cache wake-up without wrapping a single 29-day duration into the past.
  for (let remainingDays = 29; remainingDays > 0; remainingDays -= 1) {
    serverTime += day;
    await page.clock.fastForward(day);
  }
  await expect(view.locator('[data-product-metric="request_submitted"] strong')).toHaveText('Unbekannt');
  await expect(view.locator('[data-product-feedback]')).toContainText('noch nicht angebunden');
  expect(reads).toBe(3);
  await page.clock.runFor(20);
  await expect(page.locator('#viewTitle')).toBeFocused();
});

test('daily live metrics show actual stock and provider samples without inventing outcomes', async ({ page }, testInfo) => {
  await installDemoRoutes(page);
  const report = JSON.parse(readFileSync(new URL('../support/daily-live-metrics-fixture.json', import.meta.url), 'utf8'));
  let reads = 0;
  await page.route('**/api/v1/platform/demo/live-metrics', async (route) => {
    expect(route.request().method()).toBe('GET');
    expect(new URL(route.request().url()).search).toBe('');
    expect(route.request().postData()).toBeNull(); reads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
  });
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="product-delivery"]').focus();
  await page.keyboard.press('Enter');
  const stock = page.locator('[data-live-metrics="product"]');
  await expect(stock).toBeVisible();
  await expect(stock).toContainText('23');
  await expect(stock).toContainText('Seed');
  await expect(page.locator('[data-product-metric="request_submitted"] strong')).toHaveText('Unbekannt');
  await page.locator('select[aria-label="Sprache"]').selectOption('en');
  await expect(stock).toContainText('23');
  await expect(stock).toContainText('seed');
  await page.locator('[data-platform-admin-fleet-view="providers"]').click();
  const providers = page.locator('[data-live-metrics="providers"]');
  await expect(providers).toBeVisible();
  await expect(providers).toContainText('0.5');
  await expect(providers).toContainText('Latest sample:');
  await expect(providers).toContainText('start not supplied');
  await expect(providers).toContainText('Unknown');
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const screenshot = testInfo.outputPath('daily-live-provider-synthetic.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('daily-live-provider-synthetic', { path: screenshot, contentType: 'image/png' });
});
