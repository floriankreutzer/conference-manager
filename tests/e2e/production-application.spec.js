import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function catalogPayload() {
  return {
    schemaVersion: 1,
    catalog: {
      sites: [{ id: 'berlin', name: 'Berlin', active: true }],
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

async function installProductionApplicationFixture(page, { roles = ['employee'] } = {}) {
  const writes = [];
  let requests = [];

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

    if (url.pathname === '/api/v1/application/catalog' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(catalogPayload()),
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
      const nextStatus = body.transition === 'start_review'
        ? 'In Review'
        : (body.transition === 'confirm' ? 'Confirmed' : 'Cancelled');
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

  return { writes, requests: () => requests };
}

function futureDate(days = 14) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

test('Employee production flow uses server catalog and CSRF-protected request persistence', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  await page.goto(`${ORIGIN}/`);

  await expect(page.locator('[data-view="manager"]')).toHaveCount(0);
  await expect(page.locator('[data-view="tenantAdmin"]')).toHaveCount(0);
  await page.locator('[data-view="employee"]').click();
  await expect(page.locator('#viewTitle')).toBeFocused();
  await page.locator('#productionRoom').selectOption('room-a');
  await page.locator('#productionDate').fill(futureDate());
  await page.locator('#productionStart').fill('09:00');
  await page.locator('#productionEnd').fill('10:00');
  await page.locator('#productionInternal').fill('2');
  await page.locator('#productionExternal').fill('1');
  await page.getByRole('button', { name: 'Anfrage absenden' }).click();
  await expect(page.locator('#toast')).toContainText('Anfrage wurde abgesendet.');

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
  expect(fixture.writes[1]).toMatchObject({
    csrf: CSRF_TOKEN,
    body: { transition: 'cancel' },
  });
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

  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({
    csrf: CSRF_TOKEN,
    body: { transition: 'start_review' },
  });
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
