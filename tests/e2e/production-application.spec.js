import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionUtcInstant } from '../../src/core/production-time.js';
import { applicationProjectionPayload } from './fixtures/application-projections.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://conference.test';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const CSRF_TOKEN = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const REQUEST_ID = 'CR-2026-100001';
const API_REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const PROVIDER_TENANT_ID = '44444444-4444-4444-8444-444444444444';

function microsoftHealth(capability, connection) {
  const revoked = connection.status === 'revoked';
  return {
    capability,
    status: revoked ? 'revoked' : 'not_configured',
    reason: revoked ? connection.reason : null,
    lastCheckedAt: null,
    lastSuccessAt: null,
  };
}

function microsoftConnection(value) {
  const connection = {
    lastVerifiedAt: null,
    requiredPermissions: ['Place.Read.All', 'Calendars.ReadBasic.All'],
    ...value,
  };
  return {
    ...connection,
    capabilities: {
      places: microsoftHealth('places', connection),
      freeBusy: microsoftHealth('free_busy', connection),
      calendarWrite: microsoftHealth('calendar_write', connection),
    },
  };
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function sessionPayload(roles) {
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
    user: { id: USER_ID },
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

function catalogPayload(timeZone = 'Europe/Berlin') {
  return {
    schemaVersion: 1,
    catalog: {
      sites: [{ id: 'berlin', name: 'Berlin', active: true, timeZone }],
      rooms: [{
        id: 'room-a', siteId: 'berlin', name: 'Room A', capacity: 12, active: true,
        price: { amountMinor: 0, currency: 'EUR' },
      }],
      services: [],
      cateringPackages: [],
      cateringItems: [],
    },
  };
}

function publicRequest(value) {
  if (value.schemaVersion === 2) return value;
  return {
    schemaVersion: 1,
    version: value.version ?? 1,
    ...value,
    createdAt: value.createdAt ?? value.updatedAt,
    details: null,
    pricing: null,
    configurationRevisions: null,
    policy: null,
    allocations: null,
  };
}

function appliedRequest(current, change) {
  const request = {
    title: 'Updated conference', roomId: change.roomId, startsAt: change.startsAt, endsAt: change.endsAt,
    internalParticipants: change.internalParticipants, externalParticipants: change.externalParticipants,
    serviceIds: [], catering: { participantCount: 0, packageSelection: null, itemQuantities: [] },
    dietaryRequirements: null, specialRequirements: null, allocations: [],
    configurationRevisions: {
      organization: 1, locations: 1, catalogue: 1, bookingPolicies: 1, costAllocation: 1,
    },
  };
  const proposedRequest = {
    schemaVersion: 2, version: (current.version ?? 1) + 1, id: current.id,
    roomId: change.roomId, status: 'Confirmed', statusReason: null,
    startsAt: change.startsAt, endsAt: change.endsAt,
    internalParticipants: change.internalParticipants, externalParticipants: change.externalParticipants,
    statusChangedAt: '2026-08-26T11:00:00.000Z', createdAt: current.createdAt ?? current.updatedAt,
    updatedAt: '2026-08-26T11:00:00.000Z',
    details: {
      title: request.title, specialRequirements: null, dietaryRequirements: null,
      serviceIds: [], catering: request.catering,
    },
    pricing: {
      currency: 'EUR', totalMinor: 0,
      breakdown: { roomMinor: 0, servicesMinor: 0, cateringPackageMinor: 0, cateringItemsMinor: 0 },
      room: { id: change.roomId, siteId: 'berlin', name: 'Room A', price: { amountMinor: 0, currency: 'EUR' } },
      services: [], catering: { participantCount: 0, packageSelection: null, items: [] },
    },
    configurationRevisions: request.configurationRevisions,
    policy: {
      policyVersionId: 'policy-1', effectiveFrom: '2026-01-01T00:00:00.000Z',
      evaluatedAt: '2026-08-27T12:00:00.000Z',
      rules: {
        minimumLeadTimeMinutes: 0, maximumAdvanceMinutes: 527040,
        cancellationWindowMinutes: 0, changeWindowMinutes: 0, maximumParticipants: 500,
        allowedSiteIds: [], allowedRoomIds: [], allowedServiceIds: [],
      },
    },
    allocations: {
      schemaVersion: 1, configurationRevision: 1, snapshottedAt: '2026-08-27T12:00:00.000Z',
      model: 'percentage_basis_points', totalBasisPoints: 0, totalMinor: 0,
      allocatedMinor: 0, unallocatedMinor: 0, currency: 'EUR', entries: [],
    },
  };
  return { request, proposedRequest };
}

function requestRef(value) {
  return {
    id: value.id, schemaVersion: value.schemaVersion ?? 1,
    version: value.version ?? 1, status: value.status,
  };
}

async function productionHtml() {
  const source = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  return source
    .replace(
      '<meta name="conference-runtime" content="demo">',
      '<meta name="conference-runtime" content="production">',
    )
    .replace(
      './src/platform/demo-bootstrap.js?v=20260830-77',
      './src/platform/production-bootstrap.js?v=20260830-77',
    );
}

async function installProductionApplicationFixture(page, {
  roles = ['employee'],
  timeZone = 'Europe/Berlin',
  catalog = catalogPayload(timeZone),
  bookingChange: initialBookingChange = null,
  availabilityResponses = [{ available: true, conflictCount: 0 }],
  requestCreateErrors = [],
  holdAvailability = false,
  holdBookingDecision = false,
  holdSession = false,
  microsoft365 = null,
} = {}) {
  const writes = [];
  const decisionWrites = [];
  const availabilityChecks = [];
  let requests = [];
  let bookingChange = initialBookingChange;
  let releaseSession = () => {};
  const sessionGate = holdSession
    ? new Promise((resolve) => { releaseSession = resolve; })
    : null;
  let releaseAvailability = () => {};
  const availabilityGate = holdAvailability
    ? new Promise((resolve) => { releaseAvailability = resolve; })
    : null;
  let releaseBookingDecision = () => {};
  const bookingDecisionGate = holdBookingDecision
    ? new Promise((resolve) => { releaseBookingDecision = resolve; })
    : null;
  let availabilityIndex = 0;
  let requestCreateIndex = 0;

  await page.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/api/v1/session') {
      if (sessionGate) await sessionGate;
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

    if (
      request.method() === 'GET'
      && ['/api/v1/application/profile', '/api/v1/application/site-info', '/api/v1/application/notifications']
        .includes(url.pathname)
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(applicationProjectionPayload(url, { displayName: 'Demo Employee' })),
      });
      return;
    }

    if (url.pathname === '/api/v1/application/catalog' && request.method() === 'GET') {
      const section = url.searchParams.get('section');
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 2,
          configurationRevisions: {
            organization: 1, locations: 1, catalogue: 1, bookingPolicies: 1, costAllocation: 1,
          },
          bookingPolicy: {
            policyVersionId: 'policy-1',
            effectiveFrom: '2026-01-01T00:00:00.000Z',
            evaluatedAt: '2026-08-27T12:00:00.000Z',
            rules: {
              minimumLeadTimeMinutes: 0,
              maximumAdvanceMinutes: 527040,
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
          context: 'fixture_catalog_context',
          section,
          entries: section === 'costCenters' ? [] : catalog.catalog[section],
          page: { limit: 10, complete: true, nextCursor: null },
        }),
      });
      return;
    }

    if (microsoft365 && url.pathname === '/api/v1/tenant/users' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ users: [], nextAfterId: null }),
      });
      return;
    }

    if (microsoft365 && url.pathname === '/api/v1/integrations/microsoft365/connect') {
      const failure = microsoft365.connectError;
      if (failure) {
        await route.fulfill({
          status: failure.status,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({ error: { code: failure.code, requestId: 'fixture-request' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          authorizationUrl: `https://login.microsoftonline.com/${PROVIDER_TENANT_ID}/v2.0/adminconsent?client_id=fixture`,
          expiresAt: '2026-08-25T12:10:00.000Z',
          requestId: API_REQUEST_ID,
        }),
      });
      return;
    }

    if (microsoft365 && url.pathname === '/api/v1/integrations/microsoft365') {
      const failure = request.method() === 'DELETE' ? microsoft365.disconnectError : null;
      if (failure) {
        await route.fulfill({
          status: failure.status,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({ error: { code: failure.code, requestId: 'fixture-request' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ connection: microsoftConnection(microsoft365.connection), requestId: API_REQUEST_ID }),
      });
      return;
    }

    if (microsoft365 && url.pathname === '/api/v1/integrations/microsoft365/verify') {
      const failure = microsoft365.verifyError;
      await route.fulfill({
        status: failure?.status || 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(failure
          ? { error: { code: failure.code, requestId: 'fixture-request' } }
          : { connection: microsoftConnection(microsoft365.connection), requestId: API_REQUEST_ID }),
      });
      return;
    }

    if (microsoft365 && url.pathname === '/api/v1/integrations/microsoft365/room-mappings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ mappings: [], requestId: API_REQUEST_ID }),
      });
      return;
    }

    if (microsoft365 && url.pathname === '/api/v1/integrations/microsoft365/pilot-readiness') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          readiness: {
            tenantStatus: 'onboarding',
            ready: false,
            checks: {
              tenantIdentityClaimed: true,
              microsoft365Connected: false,
              placesPermissionGranted: false,
              calendarPermissionGranted: false,
              roomImported: false,
              freeBusyVerified: false,
              directoryEntitled: true,
              calendarEntitled: true,
            },
            entitlements: {
              microsoftDirectory: true,
              microsoftCalendar: true,
              microsoftCalendarWrite: false,
            },
          },
          requestId: API_REQUEST_ID,
        }),
      });
      return;
    }

    if (url.pathname === '/api/v1/application/room-availability' && request.method() === 'POST') {
      const body = request.postDataJSON();
      availabilityChecks.push({ path: url.pathname, csrf: request.headers()['x-csrf-token'], body });
      const responseIndex = availabilityIndex;
      const response = availabilityResponses[Math.min(responseIndex, availabilityResponses.length - 1)];
      availabilityIndex += 1;
      if (availabilityGate && responseIndex === 0) await availabilityGate;
      if (response instanceof Error) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({ code: 'AVAILABILITY_UNAVAILABLE' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ schemaVersion: 1, availability: response }),
      });
      return;
    }

    if (url.pathname === '/api/v1/application/requests' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 2,
          asOf: '2026-09-24T12:00:00.000Z',
          requests: requests.map(publicRequest),
          page: { limit: 10, complete: true, nextCursor: null },
        }),
      });
      return;
    }

    if (url.pathname === '/api/v1/application/requests' && request.method() === 'POST') {
      const envelope = request.postDataJSON();
      const body = envelope.request;
      writes.push({ path: url.pathname, csrf: request.headers()['x-csrf-token'], body });
      const createError = requestCreateErrors[requestCreateIndex];
      requestCreateIndex += 1;
      if (createError) {
        await route.fulfill({
          status: createError.status,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({ error: { code: createError.code, requestId: 'fixture-request' } }),
        });
        return;
      }
      const created = {
        id: REQUEST_ID,
        roomId: body.roomId,
        status: 'Submitted',
        statusReason: null,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        internalParticipants: body.internalParticipants,
        externalParticipants: body.externalParticipants,
        statusChangedAt: '2026-08-25T20:00:00.000Z',
        updatedAt: '2026-08-25T20:00:00.000Z',
      };
      requests = [created];
      await route.fulfill({
        status: 201,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ schemaVersion: 2, request: publicRequest(created), requestId: API_REQUEST_ID }),
      });
      return;
    }

    if (url.pathname === `/api/v1/requests/${REQUEST_ID}/transitions` && request.method() === 'POST') {
      const body = request.postDataJSON();
      writes.push({ path: url.pathname, csrf: request.headers()['x-csrf-token'], body });
      const current = requests[0];
      const nextStatus = {
        start_review: 'In Review',
        confirm: 'Confirmed',
        reject: 'Rejected',
        request_change: 'Change Requested',
        cancel: 'Cancelled',
      }[body.transition] || current.status;
      const transitioned = { ...current, status: nextStatus, statusReason: body.reason || null };
      requests = [transitioned];
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ schemaVersion: 2, request: publicRequest(transitioned), requestId: API_REQUEST_ID }),
      });
      return;
    }

    if (url.pathname === `/api/v1/requests/${REQUEST_ID}/booking-change` && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 2,
          result: { change: bookingChange, requestRef: requestRef(requests[0]) },
        }),
      });
      return;
    }

    if (url.pathname === `/api/v1/requests/${REQUEST_ID}/booking-change` && request.method() === 'POST') {
      const body = request.postDataJSON();
      writes.push({ path: url.pathname, csrf: request.headers()['x-csrf-token'], body });
      bookingChange = {
        id: '33333333-3333-4333-8333-333333333333',
        status: 'pending',
        rejectionReason: null,
        createdAt: '2026-08-26T10:00:00.000Z',
        updatedAt: '2026-08-26T10:00:00.000Z',
        requestSchemaVersion: 1,
        baseRequestVersion: requests[0].version ?? 1,
        request: null,
        proposedRequest: null,
        ...body,
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 2,
          result: { change: bookingChange, requestRef: requestRef(requests[0]) },
        }),
      });
      return;
    }

    if (bookingChange && url.pathname === `/api/v1/requests/${REQUEST_ID}/booking-change/${bookingChange.id}/decision` && request.method() === 'POST') {
      const body = request.postDataJSON();
      decisionWrites.push({ path: url.pathname, csrf: request.headers()['x-csrf-token'], body });
      if (bookingDecisionGate) await bookingDecisionGate;
      const applied = appliedRequest(requests[0], bookingChange);
      bookingChange = {
        ...bookingChange, status: 'applied', updatedAt: '2026-08-26T11:00:00.000Z',
        requestSchemaVersion: 2, request: applied.request, proposedRequest: applied.proposedRequest,
      };
      requests = [applied.proposedRequest];
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 2,
          result: { change: bookingChange, requestRef: requestRef(requests[0]) },
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

  return {
    availabilityChecks,
    decisionWrites,
    releaseAvailability,
    releaseBookingDecision,
    releaseSession,
    requests: () => requests,
    writes,
  };
}

function futureDate(days = 14) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function confirmedRequestFixture() {
  const date = futureDate();
  return {
    id: REQUEST_ID,
    roomId: 'room-a',
    status: 'Confirmed',
    statusReason: null,
    startsAt: `${date}T07:00:00.000Z`,
    endsAt: `${date}T08:00:00.000Z`,
    internalParticipants: 2,
    externalParticipants: 0,
    statusChangedAt: '2026-08-25T20:00:00.000Z',
    updatedAt: '2026-08-25T20:00:00.000Z',
  };
}

function bookingChangeFixture(status = 'pending') {
  const request = confirmedRequestFixture();
  return {
    id: '33333333-3333-4333-8333-333333333333',
    status,
    roomId: request.roomId,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
    internalParticipants: 3,
    externalParticipants: 0,
    rejectionReason: null,
    createdAt: '2026-08-26T10:00:00.000Z',
    updatedAt: '2026-08-26T10:00:00.000Z',
    requestSchemaVersion: 1,
    baseRequestVersion: 1,
    request: null,
    proposedRequest: null,
  };
}

test('Employee production flow uses server catalog and CSRF-protected request persistence', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  const requestDate = futureDate();
  await page.goto(`${ORIGIN}/`);

  await expect(page.locator('[data-view="manager"]')).toHaveCount(0);
  await expect(page.locator('[data-view="tenantAdmin"]')).toHaveCount(0);
  await page.locator('[data-view="employee"]').click();
  await expect(page.locator('#viewTitle')).toBeFocused();
  await page.locator('#productionRoom').selectOption('room-a');
  await page.locator('#productionTitle').fill('Customer workshop');
  await page.locator('#productionDate').fill(requestDate);
  await page.locator('#productionStart').fill('09:00');
  await page.locator('#productionEnd').fill('10:00');
  await page.locator('#productionInternal').fill('2');
  await page.locator('#productionExternal').fill('1');
  const submit = page.getByRole('button', { name: 'Anfrage absenden' });
  await expect(submit).toBeDisabled();
  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();
  await expect(page.getByText('Der Raum ist im gewählten Zeitraum verfügbar.')).toBeVisible();
  await expect(submit).toBeEnabled();

  await page.locator('#productionEnd').fill('10:30');
  await expect(submit).toBeDisabled();
  await expect(page.getByText('Prüfen Sie die Verfügbarkeit für den aktuell gewählten Raum und Zeitraum.')).toBeVisible();
  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('#toast')).toContainText('Anfrage wurde abgesendet.');

  expect(fixture.availabilityChecks).toHaveLength(2);
  expect(fixture.availabilityChecks[1]).toEqual({
    path: '/api/v1/application/room-availability',
    csrf: CSRF_TOKEN,
    body: {
      roomId: 'room-a',
      startsAt: productionUtcInstant(requestDate, '09:00', 'Europe/Berlin'),
      endsAt: productionUtcInstant(requestDate, '10:30', 'Europe/Berlin'),
    },
  });
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0].csrf).toBe(CSRF_TOKEN);
  expect(fixture.writes[0].body).toMatchObject({
    roomId: 'room-a',
    internalParticipants: 2,
    externalParticipants: 1,
  });
  expect(fixture.writes[0].body).not.toHaveProperty('tenantId');
  expect(fixture.writes[0].body).not.toHaveProperty('userId');
  expect(fixture.writes[0].body).not.toHaveProperty('status');

  await page.locator('[data-view="requests"]').click();
  await expect(page.getByText(`Anfrage ${REQUEST_ID}`)).toBeVisible();
  await page.getByRole('button', { name: 'Anfrage stornieren' }).click();
  await expect(page.locator('#toast')).toContainText('Anfrage wurde storniert.');
  await expect(page.locator(`[data-production-request-id="${REQUEST_ID}"]`)).toBeFocused();
  expect(fixture.writes[1]).toMatchObject({
    csrf: CSRF_TOKEN,
    body: { transition: 'cancel' },
  });
});

test('Employee production flow invalidates availability after request creation fails', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    requestCreateErrors: [{ status: 409, code: 'REQUEST_CONFLICT' }],
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await page.locator('#productionRoom').selectOption('room-a');
  await page.locator('#productionTitle').fill('Customer workshop');
  await page.locator('#productionDate').fill(futureDate());
  await page.locator('#productionStart').fill('09:00');
  await page.locator('#productionEnd').fill('10:00');
  await page.locator('#productionInternal').fill('1');

  const availability = page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' });
  const submit = page.getByRole('button', { name: 'Anfrage absenden' });
  await availability.click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(submit).toBeDisabled();

  await availability.click();
  await expect(submit).toBeEnabled();
  expect(fixture.availabilityChecks).toHaveLength(2);
  expect(fixture.writes).toHaveLength(1);
});

test('Employee production flow exposes occupied, transport-error, and available states', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    availabilityResponses: [
      { available: false, conflictCount: 1 },
      new Error('upstream unavailable'),
      { available: true, conflictCount: 0 },
    ],
    holdAvailability: true,
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await page.locator('#productionRoom').selectOption('room-a');
  await page.locator('#productionDate').fill(futureDate());
  await page.locator('#productionStart').fill('09:00');
  await page.locator('#productionEnd').fill('10:00');
  const check = page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' });
  const submit = page.getByRole('button', { name: 'Anfrage absenden' });

  await check.click();
  await expect(page.getByText('Raumverfügbarkeit wird serverseitig geprüft …')).toBeVisible();
  await expect(check).toBeDisabled();
  fixture.releaseAvailability();
  await expect(page.getByText(/Der Raum ist im gewählten Zeitraum belegt/)).toBeVisible();
  await expect(submit).toBeDisabled();
  await check.click();
  await expect(page.getByText(/konnte nicht sicher geprüft werden/)).toBeVisible();
  await expect(submit).toBeDisabled();
  await check.click();
  await expect(page.getByText('Der Raum ist im gewählten Zeitraum verfügbar.')).toBeVisible();
  await expect(submit).toBeEnabled();
  expect(fixture.availabilityChecks).toHaveLength(3);
  expect(fixture.writes).toHaveLength(0);
});

test('Employee production flow blocks availability checks without an authoritative site timezone', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, { timeZone: null });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await page.locator('#productionRoom').selectOption('room-a');
  await page.locator('#productionDate').fill(futureDate());
  await page.locator('#productionStart').fill('09:00');
  await page.locator('#productionEnd').fill('10:00');

  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();

  await expect(page.getByText(/keine gültige Zeitzone konfiguriert/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anfrage absenden' })).toBeDisabled();
  expect(fixture.availabilityChecks).toHaveLength(0);
  expect(fixture.writes).toHaveLength(0);
});

test('confirmed-booking dialog retains an inactive booked room and blocks combined participant overflow', async ({ page }) => {
  const catalog = catalogPayload();
  const fixture = await installProductionApplicationFixture(page, { catalog });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  await page.getByRole('button', { name: 'Bestätigte Buchung ändern' }).click();
  const dialog = page.getByRole('dialog');

  await expect(dialog.locator('select')).toHaveValue('room-a');
  await expect(dialog.locator('option[value="room-a"]')).toHaveCount(1);
  await dialog.locator(`#changeInternal-${REQUEST_ID}`).fill('500');
  await dialog.locator(`#changeExternal-${REQUEST_ID}`).fill('1');
  await dialog.getByRole('button', { name: 'Änderung einreichen' }).click();

  await expect(dialog.getByRole('alert')).toContainText(
    'Bitte wählen Sie einen Raum, ein gültiges zukünftiges Zeitfenster und mindestens eine teilnehmende Person.',
  );
  expect(fixture.writes).toHaveLength(0);
});

test('Conference Manager capability is independent and transitions server-owned request state', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  fixture.requests().push({
    id: REQUEST_ID,
    roomId: 'room-a',
    status: 'Submitted',
    statusReason: null,
    startsAt: '2026-09-15T07:00:00.000Z',
    endsAt: '2026-09-15T08:00:00.000Z',
    internalParticipants: 2,
    externalParticipants: 0,
    statusChangedAt: '2026-08-25T20:00:00.000Z',
    updatedAt: '2026-08-25T20:00:00.000Z',
  });

  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('[data-view="manager"]')).toBeVisible();
  await expect(page.locator('[data-view="tenantAdmin"]')).toHaveCount(0);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Prüfung starten' }).click();
  await expect(page.locator('#toast')).toContainText('Workflow-Status wurde aktualisiert.');
  await expect(page.locator(`[data-production-request-id="${REQUEST_ID}"]`)).toBeFocused();

  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({
    csrf: CSRF_TOKEN,
    body: { transition: 'start_review' },
  });
});

test('Conference Manager keeps applying proposals visible but fail-closed', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    bookingChange: bookingChangeFixture('applying'),
  });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();

  await expect(page.getByText('Umsetzung läuft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Änderung freigeben' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Änderung ablehnen' })).toHaveCount(0);
});

test('Conference Manager serializes a booking-change decision across refreshes', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    bookingChange: bookingChangeFixture(),
    holdBookingDecision: true,
  });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Änderung freigeben' }).click();
  await expect.poll(() => fixture.decisionWrites.length).toBe(1);

  await page.getByRole('button', { name: 'Aktualisieren' }).click();
  await expect(page.getByRole('button', { name: 'Änderung freigeben' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Änderung ablehnen' })).toBeDisabled();
  expect(fixture.decisionWrites).toHaveLength(1);

  fixture.releaseBookingDecision();
  await expect(page.locator('#toast')).toContainText('Die Änderung wurde erfolgreich umgesetzt.');
  expect(fixture.decisionWrites).toHaveLength(1);
});

test('Conference Manager reason validation is accessible and restores focus after refresh', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  fixture.requests().push({
    id: REQUEST_ID,
    roomId: 'room-a',
    status: 'Submitted',
    statusReason: null,
    startsAt: '2026-09-15T07:00:00.000Z',
    endsAt: '2026-09-15T08:00:00.000Z',
    internalParticipants: 2,
    externalParticipants: 0,
    statusChangedAt: '2026-08-25T20:00:00.000Z',
    updatedAt: '2026-08-25T20:00:00.000Z',
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await expect(page.getByText(/15\.09\.2026, 09:00/)).toBeVisible();
  await expect(page.getByText('2026-09-15T07:00:00.000Z')).toHaveCount(0);
  await page.getByRole('button', { name: 'Änderung anfordern' }).click();
  const dialog = page.getByRole('dialog');
  const reason = dialog.getByLabel('Begründung');

  await dialog.getByRole('button', { name: 'Änderung anfordern' }).click();

  await expect(reason).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByRole('alert')).toHaveText('Für diese Aktion ist eine Begründung erforderlich.');
  await expect(reason).toBeFocused();
  await reason.fill('Bitte einen späteren Beginn wählen.');
  await expect(reason).not.toHaveAttribute('aria-invalid');
  await dialog.getByRole('button', { name: 'Änderung anfordern' }).click();

  await expect(page.locator(`[data-production-request-id="${REQUEST_ID}"]`)).toBeFocused();
  expect(fixture.writes.at(-1)).toMatchObject({
    csrf: CSRF_TOKEN,
    body: {
      transition: 'request_change',
      reason: 'Bitte einen späteren Beginn wählen.',
    },
  });
});

test('production bootstrap shows localized loading before the session contract resolves', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, { holdSession: true });
  await page.goto(`${ORIGIN}/`);

  await expect(page.locator('#viewTitle')).toHaveText('Sichere Sitzung wird geladen');
  await expect(page.getByRole('status').filter({ hasText: 'Die serverseitige Microsoft-Sitzung wird geprüft.' })).toBeVisible();
  await expect(page.locator('#mainContent')).toHaveAttribute('aria-busy', 'true');

  fixture.releaseSession();
  await expect(page.locator('#viewTitle')).toHaveText('Willkommen');
  await expect(page.locator('#mainContent')).not.toHaveAttribute('aria-busy');
});

test('Tenant Admin without Conference Manager permission never receives Manager navigation', async ({ page }) => {
  await installProductionApplicationFixture(page, { roles: ['employee', 'tenant_admin'] });
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('[data-view="tenantAdmin"]')).toBeVisible();
  await expect(page.locator('[data-view="manager"]')).toHaveCount(0);
  await expect(page.locator('[data-view="employee"]')).toBeVisible();

  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noOverflow).toBe(true);
});

test('production onboarding explains permissions and maps admin, revoked and Graph failures to recovery guidance', async ({ page }) => {
  await installProductionApplicationFixture(page, {
    roles: ['employee', 'tenant_admin'],
    microsoft365: {
      connection: {
        status: 'revoked',
        placesPermission: 'missing',
        calendarsPermission: 'missing',
        reason: 'provider_unauthorized',
      },
      connectError: { status: 403, code: 'FORBIDDEN' },
      verifyError: { status: 503, code: 'MICROSOFT365_CONNECTION_UNAVAILABLE' },
    },
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="tenantAdmin"]').click();
  await page.locator('[data-tenant-admin-section="microsoft365"]').click();
  const onboarding = page.locator('[data-tenant-onboarding]');

  await expect(onboarding.getByText(/Place\.Read\.All.*Places-Lesezugriff/)).toBeVisible();
  await expect(onboarding.getByText(/Calendars\.ReadBasic\.All.*Kalender-Basislesezugriff/)).toBeVisible();
  await expect(onboarding.getByText(/Berechtigung wurde widerrufen/)).toBeVisible();

  await onboarding.getByRole('button', { name: 'Erneut verbinden' }).click();
  await expect(onboarding.getByText(/mandantenweite Admin-Zustimmung nicht erteilen/)).toBeVisible();

  await onboarding.getByRole('button', { name: 'Verbindung und Berechtigungen prüfen' }).click();
  await expect(onboarding.getByText(/Microsoft Graph oder die sichere Verbindung ist vorübergehend nicht verfügbar/)).toBeVisible();
});
