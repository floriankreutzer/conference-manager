import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionUtcInstant } from '../../src/core/production-time.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://conference.test';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const CSRF_TOKEN = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const REQUEST_ID = 'CR-2026-100001';

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

function catalogPayload(timeZone = 'Europe/Berlin') {
  return {
    schemaVersion: 1,
    catalog: {
      sites: [{ id: 'berlin', name: 'Berlin', active: true, timeZone }],
      rooms: [{ id: 'room-a', siteId: 'berlin', name: 'Room A', capacity: 12, active: true }],
      services: [],
      cateringPackages: [],
      cateringItems: [],
    },
  };
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

async function installProductionApplicationFixture(page, {
  roles = ['employee'],
  timeZone = 'Europe/Berlin',
  availabilityResponses = [{ available: true, conflictCount: 0 }],
  requestCreateErrors = [],
  holdAvailability = false,
  holdSession = false,
  microsoft365 = null,
} = {}) {
  const writes = [];
  const availabilityChecks = [];
  let requests = [];
  let releaseSession = () => {};
  const sessionGate = holdSession
    ? new Promise((resolve) => { releaseSession = resolve; })
    : null;
  let releaseAvailability = () => {};
  const availabilityGate = holdAvailability
    ? new Promise((resolve) => { releaseAvailability = resolve; })
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

    if (url.pathname === '/api/v1/application/catalog' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(catalogPayload(timeZone)),
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
          authorizationUrl: 'https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=fixture',
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
        body: JSON.stringify({ connection: microsoft365.connection }),
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
          : { connection: microsoft365.connection }),
      });
      return;
    }

    if (microsoft365 && url.pathname === '/api/v1/integrations/microsoft365/room-mappings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ mappings: [] }),
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
        body: JSON.stringify({ schemaVersion: 1, requests }),
      });
      return;
    }

    if (url.pathname === '/api/v1/application/requests' && request.method() === 'POST') {
      const body = request.postDataJSON();
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
        body: JSON.stringify({ schemaVersion: 1, request: created }),
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
        body: JSON.stringify({ schemaVersion: 1, request: transitioned }),
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
    releaseAvailability,
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

test('Employee production flow uses server catalog and CSRF-protected request persistence', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  const requestDate = futureDate();
  await page.goto(`${ORIGIN}/`);

  await expect(page.locator('[data-view="manager"]')).toHaveCount(0);
  await expect(page.locator('[data-view="tenantAdmin"]')).toHaveCount(0);
  await page.locator('[data-view="employee"]').click();
  await expect(page.locator('#viewTitle')).toBeFocused();
  await page.locator('#productionRoom').selectOption('room-a');
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
  await expect(page.locator('#viewTitle')).toHaveText('Sicher angemeldet');
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
        reason: 'provider_authorization_failed',
      },
      connectError: { status: 403, code: 'FORBIDDEN' },
      verifyError: { status: 503, code: 'MICROSOFT365_CONNECTION_UNAVAILABLE' },
    },
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="tenantAdmin"]').click();
  const onboarding = page.locator('[data-tenant-onboarding]');

  await expect(onboarding.getByText(/Place\.Read\.All.*Places-Lesezugriff/)).toBeVisible();
  await expect(onboarding.getByText(/Calendars\.ReadBasic\.All.*Kalender-Basislesezugriff/)).toBeVisible();
  await expect(onboarding.getByText(/Berechtigung wurde widerrufen/)).toBeVisible();

  await onboarding.getByRole('button', { name: 'Erneut verbinden' }).click();
  await expect(onboarding.getByText(/mandantenweite Admin-Zustimmung nicht erteilen/)).toBeVisible();

  await onboarding.getByRole('button', { name: 'Verbindung und Berechtigungen prüfen' }).click();
  await expect(onboarding.getByText(/Microsoft Graph oder die sichere Verbindung ist vorübergehend nicht verfügbar/)).toBeVisible();
});
