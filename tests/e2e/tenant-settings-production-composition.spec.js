import { expect, test } from '@playwright/test';
import { asProductionHtml } from './fixtures/production-html.js';
import { fulfillApplicationProjection } from './fixtures/application-projections.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://conference.test';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const CSRF_TOKEN = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

const clone = (value) => structuredClone(value);

function organization(displayName = 'Northstar Production') {
  return {
    displayName,
    businessMetadata: {
      legalName: 'Northstar Production GmbH',
      registrationNumber: 'HRB 12345',
      countryCode: 'DE',
    },
    presentation: { defaultLocale: 'de-DE', defaultCurrency: 'EUR' },
    branding: { logoAssetRef: null, accentToken: 'default' },
  };
}

function room({
  id,
  name,
  capacity,
  active = true,
  floor = null,
} = {}) {
  return {
    id,
    siteId: 'berlin',
    name,
    capacity,
    active,
    floor,
    equipment: id === 'atlas' ? ['screen'] : [],
    accessibility: id === 'atlas' ? ['step-free'] : [],
    serviceIds: id === 'atlas' ? ['service-av'] : [],
    cateringPackageIds: [],
    floorplanAssetId: id === 'atlas' ? 'floor-atlas' : null,
    mediaAssetIds: id === 'atlas' ? ['atlas-photo'] : [],
  };
}

function currentLocations(siteName = 'Berlin Current') {
  return {
    sites: [{ id: 'berlin', name: siteName, active: true, timeZone: 'Europe/Berlin', address: null }],
    rooms: [
      room({ id: 'atlas', name: 'Atlas Local', capacity: 20, floor: '2' }),
      room({ id: 'room-new', name: 'Later Room', capacity: 8 }),
    ],
  };
}

function sourceLocations() {
  return {
    sites: [{ id: 'berlin', name: 'Berlin Legacy', active: true, timeZone: 'Europe/Berlin', address: null }],
    rooms: [room({ id: 'atlas', name: 'Atlas Legacy', capacity: 12, floor: '1' })],
  };
}

function rolledBackLocations() {
  return {
    ...sourceLocations(),
    rooms: [
      ...sourceLocations().rooms,
      room({ id: 'room-new', name: 'Later Room', capacity: 8, active: false }),
    ],
  };
}

function providerContext() {
  return [{
    roomId: 'atlas',
    provider: 'microsoft365',
    status: 'active',
    displayName: 'Provider Atlas Authority',
    capacity: 999,
    lastSeenAt: '2026-08-27T10:00:00.000Z',
  }];
}

function catalogue(serviceName = 'AV Service') {
  return {
    services: [{
      id: 'service-av',
      name: serviceName,
      description: 'Production AV support',
      price: { amountMinor: 2500, currency: 'EUR' },
      active: true,
      order: 1,
      siteIds: ['berlin'],
      roomIds: ['atlas'],
    }],
    equipment: [],
    cateringPackages: [],
    cateringItems: [],
  };
}

function bookingPolicies(maximumParticipants = 500) {
  return {
    versions: [{
      id: 'policy-future',
      effectiveFrom: '2099-01-01T00:00:00.000Z',
      rules: {
        minimumLeadTimeMinutes: 60,
        maximumAdvanceMinutes: 525_600,
        cancellationWindowMinutes: 120,
        changeWindowMinutes: 120,
        maximumParticipants,
        allowedSiteIds: ['berlin'],
        allowedRoomIds: ['atlas'],
        allowedServiceIds: ['service-av'],
      },
    }],
  };
}

function costAllocation(name = 'Events') {
  return {
    allocationRequired: true,
    costCenters: [{ id: 'events', code: 'EVENTS', name, group: 'Operations', active: true }],
  };
}

function sessionPayload() {
  return {
    user: { id: ADMIN_ID },
    tenant: { id: TENANT_ID, status: 'active' },
    roles: ['employee', 'tenant_admin'],
    permissions: [
      'request:read',
      'request:cancel',
      'tenant:configure',
      'tenant:users:manage',
      'tenant:integrations:manage',
      'tenant:audit:read',
    ],
    session: { expiresAt: '2099-12-31T23:59:59.000Z' },
    csrfToken: CSRF_TOKEN,
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

async function productionHtml() {
  const source = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  return asProductionHtml(source);
}

function initialState() {
  return {
    organization: { revision: 3, value: organization() },
    locations: { revision: 2, configuration: currentLocations(), providerContext: providerContext() },
    catalogue: { revision: 4, value: catalogue() },
    bookingPolicies: { revision: 5, configuration: bookingPolicies() },
    costAllocation: { revision: 6, configuration: costAllocation() },
  };
}

function changedAt(revision) {
  return `2026-08-27T10:${String(revision).padStart(2, '0')}:00.000Z`;
}

async function installProductionSettingsFixture(page, { organizationConflict = true } = {}) {
  const state = initialState();
  const writes = [];
  const reads = [];
  const unexpectedApiRequests = [];
  let organizationConflictPending = organizationConflict;

  const fulfillJson = (route, body, status = 200) => route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
  const recordWrite = (request, url) => {
    const entry = {
      path: url.pathname,
      method: request.method(),
      csrf: request.headers()['x-csrf-token'],
      body: request.postDataJSON(),
    };
    writes.push(entry);
    return entry.body;
  };
  const conflict = (route, currentRevision) => fulfillJson(route, {
    error: {
      code: 'TENANT_SETTINGS_REVISION_CONFLICT',
      currentRevision,
      requestId: REQUEST_ID,
    },
  }, 409);

  await page.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname.startsWith('/api/')) reads.push({ path: `${url.pathname}${url.search}`, method });

    if (url.pathname === '/api/v1/session' && method === 'GET') {
      await fulfillJson(route, sessionPayload());
      return;
    }

    if (url.pathname === '/api/v1/tenant/presentation' && method === 'GET') {
      await fulfillJson(route, {
        schemaVersion: 1,
        revision: state.organization.revision,
        presentation: {
          displayName: state.organization.value.displayName,
          defaultLocale: state.organization.value.presentation.defaultLocale,
          defaultCurrency: state.organization.value.presentation.defaultCurrency,
          branding: {
            logoPreset: state.organization.value.branding.logoAssetRef === null
              ? 'product-default'
              : 'conference-manager-mark',
            accentToken: 'default',
          },
        },
      });
      return;
    }

    if (url.pathname === '/api/v1/tenant/settings/organization' && method === 'GET') {
      await fulfillJson(route, {
        schemaVersion: 1,
        revision: state.organization.revision,
        organization: state.organization.value,
      });
      return;
    }
    if (url.pathname === '/api/v1/tenant/settings/organization/history' && method === 'GET') {
      await fulfillJson(route, {
        schemaVersion: 1,
        revisions: [{
          revision: state.organization.revision,
          effectiveAt: changedAt(state.organization.revision),
          organization: state.organization.value,
        }],
        nextBeforeRevision: null,
      });
      return;
    }
    if (url.pathname === '/api/v1/tenant/settings/organization' && method === 'PUT') {
      const body = recordWrite(request, url);
      if (organizationConflictPending) {
        organizationConflictPending = false;
        state.organization.revision += 1;
        await conflict(route, state.organization.revision);
        return;
      }
      state.organization = {
        revision: body.expectedRevision + 1,
        value: clone(body.organization),
      };
      await fulfillJson(route, {
        schemaVersion: 1,
        revision: state.organization.revision,
        organization: state.organization.value,
      });
      return;
    }

    if (url.pathname === '/api/v1/tenant/settings/locations' && method === 'GET') {
      await fulfillJson(route, { locations: {
        schemaVersion: 1,
        revision: state.locations.revision,
        configuration: state.locations.configuration,
        providerContext: state.locations.providerContext,
      } });
      return;
    }
    if (url.pathname === '/api/v1/tenant/settings/locations/history' && method === 'GET') {
      await fulfillJson(route, { history: [
        { revision: state.locations.revision, changedAt: changedAt(state.locations.revision), actorUserId: ADMIN_ID },
        { revision: 1, changedAt: changedAt(1), actorUserId: ADMIN_ID },
      ] });
      return;
    }
    if (url.pathname === '/api/v1/tenant/settings/locations/history/1' && method === 'GET') {
      await fulfillJson(route, { revision: {
        revision: 1,
        configuration: sourceLocations(),
        changedAt: changedAt(1),
        actorUserId: ADMIN_ID,
      } });
      return;
    }
    if (url.pathname === '/api/v1/tenant/settings/locations' && method === 'PUT') {
      const body = recordWrite(request, url);
      state.locations.revision = body.expectedRevision + 1;
      state.locations.configuration = clone(body.configuration);
      await fulfillJson(route, { locations: {
        schemaVersion: 1,
        revision: state.locations.revision,
        configuration: state.locations.configuration,
        providerContext: state.locations.providerContext,
      } });
      return;
    }
    if (url.pathname === '/api/v1/tenant/settings/locations/rollback' && method === 'POST') {
      const body = recordWrite(request, url);
      state.locations.revision = body.expectedRevision + 1;
      state.locations.configuration = rolledBackLocations();
      await fulfillJson(route, { locations: {
        schemaVersion: 1,
        revision: state.locations.revision,
        configuration: state.locations.configuration,
        providerContext: state.locations.providerContext,
      } });
      return;
    }

    if (url.pathname === '/api/v1/tenant/settings/catalogue' && method === 'GET') {
      await fulfillJson(route, {
        schemaVersion: 1,
        revision: state.catalogue.revision,
        catalogue: state.catalogue.value,
      });
      return;
    }
    if (url.pathname === '/api/v1/tenant/settings/catalogue/history' && method === 'GET') {
      await fulfillJson(route, {
        schemaVersion: 1,
        revisions: [{
          revision: state.catalogue.revision,
          effectiveAt: changedAt(state.catalogue.revision),
          catalogue: state.catalogue.value,
        }],
        nextBeforeRevision: null,
      });
      return;
    }
    if (url.pathname === '/api/v1/tenant/settings/catalogue' && method === 'PUT') {
      const body = recordWrite(request, url);
      state.catalogue = { revision: body.expectedRevision + 1, value: clone(body.catalogue) };
      await fulfillJson(route, {
        schemaVersion: 1,
        revision: state.catalogue.revision,
        catalogue: state.catalogue.value,
      });
      return;
    }

    if (url.pathname === '/api/v1/tenant/settings/booking-policies' && method === 'GET') {
      await fulfillJson(route, { bookingPolicies: {
        schemaVersion: 1,
        revision: state.bookingPolicies.revision,
        configuration: state.bookingPolicies.configuration,
      } });
      return;
    }
    if (url.pathname === '/api/v1/tenant/settings/booking-policies/history' && method === 'GET') {
      await fulfillJson(route, { history: [{
        revision: state.bookingPolicies.revision,
        changedAt: changedAt(state.bookingPolicies.revision),
        actorUserId: ADMIN_ID,
      }] });
      return;
    }
    if (url.pathname === '/api/v1/tenant/settings/booking-policies' && method === 'PUT') {
      const body = recordWrite(request, url);
      state.bookingPolicies = {
        revision: body.expectedRevision + 1,
        configuration: clone(body.configuration),
      };
      await fulfillJson(route, { bookingPolicies: {
        schemaVersion: 1,
        revision: state.bookingPolicies.revision,
        configuration: state.bookingPolicies.configuration,
      } });
      return;
    }

    if (url.pathname === '/api/v1/tenant/settings/cost-allocation' && method === 'GET') {
      await fulfillJson(route, { costAllocation: {
        schemaVersion: 1,
        revision: state.costAllocation.revision,
        configuration: state.costAllocation.configuration,
      } });
      return;
    }
    if (url.pathname === '/api/v1/tenant/settings/cost-allocation/history' && method === 'GET') {
      await fulfillJson(route, { history: [{
        revision: state.costAllocation.revision,
        changedAt: changedAt(state.costAllocation.revision),
        actorUserId: ADMIN_ID,
      }] });
      return;
    }
    if (url.pathname === '/api/v1/tenant/settings/cost-allocation' && method === 'PUT') {
      const body = recordWrite(request, url);
      state.costAllocation = {
        revision: body.expectedRevision + 1,
        configuration: clone(body.configuration),
      };
      await fulfillJson(route, { costAllocation: {
        schemaVersion: 1,
        revision: state.costAllocation.revision,
        configuration: state.costAllocation.configuration,
      } });
      return;
    }

    if (await fulfillApplicationProjection(route)) return;

    if (url.pathname.startsWith('/api/')) {
      unexpectedApiRequests.push({ path: url.pathname, method });
      await fulfillJson(route, { error: { code: 'NOT_FOUND' } }, 404);
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

  return { state, writes, reads, unexpectedApiRequests };
}

async function openTenantSettings(page) {
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('html')).toHaveAttribute('data-app-build', /\S+/);
  await page.locator('[data-view="tenantAdmin"]').click();
  await expect(page.locator('[data-tenant-admin-shell]')).toBeVisible();
}

async function openSection(page, sectionId, formId) {
  await page.locator(`[data-tenant-admin-section="${sectionId}"]`).click();
  const content = page.locator(`[data-tenant-admin-section-content="${sectionId}"]`);
  await expect(content.locator(`[data-tenant-settings-form="${formId}"]`)).toBeVisible();
  return content;
}

async function submit(content, formId) {
  await content.locator(`[data-tenant-settings-form="${formId}"] button[type="submit"]`).click();
}

test('Production composition writes all settings with exact CSRF/revisions and reapplies one conflict', async ({ page }) => {
  const fixture = await installProductionSettingsFixture(page);
  await openTenantSettings(page);

  let content = await openSection(page, 'organization', 'organization');
  await content.locator('#tenant-organization-display-name').fill('Northstar Reapplied');
  await submit(content, 'organization');
  await expect(content.locator('[data-tenant-settings-conflict-reapply="true"]')).toBeVisible();
  await content.locator('[data-tenant-settings-conflict-reapply="true"]').click();
  await expect.poll(() => fixture.writes.length).toBe(2);
  await expect(content.locator('#tenant-organization-display-name')).toHaveValue('Northstar Reapplied');

  content = await openSection(page, 'locations', 'locations');
  const providerDetails = content.locator('[data-tenant-room-id="atlas"] dl');
  await expect(providerDetails).toContainText('Provider Atlas Authority');
  await expect(providerDetails).toContainText('999');
  await expect(providerDetails.locator('input, select, textarea, button')).toHaveCount(0);
  const editableLocationValues = await content.locator('input, select, textarea').evaluateAll(
    (controls) => controls.map(({ value }) => value),
  );
  expect(editableLocationValues).not.toContain('Provider Atlas Authority');
  expect(editableLocationValues).not.toContain('999');
  expect(editableLocationValues).not.toContain('2026-08-27T10:00:00.000Z');
  await expect(content.locator('#tenant-room-name-0')).toHaveValue('Atlas Local');
  await expect(content.locator('#tenant-room-capacity-0')).toHaveValue('20');
  await content.locator('#tenant-site-name-0').fill('Berlin Production');
  await submit(content, 'locations');
  await expect.poll(() => fixture.writes.length).toBe(3);
  await expect(content.locator('#tenant-site-name-0')).toHaveValue('Berlin Production');

  content = await openSection(page, 'catalog', 'catalogue');
  await content.locator('#tenant-catalogue-services-0-name').fill('Production AV');
  await submit(content, 'catalogue');
  await expect.poll(() => fixture.writes.length).toBe(4);
  await expect(content.locator('#tenant-catalogue-services-0-name')).toHaveValue('Production AV');

  content = await openSection(page, 'booking-policies', 'booking-policies');
  await content.locator('#tenant-policy-0-participants').fill('450');
  await submit(content, 'booking-policies');
  await expect.poll(() => fixture.writes.length).toBe(5);
  await expect(content.locator('#tenant-policy-0-participants')).toHaveValue('450');

  content = await openSection(page, 'cost-allocation', 'cost-allocation');
  await content.locator('#tenant-cost-center-0-name').fill('Production Events');
  await submit(content, 'cost-allocation');
  await expect.poll(() => fixture.writes.length).toBe(6);
  await expect(content.locator('#tenant-cost-center-0-name')).toHaveValue('Production Events');

  const expectedOrganization = organization('Northstar Reapplied');
  expect(fixture.writes).toEqual([
    {
      path: '/api/v1/tenant/settings/organization', method: 'PUT', csrf: CSRF_TOKEN,
      body: { schemaVersion: 1, expectedRevision: 3, organization: expectedOrganization },
    },
    {
      path: '/api/v1/tenant/settings/organization', method: 'PUT', csrf: CSRF_TOKEN,
      body: { schemaVersion: 1, expectedRevision: 4, organization: expectedOrganization },
    },
    {
      path: '/api/v1/tenant/settings/locations', method: 'PUT', csrf: CSRF_TOKEN,
      body: { schemaVersion: 1, expectedRevision: 2, configuration: currentLocations('Berlin Production') },
    },
    {
      path: '/api/v1/tenant/settings/catalogue', method: 'PUT', csrf: CSRF_TOKEN,
      body: { schemaVersion: 1, expectedRevision: 4, catalogue: catalogue('Production AV') },
    },
    {
      path: '/api/v1/tenant/settings/booking-policies', method: 'PUT', csrf: CSRF_TOKEN,
      body: { schemaVersion: 1, expectedRevision: 5, configuration: bookingPolicies(450) },
    },
    {
      path: '/api/v1/tenant/settings/cost-allocation', method: 'PUT', csrf: CSRF_TOKEN,
      body: { schemaVersion: 1, expectedRevision: 6, configuration: costAllocation('Production Events') },
    },
  ]);
  expect(Object.hasOwn(fixture.writes[2].body, 'providerContext')).toBe(false);
  expect(JSON.stringify(fixture.writes[2].body)).not.toContain('Provider Atlas Authority');
  expect(JSON.stringify(fixture.writes)).not.toContain(TENANT_ID);

  const readPaths = new Set(fixture.reads.filter(({ method }) => method === 'GET').map(({ path: value }) => value));
  for (const expectedPath of [
    '/api/v1/session',
    '/api/v1/tenant/presentation',
    '/api/v1/tenant/settings/organization',
    '/api/v1/tenant/settings/organization/history?limit=10',
    '/api/v1/tenant/settings/locations',
    '/api/v1/tenant/settings/locations/history?limit=20',
    '/api/v1/tenant/settings/catalogue',
    '/api/v1/tenant/settings/catalogue/history?limit=10',
    '/api/v1/tenant/settings/booking-policies',
    '/api/v1/tenant/settings/booking-policies/history?limit=20',
    '/api/v1/tenant/settings/cost-allocation',
    '/api/v1/tenant/settings/cost-allocation/history?limit=20',
  ]) expect(readPaths.has(expectedPath), expectedPath).toBe(true);
  expect(fixture.unexpectedApiRequests).toEqual([]);
});

test('Production Locations rollback requires revision preview and explicit confirmation', async ({ page }) => {
  const fixture = await installProductionSettingsFixture(page, { organizationConflict: false });
  await openTenantSettings(page);
  const content = await openSection(page, 'locations', 'locations');

  await content.locator('[data-source-revision="1"]').click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.locator('[data-tenant-location-rollback-preview="true"]')).toBeVisible();
  await expect(dialog.locator('[data-tenant-location-rollback-changed-sites]')).toHaveAttribute(
    'data-tenant-location-rollback-changed-sites', '1',
  );
  await expect(dialog.locator('[data-tenant-location-rollback-changed-rooms]')).toHaveAttribute(
    'data-tenant-location-rollback-changed-rooms', '2',
  );
  await expect(dialog.locator('[data-tenant-location-rollback-retained-rooms]')).toHaveAttribute(
    'data-tenant-location-rollback-retained-rooms', '1',
  );
  await expect(dialog.locator('[data-tenant-location-rollback-consequence="true"]')).toBeVisible();
  const confirm = dialog.locator('[data-tenant-location-rollback-confirm="true"]');
  await expect(confirm).toHaveAttribute('data-expected-revision', '2');
  await expect(confirm).toHaveAttribute('data-source-revision', '1');
  expect(fixture.writes).toEqual([]);

  await confirm.click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0]).toEqual({
    path: '/api/v1/tenant/settings/locations/rollback',
    method: 'POST',
    csrf: CSRF_TOKEN,
    body: { schemaVersion: 1, expectedRevision: 2, sourceRevision: 1 },
  });
  await expect(dialog).toHaveCount(0);
  await expect(content.locator('#tenant-site-name-0')).toHaveValue('Berlin Legacy');
  await expect(content.locator('[data-tenant-room-id="room-new"] input[type="checkbox"]')).not.toBeChecked();
  await expect(content.locator('[data-tenant-room-id="atlas"] dl')).toContainText('Provider Atlas Authority');
  expect(fixture.reads).toContainEqual({
    path: '/api/v1/tenant/settings/locations/history/1',
    method: 'GET',
  });
  expect(fixture.unexpectedApiRequests).toEqual([]);
});
