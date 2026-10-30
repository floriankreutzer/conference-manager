import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const ACTIVE_TENANT_ID = '10000000-0000-4000-8000-000000000004';
const REQUEST_ID = '20000000-0000-4000-8000-000000000001';
const CSRF_TOKEN = 'c'.repeat(43);

const ROLE_PROJECTIONS = Object.freeze({
  security_admin: Object.freeze({
    role: 'platform_security_admin',
    permissions: ['platform:tenant:read', 'platform:diagnostics:read', 'platform:diagnostics:sensitive',
      'platform:recovery:execute', 'platform:audit:read', 'platform:session:revoke',
      'platform:operator:manage', 'platform:break-glass:manage'],
    assurance: 'step_up',
  }),
  security_auditor: Object.freeze({
    role: 'platform_security_auditor',
    permissions: ['platform:tenant:read', 'platform:diagnostics:read', 'platform:diagnostics:sensitive',
      'platform:audit:read', 'platform:audit:export', 'platform:runtime:read'],
    assurance: 'step_up',
  }),
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

function insightsTab(page, area, id) {
  return page.locator(`[data-insights-tabs="${area}-insights"] [data-insights-tab="${id}"]`);
}

async function selectedInsightsPanel(page, area, id) {
  const tab = insightsTab(page, area, id);
  await expect(tab).toHaveAttribute('role', 'tab');
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(tab).toHaveAttribute('tabindex', '0');
  const panel = page.locator(`[id="${await tab.getAttribute('aria-controls')}"]`);
  await expect(panel).toHaveAttribute('role', 'tabpanel');
  await expect(panel).toHaveAttribute('aria-labelledby', await tab.getAttribute('id'));
  await expect(panel).toHaveAttribute('data-insights-panel', id);
  await expect(panel).toBeVisible();
  return panel;
}

async function selectInsightsTab(page, area, id) {
  await insightsTab(page, area, id).click();
  return selectedInsightsPanel(page, area, id);
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
  const requests = state.requests.map(({ path, method }) => `${method} ${path}`);
  expect(requests.slice(0, 2)).toEqual([
    'GET /api/v1/platform/demo/session',
    'GET /api/v1/platform/tenants',
  ]);
  // These independent, permission-qualified reads hydrate the customer cards.
  // Keep the exact allowlist: no writes, audit access or browser-selected source.
  expect(requests.slice(2).sort()).toEqual([
    'GET /api/v1/platform/microsoft365/health',
    'GET /api/v1/platform/readiness',
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
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Mandant sperren', exact: true })).toBeVisible();
  await page.locator('#platformAdminActionReason').fill('Automated shared Demo lifecycle exercise');
  await page.locator('[data-platform-admin-confirm-action="suspend"]').click();
  const suspendedStatuses = page.locator('[data-platform-admin-section="lifecycle"] [data-state="suspended"]');
  await expect(suspendedStatuses).toHaveCount(2);
  await expect(suspendedStatuses.first()).toBeVisible();

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
  await expect(page.locator('[data-authentication-surface="platform"]')).toHaveAttribute('data-platform-admin-runtime', 'production');
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
  await page.getByRole('button', { name: 'Mit Microsoft anmelden', exact: true }).click();
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

for (const locale of ['de', 'en']) test(`late directory summaries retain keyboard navigation in ${locale}`, async ({ page }) => {
  await installDemoRoutes(page);
  let releaseSummary;
  const summaryPending = new Promise(resolve => { releaseSummary = resolve; });
  let summaryReads = 0;
  await page.route('**/api/v1/platform/readiness**', async route => {
    summaryReads++;
    await summaryPending;
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND' } }) });
  });
  let providerReads = 0;
  const report = readFileSync(new URL('../support/provider-usage-fixture.json', import.meta.url), 'utf8');
  await page.route('**/api/v1/platform/demo/provider-usage', async route => {
    providerReads++;
    await route.fulfill({ contentType: 'application/json', body: report });
  });
  await page.goto('/platform-admin-demo/');
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption(locale);
  await expect.poll(() => summaryReads).toBe(1);
  const open = page.locator('[data-platform-admin-fleet-view="providers"]');
  await open.focus();
  releaseSummary();
  await expect(page.locator('.platform-admin-fleet-card')).toHaveCount(1);
  await expect(open).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-platform-provider-report]')).toBeVisible();
  await expect(page.locator('#viewTitle')).toHaveText(locale === 'de' ? 'Anbieter & Verbrauch' : 'Providers & usage');
  await expect(page.locator('#viewTitle')).toBeFocused();
  expect(providerReads).toBe(1);
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
  const overview = await selectedInsightsPanel(page, 'provider', 'overview');
  await expect(overview.locator('[data-platform-provider]')).toHaveCount(4);
  expect(await overview.locator('[data-platform-provider]').evaluateAll((cards) =>
    cards.map((card) => card.dataset.platformProvider))).toEqual(['neon', 'render', 'resend', 'github']);
  await expect(page.locator('#platformProviderNeonMeter')).toBeVisible();
  await expect(page.locator('#platformProviderNeonMeter')).toHaveAttribute('value', '260000000000');
  await expect(page.locator('label[for="platformProviderNeonMeter"]')).toContainText('52');
  const neonDetails = overview.locator('[data-platform-provider="neon"] details');
  await expect(neonDetails).not.toHaveAttribute('open');
  await neonDetails.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(neonDetails).toHaveAttribute('open', '');
  await expect(page.locator('[data-platform-provider="neon"]')).toContainText('keine Ausgabensperre');
  await expect(page.locator('[data-platform-provider="render"]')).toContainText('Unbekannt');
  await expect(page.locator('[data-platform-provider="github"]')).toContainText('Unbekannt');
  await selectInsightsTab(page, 'provider', 'usage');
  await expect(page.locator('[data-provider-neon-details]')).toBeVisible();
  await expect(page.locator('.platform-admin-provider-thresholds [data-tone="critical"]')).toHaveCount(1);
  await expect(page.locator('[data-platform-provider-report]')).toContainText('veraltet');
  const sources = await selectInsightsTab(page, 'provider', 'sources');
  const alerts = sources.locator('details').filter({ has: page.getByText('Warnungen', { exact: true }) });
  await expect(alerts).not.toHaveAttribute('open');
  await alerts.locator(':scope > summary').click();
  await expect(alerts).toHaveAttribute('open', '');
  await expect(page.locator('[data-platform-provider-report]')).toContainText('keine Warn-E-Mails');
  await page.locator('select[aria-label="Sprache"]').selectOption('en');
  await expect(page.locator('#viewTitle')).toHaveText('Providers & usage');
  await selectedInsightsPanel(page, 'provider', 'sources');
  await selectInsightsTab(page, 'provider', 'overview');
  await expect(page.locator('[data-platform-provider="render"]')).toContainText('Unknown');
  await expect(page.locator('[data-platform-provider-freshness]')).toContainText('observation is stale');
  await selectInsightsTab(page, 'provider', 'usage');
  await page.locator('[data-platform-provider-refresh]').click();
  await expect(page.locator('[data-platform-provider-report]')).toBeVisible();
  expect(reads).toBe(2);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('Provider revisits and visible expiry read the latest stored report once without polling or mutations', async ({ page }) => {
  let report = JSON.parse(readFileSync(new URL('../support/provider-usage-fixture.json', import.meta.url), 'utf8'));
  await page.clock.install({ time: new Date(report.evaluatedAt) });
  await installDemoRoutes(page);
  let reads = 0;
  await page.route('**/api/v1/platform/demo/provider-usage', async (route) => {
    expect(route.request().method()).toBe('GET');
    expect(new URL(route.request().url()).search).toBe('');
    expect(route.request().postData()).toBeNull();
    reads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
  });
  await page.goto('/platform-admin-demo/');
  const providers = page.locator('[data-platform-admin-fleet-view="providers"]');
  const status = page.locator('[data-platform-provider-freshness]');
  const meter = page.locator('#platformProviderNeonMeter');
  await providers.click(); await expect(status).toHaveAttribute('data-platform-provider-freshness', 'fresh');
  await expect(meter).toHaveAttribute('value', String(report.neon.usedBytes));
  const directory = page.locator('[data-platform-admin-fleet-view="directory"]');
  await directory.click(); await focusAfterNavigationTransition(page, directory);
  await page.clock.fastForward(43_200_001);
  await expect(directory).toBeFocused(); expect(reads).toBe(1);
  // Returning reads the separately saved new report; it never starts collection.
  report = JSON.parse(readFileSync(new URL('../support/provider-usage-refreshed-fixture.json', import.meta.url), 'utf8'));
  await providers.click(); await expect(status).toHaveAttribute('data-platform-provider-freshness', 'fresh');
  await expect(meter).toHaveAttribute('value', String(report.neon.usedBytes));
  expect(reads).toBe(2);
  const refresh = page.locator('[data-platform-provider-refresh]');
  await focusAfterNavigationTransition(page, refresh); await page.keyboard.press('Enter');
  await expect(status).toHaveAttribute('data-platform-provider-freshness', 'fresh');
  await expect(page.locator('#viewTitle')).toBeFocused(); expect(reads).toBe(3);
  report = { ...report, freshness: 'stale',
    evaluatedAt: new Date(Date.parse(report.observedAt) + 86_400_001).toISOString() };
  await refresh.focus(); await page.clock.fastForward(86_400_001); await page.clock.runFor(20);
  await expect(status).toHaveAttribute('data-platform-provider-freshness', 'stale');
  await expect(page.locator('#viewTitle')).toBeFocused(); expect(reads).toBe(4);
  await page.clock.fastForward(300_001);
  expect(reads).toBe(4);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => reads).toBe(5);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
  });
  await page.clock.runFor(20);
  expect(reads).toBe(5);
});

test('a fresh daily envelope cannot label an old provider observation current or start a read loop', async ({ page }) => {
  const report = JSON.parse(readFileSync(new URL('../support/daily-live-metrics-fixture.json', import.meta.url), 'utf8'));
  report.evaluatedAt = report.productDelivery.evaluatedAt = '2026-10-16T00:00:00.000Z';
  Object.assign(report.measurements.find((row) => row.id === 'render_customer_bandwidth'), {
    observedAt: '2026-10-14T23:00:00.000Z', periodStart: '2026-10-13T23:00:00.000Z',
    periodEnd: '2026-10-14T23:00:00.000Z', sampleAt: '2026-10-14T22:00:00.000Z',
  });
  await page.clock.install({ time: new Date(report.evaluatedAt) });
  await installDemoRoutes(page);
  let reads = 0;
  await page.route('**/api/v1/platform/demo/live-metrics', (route) => {
    reads += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
  });
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="providers"]').click();
  const status = page.locator('[data-platform-provider-freshness]');
  const render = page.locator('[data-platform-provider="render"] > header .platform-admin-status');
  const resend = page.locator('[data-platform-provider="resend"] > header .platform-admin-status');
  await expect(status).toHaveAttribute('data-platform-provider-freshness', 'stale');
  await expect(render).toHaveText('Quelle veraltet');
  await expect(resend).toHaveText('Daten teilweise vorhanden');
  await page.locator('select[aria-label="Sprache"]').selectOption('en');
  await expect(render).toHaveText('Source stale');
  await expect(status).toContainText('observation is stale');
  await page.clock.fastForward(300_001);
  expect(reads).toBe(1);
  // An already stale row must not disable the later deadline of another source.
  report.evaluatedAt = report.productDelivery.evaluatedAt = '2026-10-16T12:00:00.000Z';
  report.freshness = report.productDelivery.freshness = 'stale';
  await page.clock.fastForward(43_200_000 - 300_001);
  await expect.poll(() => reads).toBe(2);
  await expect(resend).toHaveText('Source stale');
  await page.clock.fastForward(300_001);
  expect(reads).toBe(2);
});

test('Neon card and summary expire together before the bounded stored-report retry', async ({ page }) => {
  let report = JSON.parse(readFileSync(new URL('../support/provider-usage-fixture.json', import.meta.url), 'utf8'));
  report.evaluatedAt = '2026-10-15T23:58:00.000Z';
  const start = Date.parse(report.evaluatedAt);
  await page.clock.install({ time: new Date(start) });
  await installDemoRoutes(page);
  let reads = 0;
  await page.route('**/api/v1/platform/demo/provider-usage', (route) => {
    reads += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
  });
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="providers"]').click();
  const status = page.locator('[data-platform-provider-freshness]');
  const neon = page.locator('[data-platform-provider="neon"] > header .platform-admin-status');
  await expect(status).toHaveAttribute('data-platform-provider-freshness', 'fresh');
  await expect(neon).toHaveText('Quelle aktuell');
  await page.clock.fastForward(120_001);
  await expect(status).toHaveAttribute('data-platform-provider-freshness', 'stale');
  await expect(neon).toHaveText('Quelle veraltet');
  expect(reads).toBe(1);
  report = { ...report, evaluatedAt: new Date(start + 300_002).toISOString(), freshness: 'stale' };
  await page.clock.fastForward(180_001);
  await expect.poll(() => reads).toBe(2);
  await expect(neon).toHaveText('Quelle veraltet');
  await page.clock.fastForward(300_001);
  expect(reads).toBe(2);
});

test('returning before five minutes repaints a provider sample that expired while hidden without another read', async ({ page }) => {
  const report = JSON.parse(readFileSync(new URL('../support/daily-live-metrics-fixture.json', import.meta.url), 'utf8'));
  const neon = JSON.parse(readFileSync(new URL('../support/provider-usage-fixture.json', import.meta.url), 'utf8'));
  report.evaluatedAt = report.productDelivery.evaluatedAt = neon.evaluatedAt = '2026-10-16T10:58:00.000Z';
  neon.freshness = 'stale';
  report.providerUsage = neon;
  await page.clock.install({ time: new Date(report.evaluatedAt) });
  await installDemoRoutes(page);
  let reads = 0;
  await page.route('**/api/v1/platform/demo/live-metrics', (route) => {
    reads += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
  });
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="providers"]').click();
  const summary = page.locator('[data-platform-provider-freshness]');
  const render = page.locator('[data-platform-provider="render"] > header .platform-admin-status');
  await expect(summary).toHaveAttribute('data-platform-provider-freshness', 'stale');
  await expect(render).toHaveText('Daten teilweise vorhanden');
  // Supply the browser lifecycle state explicitly so both headless engines
  // exercise the same hidden-expiry and visible-return event sequence.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(120_001);
  expect(reads).toBe(1);
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(summary).toHaveAttribute('data-platform-provider-freshness', 'stale');
  await expect(render).toHaveText('Quelle veraltet');
  await selectInsightsTab(page, 'provider', 'usage');
  await expect(page.locator('[data-live-metric="render_customer_bandwidth"] .platform-admin-status'))
    .toHaveText('Messpunkt älter als 24 Stunden');
  expect(reads).toBe(1);
});

test('Resend quota meters require complete matching windows while retaining the reported amounts', async ({ page }) => {
  const report = JSON.parse(readFileSync(new URL('../support/daily-live-metrics-fixture.json', import.meta.url), 'utf8'));
  const sent = report.measurements.find((row) => row.id === 'resend_monthly_sent');
  const limit = report.measurements.find((row) => row.id === 'resend_monthly_limit');
  Object.assign(limit, { ...sent, id: limit.id, value: 100 });
  await installDemoRoutes(page);
  await page.route('**/api/v1/platform/demo/live-metrics', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(report),
  }));
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="providers"]').click();
  const resend = page.locator('[data-platform-provider="resend"]');
  const meter = resend.locator('#provider-resend-monthly-meter');
  await expect(resend.locator('.platform-admin-insights-primary-value')).toHaveText('2');
  await expect(resend.locator(':scope > .platform-admin-insights-card-values')).toContainText('100');
  await expect(meter).toHaveCount(0);
  sent.periodStart = limit.periodStart = '2026-10-15T00:00:00.000Z';
  await page.locator('[data-platform-provider-refresh]').click();
  await expect(meter).toBeVisible();
  await expect(meter).toHaveAttribute('value', '2');
  await expect(meter).toHaveAttribute('max', '100');
  limit.periodEnd = '2026-11-13T12:00:00.000Z';
  await page.locator('[data-platform-provider-refresh]').click();
  await expect(resend).toBeVisible();
  await expect(meter).toHaveCount(0);
  await expect(resend.locator('.platform-admin-insights-primary-value')).toHaveText('2');
  await expect(resend.locator(':scope > .platform-admin-insights-card-values')).toContainText('100');
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
  await selectInsightsTab(page, 'product', 'usage');
  await expect(view.locator('[data-product-metric="request_submitted"] strong')).toHaveText('Unbekannt');
  await selectInsightsTab(page, 'product', 'feedback');
  await expect(view.locator('[data-product-feedback]')).toContainText('Noch keine auswertbaren Feedbackdaten');
  await selectInsightsTab(page, 'product', 'delivery');
  const delivery = view.locator('[data-product-delivery-source="stored"]');
  await expect(delivery.locator('[data-product-delivery-component]')).toHaveCount(3);
  await expect(delivery.locator('[data-product-delivery-component="api"] [data-product-delivery-window]')).toHaveCount(4);
  const older = delivery.locator('[data-product-delivery-component="api"] [data-product-delivery-window]').nth(1);
  await older.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(older).toHaveAttribute('open', '');
  await expect(older.locator('[data-product-metric="change_failure_rate"] strong')).toHaveText('Unbekannt');
  const screenshot = testInfo.outputPath('product-delivery-overview.png');
  // WebKit limits a single image dimension to 32767px. Keep a viewport overview
  // and every metric card separately so the expanded mobile report is covered.
  await page.screenshot({ path: screenshot });
  await testInfo.attach('product-delivery-overview', { path: screenshot, contentType: 'image/png' });
  const evidenceCards = delivery.locator('[data-product-delivery-component]');
  for (let index = 0; index < await evidenceCards.count(); index += 1) {
    const path = testInfo.outputPath(`product-delivery-card-${index}.png`);
    await evidenceCards.nth(index).screenshot({ path });
    await testInfo.attach(`product-delivery-card-${index}`, { path, contentType: 'image/png' });
  }
  await page.locator('select[aria-label="Sprache"]').selectOption('en');
  await expect(page.locator('#viewTitle')).toHaveText('Product & delivery');
  await selectedInsightsPanel(page, 'product', 'delivery');
  await selectInsightsTab(page, 'product', 'usage');
  await expect(view.locator('[data-product-metric="request_submitted"] strong')).toHaveText('Unknown');
  report = JSON.parse(readFileSync(new URL('../support/product-delivery-known-fixture.json', import.meta.url), 'utf8'));
  await page.locator('[data-product-delivery-refresh]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#viewTitle')).toBeFocused();
  await expect(view).toBeVisible();
  expect(reads).toBe(2);
  await expect(view.locator('[data-product-metric="request_submitted"] strong')).toHaveText('1');
  await expect(view.locator('[data-product-metric="recovery_failure_rate"] strong')).toHaveText('25%');
  await selectInsightsTab(page, 'product', 'delivery');
  const api = delivery.locator('[data-product-delivery-component="api"]');
  await expect(api.locator('[data-product-delivery-window]').first().locator('[data-product-metric="change_lead_time"] strong')).toHaveText('0.5 s');
  await page.locator('select[aria-label="Language"]').selectOption('de');
  await expect(api.locator('[data-product-delivery-window]').first().locator('[data-product-metric="change_lead_time"] strong')).toHaveText('0,5 s');
  await selectInsightsTab(page, 'product', 'usage');
  await expect(view.locator('[data-product-metric="recovery_failure_rate"] strong')).toHaveText(/25\s%/u);
  await selectInsightsTab(page, 'product', 'delivery');
  expect(await api.locator('[data-product-delivery-window][open] > .platform-admin-definition-list > div').evaluateAll((rows) =>
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
  await selectInsightsTab(page, 'product', 'delivery');
  const manual = page.locator('[data-operator-source="manual"]');
  const feedback = page.locator('[data-operator-source="feedback"]');
  await expect(manual).not.toHaveAttribute('open');
  await manual.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(manual).toHaveAttribute('open', '');
  await expect(manual).toContainText('Vom Betreiber bestätigt');
  await selectInsightsTab(page, 'product', 'feedback');
  await expect(feedback).toContainText('Register vorhanden, Quellenabdeckung unvollständig');
  await expect(page.locator('[data-product-feedback]')).not.toContainText('noch nicht angebunden');
  for (const id of ['total', 'open', 'highSeverity']) {
    await expect(feedback.locator(`[data-product-feedback-metric="${id}"] strong`)).toHaveText('Unbekannt');
  }
  await selectInsightsTab(page, 'product', 'delivery');
  const older = manual.locator('[data-product-delivery-component="api"] [data-product-delivery-window]').nth(1);
  await older.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(older).toHaveAttribute('open', '');
  await page.locator('select[aria-label="Sprache"]').selectOption('en');
  await expect(manual).toContainText('Operator-confirmed');
  await selectInsightsTab(page, 'product', 'feedback');
  await expect(feedback.locator('dd').first()).toHaveText('Unknown');
  await expect(page.locator('#app')).not.toContainText('synthetic-owner');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
  await selectInsightsTab(page, 'product', 'delivery');
  await manual.locator(':scope > summary').click();
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

test('private product failures and forged content fail closed and the protected port refuses Demo payloads', async ({ page }) => {
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
  const demoReport = JSON.parse(readFileSync(new URL('../support/product-delivery-fixture.json', import.meta.url), 'utf8'));
  const refusal = await page.evaluate(async report => {
    const { createProtectedPlatformInsights } = await import('/src/platform-admin/production/insights-api.js');
    const protectedPort = createProtectedPlatformInsights({ apiClient: { async request() { return report; } } });
    try { await protectedPort.productDelivery.load(); }
    catch (error) { return error.message; }
    return null;
  }, demoReport);
  expect(refusal).toBe('PRODUCT_DELIVERY_INVALID');
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
  await selectInsightsTab(page, 'product', 'usage');
  await expect(view.locator('[data-product-outcomes] [data-product-source-freshness="stale"][role="status"]')).toBeVisible();
  await view.locator('[data-product-delivery-refresh]').focus();
  // The browser clock accepts bounded signed-32-bit durations. Advance each
  // daily cache wake-up without wrapping a single 29-day duration into the past.
  for (let remainingDays = 29; remainingDays > 0; remainingDays -= 1) {
    serverTime += day;
    await page.clock.fastForward(day);
  }
  await expect(view.locator('[data-product-metric="request_submitted"] strong')).toHaveText('Unbekannt');
  expect(reads).toBe(3);
  await page.clock.runFor(20);
  await expect(page.locator('#viewTitle')).toBeFocused();
  await selectInsightsTab(page, 'product', 'feedback');
  await expect(view.locator('[data-product-feedback]')).toContainText('Noch keine auswertbaren Feedbackdaten');
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
  await selectInsightsTab(page, 'product', 'usage');
  await expect(page.locator('[data-product-metric="request_submitted"] strong')).toHaveText('Unbekannt');
  await page.locator('select[aria-label="Sprache"]').selectOption('en');
  await selectInsightsTab(page, 'product', 'overview');
  await expect(stock).toContainText('23');
  await expect(stock).toContainText('seed');
  await page.locator('[data-platform-admin-fleet-view="providers"]').click();
  await selectInsightsTab(page, 'provider', 'usage');
  const providers = page.locator('[data-live-metrics="providers"]');
  await expect(providers).toBeVisible();
  await expect(providers).toContainText('0.5');
  await expect(providers).toContainText('Latest sample:');
  await expect(providers).toContainText('start not supplied');
  await expect(providers).toContainText('Unknown');
  expect(reads).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const screenshot = testInfo.outputPath('daily-live-provider-synthetic.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('daily-live-provider-synthetic', { path: screenshot, contentType: 'image/png' });
});

function independentProductFixtures() {
  const load = (name) => JSON.parse(readFileSync(new URL(`../support/${name}`, import.meta.url), 'utf8'));
  const shiftThreeDays = (value) => JSON.parse(JSON.stringify(value), (_key, item) =>
    typeof item === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item)
      ? new Date(Date.parse(item) + 3 * 86_400_000).toISOString() : item);
  const daily = shiftThreeDays(load('daily-live-metrics-fixture.json'));
  const runtime = load('product-runtime-fixture.json');
  const operators = load('operations-sources-fixture.json');
  daily.productDelivery = shiftThreeDays(load('product-delivery-known-fixture.json'));
  daily.evaluatedAt = daily.productDelivery.evaluatedAt = operators.evaluatedAt = runtime.evaluatedAt;
  for (const source of operators.sources) source.freshness = 'stale';
  return { daily, runtime, operators };
}

test('runtime Product subsets and old operator sources cannot mark the fresh daily report stale', async ({ page }, testInfo) => {
  const { daily, runtime, operators } = independentProductFixtures();
  await page.clock.install({ time: new Date(runtime.evaluatedAt) });
  await installDemoRoutes(page);
  const responses = { 'live-metrics': daily, 'product-delivery': runtime, 'operations-sources': operators };
  for (const [path, value] of Object.entries(responses)) {
    await page.route(`**/api/v1/platform/demo/${path}`, (route) => {
      expect(route.request().method()).toBe('GET'); expect(route.request().postData()).toBeNull();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
    });
  }
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="product-delivery"]').click();
  const view = page.locator('[data-product-delivery-report]');
  const overview = await selectedInsightsPanel(page, 'product', 'overview');
  await expect(overview.locator('[data-insight-source="runtime"] [role="status"]')).toContainText('weniger als 24');
  await expect(overview.locator('[data-insight-source="product_daily"] [role="status"]')).toContainText('weniger als 24');
  await expect(overview.locator('[data-insight-source="manual"] [role="status"]')).toContainText('Bestätigung');
  await expect(overview.locator('[data-insight-source="manual"] [data-product-source-freshness]')).toHaveAttribute('data-product-source-freshness', 'stale');
  await expect(overview.locator('[data-insight-source="feedback"] [role="status"]')).toContainText('mindestens 24');
  await expect(overview.locator('[data-insight-source="runtime"] time')).toHaveAttribute('datetime', runtime.observedAt);
  await expect(overview.locator('[data-insight-source="product_daily"] time')).toHaveAttribute('datetime', daily.productDelivery.observedAt);
  await expect(overview.locator('[data-insight-source="manual"] time')).toHaveAttribute('datetime', operators.sources[0].observedAt);
  await expect(view.locator('.platform-admin-insights-header [data-product-source-freshness="stale"]')).toHaveCount(0);
  await selectInsightsTab(page, 'product', 'usage');
  const submitted = view.locator('[data-product-outcomes] [data-product-metric="request_submitted"]');
  await expect(submitted.locator('strong')).toHaveText('2');
  await expect(submitted).toHaveAttribute('data-metric-coverage', 'partial');
  await expect(submitted).toContainText('Beobachtete Teilmenge');
  const evidence = submitted.locator('details');
  await expect(evidence).not.toHaveAttribute('open');
  await evidence.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(evidence).toHaveAttribute('open', '');
  await expect(evidence).toContainText('vollständige Historie');
  await expect(view.locator('[data-product-outcomes] [data-product-metric="request_abandoned"] strong')).toHaveText('Unbekannt');
  await page.locator('select[aria-label="Sprache"]').selectOption('en');
  await selectedInsightsPanel(page, 'product', 'usage');
  await expect(submitted).toContainText('Observed subset');
  await expect(submitted.locator('strong')).toHaveText('2');
  const screenshot = testInfo.outputPath('runtime-product-subsets.png');
  await submitted.locator('summary').click();
  await expect(submitted.locator('details')).toContainText('Complete history');
  await submitted.screenshot({ path: screenshot });
  await testInfo.attach('runtime-product-subsets', { path: screenshot, contentType: 'image/png' });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const delivery = await selectInsightsTab(page, 'product', 'delivery');
  await expect(delivery.locator('[data-product-delivery-source="stored"] [data-insight-source="product_daily"] time'))
    .toHaveAttribute('datetime', daily.productDelivery.observedAt);
  await page.locator('[data-product-delivery-refresh]').click();
  await selectedInsightsPanel(page, 'product', 'delivery');
  await expect(delivery.locator('[data-product-delivery-source="stored"] time')).toHaveAttribute('datetime', daily.productDelivery.observedAt);
  await page.locator('[data-platform-admin-fleet-view="providers"]').click();
  await expect(page.locator('[data-platform-provider-freshness]')).toHaveAttribute('data-platform-provider-freshness', 'fresh');
  const providers = await selectInsightsTab(page, 'provider', 'sources');
  await expect(providers.locator('[data-insight-source="daily"] time')).toHaveAttribute('datetime', daily.observedAt);
});

test('unavailable runtime Product shows the original stored report and a disclosed source-read reason', async ({ page }) => {
  const { daily } = independentProductFixtures();
  await installDemoRoutes(page);
  await page.route('**/api/v1/platform/demo/live-metrics', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(daily),
  }));
  await page.route('**/api/v1/platform/demo/product-delivery', (route) => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SOURCE_UNAVAILABLE' } }),
  }));
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="product-delivery"]').click();
  const usage = await selectInsightsTab(page, 'product', 'usage');
  const outcomes = usage.locator('[data-product-outcomes]');
  await expect(outcomes).toContainText('Laufende Produktdaten derzeit nicht abrufbar');
  await expect(outcomes.locator('[data-insight-source="product_daily"] time')).toHaveAttribute('datetime', daily.productDelivery.observedAt);
  await expect(outcomes.locator('[data-product-metric="request_submitted"] strong')).toHaveText('1');
  await expect(outcomes.locator('[data-metric-coverage]')).toHaveCount(0);
  const reason = outcomes.locator(':scope > details').filter({ has: page.getByText('Warum diese Quelle fehlt', { exact: true }) });
  await reason.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(reason).toContainText('beim letzten Abruf nicht bereitstellen');
});

test('fresh runtime Product preserves the separate stale delivery clock inside a fresh daily report', async ({ page }) => {
  const { daily, runtime } = independentProductFixtures();
  const delivery = JSON.parse(readFileSync(new URL('../support/product-delivery-known-fixture.json', import.meta.url), 'utf8'));
  delivery.evaluatedAt = runtime.evaluatedAt; delivery.freshness = 'stale';
  daily.productDelivery = delivery;
  await installDemoRoutes(page);
  for (const [path, value] of [['live-metrics', daily], ['product-delivery', runtime]]) {
    await page.route(`**/api/v1/platform/demo/${path}`, (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(value),
    }));
  }
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="product-delivery"]').click();
  const overview = await selectedInsightsPanel(page, 'product', 'overview');
  await expect(overview.locator('[data-insight-source="runtime"] [data-product-source-freshness]')).toHaveAttribute('data-product-source-freshness', 'fresh');
  await expect(overview.locator('[data-insight-source="product_daily"] [data-product-source-freshness]')).toHaveAttribute('data-product-source-freshness', 'stale');
  const section = await selectInsightsTab(page, 'product', 'delivery');
  await expect(section.locator('[data-product-delivery-source="stored"] time')).toHaveAttribute('datetime', delivery.observedAt);
  await expect(section.locator('[data-product-delivery-source="stored"] [role="status"]')).toContainText('mindestens 24 Stunden');
  const methodology = section.locator('[data-product-delivery-source="stored"] > details');
  await methodology.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(methodology).toContainText('Render-Customer-Demo-Build');
  await expect(methodology).toContainText('/conference-manager-website/');
  await expect(methodology).toContainText('Produktionspublikation');
  await expect(methodology).toContainText('eigene Nachweise unbekannt');
  await page.locator('select[aria-label="Sprache"]').selectOption('en');
  await methodology.locator(':scope > summary').click();
  await expect(methodology).toContainText('GitHub Pages review target');
  await expect(methodology).toContainText('separate Production publication');
  await page.locator('[data-platform-admin-fleet-view="providers"]').click();
  await expect(page.locator('[data-platform-provider-freshness]')).toHaveAttribute('data-platform-provider-freshness', 'fresh');
});

test('runtime-only Product retains its true time while the daily and delivery reports are unavailable', async ({ page }) => {
  const { runtime } = independentProductFixtures();
  await installDemoRoutes(page);
  await page.route('**/api/v1/platform/demo/live-metrics', (route) => route.fulfill({
    status: 504, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SOURCE_TIMEOUT' } }),
  }));
  await page.route('**/api/v1/platform/demo/product-delivery', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(runtime),
  }));
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="product-delivery"]').click();
  const view = page.locator('[data-product-delivery-report]');
  const notice = view.locator('[data-insight-fallback="daily"]');
  await expect(notice).toContainText('Tagesbericht derzeit nicht abrufbar');
  await notice.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(notice).toContainText('Wartezeit nicht geantwortet');
  const usage = await selectInsightsTab(page, 'product', 'usage');
  await expect(usage.locator('[data-product-outcomes] [data-insight-source="runtime"] time')).toHaveAttribute('datetime', runtime.observedAt);
  await expect(usage.locator('[data-product-outcomes] [data-product-metric="request_submitted"] strong')).toHaveText('2');
  const delivery = await selectInsightsTab(page, 'product', 'delivery');
  await expect(delivery).toContainText('Kein gespeicherter Auslieferungsbericht verfügbar');
  await expect(delivery.locator('[data-product-delivery-component]')).toHaveCount(0);
  await page.locator('select[aria-label="Sprache"]').selectOption('en');
  await selectedInsightsPanel(page, 'product', 'delivery');
  await expect(delivery).toContainText('No stored delivery report is available');
  await expect(notice).toContainText('Daily report currently unavailable');
});

for (const { area, fleetView, tabs } of [
  { area: 'provider', fleetView: 'providers', tabs: ['overview', 'usage', 'sources'] },
  { area: 'product', fleetView: 'product-delivery', tabs: ['overview', 'usage', 'delivery', 'feedback'] },
]) {
  test(`${area} insight tabs preserve keyboard semantics and the selected section across report refresh, locale and revisit`, async ({ page }) => {
    await installDemoRoutes(page);
    const report = JSON.parse(readFileSync(new URL('../support/daily-live-metrics-fixture.json', import.meta.url), 'utf8'));
    await page.clock.install({ time: new Date(report.evaluatedAt) });
    let reads = 0;
    await page.route('**/api/v1/platform/demo/live-metrics', async (route) => {
      expect(route.request().method()).toBe('GET');
      expect(route.request().postData()).toBeNull();
      reads += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
    });
    await page.goto('/platform-admin-demo/');
    const navigation = page.locator(`[data-platform-admin-fleet-view="${fleetView}"]`);
    await navigation.click();
    const insights = page.locator(`[data-insights-tabs="${area}-insights"]`);
    const tablist = insights.getByRole('tablist');
    await expect(tablist).toHaveAttribute('role', 'tablist');
    await expect(tablist.getByRole('tab')).toHaveCount(tabs.length);
    await selectedInsightsPanel(page, area, 'overview');
    await focusAfterNavigationTransition(page, insightsTab(page, area, 'overview'));
    for (const [key, selected] of [
      ['ArrowRight', 'usage'], ['End', tabs.at(-1)], ['ArrowRight', 'overview'],
      ['ArrowLeft', tabs.at(-1)], ['Home', 'overview'], ['End', tabs.at(-1)],
    ]) {
      await page.keyboard.press(key);
      await selectedInsightsPanel(page, area, selected);
      await expect(insightsTab(page, area, selected)).toBeFocused();
      await expect(tablist.locator('[aria-selected="true"]')).toHaveCount(1);
      await expect(tablist.locator('[tabindex="0"]')).toHaveCount(1);
      await expect(page.locator('[data-insights-panel]:visible')).toHaveCount(1);
    }
    const selected = tabs.at(-1);
    // Leave immediately after tab selection: no locale change or report refresh
    // may be needed to remember the current destination.
    await page.locator('[data-platform-admin-fleet-view="directory"]').click();
    await navigation.click();
    await expect(page).toHaveURL(new RegExp(`#fleet=${fleetView}&tab=${selected}$`));
    await selectedInsightsPanel(page, area, selected);
    expect(reads).toBe(1);
    await page.locator('select[aria-label="Sprache"]').selectOption('en');
    await selectedInsightsPanel(page, area, selected);
    await insightsTab(page, area, selected).focus();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.clock.runFor(20);
    await expect(insightsTab(page, area, selected)).toBeFocused();
    expect(reads).toBe(1);
    const refresh = page.locator(area === 'provider'
      ? '[data-platform-provider-refresh]' : '[data-product-delivery-refresh]');
    await refresh.focus(); await page.keyboard.press('Enter');
    await selectedInsightsPanel(page, area, selected);
    await expect.poll(() => reads).toBe(2);
    await page.locator('[data-platform-admin-fleet-view="directory"]').click();
    await navigation.click();
    await selectedInsightsPanel(page, area, selected);
    expect(reads).toBe(2);
    await page.locator('select[aria-label="Language"]').selectOption('de');
    await selectedInsightsPanel(page, area, selected);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    for (const id of tabs) {
      await selectInsightsTab(page, area, id);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
        .toBeLessThanOrEqual(1);
    }
  });

  test(`${area} insight reads fail closed on daily-feed authority and JSON failures without legacy fallback`, async ({ page }) => {
    await installDemoRoutes(page);
    const legacyName = area === 'provider' ? 'provider-usage-fixture.json' : 'product-delivery-known-fixture.json';
    const legacy = JSON.parse(readFileSync(new URL(`../support/${legacyName}`, import.meta.url), 'utf8'));
    let legacyReads = 0;
    await page.route(area === 'provider' ? '**/api/v1/platform/demo/provider-usage' : '**/api/v1/platform/demo/product-delivery', (route) => {
      legacyReads += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(legacy) });
    });
    let sourceReads = 0;
    await page.route('**/api/v1/platform/demo/operations-sources', (route) => {
      sourceReads += 1;
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    const failures = [
      { status: 401, body: JSON.stringify({ error: { code: 'PLATFORM_UNAUTHORIZED' } }) },
      { status: 403, body: JSON.stringify({ error: { code: 'PLATFORM_FORBIDDEN' } }) },
      { status: 200, body: '{"privateText":"must-not-render-private-content",' },
      { status: 200, body: JSON.stringify({ privateText: 'must-not-render-private-content' }) },
    ];
    let response = failures[0]; let reads = 0;
    await page.route('**/api/v1/platform/demo/live-metrics', (route) => {
      expect(route.request().method()).toBe('GET');
      reads += 1;
      return route.fulfill({ ...response, contentType: 'application/json' });
    });
    await page.goto('/platform-admin-demo/');
    await page.locator(`[data-platform-admin-fleet-view="${fleetView}"]`).click();
    const report = page.locator(area === 'provider' ? '[data-platform-provider-report]' : '[data-product-delivery-report]');
    const refresh = page.locator(area === 'provider' ? '[data-platform-provider-refresh]' : '[data-product-delivery-refresh]');
    const heading = area === 'provider' ? 'Anbieterübersicht nicht verfügbar' : 'Produktübersicht nicht verfügbar';
    for (let index = 0; index < failures.length; index += 1) {
      if (index > 0) { response = failures[index]; await refresh.click(); }
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(report).toHaveCount(0);
      await expect(page.locator('#app')).not.toContainText('must-not-render-private-content');
      expect(reads).toBe(index + 1);
      expect(legacyReads).toBe(0);
      expect(sourceReads).toBe(0);
    }
  });
}

test('a fresh daily envelope cannot retain an expired embedded Product snapshot or move tab focus', async ({ page }) => {
  const live = JSON.parse(readFileSync(new URL('../support/daily-live-metrics-fixture.json', import.meta.url), 'utf8'));
  const known = JSON.parse(readFileSync(new URL('../support/product-delivery-known-fixture.json', import.meta.url), 'utf8'));
  const expired = JSON.parse(readFileSync(new URL('../support/product-delivery-expired-fixture.json', import.meta.url), 'utf8'));
  const start = Date.parse(expired.evaluatedAt);
  const expiry = start + 6 * 60_000;
  known.observedAt = new Date(Date.parse(known.observedAt) + 6 * 60_000).toISOString();
  const shift = start - Date.parse(live.observedAt);
  // Keep the daily measurements recent and internally consistent while the
  // independently observed Product snapshot approaches its retention limit.
  for (const row of live.measurements) {
    for (const clock of ['observedAt', 'sampleAt', 'periodStart', 'periodEnd']) {
      if (row[clock] !== null) row[clock] = new Date(Date.parse(row[clock]) + shift).toISOString();
    }
  }
  let serverTime = start; let reads = 0;
  await page.clock.install({ time: new Date(start) });
  await installDemoRoutes(page);
  await page.route('**/api/v1/platform/demo/live-metrics', (route) => {
    reads += 1;
    const evaluatedAt = new Date(serverTime).toISOString();
    const productDelivery = serverTime >= expiry ? { ...expired, evaluatedAt }
      : { ...known, evaluatedAt, freshness: 'stale' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ...live, observedAt: new Date(start).toISOString(), evaluatedAt, productDelivery,
    }) });
  });
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="product-delivery"]').click();
  await selectInsightsTab(page, 'product', 'usage');
  const submitted = page.locator('[data-product-metric="request_submitted"] strong');
  await expect(submitted).toHaveText('1');
  expect(reads).toBe(1);
  await insightsTab(page, 'product', 'usage').focus();
  serverTime = expiry;
  await page.clock.fastForward(6 * 60_000);
  await expect.poll(() => reads).toBe(2);
  await expect(submitted).toHaveText('Unbekannt');
  await selectedInsightsPanel(page, 'product', 'usage');
  await expect(insightsTab(page, 'product', 'usage')).toBeFocused();
});

test('delivery charts contain only the four source periods and never draw unknown values as zero', async ({ page }) => {
  await installDemoRoutes(page);
  const report = JSON.parse(readFileSync(new URL('../support/product-delivery-known-fixture.json', import.meta.url), 'utf8'));
  await page.route('**/api/v1/platform/demo/product-delivery', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(report),
  }));
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="product-delivery"]').click();
  await selectInsightsTab(page, 'product', 'delivery');
  const stored = page.locator('[data-product-delivery-source="stored"]');
  for (const component of report.delivery) {
    const section = stored.locator(`[data-product-delivery-component="${component.component}"]`);
    const select = section.locator('[data-product-delivery-chart-select]');
    await expect(select).toHaveValue('deployment_frequency');
    const periods = component.buckets.map((bucket) => bucket.periodStart);
    for (const metric of component.buckets[0].metrics) {
      await select.selectOption(metric.id);
      const series = section.locator(`[data-product-delivery-series="${metric.id}"]`);
      await expect(series).toBeVisible();
      await expect(section.locator('[data-product-delivery-series]:visible')).toHaveCount(1);
      const rows = series.locator('[data-product-delivery-period]');
      await expect(rows).toHaveCount(4);
      expect(await rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.productDeliveryPeriod))).toEqual(periods);
      for (const bucket of component.buckets) {
        const row = series.locator(`[data-product-delivery-period="${bucket.periodStart}"]`);
        const value = bucket.metrics.find((entry) => entry.id === metric.id).value;
        await expect(row).toHaveAttribute('data-product-delivery-period-end', bucket.periodEnd);
        await expect(row.locator('th')).toHaveAttribute('scope', 'row');
        await expect(row.locator('meter')).toHaveCount(value === null ? 0 : 1);
        if (value === null) await expect(row).toContainText('Unbekannt');
        else await expect(row.locator('meter')).toHaveAttribute('value', String(value));
      }
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
});

test('Platform navigation clears an obsolete action announcement without retrying the uncertain mutation',async({ page })=>{
  await installDemoRoutes(page,{ initialPersona: 'tenant_operator' });let attempts=0;
  await page.route(`**/api/v1/platform/tenants/${ACTIVE_TENANT_ID}/lifecycle/transitions`,route=>{
    attempts++;return route.fulfill({ status: 503,contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SOURCE_UNAVAILABLE' } }) });
  });
  await page.goto('/platform-admin-demo/');
  await page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`).click();
  await page.locator('[data-platform-admin-navigate="lifecycle"]').click();
  await page.locator('[data-platform-action="suspend"]').click();
  await page.locator('#platformAdminActionReason').fill('Isolated uncertain action fixture');
  await page.locator('[data-platform-admin-confirm-action="suspend"]').click();
  await expect(page.locator('#alertRegion')).not.toBeEmpty();
  await page.locator('[data-platform-admin-fleet-view="directory"]').click();
  await expect(page.locator('#alertRegion')).toBeEmpty();await expect(page.locator('#statusRegion')).toBeEmpty();
  await expect(page.locator('.platform-admin-error')).toBeVisible();
  await page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`).click();
  await page.goBack();await expect(page.locator('#alertRegion')).toBeEmpty();expect(attempts).toBe(1);
});

test('Platform runtime accepts actual API support references and reflows long metadata on mobile',async({ page })=>{
  await installDemoRoutes(page);
  const payload=JSON.parse(readFileSync(new URL('../support/platform-runtime-output-fixture.json',import.meta.url),'utf8'));
  await page.route('**/api/v1/platform/runtime/deployments?schemaVersion=2',route=>route.fulfill({
    contentType: 'application/json',body: JSON.stringify(payload),
  }));
  await page.goto('/platform-admin-demo/');
  await page.locator('[data-platform-admin-fleet-view="runtime-status"]').click();
  await expect(page.locator('.platform-admin-record-list article')).toHaveCount(4);
  for (const width of [320,1280]) {
    await page.setViewportSize({ width,height: 900 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await expect(page.locator('.platform-admin-error')).toHaveCount(0);
});

for (const locale of ['de', 'en']) {
  test(`persistent global routes restore deep links, reload, tabs and browser history: ${locale}`, async ({ page }) => {
    await installDemoRoutes(page);
    const report = JSON.parse(readFileSync(new URL('../support/product-delivery-known-fixture.json', import.meta.url), 'utf8'));
    await page.route('**/api/v1/platform/demo/product-delivery', route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify(report),
    }));
    await page.goto('/platform-admin-demo/#fleet=product-delivery&tab=feedback');
    await page.evaluate(async value => { const { setLanguage } = await import('/src/core/i18n.js'); setLanguage(value); }, locale);
    await selectedInsightsPanel(page, 'product', 'feedback');
    const navigation = page.locator('[data-platform-admin-fleet-view="product-delivery"]');
    await expect(navigation).toHaveAttribute('aria-current', 'page');
    const heading = await page.locator('#viewTitle').textContent();
    await page.reload();
    await selectedInsightsPanel(page, 'product', 'feedback');
    await expect(page.locator('#viewTitle')).toHaveText(heading);
    await insightsTab(page, 'product', 'delivery').focus();
    await insightsTab(page, 'product', 'delivery').press('Enter');
    await expect(page).toHaveURL(/#fleet=product-delivery&tab=delivery$/);
    await expect(insightsTab(page, 'product', 'delivery')).toBeFocused();
    await page.goBack(); await selectedInsightsPanel(page, 'product', 'feedback');
    await expect(page.locator('#viewTitle')).toBeFocused();
    await page.goForward(); await selectedInsightsPanel(page, 'product', 'delivery');
    await expect(navigation).toHaveAttribute('aria-current', 'page');
    await page.locator('[data-platform-admin-fleet-view="directory"]').click();
    await expect(page).toHaveURL(/#fleet$/);
    await page.goBack(); await selectedInsightsPanel(page, 'product', 'delivery');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('persistent global routes cannot reveal an unavailable or unauthorized view', async ({ page }) => {
  const state = await installDemoRoutes(page);
  await page.goto('/platform-admin-demo/#fleet=platform-audit');
  await expect(page).toHaveURL(/#fleet$/);
  await expect(page.locator('[data-platform-admin-fleet-view="platform-audit"]')).toHaveCount(0);
  expect(state.requests.some(request => request.path.includes('/audit/'))).toBe(false);
  await page.goto('/platform-admin-demo/#fleet=product-delivery&tab=%3Cscript%3E');
  await expect(page.locator('[data-platform-admin-fleet-view="directory"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-product-delivery-report]')).toHaveCount(0);
});

async function installEntitlementRoutes(page, { reader = false, delayed = false } = {}) {
  const state = await installDemoRoutes(page, { initialPersona: reader ? 'support_reader' : 'tenant_operator' });
  const ids = ['microsoft.directory', 'microsoft.calendar', 'microsoft.calendar.write'];
  const previews = []; let failure = true; let release;
  await page.route('**/api/v1/platform/capabilities', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ schemaVersion: 1, items: ids.map((capabilityId, index) => ({ capabilityId,
      dependencies: index ? [ids[index - 1]] : [] })) }),
  }));
  await page.route('**/api/v1/platform/packages?*', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ schemaVersion: 1, snapshotAt: '2026-10-28T00:00:00.000Z', items: [], nextCursor: null }),
  }));
  await page.route(`**/api/v1/platform/tenants/${ACTIVE_TENANT_ID}/entitlements`, route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ schemaVersion: 1, entitlements: { tenantId: ACTIVE_TENANT_ID, tenantStatus: 'active', revision: 3,
      entries: ids.map(capabilityId => ({ capabilityId, enabled: false, effectiveAt: null })) } }),
  }));
  await page.route(`**/api/v1/platform/tenants/${ACTIVE_TENANT_ID}/entitlement-previews`, async route => {
    previews.push(route.request().postDataJSON());
    if (delayed) await new Promise(resolve => { release = resolve; });
    await route.fulfill({ status: failure ? 503 : 200, contentType: 'application/json', body: JSON.stringify(failure
      ? { error: { code: 'SOURCE_UNAVAILABLE' } }
      : { schemaVersion: 1, source: 'direct', plan: { tenantId: ACTIVE_TENANT_ID, tenantStatus: 'active', sourceRevision: 3,
        changed: true, changes: previews.at(-1).proposals.map(entry => ({ ...entry, previousEnabled: false })) } }) });
  });
  return { state, previews, succeed: () => { failure = false; }, release: () => release?.() };
}

for (const locale of ['de', 'en']) {
  test(`entitlement workspace explains empty states and preserves selection through failed and successful preview: ${locale}`, async ({ page }) => {
    const fixture = await installEntitlementRoutes(page, { delayed: true });
    await page.goto(`/platform-admin-demo/#tenant=${ACTIVE_TENANT_ID}&section=entitlements`);
    await page.evaluate(async value => { const { setLanguage } = await import('/src/core/i18n.js'); setLanguage(value); }, locale);
    const form = page.locator('.platform-admin-entitlement-form');
    const preview = form.getByRole('button', { name: locale === 'de' ? 'Änderungen prüfen' : 'Review changes' });
    const directory = form.getByRole('checkbox', { name: locale === 'de' ? 'Microsoft-Verzeichnis lesen' : 'Read Microsoft directory' });
    await expect(form.getByRole('status')).toContainText(locale === 'de' ? 'Keine Änderungen ausgewählt' : 'No changes selected');
    await expect(page.getByText(locale === 'de' ? /derzeit keine Funktionspakete/ : /No capability packages/)).toBeVisible();
    await expect(preview).toBeDisabled();
    await directory.focus(); await directory.press('Space'); await expect(preview).toBeEnabled();
    await preview.click(); await expect.poll(() => fixture.previews.length).toBe(1);
    await expect(form).toHaveAttribute('aria-busy', 'true'); await expect(directory).toBeDisabled();
    await expect(form.getByRole('status')).toContainText(locale === 'de' ? 'Vorschau wird geladen' : 'Loading the preview');
    fixture.release();
    await expect(form.getByRole('alert')).toContainText(locale === 'de' ? 'Auswahl bleibt erhalten' : 'selection is preserved');
    await expect(directory).toBeChecked(); await expect(preview).toBeEnabled(); await expect(preview).toBeFocused();
    fixture.succeed(); await preview.click(); await expect.poll(() => fixture.previews.length).toBe(2); fixture.release();
    await expect(page.locator('#platformAdminEntitlementPreviewTitle')).toBeFocused();
    await expect(directory).toBeChecked();
    const apply = page.locator('[data-platform-admin-apply-entitlements="direct"]'); await expect(apply).toBeVisible();
    await directory.uncheck(); await expect(apply).not.toBeVisible(); await expect(preview).toBeDisabled();
    await directory.check(); await expect(apply).toBeVisible();
    expect(fixture.previews).toEqual([{ proposals: [{ capabilityId: 'microsoft.directory', enabled: true }] },
      { proposals: [{ capabilityId: 'microsoft.directory', enabled: true }] }]);
    expect(fixture.state.requests.some(request => request.path.includes('entitlement-applications'))).toBe(false);
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1280) {
        const geometry = await page.locator('.platform-admin-entitlements-workspace').evaluate(node => {
          const [form, packages] = [...node.children].map(child => child.getBoundingClientRect());
          return { form: form.x, packages: packages.x, workspace: node.getBoundingClientRect().width, width: form.width };
        });
        expect(geometry.packages).toBeGreaterThan(geometry.form);
        expect(geometry.width).toBeGreaterThan(geometry.workspace * 0.4);
      }
    }
  });
}

test('entitlement workspace read-only authority and departed preview remain bounded', async ({ page }) => {
  let fixture = await installEntitlementRoutes(page, { reader: true });
  await page.goto(`/platform-admin-demo/#tenant=${ACTIVE_TENANT_ID}&section=entitlements`);
  const form = page.locator('.platform-admin-entitlement-form');
  await expect(form.getByRole('checkbox')).toHaveCount(3);
  for (const control of await form.getByRole('checkbox').all()) await expect(control).toBeDisabled();
  await expect(form.getByRole('button', { name: 'Änderungen prüfen' })).toHaveCount(0);
  expect(fixture.previews.length).toBe(0);
  await page.unrouteAll({ behavior: 'wait' }); fixture = await installEntitlementRoutes(page, { delayed: true });
  await page.reload(); await form.getByRole('checkbox').first().check();
  await form.getByRole('button', { name: 'Änderungen prüfen' }).click(); await expect.poll(() => fixture.previews.length).toBe(1);
  await page.locator('[data-platform-admin-fleet-view="directory"]').click();
  fixture.succeed(); fixture.release();
  await expect(page).toHaveURL(/#fleet$/); await expect(page.locator('.platform-admin-preview')).toHaveCount(0);
  await page.goBack(); await expect(form).toBeVisible(); await expect(page.locator('.platform-admin-preview')).toHaveCount(0);
});

for (const locale of ['de','en']) test(`Platform context groups retain customer identity, distinct runtime routes and keyboard return in ${locale}`, async ({ page }, testInfo) => {
  const state=await installDemoRoutes(page,{ initialPersona: 'tenant_operator' });
  let releaseRuntime=null;
  await page.route('**/api/v1/platform/runtime/deployments?schemaVersion=2',async route=>{
    await new Promise(resolve=>{ releaseRuntime=resolve; });
    await route.fulfill({ status: 503,contentType: 'application/json',body: JSON.stringify({ error: { code: 'RUNTIME_UNAVAILABLE' } }) });
  });
  await page.goto('/platform-admin-demo/');
  await page.evaluate(async value=>{ const { setLanguage }=await import('/src/core/i18n.js');setLanguage(value); },locale);
  const navigation=page.locator('#primaryNavigation');
  await expect(page.locator('#brandTitle')).toHaveText('Conference Manager');
  await expect(page.locator('#brandSubtitle')).toHaveText('by Pavurel');
  await expect(navigation.locator('section')).toHaveCount(1);
  await expect(page.locator('#platformAdminGlobalNavigation')).toHaveText(locale==='de' ? 'Plattform · alle Kunden' : 'Platform · all customers');
  const filters=page.locator('.platform-admin-filter-form'),create=page.locator('.platform-admin-create-panel');
  await expect(create).toBeVisible();
  expect(await filters.evaluate((node)=>Boolean(node.compareDocumentPosition(document.querySelector('.platform-admin-create-panel')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`).focus();await page.keyboard.press('Enter');
  await expect(navigation.locator('section')).toHaveCount(2);
  await expect(page.locator('#platformAdminCustomerNavigation')).toHaveText(locale==='de' ? 'Kunde · Dune Collective' : 'Customer · Dune Collective');
  const globalRuntime=navigation.locator('[data-platform-admin-fleet-view="runtime-status"]');
  const customerRuntime=navigation.locator('[data-platform-admin-navigate="runtime-status"]');
  await expect(globalRuntime).toHaveText(locale==='de' ? 'Plattformbetrieb' : 'Platform runtime');
  await expect(customerRuntime).toHaveText(locale==='de' ? 'Kundenbetrieb' : 'Customer runtime');
  await customerRuntime.focus();await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`#tenant=${ACTIVE_TENANT_ID}&section=runtime-status$`));
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(customerRuntime).toHaveAttribute('aria-current','page');
  for (const width of [320,1280]) {
    await page.setViewportSize({ width,height: 900 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await testInfo.attach(`platform-context-${locale}-${width}`,{ body: await navigation.screenshot(),contentType: 'image/png' });
  }
  await globalRuntime.focus();await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#fleet=runtime-status$/);
  await expect(navigation.locator('section')).toHaveCount(1);
  await expect.poll(()=>typeof releaseRuntime).toBe('function');
  const directory=navigation.locator('[data-platform-admin-fleet-view="directory"]');
  try {
    await directory.focus();await expect(directory).toBeFocused();
  } finally { releaseRuntime(); }
  await expect(page.locator('.platform-admin-error')).toBeVisible();
  // A completed background read must retain the current keyboard destination.
  await expect(directory).toBeFocused();await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#fleet$/);
  await expect(page.locator('.platform-admin-fleet-card')).toContainText('Dune Collective');
  expect(state.requests.filter(({ method })=>method!=='GET')).toHaveLength(0);
});

for (const locale of ['de','en']) for (const freshness of ['fresh','stale','unknown']) {
  test(`Runtime ${locale} prioritizes ${freshness} observation without inventing a current outage`,async({ page },testInfo)=>{
    await installDemoRoutes(page);
    const fixture=JSON.parse(readFileSync(new URL('../support/platform-runtime-output-fixture.json',import.meta.url),'utf8'));
    const runtime=fixture.deployments[0];
    runtime.freshness={ ...runtime.freshness,state: freshness,observedAt: freshness==='unknown' ? null : '2026-10-25T11:50:00.000Z' };
    runtime.overallState=freshness==='fresh' ? 'ready' : freshness;
    await page.route('**/api/v1/platform/runtime/deployments?schemaVersion=2',route=>route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ schemaVersion: 1,deployments: [runtime] }) }));
    await page.goto('/platform-admin-demo/');
    await page.evaluate(async value=>{ const { setLanguage }=await import('/src/core/i18n.js');setLanguage(value); },locale);
    await page.locator('[data-platform-admin-fleet-view="runtime-status"]').click();
    const card=page.locator(`[data-runtime-observation="${freshness}"]`),details=card.locator('details');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading')).toContainText(runtime.deployment.reference);
    await expect(card.getByText(locale==='de' ? 'Conference Manager · Anwendungsdienst' : 'Conference Manager · application service',{ exact: true })).toBeVisible();
    await expect(card).toContainText('Test');
    if (freshness==='unknown') await expect(card.locator('time')).toHaveCount(0);
    else await expect(card.locator('time')).toHaveAttribute('datetime',runtime.freshness.observedAt);
    if (freshness==='stale') await expect(card).toContainText(locale==='de' ? 'Dies bestätigt keinen aktuellen Ausfall.' : 'This does not confirm a current outage.');
    await expect(details).not.toHaveAttribute('open','');
    await expect(details.locator('dd').first()).toBeHidden();
    await details.locator('summary').focus();await page.keyboard.press('Enter');
    await expect(details.locator('dd').first()).toHaveText(runtime.components.frontend.version);
    await expect(page.locator('.skip-link')).not.toBeInViewport();
    for (const width of [320,1280]) {
      await page.setViewportSize({ width,height: 900 });
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      if (freshness==='stale') await testInfo.attach(`runtime-observation-${locale}-${width}`,{ body: await card.screenshot(),contentType: 'image/png' });
    }
  });
}

for (const locale of ['de','en']) test(`quota confirmation retains customer, human metric and canonical dimension in ${locale}`,async({ page })=>{
  const state=await installDemoRoutes(page,{ initialPersona: 'tenant_operator' });
  await page.route(`**/api/v1/platform/tenants/${ACTIVE_TENANT_ID}/metering/usage?*`,route=>{
    const start=new URL(route.request().url()).searchParams.get('periodStart'),end=new Date(start);
    end.setUTCMonth(end.getUTCMonth()+1);
    const names=['active_users','active_rooms','requests_created','bookings_confirmed','integration_operations'];
    return route.fulfill({ contentType: 'application/json',body: JSON.stringify({ schemaVersion: 1,tenantId: ACTIVE_TENANT_ID,
      period: { start,end: end.toISOString(),timeZone: 'UTC' },dataState: 'partial',measuredAt: null,reconciledAt: null,
      dimensions: names.map(dimension=>({ dimension,value: 0 })),
      quotas: names.map(dimension=>({ dimension,state: dimension==='active_users' ? 'configured' : 'not_configured',
        softLimit: dimension==='active_users' ? 100 : null,hardLimit: dimension==='active_users' ? 200 : null,revision: dimension==='active_users' ? 1 : 0 })),
    }) });
  });
  await page.goto('/platform-admin-demo/');
  await page.evaluate(async value=>{ const { setLanguage }=await import('/src/core/i18n.js');setLanguage(value); },locale);
  await page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`).click();
  await page.locator('[data-platform-admin-navigate="metering"]').click();
  await page.locator('[data-platform-admin-quota="active_users"]').click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading')).toContainText(locale==='de' ? 'Aktive interne Personen' : 'Active internal people');
  await expect(dialog).toContainText('Dune Collective');
  await expect(dialog).toContainText('active_users');
  await expect(dialog.getByRole('button',{ name: locale==='de' ? 'Kontingent speichern' : 'Save quota',exact: true })).toBeVisible();
  for (const width of [320,1280]) {
    await page.setViewportSize({ width,height: 900 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await dialog.press('Escape');await expect(dialog).toBeHidden();
  expect(state.requests.filter(({ method })=>method!=='GET')).toHaveLength(0);
});

test('Platform headings use Bordeaux light icons while dark navigation retains white inverse icons', async ({ page }) => {
  await installDemoRoutes(page);
  await page.goto('/platform-admin-demo/');

  const title = page.locator('#viewTitle');
  const expectTitleIcon = async (name) => {
    const icon = title.locator('img.pavurel-functional-icon');
    await expect(icon).toHaveAttribute('src', new RegExp(`/light/${name}\\.svg$`));
    await expect(icon).toHaveAttribute('alt', '');
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expect(title.locator('span')).toBeVisible();
    expect((await title.locator('span').textContent()).trim()).not.toBe('');
  };

  await expectTitleIcon('customers');
  const inverseIcons = page.locator('nav img.pavurel-functional-icon');
  await expect(inverseIcons).not.toHaveCount(0);
  for (const icon of await inverseIcons.all()) {
    await expect(icon).toHaveAttribute('src', /\/inverse\//);
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
  }

  await page.locator('[data-platform-admin-fleet-view="readiness"]').click();
  await expectTitleIcon('info');
  await page.locator('[data-platform-admin-fleet-view="directory"]').click();

  await page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`).click();
  await expectTitleIcon('dashboard');
  const metricIcon = page.locator('.platform-admin-onboarding-progress h3 img.pavurel-functional-icon').first();
  await expect(metricIcon).toHaveAttribute('src', /\/light\/settings\.svg$/);
  await expect(metricIcon).toHaveAttribute('aria-hidden', 'true');
  await page.locator('[data-platform-admin-navigate="lifecycle"]').click();
  await expectTitleIcon('settings');
});

for (const locale of ['de', 'en']) test(`customer target composes sourced status, responsibility and desktop columns in ${locale}`, async ({ page }, testInfo) => {
  const state = await installDemoRoutes(page);
  const snapshotAt = '2026-10-29T12:00:00.000Z';
  await page.route('**/api/v1/platform/readiness**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    schemaVersion: 1, snapshotAt, nextCursor: null, items: [{ tenantId: ACTIVE_TENANT_ID, displayName: 'Dune Collective',
      lifecycle: { status: 'active', revision: 3 }, onboardingState: 'complete',
      readiness: { state: 'blocked', blockerCodes: ['entitlement.microsoft_calendar.missing'], checks: [] },
      entitlements: { enabledCount: 0, requiredMissingCount: 1 }, evidence: [] }],
  }) }));
  await page.route('**/api/v1/platform/microsoft365/health**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    schemaVersion: 1, snapshotAt, nextCursor: null, items: [{ tenantId: ACTIVE_TENANT_ID, displayName: 'Dune Collective',
      lifecycle: { status: 'active', revision: 3 }, connectionState: 'connected', permissions: { places: 'unknown', calendars: 'unknown' },
      mappings: { active: 0, missing: 0, total: 0 }, capabilities: [] }],
  }) }));
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/platform-admin-demo/');
  await page.evaluate(async value => { const { setLanguage } = await import('/src/core/i18n.js'); setLanguage(value); }, locale);
  const card = page.locator('.platform-admin-fleet-card');
  await expect(card).toContainText(locale === 'de' ? 'Blockiert' : 'Blocked');
  await expect(card).toContainText(locale === 'de' ? 'Verbunden' : 'Connected');
  await expect(card).toContainText(locale === 'de' ? 'Readiness-Voraussetzung klären' : 'Resolve readiness prerequisite');
  await card.getByRole('button', { name: locale === 'de' ? 'Dune Collective öffnen' : 'Open Dune Collective' }).click();
  const workbench = page.locator('.platform-admin-customer-workbench');
  await expect(workbench.locator('section.card')).toHaveCount(6);
  await expect(workbench.locator('[aria-current="step"]')).toHaveText(locale === 'de' ? 'Abgeschlossen' : 'Complete');
  await expect(workbench.locator('.platform-admin-customer-readiness')).toContainText(locale === 'de' ? 'Blockiert' : 'Blocked');
  await expect(workbench.locator('.platform-admin-customer-activity')).toContainText(locale === 'de' ? 'keine Leseberechtigung' : 'does not have read permission');
  await expect(workbench.locator('.platform-admin-workbench-technical')).not.toHaveAttribute('open', '');
  const customerId = page.locator('.platform-admin-customer-id');
  await expect(customerId.locator('code')).toBeHidden();
  await customerId.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(customerId.locator('code')).toHaveText(ACTIVE_TENANT_ID);
  await expect(customerId.locator('code')).toBeVisible();
  await customerId.locator('summary').press('Enter');
  await expect(customerId.locator('code')).toBeHidden();
  const task = workbench.locator('[data-platform-admin-next-task]');
  await task.getByRole('button').focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/section=entitlements$/);
  await page.goBack(); await expect(workbench).toBeVisible();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1440) {
      const columns = await workbench.evaluate(node => [...node.children].slice(0, 2).map(child => child.getBoundingClientRect().x));
      expect(columns[1]).toBeGreaterThan(columns[0]);
      const directoryLabel = page.locator('[data-platform-admin-fleet-view="directory"] > span');
      const labelGeometry = await directoryLabel.evaluate(node => ({ height: node.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight), width: node.getBoundingClientRect().width }));
      expect(labelGeometry.height, JSON.stringify(labelGeometry)).toBeLessThanOrEqual(labelGeometry.lineHeight + 1);
      const currentStep = workbench.locator('[aria-current="step"] > span:last-child');
      expect(await currentStep.evaluate(node => node.getBoundingClientRect().height <= Number.parseFloat(getComputedStyle(node).lineHeight) + 1)).toBe(true);
    }
    await testInfo.attach(`customer-target-${locale}-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }
  expect(errors).toEqual([]);
  expect(state.requests.filter(request => request.method !== 'GET')).toHaveLength(0);
});

test('tenant workbench presents localized horizontal section navigation without changing route contracts', async ({ page }) => {
  await installDemoRoutes(page);
  await page.goto('/platform-admin-demo/');
  await page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`).click();

  const tabs = page.locator('[data-platform-admin-section-tabs]');
  await expect(tabs).toBeVisible();
  await expect(tabs.locator('[data-platform-admin-section-tab]')).toHaveCount(7);
  await expect(tabs.locator('[aria-current="page"]')).toContainText('Übersicht');

  const entitlements = tabs.locator('[data-platform-admin-section-tab="entitlements"]');
  await entitlements.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/section=entitlements/);
  await expect(tabs.locator('[aria-current="page"]')).toHaveAttribute('data-platform-admin-section-tab', 'entitlements');
  await expect(page.locator('#viewTitle')).toBeFocused();

  await page.locator('select[aria-label="Sprache"]').selectOption('en');
  await expect(tabs.locator('[aria-current="page"]')).toContainText('Feature access');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
});

for (const locale of ['de', 'en']) {
  test(`late customer resource failure preserves keyboard navigation in ${locale}`, async ({ page }) => {
    const state = await installDemoRoutes(page);
    let release;
    await page.route(`**/api/v1/platform/tenants/${ACTIVE_TENANT_ID}/diagnostics`, async route => {
      await new Promise(resolve => { release = resolve; });
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE' } }) });
    });
    await page.goto(`/platform-admin-demo/#tenant=${ACTIVE_TENANT_ID}&section=diagnostics`);
    await expect.poll(() => typeof release).toBe('function');
    await expect(page.locator('.platform-admin-tenant-section')).toHaveCount(1);
    await page.evaluate(async value => { const { setLanguage } = await import('/src/core/i18n.js'); setLanguage(value); }, locale);
    const directory = page.locator('#primaryNavigation [data-platform-admin-fleet-view="directory"]');
    await directory.focus();
    release();
    await expect(page.locator('.platform-admin-error')).toBeVisible();
    await expect(directory).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#fleet$/);
    await expect(page.locator('.platform-admin-fleet-card')).toContainText('Dune Collective');
    expect(state.requests.filter(({ method }) => method !== 'GET')).toHaveLength(0);
  });

  test(`departed customer read preserves the current directory draft in ${locale}`, async ({ page }) => {
    await installDemoRoutes(page);
    let release; let reads = 0;
    const path = `/api/v1/platform/tenants/${ACTIVE_TENANT_ID}/diagnostics`;
    await page.route(`**${path}`, async route => {
      reads++;
      await new Promise(resolve => { release = resolve; });
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE' } }) });
    });
    await page.goto(`/platform-admin-demo/#tenant=${ACTIVE_TENANT_ID}&section=diagnostics`);
    await page.evaluate(async value => { const { setLanguage } = await import('/src/core/i18n.js'); setLanguage(value); }, locale);
    await expect.poll(() => typeof release).toBe('function');
    await page.locator('#primaryNavigation [data-platform-admin-fleet-view="directory"]').click();
    const query = page.locator('#platformAdminQuery');
    await query.fill('unsubmitted customer query');
    const response = page.waitForResponse(value => new URL(value.url()).pathname === path);
    release(); await (await response).finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await expect(query).toHaveValue('unsubmitted customer query');
    await expect(query).toBeFocused();
    await expect(page).toHaveURL(/#fleet$/);
    await page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`).click();
    await page.locator('#primaryNavigation [data-platform-admin-navigate="diagnostics"]').click();
    await expect(page.locator('.platform-admin-error')).toBeVisible();
    expect(reads).toBe(1);
  });
}

test('a departed diagnostic search cannot repaint a subsequently reopened customer', async ({ page }) => {
  await installDemoRoutes(page, { initialPersona: 'security_auditor' });
  const correlationId = '22222222-2222-4222-8222-222222222222';
  await page.route(`**/api/v1/platform/tenants/${ACTIVE_TENANT_ID}/diagnostics`, route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ schemaVersion: 1, summary: {
      tenant: { tenantId: ACTIVE_TENANT_ID, displayName: 'Dune Collective', lifecycleStatus: 'active', lifecycleRevision: 3 },
      readiness: { state: 'ready', blockerCodes: [], evaluatedAt: '2026-07-01T12:00:00.000Z' },
      entitlements: { revision: 1, enabledCount: 2 },
      microsoft: { connectionState: 'connected', healthState: 'healthy', freshness: 'fresh', lastCheckedAt: null },
      mappings: { active: 1, missing: 0, total: 1 }, deployment: { release: null, observedAt: null }, recentFailures: [],
    } }),
  }));
  let release;
  await page.route(`**/diagnostics/correlations/${correlationId}?*`, async route => {
    const url = new URL(route.request().url());
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ schemaVersion: 1,
      tenantId: ACTIVE_TENANT_ID, lookupCorrelationId: correlationId,
      from: url.searchParams.get('from'), to: url.searchParams.get('to'), items: [] }) });
  });
  await page.goto(`/platform-admin-demo/#tenant=${ACTIVE_TENANT_ID}&section=diagnostics`);
  await page.locator('#platformAdminCorrelationId').fill(correlationId);
  await page.getByRole('button', { name: 'Korrelation suchen', exact: true }).click();
  await expect.poll(() => typeof release).toBe('function');
  await page.locator('[data-platform-admin-fleet-view="directory"]').click();
  await page.goBack(); await expect(page.locator('#platformAdminCorrelationId')).toBeVisible();
  const response = page.waitForResponse(value => value.url().includes(`/diagnostics/correlations/${correlationId}`));
  release(); await (await response).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await expect(page.locator('#platformAdminCorrelationResultsTitle')).toHaveCount(0);
  await expect(page.locator('#platformAdminCorrelationId')).toHaveValue('');
  await expect(page.locator('#viewTitle')).toBeFocused();
});


test('fleet totals account for every lifecycle state in the current filtered directory',async({ page })=>{
  const state=await installDemoRoutes(page);
  const states=['pending','onboarding','ready','active','suspended','archived'];
  await page.route('**/api/v1/platform/tenants?*',route=>{
    const payload=directoryPayload(),filter=new URL(route.request().url()).searchParams.get('lifecycleStatus');
    payload.items=states.map((status,index)=>({ ...payload.items[0],
      tenantId: `10000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
      displayName: `Lifecycle ${status}`,lifecycle: { status,revision: 1 } }))
      .filter(item=>!filter || item.lifecycle.status===filter);
    return route.fulfill({ contentType: 'application/json',body: JSON.stringify(payload) });
  });
  await page.goto('/platform-admin-demo/');
  const counts=page.locator('.platform-admin-metric-grid .platform-admin-metric strong');
  await expect(counts).toHaveText(['6','1','1','1','1','1','1']);
  await page.locator('#platformAdminLifecycle').selectOption('onboarding');
  await page.locator('.platform-admin-filter-form').getByRole('button',{ name: 'Filter anwenden',exact: true }).click();
  await expect(counts).toHaveText(['1','0','1','0','0','0','0']);
  expect(state.requests.some(request=>request.method!=='GET')).toBe(false);
});
const RECOVERY_USER = '11111111-1111-4111-8111-111111111111';
const RECOVERY_OTHER_USER = '22222222-2222-4222-8222-222222222222';
const RECOVERY_BLOCKED_USER = '33333333-3333-4333-8333-333333333333';

function recoveryTargetPayload({ items = [], nextCursor = null } = {}) {
  return { schemaVersion: 1, tenantId: ACTIVE_TENANT_ID, operation: 'last-tenant-admin',
    snapshotAt: '2026-10-30T12:00:00.000Z', nextCursor,
    items: items.map(([targetUserId, eligible]) => ({ targetUserId, eligible, userState: 'active',
      activeSessionCount: 0, identityState: 'active', alreadyTenantAdmin: false, currentTenantAdminCount: 0 })),
  };
}

async function openExplicitRecoveryFixture(page, locale, respond) {
  const state = await installDemoRoutes(page, { initialPersona: 'security_admin' });
  const reads = [];
  await page.route(url => url.pathname.startsWith(`/api/v1/platform/tenants/${ACTIVE_TENANT_ID}/recovery/`)
    && url.pathname.endsWith('/targets'), async route => {
    expect(route.request().method()).toBe('GET');
    const url = new URL(route.request().url());
    reads.push({ path: url.pathname, limit: url.searchParams.get('limit'), cursor: url.searchParams.get('cursor') });
    await respond(route, reads.length);
  });
  await page.goto(`/platform-admin-demo/#tenant=${ACTIVE_TENANT_ID}&section=recovery`);
  await page.evaluate(async value => { const { setLanguage } = await import('/src/core/i18n.js'); setLanguage(value); }, locale);
  await expect(page.locator('[data-platform-admin-section="recovery"] article')).toHaveCount(8);
  expect(reads).toEqual([]);
  return { reads, state };
}

for (const locale of ['de', 'en']) {
  test(`recovery targets are explicit and pagination preserves selection in ${locale}`, async ({ page }, testInfo) => {
    let release;
    const { reads, state } = await openExplicitRecoveryFixture(page, locale, async (route, attempt) => {
      if (attempt === 1) await new Promise(resolve => { release = resolve; });
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(attempt === 1
        ? recoveryTargetPayload({ items: [[RECOVERY_USER, true], [RECOVERY_BLOCKED_USER, false]], nextCursor: 'next-page' })
        : recoveryTargetPayload({ items: [[RECOVERY_OTHER_USER, true]] })) });
    });
    const load = page.locator('[data-platform-admin-recovery-targets-load="last-tenant-admin"]');
    const preview = page.locator('[data-platform-admin-recovery-preview="last-tenant-admin"]');
    const card = page.locator('article').filter({ has: load });
    const target = page.locator('#platformAdminRecoveryTarget-last-tenant-admin');
    await expect(card).toContainText(locale === 'de' ? 'Die Zielliste ist noch nicht geladen' : 'The target list has not been loaded');
    await expect(preview).toBeDisabled();
    await load.focus(); await page.keyboard.press('Enter');
    await expect.poll(() => typeof release).toBe('function');
    await expect(card).toHaveAttribute('aria-busy', 'true'); await expect(load).toBeDisabled();
    await expect(page.locator('[data-platform-admin-recovery-targets-load="user-session-revocation"]')).toBeDisabled();
    expect(reads).toHaveLength(1); expect(reads[0].path).toContain('/last-tenant-admin/targets');
    release();
    await expect(card.getByRole('status')).toContainText(locale === 'de' ? 'Die Zielliste wurde geladen' : 'The target list was loaded');
    await expect(load).toBeFocused();
    // State matchers follow the wrapping label to its select; inspect the native option itself.
    await expect(target.locator(`option[value="${RECOVERY_BLOCKED_USER}"]`)).toHaveJSProperty('disabled', true);
    await target.selectOption(RECOVERY_USER);
    await target.press('ArrowDown');
    await expect(target).toHaveValue(RECOVERY_USER); await expect(preview).toBeEnabled();
    await page.locator('[data-platform-admin-recovery-targets-more="last-tenant-admin"]').click();
    await expect(target.locator('option')).toHaveCount(4); await expect(target).toHaveValue(RECOVERY_USER);
    await expect(target.locator(`option[value="${RECOVERY_OTHER_USER}"]`)).toHaveJSProperty('disabled', false);
    await expect(page.locator('[data-platform-admin-recovery-targets-more="last-tenant-admin"]')).toBeHidden();
    expect(reads.map(value => value.cursor)).toEqual([null, 'next-page']);
    expect(reads.every(value => value.limit === '50' && value.path.includes('/last-tenant-admin/targets'))).toBe(true);
    expect(state.requests.filter(value => value.method !== 'GET')).toEqual([]);
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await testInfo.attach(`explicit-targets-${locale}-${width}`, { body: await card.screenshot(), contentType: 'image/png' });
    }
  });

  test(`recovery target failure is local and retries only after explicit input in ${locale}`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const { reads, state } = await openExplicitRecoveryFixture(page, locale, async (route, attempt) => {
      await route.fulfill({ status: attempt === 1 ? 503 : 200, contentType: 'application/json',
        body: JSON.stringify(attempt === 1 ? { error: { code: 'UNAVAILABLE' } } : recoveryTargetPayload()) });
    });
    const load = page.locator('[data-platform-admin-recovery-targets-load="last-tenant-admin"]');
    const card = page.locator('article').filter({ has: load });
    await load.click();
    await expect(card.getByRole('alert')).toContainText(locale === 'de' ? 'Auswahl bleibt erhalten' : 'selection is preserved');
    await expect(load).toBeEnabled(); await expect(load).toBeFocused();
    await expect(page.locator('[data-platform-admin-recovery-targets-load="room-mapping-repair"]')).toBeEnabled();
    await expect(page.locator('[data-platform-admin-section="recovery"] article')).toHaveCount(8);
    expect(reads).toHaveLength(1);
    await load.press('Enter');
    await expect(card.getByRole('alert')).toHaveCount(0);
    await expect(card).toContainText(locale === 'de' ? 'Auf dieser geladenen Seite ist kein geeignetes Ziel' : 'No eligible target is available');
    await expect(page.locator('[data-platform-admin-recovery-preview="last-tenant-admin"]')).toBeDisabled();
    expect(reads).toHaveLength(2); expect(errors).toEqual([]);
    expect(state.requests.filter(value => value.method !== 'GET')).toEqual([]);
  });

  test(`departed recovery target read cannot clear the current draft or populate a reopened view in ${locale}`, async ({ page }) => {
    let release;
    const { reads } = await openExplicitRecoveryFixture(page, locale, async route => {
      await new Promise(resolve => { release = resolve; });
      await route.fulfill({ contentType: 'application/json',
        body: JSON.stringify(recoveryTargetPayload({ items: [[RECOVERY_USER, true]] })) });
    });
    await page.locator('[data-platform-admin-recovery-targets-load="last-tenant-admin"]').click();
    await expect.poll(() => typeof release).toBe('function');
    await page.locator('#primaryNavigation [data-platform-admin-fleet-view="directory"]').click();
    const query = page.locator('#platformAdminQuery');
    await query.fill('unsubmitted recovery departure draft');
    const response = page.waitForResponse(value => value.url().includes('/recovery/last-tenant-admin/targets'));
    release(); await (await response).finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await expect(query).toHaveValue('unsubmitted recovery departure draft'); await expect(query).toBeFocused();
    await page.locator(`[data-platform-admin-tenant="${ACTIVE_TENANT_ID}"]`).click();
    await page.locator('#primaryNavigation [data-platform-admin-navigate="recovery"]').click();
    await expect(page.locator('#platformAdminRecoveryTarget-last-tenant-admin option')).toHaveCount(1);
    await expect(page.locator('[data-platform-admin-recovery-targets-load="last-tenant-admin"]'))
      .toHaveText(locale === 'de' ? 'Ziele laden' : 'Load targets');
    expect(reads).toHaveLength(1);
  });
}

for (const locale of ['de','en']) test(`Runtime service identity separates latest evidence and keyboard-accessible history: ${locale}`,async({ page })=>{
  await installDemoRoutes(page);
  const template=JSON.parse(readFileSync(new URL('../support/platform-runtime-output-fixture.json',import.meta.url),'utf8')).deployments[0];
  const entry=(reference,key,at)=>({ ...template,schemaVersion:2,
    serviceInstance:key ? { key,surface:'customer' } : null,
    deployment:{ ...template.deployment,reference },freshness:{ ...template.freshness,observedAt:at } });
  await page.route('**/api/v1/platform/runtime/deployments?schemaVersion=2',route=>route.fulfill({ contentType:'application/json',
    body:JSON.stringify({ schemaVersion:2,deployments:[entry('old','customer-a','2026-10-29T12:00:00.000Z'),
      entry('current','customer-a','2026-10-30T12:00:00.000Z'),entry('legacy',null,null)] }) }));
  await page.goto('/platform-admin-demo/');
  await page.evaluate(async value=>{ const { setLanguage }=await import('/src/core/i18n.js');setLanguage(value); },locale);
  await page.locator('[data-platform-admin-fleet-view="runtime-status"]').click();
  const instance=page.locator('[data-runtime-instance]'),history=page.locator('[data-runtime-history]');
  await expect(instance).toHaveCount(1);await expect(instance.locator(':scope > article')).toContainText('current');
  await expect(history.locator('article')).toBeHidden();
  await history.locator(':scope > summary').focus();await page.keyboard.press('Enter');
  await expect(history.locator('article')).toContainText('old');
  await expect(page.locator('[data-runtime-unassigned]')).toContainText('legacy');
  for (const width of [320,1280]) { await page.setViewportSize({ width,height:900 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); }
});
