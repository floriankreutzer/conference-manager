import { expect, test } from '@playwright/test';

const EDGE_PORT = 4443;
const CUSTOMER_ORIGIN = `https://customer.demo.test:${EDGE_PORT}`;
const PLATFORM_ORIGIN = `https://platform.demo.test:${EDGE_PORT}`;
const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '20000000-0000-4000-8000-000000000002';
const REQUEST_A = '12000000-0000-4000-8000-000000000001';
const REQUEST_B = '22000000-0000-4000-8000-000000000002';
const BASELINE_NAME_A = 'Northwind Demo';
const BASELINE_NAME_B = 'Contoso Demo';
const MUTATED_NAME_B = 'Contoso Demo E2E';
const SEED_VERSION = 'saas-3.5-shared-demo-v1';
const REQUEST_TITLE = 'Shared Demo end-to-end request';

async function payload(response) {
  const contentType = response.headers()['content-type'] || '';
  return contentType.includes('application/json') ? response.json() : null;
}

async function expectStatus(response, expected) {
  const body = await payload(response);
  expect(response.status(), JSON.stringify(body)).toBe(expected);
  return body;
}

function unsafeHeaders(origin, csrfToken, { idempotencyKey = null } = {}) {
  return {
    Origin: origin,
    'X-CSRF-Token': csrfToken,
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
}

async function establishCustomer(context) {
  const response = await context.request.get(`${CUSTOMER_ORIGIN}/api/v1/demo/session`);
  return expectStatus(response, 200);
}

async function switchCustomer(context, session, tenantId, persona) {
  const response = await context.request.put(`${CUSTOMER_ORIGIN}/api/v1/demo/session/context`, {
    headers: unsafeHeaders(CUSTOMER_ORIGIN, session.csrfToken),
    data: { tenantId, persona },
  });
  return expectStatus(response, 200);
}

async function switchCustomerThroughUi(page, tenantId, persona) {
  await page.getByLabel('Demo-Tenant').selectOption(tenantId);
  await page.getByLabel('Demo-Persona').selectOption(persona);
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'PUT'
      && url.origin === CUSTOMER_ORIGIN
      && url.pathname === '/api/v1/demo/session/context';
  });
  const rebootstrapPromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'GET'
      && url.origin === CUSTOMER_ORIGIN
      && url.pathname === '/api/v1/demo/session';
  });
  await page.locator('[data-demo-security] button').click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect((await rebootstrapPromise).status()).toBe(200);
  const session = await establishCustomer(page.context());
  await expect(page.getByLabel('Demo-Tenant')).toHaveValue(tenantId);
  await expect(page.getByLabel('Demo-Persona')).toHaveValue(persona);
  return session;
}

async function expectUiResponseStatus(page, method, pathname, action, expectedStatus) {
  const pageOrigin = new URL(page.url()).origin;
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === method
      && url.origin === pageOrigin
      && url.pathname === pathname;
  });
  await action();
  const response = await responsePromise;
  expect(response.status()).toBe(expectedStatus);
}

async function switchPlatformThroughUi(page, persona) {
  const select = page.getByLabel('Simulierte Operator-Rolle');
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'PUT'
      && url.origin === PLATFORM_ORIGIN
      && url.pathname === '/api/v1/platform/demo/session/persona';
  });
  await select.selectOption(persona);
  expect((await responsePromise).status()).toBe(200);
  await expect(select).toHaveValue(persona);
  return establishPlatform(page.context());
}

async function establishPlatform(context) {
  const response = await context.request.get(`${PLATFORM_ORIGIN}/api/v1/platform/demo/session`);
  return expectStatus(response, 200);
}

async function switchPlatform(context, session, persona) {
  const response = await context.request.put(`${PLATFORM_ORIGIN}/api/v1/platform/demo/session/persona`, {
    headers: unsafeHeaders(PLATFORM_ORIGIN, session.csrfToken),
    data: { persona },
  });
  return expectStatus(response, 200);
}

async function resetDemo(context, session) {
  const response = await context.request.post(`${PLATFORM_ORIGIN}/api/v1/platform/demo/reset`, {
    headers: unsafeHeaders(PLATFORM_ORIGIN, session.csrfToken),
    data: { confirm: true },
  });
  const result = await expectStatus(response, 200);
  expect(result.seedVersion).toBe(SEED_VERSION);
  expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
  return result;
}

async function platformDirectory(context) {
  const response = await context.request.get(`${PLATFORM_ORIGIN}/api/v1/platform/tenants?limit=100`);
  return expectStatus(response, 200);
}

function futureBusinessWindow() {
  const startsAt = new Date(Date.now() + (14 * 24 * 60 * 60 * 1_000));
  startsAt.setUTCHours(10, 0, 0, 0);
  while ([0, 6].includes(startsAt.getUTCDay())) startsAt.setUTCDate(startsAt.getUTCDate() + 1);
  const endsAt = new Date(startsAt.getTime() + (60 * 60 * 1_000));
  return Object.freeze({
    date: startsAt.toISOString().slice(0, 10),
    start: startsAt.toISOString().slice(11, 16),
    end: endsAt.toISOString().slice(11, 16),
  });
}

test('shared Demo persists cross-surface state, isolates authority, and resets reproducibly', async ({ browser }) => {
  const bootstrapContext = await browser.newContext({ ignoreHTTPSErrors: true });
  let bootstrapPlatform = await establishPlatform(bootstrapContext);
  bootstrapPlatform = await switchPlatform(bootstrapContext, bootstrapPlatform, 'security_admin');
  const baselineReset = await resetDemo(bootstrapContext, bootstrapPlatform);
  await bootstrapContext.close();

  const customerContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const platformContext = await browser.newContext({ ignoreHTTPSErrors: true });
  let customerSession = await establishCustomer(customerContext);
  let platformSession = await establishPlatform(platformContext);

  const customerCookies = await customerContext.cookies([
    `${CUSTOMER_ORIGIN}/api/v1/demo/session`,
    `${PLATFORM_ORIGIN}/api/v1/platform/demo/session`,
  ]);
  const platformCookies = await platformContext.cookies([
    `${CUSTOMER_ORIGIN}/api/v1/demo/session`,
    `${PLATFORM_ORIGIN}/api/v1/platform/demo/session`,
  ]);
  expect(customerCookies.some(({ name, domain }) => name === 'cm_session' && domain === 'customer.demo.test')).toBe(true);
  expect(customerCookies.some(({ name }) => name === 'cm_platform_session')).toBe(false);
  expect(platformCookies.some(({ name, domain }) => name === 'cm_platform_session' && domain === 'platform.demo.test')).toBe(true);
  expect(platformCookies.some(({ name }) => name === 'cm_session')).toBe(false);

  const customerPage = await customerContext.newPage();
  await customerPage.goto(CUSTOMER_ORIGIN);
  await expect(customerPage.getByLabel('Demo-Tenant')).toBeVisible();
  await customerPage.evaluate(() => {
    localStorage.setItem('conference_demo_role_v1', 'forged-platform-admin');
    sessionStorage.setItem('conference_demo_tenant_v1', 'forged-tenant');
    localStorage.clear();
    sessionStorage.clear();
  });
  await customerPage.reload();
  await expect(customerPage.getByLabel('Demo-Tenant')).toHaveValue(TENANT_A);
  expect(await customerPage.evaluate(() => ({
    local: Object.keys(localStorage).filter((key) => key !== 'conference_language_v1'),
    session: Object.keys(sessionStorage),
  }))).toEqual({ local: [], session: [] });

  const platformPage = await platformContext.newPage();
  await platformPage.goto(PLATFORM_ORIGIN);
  await expect(platformPage.getByLabel('Simulierte Operator-Rolle')).toBeVisible();
  await expect(platformPage.getByText(BASELINE_NAME_A, { exact: true }).first()).toBeVisible();

  const customerTenants = await expectStatus(
    await customerContext.request.get(`${CUSTOMER_ORIGIN}/api/v1/demo/tenants`),
    200,
  );
  expect(customerTenants.tenants.map(({ id }) => id).sort()).toEqual([TENANT_A, TENANT_B]);

  const ownedRequest = await customerContext.request.get(`${CUSTOMER_ORIGIN}/api/v1/requests/${REQUEST_A}`);
  await expectStatus(ownedRequest, 200);
  const crossTenantRequest = await customerContext.request.get(`${CUSTOMER_ORIGIN}/api/v1/requests/${REQUEST_B}`);
  const concealed = await expectStatus(crossTenantRequest, 404);
  expect(concealed.error.code).toBe('NOT_FOUND');

  const customerMissingCsrf = await customerContext.request.put(
    `${CUSTOMER_ORIGIN}/api/v1/demo/session/context`,
    { headers: { Origin: CUSTOMER_ORIGIN }, data: { tenantId: TENANT_B, persona: 'employee' } },
  );
  expect((await expectStatus(customerMissingCsrf, 403)).error.code).toBe('CSRF_INVALID');

  const platformMissingCsrf = await platformContext.request.put(
    `${PLATFORM_ORIGIN}/api/v1/platform/demo/session/persona`,
    { headers: { Origin: PLATFORM_ORIGIN }, data: { persona: 'tenant_operator' } },
  );
  expect((await expectStatus(platformMissingCsrf, 403)).error.code).toBe('PLATFORM_CSRF_INVALID');

  const degradedProviderEvidence = await expectStatus(
    await platformContext.request.get(
      `${PLATFORM_ORIGIN}/api/v1/platform/microsoft365/health?limit=100`,
    ),
    200,
  );
  const degradedTenant = degradedProviderEvidence.items.find(({ tenantId }) => tenantId === TENANT_A);
  expect(degradedTenant.capabilities.length).toBeGreaterThan(0);
  expect(degradedTenant.capabilities.every(({ status }) => status === 'degraded')).toBe(true);

  const unauthorizedTransition = await platformContext.request.post(
    `${PLATFORM_ORIGIN}/api/v1/platform/tenants/${TENANT_B}/lifecycle/transitions`,
    {
      headers: unsafeHeaders(PLATFORM_ORIGIN, platformSession.csrfToken, {
        idempotencyKey: '41000000-0000-4000-8000-000000000001',
      }),
      data: {
        targetStatus: 'active',
        expectedRevision: 1,
        reason: 'Shared Demo authorization negative',
        confirmation: { action: 'tenant.lifecycle.transition', tenantId: TENANT_B },
      },
    },
  );
  expect((await expectStatus(unauthorizedTransition, 403)).error.code)
    .toBe('PLATFORM_AUTHORIZATION_DENIED');

  platformSession = await switchPlatformThroughUi(platformPage, 'tenant_operator');
  await platformPage.locator(`[data-platform-admin-tenant="${TENANT_B}"]`).click();
  await platformPage.locator('[data-platform-admin-navigate="lifecycle"]').click();
  await platformPage.locator('[data-platform-action="activate"]').click();
  await platformPage.locator('#platformAdminActionReason').fill('Activate the second shared Demo Tenant');
  await expectUiResponseStatus(
    platformPage,
    'POST',
    `/api/v1/platform/tenants/${TENANT_B}/lifecycle/transitions`,
    () => platformPage.locator('[data-platform-admin-confirm-action="activate"]').click(),
    200,
  );
  await expect(platformPage.locator('[data-platform-admin-section="lifecycle"] [data-state="active"]').first())
    .toBeVisible();

  const staleActivation = await platformContext.request.post(
    `${PLATFORM_ORIGIN}/api/v1/platform/tenants/${TENANT_B}/lifecycle/transitions`,
    {
      headers: unsafeHeaders(PLATFORM_ORIGIN, platformSession.csrfToken, {
        idempotencyKey: '41000000-0000-4000-8000-000000000003',
      }),
      data: {
        targetStatus: 'active',
        expectedRevision: 1,
        reason: 'Reject a stale shared Demo lifecycle command',
        confirmation: { action: 'tenant.lifecycle.transition', tenantId: TENANT_B },
      },
    },
  );
  expect((await expectStatus(staleActivation, 409)).error.code).toBe('PLATFORM_LIFECYCLE_STALE');

  customerSession = await switchCustomerThroughUi(customerPage, TENANT_B, 'tenant_admin');
  expect(customerSession.tenant).toEqual({ id: TENANT_B, status: 'active' });
  await customerPage.locator('[data-view="tenantAdmin"]').click();
  await customerPage.locator('[data-tenant-admin-section="organization"]').click();
  const organizationForm = customerPage.locator('[data-tenant-settings-form="organization"]');
  await expect(organizationForm.locator('#tenant-organization-display-name')).toHaveValue(BASELINE_NAME_B);
  await organizationForm.locator('#tenant-organization-display-name').fill(MUTATED_NAME_B);
  await expectUiResponseStatus(
    customerPage,
    'PUT',
    '/api/v1/tenant/settings/organization',
    () => organizationForm.getByRole('button', { name: /speichern/i }).click(),
    200,
  );
  await expect(customerPage.locator('#brandTitle')).toHaveText(MUTATED_NAME_B);
  customerSession = await switchCustomerThroughUi(customerPage, TENANT_B, 'employee');
  expect(customerSession.tenant).toEqual({ id: TENANT_B, status: 'active' });
  const requestOwnerUserId = customerSession.user.id;

  await customerPage.locator('[data-view="employee"]').click();
  const businessWindow = futureBusinessWindow();
  await customerPage.locator('#productionTitle').fill(REQUEST_TITLE);
  await customerPage.locator('#productionDate').fill(businessWindow.date);
  await customerPage.locator('#productionStart').fill(businessWindow.start);
  await customerPage.locator('#productionEnd').fill(businessWindow.end);
  await customerPage.locator('#productionRoom').selectOption({ index: 1 });
  await customerPage.locator('#productionInternal').fill('2');
  await customerPage.locator('#productionExternal').fill('0');
  const submitRequest = customerPage.getByRole('button', { name: 'Anfrage absenden' });
  await expect(submitRequest).toBeDisabled();
  await expectUiResponseStatus(
    customerPage,
    'POST',
    '/api/v1/application/room-availability',
    () => customerPage.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click(),
    200,
  );
  await expect(submitRequest).toBeEnabled();
  await expectUiResponseStatus(
    customerPage,
    'POST',
    '/api/v1/application/requests',
    () => submitRequest.click(),
    201,
  );
  const employeeCard = customerPage.locator('[data-production-request-id]')
    .filter({ hasText: 'Zur Prüfung' })
    .first();
  await expect(employeeCard).toBeVisible();
  const createdRequestId = await employeeCard.getAttribute('data-production-request-id');
  expect(createdRequestId).toMatch(/^[0-9a-f-]{36}$/i);
  await expect(employeeCard).toContainText('Zur Prüfung');

  customerSession = await switchCustomerThroughUi(customerPage, TENANT_B, 'conference_manager');
  const managerUserId = customerSession.user.id;
  expect(managerUserId).not.toBe(requestOwnerUserId);
  await customerPage.locator('[data-view="manager"]').click();
  const managerCard = customerPage.locator(`[data-production-request-id="${createdRequestId}"]`);
  await expect(managerCard).toBeVisible();
  const transitionPath = `/api/v1/requests/${createdRequestId}/transitions`;
  await expectUiResponseStatus(
    customerPage,
    'POST',
    transitionPath,
    () => managerCard.getByRole('button', { name: 'Prüfung starten' }).click(),
    200,
  );
  await expect(managerCard).toContainText('In Prüfung');
  await managerCard.getByRole('button', { name: 'Änderung anfordern' }).click();
  const reasonDialog = customerPage.getByRole('dialog', { name: 'Änderung anfordern' });
  await expect(reasonDialog).toBeVisible();
  await reasonDialog.getByLabel('Begründung').fill('Bitte Teilnehmerzahl abschließend prüfen.');
  await expectUiResponseStatus(
    customerPage,
    'POST',
    transitionPath,
    () => reasonDialog.getByRole('button', { name: 'Änderung anfordern' }).click(),
    200,
  );
  await expect(managerCard).toContainText('Änderung angefordert');

  customerSession = await switchCustomerThroughUi(customerPage, TENANT_B, 'dual_role');
  expect(customerSession.roles).toEqual(['employee', 'conference_manager', 'tenant_admin']);
  expect(customerSession.permissions).toEqual([
    'request:read',
    'request:cancel',
    'request:manage',
    'tenant:rooms:business:manage',
    'tenant:catalogue:manage',
    'tenant:configure',
    'tenant:users:manage',
    'tenant:integrations:manage',
    'tenant:audit:read',
  ]);
  await expect(customerPage.locator('[data-view="manager"]')).toHaveCount(1);
  await expect(customerPage.locator('[data-view="tenantAdmin"]')).toHaveCount(1);
  await customerPage.locator('[data-view="manager"]').click();
  await expect(customerPage.locator(`[data-production-request-id="${createdRequestId}"]`)).toBeVisible();
  await customerPage.locator('[data-view="tenantAdmin"]').click();
  await expect(customerPage.locator('[data-tenant-admin-shell]')).toBeVisible();
  await customerPage.locator('[data-tenant-admin-section="users"]').click();
  await expect(customerPage).toHaveURL(/#tenant-admin\/users$/);

  await customerPage.evaluate(async () => {
    const channel = new BroadcastChannel('conference-manager-customer-session-lock-v1');
    channel.postMessage({ type: 'lock' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    channel.close();
  });
  const dualRoleLock = customerPage.locator('dialog[data-inactivity-lock="true"]');
  await expect(customerPage.locator('html')).toHaveAttribute('data-session-locked', 'true');
  await expect(dualRoleLock).toBeVisible();
  await expect(dualRoleLock.getByRole('button', { name: 'Sitzung prüfen und entsperren' })).toBeFocused();
  await expect(customerPage.locator('#primaryNavigation')).toBeEmpty();
  await expect(customerPage.locator('#app')).toBeEmpty();
  await customerPage.evaluate(() => {
    window.location.hash = '#tenant-admin/users';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await expect(customerPage.locator('#app')).toBeEmpty();
  const unlocked = customerPage.waitForEvent('load');
  await dualRoleLock.getByRole('button', { name: 'Sitzung prüfen und entsperren' }).click();
  await unlocked;
  customerSession = await establishCustomer(customerContext);
  expect(customerSession.demo.persona).toBe('dual_role');
  await expect(customerPage.locator('[data-view="manager"]')).toHaveCount(1);
  await expect(customerPage.locator('[data-view="tenantAdmin"]')).toHaveCount(1);
  await expect(customerPage.locator('[data-tenant-admin-shell]')).toBeVisible();

  customerSession = await switchCustomerThroughUi(customerPage, TENANT_B, 'employee');
  await customerPage.locator('[data-view="requests"]').click();
  const followUpCard = customerPage.locator(`[data-production-request-id="${createdRequestId}"]`);
  await expect(followUpCard).toBeVisible();
  await expect(followUpCard).toContainText('Änderung angefordert');
  const employeeFollowUp = await expectStatus(
    await customerContext.request.get(
      `${CUSTOMER_ORIGIN}/api/v1/requests/${encodeURIComponent(createdRequestId)}`,
    ),
    200,
  );
  expect(employeeFollowUp.request).toMatchObject({
    id: createdRequestId,
    status: 'Change Requested',
    details: { title: REQUEST_TITLE },
  });
  await followUpCard.getByRole('button', { name: 'Verlauf' }).click();
  const historyDialog = customerPage.getByRole('dialog', { name: 'Verlauf' });
  await expect(historyDialog).toBeVisible();
  await expect(historyDialog.locator('p')).toHaveCount(3);
  await historyDialog.getByRole('button', { name: 'Schließen' }).click();

  await followUpCard.getByRole('button', { name: 'Änderung bearbeiten' }).click();
  await expect(customerPage.locator('#productionTitle')).toHaveValue(REQUEST_TITLE);
  await customerPage.locator('#productionInternal').fill('3');
  const [resubmissionAvailabilityRequest] = await Promise.all([
    customerPage.waitForRequest((request) => request.method() === 'POST'
      && new URL(request.url()).pathname === '/api/v1/application/room-availability'),
    expectUiResponseStatus(
      customerPage,
      'POST',
      '/api/v1/application/room-availability',
      () => customerPage.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click(),
      200,
    ),
  ]);
  expect(resubmissionAvailabilityRequest.postDataJSON()).toMatchObject({
    resubmissionRequestId: createdRequestId,
  });
  await expectUiResponseStatus(
    customerPage,
    'POST',
    `/api/v1/application/requests/${createdRequestId}/resubmissions`,
    () => customerPage.getByRole('button', { name: 'Änderung erneut einreichen' }).click(),
    200,
  );
  const resubmittedCard = customerPage.locator(`[data-production-request-id="${createdRequestId}"]`);
  await expect(resubmittedCard).toContainText('Zur Prüfung');
  await expect(resubmittedCard).toContainText('3');

  customerSession = await switchCustomerThroughUi(customerPage, TENANT_B, 'conference_manager');
  expect(customerSession.user.id).toBe(managerUserId);
  await customerPage.locator('[data-view="manager"]').click();
  const managerCancelCard = customerPage.locator(`[data-production-request-id="${createdRequestId}"]`);
  await managerCancelCard.getByRole('button', { name: 'Anfrage stornieren' }).click();
  const managerCancelDialog = customerPage.getByRole('dialog', { name: 'Anfrage wirklich stornieren?' });
  await expect(managerCancelDialog).toContainText('Die Anfragedaten werden nicht gelöscht.');
  await expectUiResponseStatus(
    customerPage,
    'POST',
    transitionPath,
    () => managerCancelDialog.getByRole('button', { name: 'Anfrage stornieren' }).click(),
    200,
  );
  await expect(managerCancelCard).toContainText('Storniert');

  customerSession = await switchCustomerThroughUi(customerPage, TENANT_B, 'employee');
  await customerPage.locator('[data-view="requests"]').click();
  await expect(customerPage.locator(`[data-production-request-id="${createdRequestId}"]`))
    .toContainText('Storniert');
  const employeeHistory = await expectStatus(
    await customerContext.request.get(
      `${CUSTOMER_ORIGIN}/api/v1/requests/${encodeURIComponent(createdRequestId)}/history?limit=10`,
    ),
    200,
  );
  expect(employeeHistory.history.map(({ request }) => request.status)).toEqual([
    'Cancelled',
    'Submitted',
    'Change Requested',
    'In Review',
    'Submitted',
  ]);

  await platformPage.reload();
  await expect(platformPage.getByText(MUTATED_NAME_B, { exact: true }).first()).toBeVisible();
  await expect(platformPage.getByText(createdRequestId, { exact: false })).toHaveCount(0);
  await expect(platformPage.getByText(REQUEST_TITLE, { exact: false })).toHaveCount(0);
  const customerChangeVisibleToPlatform = await platformDirectory(platformContext);
  expect(customerChangeVisibleToPlatform.items.find(({ tenantId }) => tenantId === TENANT_B)?.displayName)
    .toBe(MUTATED_NAME_B);
  const platformProjection = await expectStatus(
    await platformContext.request.get(
      `${PLATFORM_ORIGIN}/api/v1/platform/tenants/${TENANT_B}/diagnostics`,
    ),
    200,
  );
  expect(platformProjection.summary.tenant).toMatchObject({
    tenantId: TENANT_B,
    displayName: MUTATED_NAME_B,
    lifecycleStatus: 'active',
  });
  expect(JSON.stringify(platformProjection)).not.toContain(createdRequestId);
  expect(JSON.stringify(platformProjection)).not.toContain(REQUEST_TITLE);

  platformSession = await switchPlatform(platformContext, platformSession, 'security_admin');
  const resetActorId = platformSession.operatorId;
  const reset = await resetDemo(platformContext, platformSession);
  expect(reset.checksum).toBe(baselineReset.checksum);

  const invalidatedCustomer = await customerContext.request.get(`${CUSTOMER_ORIGIN}/api/v1/application/profile`);
  expect((await expectStatus(invalidatedCustomer, 401)).error.code).toBe('UNAUTHENTICATED');
  const invalidatedPlatform = await platformContext.request.get(`${PLATFORM_ORIGIN}/api/v1/platform/tenants?limit=100`);
  expect((await expectStatus(invalidatedPlatform, 401)).error.code).toBe('PLATFORM_UNAUTHENTICATED');

  await customerContext.clearCookies();
  await platformContext.clearCookies();
  customerSession = await establishCustomer(customerContext);
  platformSession = await establishPlatform(platformContext);
  platformSession = await switchPlatform(platformContext, platformSession, 'security_auditor');
  const resetAudit = await expectStatus(
    await platformContext.request.get(`${PLATFORM_ORIGIN}/api/v1/platform/audit/events?limit=100`),
    200,
  );
  expect(resetAudit.items).toContainEqual(expect.objectContaining({
    operatorId: resetActorId,
    action: 'platform.recovery.executed',
    targetType: 'demo_runtime',
    targetId: 'shared_demo',
    outcome: 'success',
    metadata: { operation: 'reset' },
  }));
  expect(customerSession.tenant).toEqual({ id: TENANT_A, status: 'active' });
  const restoredDirectory = await platformDirectory(platformContext);
  expect(restoredDirectory.items.find(({ tenantId }) => tenantId === TENANT_A)?.displayName).toBe(BASELINE_NAME_A);
  expect(restoredDirectory.items.find(({ tenantId }) => tenantId === TENANT_B)?.displayName).toBe(BASELINE_NAME_B);
  expect(restoredDirectory.items.find(({ tenantId }) => tenantId === TENANT_B)?.lifecycle).toEqual({
    status: 'ready',
    revision: 1,
  });

  platformSession = await switchPlatform(platformContext, platformSession, 'security_admin');
  const repeatedReset = await resetDemo(platformContext, platformSession);
  expect(repeatedReset).toMatchObject({ seedVersion: reset.seedVersion, checksum: reset.checksum });

  await Promise.all([customerContext.close(), platformContext.close()]);
});
