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
  return Object.freeze({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
}

async function employeeRequestDraft(context) {
  const sitesResponse = await context.request.get(
    `${CUSTOMER_ORIGIN}/api/v1/application/catalog?section=sites&limit=10`,
  );
  const sites = await expectStatus(sitesResponse, 200);
  expect(sites.context).toMatch(/^[A-Za-z0-9_-]+$/);
  const roomsResponse = await context.request.get(
    `${CUSTOMER_ORIGIN}/api/v1/application/catalog?section=rooms&limit=10&context=${encodeURIComponent(sites.context)}`,
  );
  const catalog = await expectStatus(roomsResponse, 200);
  expect(catalog.entries.length).toBeGreaterThan(0);
  expect(catalog.costAllocation.allocationRequired).toBe(false);
  return Object.freeze({
    title: REQUEST_TITLE,
    roomId: catalog.entries[0].id,
    ...futureBusinessWindow(),
    internalParticipants: 2,
    externalParticipants: 0,
    serviceIds: [],
    catering: { participantCount: 0, packageSelection: null, itemQuantities: [] },
    dietaryRequirements: null,
    specialRequirements: null,
    allocations: [],
    configurationRevisions: catalog.configurationRevisions,
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

  platformSession = await switchPlatform(platformContext, platformSession, 'tenant_operator');
  const activated = await platformContext.request.post(
    `${PLATFORM_ORIGIN}/api/v1/platform/tenants/${TENANT_B}/lifecycle/transitions`,
    {
      headers: unsafeHeaders(PLATFORM_ORIGIN, platformSession.csrfToken, {
        idempotencyKey: '41000000-0000-4000-8000-000000000002',
      }),
      data: {
        targetStatus: 'active',
        expectedRevision: 1,
        reason: 'Activate the second shared Demo Tenant',
        confirmation: { action: 'tenant.lifecycle.transition', tenantId: TENANT_B },
      },
    },
  );
  const activation = await expectStatus(activated, 200);
  expect(activation.lifecycle).toMatchObject({ tenantId: TENANT_B, status: 'active', revision: 2 });

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

  customerSession = await switchCustomer(customerContext, customerSession, TENANT_B, 'tenant_admin');
  expect(customerSession.tenant).toEqual({ id: TENANT_B, status: 'active' });
  const currentOrganization = await expectStatus(
    await customerContext.request.get(`${CUSTOMER_ORIGIN}/api/v1/tenant/settings/organization`),
    200,
  );
  expect(currentOrganization.organization.displayName).toBe(BASELINE_NAME_B);
  const organizationUpdate = await customerContext.request.put(
    `${CUSTOMER_ORIGIN}/api/v1/tenant/settings/organization`,
    {
      headers: unsafeHeaders(CUSTOMER_ORIGIN, customerSession.csrfToken),
      data: {
        schemaVersion: currentOrganization.schemaVersion,
        expectedRevision: currentOrganization.revision,
        organization: { ...currentOrganization.organization, displayName: MUTATED_NAME_B },
      },
    },
  );
  const updatedOrganization = await expectStatus(organizationUpdate, 200);
  expect(updatedOrganization.organization.displayName).toBe(MUTATED_NAME_B);

  customerSession = await switchCustomer(customerContext, customerSession, TENANT_B, 'employee');
  expect(customerSession.tenant).toEqual({ id: TENANT_B, status: 'active' });

  const draft = await employeeRequestDraft(customerContext);
  const createResponse = await customerContext.request.post(
    `${CUSTOMER_ORIGIN}/api/v1/application/requests`,
    {
      headers: unsafeHeaders(CUSTOMER_ORIGIN, customerSession.csrfToken),
      data: { schemaVersion: 2, request: draft },
    },
  );
  const created = await expectStatus(createResponse, 201);
  const createdRequestId = created.request.id;
  expect(created.request).toMatchObject({
    id: createdRequestId,
    status: 'Submitted',
    version: 1,
    details: { title: REQUEST_TITLE },
  });

  customerSession = await switchCustomer(
    customerContext,
    customerSession,
    TENANT_B,
    'conference_manager',
  );
  const reviewResponse = await customerContext.request.post(
    `${CUSTOMER_ORIGIN}/api/v1/requests/${encodeURIComponent(createdRequestId)}/transitions`,
    {
      headers: unsafeHeaders(CUSTOMER_ORIGIN, customerSession.csrfToken),
      data: { transition: 'start_review' },
    },
  );
  const reviewed = await expectStatus(reviewResponse, 200);
  expect(reviewed.request).toMatchObject({ id: createdRequestId, status: 'In Review' });
  const confirmResponse = await customerContext.request.post(
    `${CUSTOMER_ORIGIN}/api/v1/requests/${encodeURIComponent(createdRequestId)}/transitions`,
    {
      headers: unsafeHeaders(CUSTOMER_ORIGIN, customerSession.csrfToken),
      data: { transition: 'confirm' },
    },
  );
  const confirmed = await expectStatus(confirmResponse, 200);
  expect(confirmed.request).toMatchObject({ id: createdRequestId, status: 'Confirmed' });

  customerSession = await switchCustomer(customerContext, customerSession, TENANT_B, 'employee');
  const employeeFollowUp = await expectStatus(
    await customerContext.request.get(
      `${CUSTOMER_ORIGIN}/api/v1/requests/${encodeURIComponent(createdRequestId)}`,
    ),
    200,
  );
  expect(employeeFollowUp.request).toMatchObject({
    id: createdRequestId,
    status: 'Confirmed',
    details: { title: REQUEST_TITLE },
  });
  const cancellationResponse = await customerContext.request.post(
    `${CUSTOMER_ORIGIN}/api/v1/requests/${encodeURIComponent(createdRequestId)}/transitions`,
    {
      headers: unsafeHeaders(CUSTOMER_ORIGIN, customerSession.csrfToken),
      data: { transition: 'cancel' },
    },
  );
  const cancelled = await expectStatus(cancellationResponse, 200);
  expect(cancelled.request).toMatchObject({ id: createdRequestId, status: 'Cancelled' });
  const employeeHistory = await expectStatus(
    await customerContext.request.get(
      `${CUSTOMER_ORIGIN}/api/v1/requests/${encodeURIComponent(createdRequestId)}/history?limit=10`,
    ),
    200,
  );
  expect(employeeHistory.history.map(({ request }) => request.status)).toEqual([
    'Cancelled',
    'Confirmed',
    'In Review',
    'Submitted',
  ]);

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
