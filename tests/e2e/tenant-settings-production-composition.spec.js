import { attachCustomerScreenEvidence } from './fixtures/customer-screen-evidence.js';
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
    guestPublicValues: null,
  };
}

function currentLocations(siteName = 'Berlin Current') {
  return {
    sites: [{ id: 'berlin', name: siteName, active: true, timeZone: 'Europe/Berlin', address: null, guestInformation: null, guestPublicValues: null }],
    rooms: [
      room({ id: 'atlas', name: 'Atlas Local', capacity: 20, floor: '2' }),
      room({ id: 'room-new', name: 'Later Room', capacity: 8 }),
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
    bookingPolicies: { revision: 5, configuration: bookingPolicies() },
    costAllocation: { revision: 6, configuration: costAllocation() },
  };
}

function changedAt(revision) {
  return `2026-08-27T10:${String(revision).padStart(2, '0')}:00.000Z`;
}

async function installProductionSettingsFixture(page, {
  organizationConflict = true,
  holdOrganizationReapplyRead = false,
  cateringEnabled = false,
  cateringConnections = [],
  cateringCreateResponseLost = false,
  cateringConflict = false,
} = {}) {
  const state = initialState();
  const cateringWrites = [];
  const cateringCommands = new Map();
  state.catering = clone(cateringConnections);
  let cateringCreateFailure = cateringCreateResponseLost;
  let cateringConflictPending = cateringConflict;
  const writes = [];
  const reads = [];
  const unexpectedApiRequests = [];
  let organizationConflictPending = organizationConflict;
  let organizationReadCount = 0;
  let releaseOrganizationReapplyRead = () => {};
  const organizationReapplyReadGate = holdOrganizationReapplyRead
    ? new Promise((resolve) => { releaseOrganizationReapplyRead = resolve; })
    : null;

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

    if (url.pathname === '/api/v1/integrations/catering' && method === 'GET') {
      if (!cateringEnabled) {
        await fulfillJson(route, { error: { code: 'NOT_FOUND' } }, 404);
        return;
      }
      const capabilities = Object.fromEntries(['catalogue', 'availability', 'order', 'update', 'cancel', 'status']
        .map((name) => [`catering.${name}`, 'manual']));
      const after = url.searchParams.get('afterIntegrationId');
      const rows = state.catering.filter((entry) => after === null || entry.integrationId > after)
        .sort((a, b) => a.integrationId.localeCompare(b.integrationId));
      await fulfillJson(route, { schemaVersion: 1,
        providers: [{ providerId: 'manual_catering', capabilities }], connections: rows.slice(0, 20),
        nextAfterIntegrationId: rows.length > 20 ? rows[19].integrationId : null });
      return;
    }
    if (cateringEnabled && url.pathname === '/api/v1/integrations/catering' && method === 'POST') {
      const body = request.postDataJSON();
      cateringWrites.push({ body: clone(body), csrf: request.headers()['x-csrf-token'], method });
      let saved = cateringCommands.get(body.commandId);
      if (!saved) {
        saved = { schemaVersion: 1, integrationId: '40000000-0000-4000-8000-000000000001',
          providerId: body.providerId, revision: 1, configuration: clone(body.configuration) };
        cateringCommands.set(body.commandId, saved);
        state.catering.push(saved);
      }
      if (cateringCreateFailure) {
        cateringCreateFailure = false;
        await fulfillJson(route, { error: { code: 'UNAVAILABLE' } }, 503);
      } else await fulfillJson(route, saved);
      return;
    }
    const cateringMatch = /^\/api\/v1\/integrations\/catering\/([0-9a-f-]{36})\/configuration$/.exec(url.pathname);
    if (cateringEnabled && cateringMatch && method === 'PUT') {
      const body = request.postDataJSON();
      cateringWrites.push({ body: clone(body), csrf: request.headers()['x-csrf-token'], method });
      const saved = state.catering.find((entry) => entry.integrationId === cateringMatch[1]);
      if (cateringConflictPending) {
        cateringConflictPending = false;
        saved.revision += 1;
        await conflict(route, saved.revision);
      } else if (saved.revision !== body.expectedRevision) await conflict(route, saved.revision);
      else {
        saved.revision += 1;
        saved.configuration = clone(body.configuration);
        await fulfillJson(route, saved);
      }
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
      organizationReadCount += 1;
      if (organizationReapplyReadGate && writes.some((entry) => entry.path === '/api/v1/tenant/settings/organization')) {
        await organizationReapplyReadGate;
      }
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
      const schemaVersion = Number(url.searchParams.get('schemaVersion') || 1);
      const configuration = schemaVersion === 1 ? {
        sites: state.locations.configuration.sites.map(({ guestInformation, guestPublicValues, ...site }) => site),
        rooms: state.locations.configuration.rooms.map(({ guestPublicValues, ...room }) => room),
      } : state.locations.configuration;
      await fulfillJson(route, { locations: {
        schemaVersion,
        revision: state.locations.revision,
        configuration,
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
    if (url.pathname === '/api/v1/tenant/settings/locations' && method === 'PUT') {
      const body = recordWrite(request, url);
      state.locations.revision = body.expectedRevision + 1;
      state.locations.configuration = clone(body.configuration);
      await fulfillJson(route, { locations: {
        schemaVersion: body.schemaVersion,
        revision: state.locations.revision,
        configuration: state.locations.configuration,
        providerContext: state.locations.providerContext,
      } });
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

  return {
    state,
    cateringWrites,
    writes,
    reads,
    unexpectedApiRequests,
    organizationReads: () => organizationReadCount,
    releaseOrganizationReapplyRead,
  };
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

for (const language of ['de', 'en']) {

  for (const owner of [
    { id: 'organization', field: '#tenant-organization-display-name', revision: 3 },
    { id: 'booking-policies', field: '#tenant-policy-0-advance', revision: 5 },
    { id: 'cost-allocation', field: '#tenant-cost-center-0-name', revision: 6 },
  ]) {
    test(`CO-306 post-save focus preserves the next ${owner.id} keyboard edit in ${language}`, async ({ page }, testInfo) => {
      await page.addInitScript((value) => localStorage.setItem('conference_language_v1', value), language);
      const fixture = await installProductionSettingsFixture(page, { organizationConflict: false });
      fixture.state.bookingPolicies.configuration.versions[0].rules.maximumAdvanceMinutes = 527040;
      const original = clone(owner.id === 'organization'
        ? fixture.state.organization.value
        : owner.id === 'booking-policies'
          ? fixture.state.bookingPolicies.configuration
          : fixture.state.costAllocation.configuration);
      await openTenantSettings(page);
      const content = await openSection(page, owner.id, owner.id);
      const heading = content.locator('h2').first();
      await expect(heading).toBeVisible();
      // Navigation can focus the loading heading before the async form replaces it.
      // Finish that native frame before holding only the post-save callbacks.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

      // Hold application frames after normal navigation has completed. Draining
      // the whole bounded queue also runs announcements before the owned focus.
      await page.evaluate(() => {
        const callbacks = [];
        window.requestAnimationFrame = (callback) => {
          callbacks.push(callback);
          return callbacks.length;
        };
        window.tenantPostSaveFocusTest = {
          drain: () => {
            let count = 0;
            while (callbacks.length) {
              if (++count > 20) throw new Error('TENANT_FOCUS_CALLBACK_LIMIT');
              callbacks.shift()(performance.now());
            }
            return count;
          },
        };
      });

      const revisionText = (revision) => language === 'de'
        ? `Konfigurationsstand: ${revision}`
        : `Configuration revision: ${revision}`;
      await submit(content, owner.id);
      await expect.poll(() => fixture.writes.length).toBe(1);
      await expect(content.getByText(revisionText(owner.revision + 1), { exact: true })).toBeVisible();
      const normalCallbacks = await page.evaluate(() => window.tenantPostSaveFocusTest.drain());
      expect(normalCallbacks).toBeGreaterThan(0);
      await expect(heading).toBeFocused();

      await submit(content, owner.id);
      await expect.poll(() => fixture.writes.length).toBe(2);
      await expect(content.getByText(revisionText(owner.revision + 2), { exact: true })).toBeVisible();
      if (owner.id === 'cost-allocation') {
        const row = content.locator('details.catalogue-editor-row').first();
        if (!(await row.evaluate((node) => node.open))) await row.locator(':scope > summary').click();
      }
      const target = content.locator(owner.field);
      await expect(target).toBeVisible();
      await target.focus();
      await target.press('ControlOrMeta+A');
      const interruptedCallbacks = await page.evaluate(() => window.tenantPostSaveFocusTest.drain());
      expect(interruptedCallbacks).toBeGreaterThan(0);
      const focusAfterDrain = await target.evaluate((node) => ({
        target: document.activeElement === node,
        heading: document.activeElement === node.closest('[data-tenant-admin-section-content]')?.querySelector('h2'),
      }));
      await testInfo.attach('tenant-post-save-focus-order', {
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify({ owner: owner.id, language, normalCallbacks, interruptedCallbacks, focusAfterDrain })),
      });
      await expect(target).toBeFocused();

      const typedValue = owner.id === 'booking-policies' ? '0.001' : `Keyboard edit ${language}`;
      await page.keyboard.type(typedValue);
      await expect(target).toHaveValue(typedValue);
      if (owner.id === 'booking-policies') {
        // The input event must validate before any submit/validation fallback.
        await expect(target).toHaveAttribute('aria-invalid', 'true');
        await submit(content, owner.id);
        expect(fixture.writes).toHaveLength(2);
        await expect(target).toBeFocused();
        await target.press('ControlOrMeta+A');
        await page.keyboard.type('367');
        await expect(target).toHaveValue('367');
        await expect(target).not.toHaveAttribute('aria-invalid', 'true');
      }
      await submit(content, owner.id);
      await expect.poll(() => fixture.writes.length).toBe(3);
      await expect(content.getByText(revisionText(owner.revision + 3), { exact: true })).toBeVisible();
      const finalCallbacks = await page.evaluate(() => window.tenantPostSaveFocusTest.drain());
      expect(finalCallbacks).toBeGreaterThan(0);
      await expect(heading).toBeFocused();

      const expected = clone(original);
      if (owner.id === 'organization') expected.displayName = typedValue;
      else if (owner.id === 'booking-policies') expected.versions[0].rules.maximumAdvanceMinutes = 528480;
      else expected.costCenters[0].name = typedValue;
      for (let index = 0; index < fixture.writes.length; index += 1) {
        const write = fixture.writes[index];
        expect(write.path).toBe(`/api/v1/tenant/settings/${owner.id}`);
        expect(write.method).toBe('PUT');
        expect(write.csrf).toBe(CSRF_TOKEN);
        expect(write.body.expectedRevision).toBe(owner.revision + index);
        expect(owner.id === 'organization' ? write.body.organization : write.body.configuration)
          .toEqual(index < 2 ? original : expected);
      }
    });
  }

  test(`CO-306 policy duration units preserve minutes and reject fractional minutes in ${language}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('conference_language_v1', value), language);
    const fixture = await installProductionSettingsFixture(page);
    fixture.state.bookingPolicies.configuration.versions[0].rules.maximumAdvanceMinutes = 527040;
    const original = clone(fixture.state.bookingPolicies.configuration);
    await openTenantSettings(page);
    const content = await openSection(page, 'booking-policies', 'booking-policies');
    const amount = content.locator('#tenant-policy-0-advance');
    const unit = content.locator('#tenant-policy-0-advance-unit');
    await expect(unit).toHaveValue('days');
    await expect(amount).toHaveValue('366');
    await unit.selectOption('minutes');
    await expect(amount).toHaveValue('527040');
    await unit.selectOption('hours');
    await expect(amount).toHaveValue('8784');
    await unit.selectOption('days');
    await expect(amount).toHaveValue('366');
    await submit(content, 'booking-policies');
    await expect.poll(() => fixture.writes.length).toBe(1);
    expect(fixture.writes[0].body.configuration).toEqual(original);
    expect(fixture.writes[0].body.expectedRevision).toBe(5);
    expect(fixture.writes[0].csrf).toBe(CSRF_TOKEN);
    await expect(content.getByText(language === 'de' ? 'Konfigurationsstand: 6' : 'Configuration revision: 6')).toBeVisible();
    await amount.fill('0.001');
    await submit(content, 'booking-policies');
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
    await expect(amount).toBeFocused();
    expect(fixture.writes).toHaveLength(1);
    await amount.fill('367');
    await submit(content, 'booking-policies');
    await expect.poll(() => fixture.writes.length).toBe(2);
    expect(fixture.writes[1].body.configuration.versions[0].rules.maximumAdvanceMinutes).toBe(528480);
  });

  test(`CO-306 Tenant searches preserve complete owned snapshots in ${language}`, async ({ page }, testInfo) => {
    await page.addInitScript((value) => localStorage.setItem('conference_language_v1', value), language);
    const fixture = await installProductionSettingsFixture(page);
    fixture.state.locations.configuration.rooms.push(...Array.from({ length: 8 }, (_, index) => room({
      id: `extra-${index}`, name: `Extra room ${index}`, capacity: 8,
    })));
    fixture.state.costAllocation.configuration.costCenters = Array.from({ length: 18 }, (_, index) => ({
      id: `center-${index}`, code: `CENTER_${index}`, name: `Center ${index}`, group: null, active: true,
    }));
    const originalLocations = clone(fixture.state.locations.configuration);
    const originalCosts = clone(fixture.state.costAllocation.configuration);
    await openTenantSettings(page);
    let content = await openSection(page, 'locations', 'locations-technical');
    await content.locator('#tenant-rooms-search').fill('Extra room 7');
    const roomEntry = content.locator('[data-tenant-room-id="extra-7"]').locator('..');
    await roomEntry.locator(':scope > summary').focus();
    await page.keyboard.press('Enter');
    await expect(content.locator('#tenant-room-site-9')).toBeVisible();
    await attachCustomerScreenEvidence(page, testInfo, { screen: '22', state: 'filtered-technical-room-details', roles: ['employee', 'tenant_admin'] });
    await content.locator('#tenant-sites-search').fill('Berlin');
    await content.locator('#tenant-site-name-0').fill('Updated Berlin');
    await content.locator('#tenant-sites-search').fill('No match');
    await submit(content, 'locations-technical');
    await expect.poll(() => fixture.writes.length).toBe(1);
    expect(fixture.writes[0].body.configuration).toEqual({ ...originalLocations,
      sites: [{ ...originalLocations.sites[0], name: 'Updated Berlin' }],
    });
    expect(fixture.writes[0].body.expectedRevision).toBe(2);
    expect(fixture.writes[0].csrf).toBe(CSRF_TOKEN);
    content = await openSection(page, 'cost-allocation', 'cost-allocation');
    await content.locator('#tenant-cost-centers-search').fill('Center 17');
    await content.locator('[data-cost-center-id="center-17"]').locator('..').locator(':scope > summary').click();
    await attachCustomerScreenEvidence(page, testInfo, { screen: '24', state: 'filtered-cost-center-before-edit', roles: ['employee', 'tenant_admin'] });
    await content.locator('#tenant-cost-center-17-name').fill('Updated center');
    await content.locator('#tenant-cost-centers-search').fill('No match');
    await submit(content, 'cost-allocation');
    await expect.poll(() => fixture.writes.length).toBe(2);
    expect(fixture.writes[1].body.configuration).toEqual({ ...originalCosts,
      costCenters: originalCosts.costCenters.map((entry, index) => index === 17 ? { ...entry, name: 'Updated center' } : entry),
    });
    expect(fixture.writes[1].body.expectedRevision).toBe(6);
    expect(fixture.writes[1].csrf).toBe(CSRF_TOKEN);
    await expect(content.locator('[data-tenant-settings-form="cost-allocation"] button[type="submit"]')).toBeEnabled();
    await attachCustomerScreenEvidence(page, testInfo, { screen: '24', state: 'after-confirmed-complete-snapshot-save', roles: ['employee', 'tenant_admin'] });
    for (const width of [390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test('REG-01 REG-02: Tenant Admin writes owned settings and excludes Manager-owned fields', async ({ page }) => {
  const fixture = await installProductionSettingsFixture(page);
  await openTenantSettings(page);

  await expect(page.locator('[data-view="manager"]')).toHaveCount(0);
  await expect(page.locator('[data-tenant-admin-section="catering"]')).toHaveCount(0);

  let content = await openSection(page, 'organization', 'organization');
  await content.locator('#tenant-organization-display-name').fill('Northstar Reapplied');
  await submit(content, 'organization');
  const reapply = content.locator('[data-tenant-settings-conflict-reapply="true"]');
  await expect(reapply).toBeVisible();
  await reapply.click();
  await expect.poll(() => fixture.writes.length).toBe(2);
  await expect(content.locator('#tenant-organization-display-name')).toHaveValue('Northstar Reapplied');

  content = await openSection(page, 'locations', 'locations-technical');
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
  const atlas = content.locator('[data-tenant-room-id="atlas"]');
  await expect(atlas.locator('legend')).toHaveText('Atlas Local');
  await expect(providerDetails.locator('dd').nth(0)).toHaveText('Atlas Local');
  await expect(providerDetails.locator('dd').nth(1)).toHaveText('20');
  await expect(atlas.locator('#tenant-room-name-0, #tenant-room-capacity-0')).toHaveCount(0);
  await expect(atlas.locator('#tenant-room-site-0')).toHaveValue('berlin');
  await content.locator('#tenant-site-name-0').fill('Berlin Production');
  const locationsFormBeforeSave = await content.locator('[data-tenant-settings-form="locations-technical"]').elementHandle();
  await submit(content, 'locations-technical');
  await expect.poll(() => fixture.writes.length).toBe(3);
  await expect.poll(() => locationsFormBeforeSave.evaluate((form) => form.isConnected)).toBe(false);
  await expect(content.locator('#tenant-site-name-0')).toHaveValue('Berlin Production');

  await expect(page.locator(
    '[data-tenant-admin-section="catalog"], [data-tenant-admin-section="catalogue"]',
  )).toHaveCount(0);

  content = await openSection(page, 'booking-policies', 'booking-policies');
  // The app may refresh the entire section when the prior Locations save updates
  // the Tenant presentation. Re-enter the value in the currently connected form
  // and still verify the actual committed payload and revision below.
  const participants = content.locator('#tenant-policy-0-participants');
  await expect.poll(async () => {
    await participants.fill('450');
    return participants.inputValue();
  }).toBe('450');
  await submit(content, 'booking-policies');
  await expect.poll(() => fixture.writes.length).toBe(4);
  await expect(content.getByText('Konfigurationsstand: 6')).toBeVisible();
  await expect(content.locator('#tenant-policy-0-participants')).toHaveValue('450');

  content = await openSection(page, 'cost-allocation', 'cost-allocation');
  await expect(content.getByText('Konfigurationsstand: 6')).toBeVisible();
  const costCenterName = content.locator('#tenant-cost-center-0-name');
  await expect.poll(async () => {
    await costCenterName.fill('Production Events');
    return costCenterName.inputValue();
  }).toBe('Production Events');
  await submit(content, 'cost-allocation');
  await expect.poll(() => fixture.writes.length).toBe(5);
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
      body: { schemaVersion: 3, expectedRevision: 2, configuration: currentLocations('Berlin Production') },
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
    '/api/v1/integrations/catering',
    '/api/v1/tenant/settings/organization',
    '/api/v1/tenant/settings/organization/history?limit=10',
    '/api/v1/tenant/settings/locations?schemaVersion=3',
    '/api/v1/tenant/settings/locations/history?limit=20',
    '/api/v1/tenant/settings/booking-policies',
    '/api/v1/tenant/settings/booking-policies/history?limit=20',
    '/api/v1/tenant/settings/cost-allocation',
    '/api/v1/tenant/settings/cost-allocation/history?limit=20',
  ]) expect(readPaths.has(expectedPath), expectedPath).toBe(true);
  expect(fixture.reads.some(({ path: value }) => (
    value.startsWith('/api/v1/tenant/settings/catalogue')
  ))).toBe(false);
  expect(fixture.unexpectedApiRequests).toEqual([]);
});

for (const language of ['de', 'en']) {
  test(`CO-307 ${language}: organization edits survive Stay and require explicit discard before navigation`, async ({ page }, testInfo) => {
    await page.addInitScript((value) => localStorage.setItem('conference_language_v1', value), language);
    const fixture = await installProductionSettingsFixture(page, { organizationConflict: false });
    await openTenantSettings(page);
    const content = await openSection(page, 'organization', 'organization');
    const registration = content.locator('#tenant-organization-registration-number');
    await attachCustomerScreenEvidence(page, testInfo, { screen: '21', state: 'organization-before-edit', roles: ['employee', 'tenant_admin'] });
    await registration.fill('QA-UNSAVED');
    expect(await page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
    if (language === 'de') await page.locator('[data-tenant-admin-section="booking-policies"]').click();
    else await page.evaluate(() => { location.hash = '#tenant-admin/booking-policies'; });
    const dialog = page.getByRole('dialog');
    const stay = dialog.getByRole('button', { name: language === 'de' ? 'Hier bleiben' : 'Stay here' });
    await expect(stay).toBeFocused();
    await attachCustomerScreenEvidence(page, testInfo, { screen: '21', state: 'unsaved-navigation-dialog', roles: ['employee', 'tenant_admin'] });
    await page.keyboard.press('Enter');
    await expect(registration).toHaveValue('QA-UNSAVED');
    await attachCustomerScreenEvidence(page, testInfo, { screen: '21', state: 'draft-retained-after-stay', roles: ['employee', 'tenant_admin'] });
    expect(fixture.writes).toHaveLength(0);
    await page.locator('[data-view="welcome"]').click();
    await dialog.getByRole('button', { name: language === 'de' ? 'Änderungen verwerfen' : 'Discard changes' }).click();
    await expect(page.locator('#welcomeHeading')).toBeVisible();
    await openTenantSettings(page);
    const restored = await openSection(page, 'organization', 'organization');
    await expect(restored.locator('#tenant-organization-registration-number')).toHaveValue('HRB 12345');
    expect(fixture.writes).toHaveLength(0);
  });
}

test('CO-307 failed save retains edits and Escape cancels navigation without retrying the write', async ({ page }) => {
  await installProductionSettingsFixture(page, { organizationConflict: false });
  let attempts = 0;
  await page.route(`${ORIGIN}/api/v1/tenant/settings/organization`, async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    attempts += 1;
    await route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAVAILABLE' } }) });
  });
  await openTenantSettings(page);
  const content = await openSection(page, 'organization', 'organization');
  const registration = content.locator('#tenant-organization-registration-number');
  await registration.fill('QA-FAILED-SAVE');
  await submit(content, 'organization');
  await expect(content.locator('button[type="submit"]')).toBeEnabled();
  await expect(content.locator('button[type="submit"]')).toBeFocused();
  await expect(registration).toHaveValue('QA-FAILED-SAVE');
  await expect(registration).toBeEnabled();
  await page.locator('[data-view="welcome"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(registration).toHaveValue('QA-FAILED-SAVE');
  expect(attempts).toBe(1);
  expect(await page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
});

test('CO-307 successful organization save allows navigation without a discard warning', async ({ page }) => {
  const fixture = await installProductionSettingsFixture(page, { organizationConflict: false });
  await openTenantSettings(page);
  const content = await openSection(page, 'organization', 'organization');
  await content.locator('#tenant-organization-registration-number').fill('QA-SAVED');
  const originalForm = await content.locator('[data-tenant-settings-form="organization"]').elementHandle();
  await submit(content, 'organization');
  await expect.poll(() => fixture.writes.length).toBe(1);
  await expect.poll(() => originalForm.evaluate((form) => form.isConnected)).toBe(false);
  await expect(content.locator('#tenant-organization-registration-number')).toHaveValue('QA-SAVED');
  await page.locator('[data-view="welcome"]').click();
  await expect(page.locator('#welcomeHeading')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('deferred section navigation focus preserves an active settings edit', async ({ page }) => {
  const fixture = await installProductionSettingsFixture(page, { organizationConflict: false });
  await openTenantSettings(page);
  await page.evaluate(() => {
    const original = window.requestAnimationFrame.bind(window);
    const pending = [];
    window.requestAnimationFrame = (callback) => {
      if (!callback.toString().includes('focusSectionId')) return original(callback);
      pending.push(callback);
      return 0;
    };
    window.flushSectionNavigationFocus = () => {
      if (pending.length !== 1) throw new Error('Expected one deferred section focus');
      pending.splice(0).forEach((callback) => callback(performance.now()));
      window.requestAnimationFrame = original;
    };
  });
  const content = await openSection(page, 'organization', 'organization');
  const name = content.locator('#tenant-organization-display-name');
  await name.fill('Northstar Focus Retained');
  await expect(name).toBeFocused();
  await page.evaluate(() => window.flushSectionNavigationFocus());
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Northstar Focus Retained');
  await submit(content, 'organization');
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0].body.organization.displayName).toBe('Northstar Focus Retained');
  await expect(content.locator('#tenant-organization-display-name')).toHaveValue('Northstar Focus Retained');
});

test('Tenant Admin sees Location history without a mixed-ownership rollback action', async ({ page }) => {
  const fixture = await installProductionSettingsFixture(page, { organizationConflict: false });
  await openTenantSettings(page);
  const content = await openSection(page, 'locations', 'locations-technical');

  await expect(content.getByText(/Stand 1/)).toBeVisible();
  await expect(content.locator('[data-tenant-room-id="atlas"] dl')).toContainText('Provider Atlas Authority');
  await expect(content.locator(
    '[data-source-revision], [data-tenant-location-rollback-preview], [data-tenant-location-rollback-confirm]',
  )).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
  expect(fixture.reads.some(({ path: value }) => (
    value.startsWith('/api/v1/tenant/settings/locations/history/1')
    || value === '/api/v1/tenant/settings/locations/rollback'
  ))).toBe(false);
  expect(fixture.unexpectedApiRequests).toEqual([]);
});

test('detached Tenant Admin conflict reapply stops before a second privileged write', async ({ page }) => {
  const fixture = await installProductionSettingsFixture(page, {
    holdOrganizationReapplyRead: true,
  });
  await openTenantSettings(page);
  const content = await openSection(page, 'organization', 'organization');

  await content.locator('#tenant-organization-display-name').fill('Detached reapply');
  await submit(content, 'organization');
  await expect.poll(() => fixture.writes.length).toBe(1);
  const reapply = content.locator('[data-tenant-settings-conflict-reapply="true"]');
  await expect(reapply).toBeVisible();
  const detachedReapply = await reapply.elementHandle();
  expect(detachedReapply).not.toBeNull();
  const readsBeforeReapply = fixture.organizationReads();
  await reapply.click();
  await expect.poll(() => fixture.organizationReads()).toBe(readsBeforeReapply + 1);

  await page.locator('[data-view="welcome"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Änderungen verwerfen' }).click();
  const reapplyRead = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/v1/tenant/settings/organization'
    && response.request().method() === 'GET'
  ));
  fixture.releaseOrganizationReapplyRead();
  await reapplyRead;
  await expect.poll(() => detachedReapply.evaluate((button) => button.disabled)).toBe(false);

  expect(fixture.writes).toHaveLength(1);
  await expect(page.locator('#welcomeHeading')).toBeVisible();
  await expect(page.locator('[data-tenant-admin-shell]')).toHaveCount(0);
  await expect(page.locator('#toast')).toBeEmpty();
});
test('API-02 Tenant Admin edits public guest information with exact authority and deliberate clearing', async ({ page }) => {
  const fixture = await installProductionSettingsFixture(page, { organizationConflict: false });
  await openTenantSettings(page);
  const content = await openSection(page, 'locations', 'locations-technical');
  const editor = content.locator('[data-guest-information-editor="0"]');
  await expect(editor).toHaveAttribute('aria-describedby', 'tenant-site-guest-0-description');
  await expect(content.locator('#tenant-site-guest-0-description')).not.toBeEmpty();
  await expect(content.locator('#tenant-site-guest-0-arrival')).toBeHidden();
  await content.locator('#tenant-site-guest-0-enabled').check();
  await content.locator('#tenant-site-guest-0-arrival').fill('Use the main entrance');
  await content.locator('#tenant-site-guest-0-wifiPolicy').selectOption('credentials_on_arrival');
  await content.locator('#tenant-site-guest-0-wifiNetworkName').fill('Guest network');
  await content.locator('#tenant-site-guest-0-routeUrl').fill('https://www.openstreetmap.org/way/123');
  await submit(content, 'locations-technical');
  await expect.poll(() => fixture.writes.length).toBe(1);
  await expect(content.locator('#tenant-site-guest-0-arrival')).toHaveValue('Use the main entrance');
  const saved = fixture.writes[0];
  expect(saved.csrf).toBe(CSRF_TOKEN);
  expect(saved.body.schemaVersion).toBe(3);
  expect(saved.body.configuration.rooms).toEqual(currentLocations().rooms);
  expect(saved.body.configuration.sites[0].guestInformation).toEqual({
    address: null, publicTransport: null, arrival: 'Use the main entrance', parking: null,
    reception: null, building: null, visitorNotes: null, accessibility: null,
    wifiPolicy: 'credentials_on_arrival', wifiNetworkName: 'Guest network', contact: null,
    routeUrl: 'https://www.openstreetmap.org/way/123',
  });
  await content.locator('#tenant-site-guest-0-enabled').uncheck();
  await submit(content, 'locations-technical');
  await expect.poll(() => fixture.writes.length).toBe(2);
  expect(fixture.writes[1].body.configuration.sites[0].guestInformation).toBeNull();
  await expect(content.locator('#tenant-site-guest-0-enabled')).not.toBeChecked();
  await expect(content.locator('#tenant-site-guest-0-arrival')).toBeHidden();
  expect(fixture.unexpectedApiRequests).toEqual([]);
});

test('API-02 guest editor blocks secrets and unsafe routes with field-associated errors', async ({ page }) => {
  const fixture = await installProductionSettingsFixture(page, { organizationConflict: false });
  await openTenantSettings(page);
  const content = await openSection(page, 'locations', 'locations-technical');
  await content.locator('#tenant-site-guest-0-enabled').check();
  const arrival = content.locator('#tenant-site-guest-0-arrival');
  await arrival.fill('Password: secret');
  await submit(content, 'locations-technical');
  await expect(arrival).toBeFocused();
  await expect(arrival).toHaveAttribute('aria-invalid', 'true');
  await expect(content.locator('#tenant-site-guest-0-error')).not.toBeEmpty();
  expect(fixture.writes).toEqual([]);
  await arrival.fill('Ask at reception');
  const route = content.locator('#tenant-site-guest-0-routeUrl');
  await route.fill('https://maps.apple.com/?token=secret');
  await submit(content, 'locations-technical');
  await expect(route).toBeFocused();
  await expect(route).toHaveAttribute('aria-invalid', 'true');
  expect(fixture.writes).toEqual([]);
  await route.fill('https://www.openstreetmap.org/way/123');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await submit(content, 'locations-technical');
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.unexpectedApiRequests).toEqual([]);
});

test('H-035 Tenant Admin publishes and withdraws only finite Site Guest values', async ({ page }) => {
  const fixture = await installProductionSettingsFixture(page, { organizationConflict: false });
  await openTenantSettings(page);
  const content = await openSection(page, 'locations', 'locations-technical');
  const enabled = content.locator('#public-guest-site-0-enabled');
  await expect(content.locator('#public-guest-site-0-arrival')).toBeHidden();
  await enabled.check();
  await content.locator('#public-guest-site-0-publicTransport').selectOption('available');
  await content.locator('#public-guest-site-0-arrival').selectOption('reception');
  await content.locator('#public-guest-site-0-step_free_entry').check();
  await submit(content, 'locations-technical');
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0].body.configuration.sites[0].guestPublicValues).toEqual({
    publicTransport: 'available', parking: 'not_available', arrival: 'reception',
    accessibilityFeatures: ['step_free_entry'],
  });
  await expect(content.locator('#public-guest-site-0-enabled')).toBeChecked();
  await content.locator('#public-guest-site-0-enabled').uncheck();
  await submit(content, 'locations-technical');
  await expect.poll(() => fixture.writes.length).toBe(2);
  expect(fixture.writes[1].body.configuration.sites[0].guestPublicValues).toBeNull();
  expect(fixture.unexpectedApiRequests).toEqual([]);
});

const cateringId = (n) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function cateringConnection(n) {
  return { schemaVersion: 1, integrationId: cateringId(n), providerId: 'manual_catering', revision: 1,
    configuration: { initialOrderMode: 'manager_review', capabilities: Object.fromEntries(
      ['catalogue', 'availability', 'order', 'update', 'cancel', 'status'].map((key) => [`catering.${key}`, 'manual']),
    ) } };
}
async function openCatering(page) {
  await page.locator('[data-tenant-admin-section="catering"]').click();
  const content = page.locator('[data-tenant-admin-section-content="catering"]');
  await expect(content.locator('[data-catering-form="new"]')).toBeVisible();
  return content;
}

test('Catering setup preserves a failed command for deliberate safe replay and reflows in DE/EN', async ({ page }) => {
  const fixture = await installProductionSettingsFixture(page, { cateringEnabled: true, cateringCreateResponseLost: true });
  await openTenantSettings(page);
  const content = await openCatering(page);
  await expect(content.getByText('Gespeicherte Einstellungen bestätigen weder die Verfügbarkeit noch die Lieferbereitschaft eines Caterers.')).toBeVisible();
  const form = content.locator('[data-catering-form="new"]');
  const mode = form.locator('select').first();
  await mode.focus();
  await page.keyboard.press('ArrowDown');
  await expect(mode).toHaveValue('after_conference_approval');
  await form.getByRole('button', { name: 'Verbindung einrichten', exact: true }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(mode).toHaveValue('after_conference_approval');
  await expect(form.getByRole('button', { name: 'Verbindung einrichten', exact: true })).toBeFocused();
  await form.getByRole('button', { name: 'Verbindung einrichten', exact: true }).click();
  await expect(content.locator(`[data-catering-form="${cateringId(1)}"]`)).toBeVisible();
  expect(fixture.state.catering).toHaveLength(1);
  expect(fixture.cateringWrites).toHaveLength(2);
  expect(fixture.cateringWrites[0].body).toEqual(fixture.cateringWrites[1].body);
  expect(fixture.cateringWrites[0].csrf).toBe(CSRF_TOKEN);
  expect(Object.keys(fixture.cateringWrites[0].body).sort()).toEqual(['commandId', 'configuration', 'providerId', 'schemaVersion']);
  expect(fixture.cateringWrites[0].body.commandId).toMatch(/^[0-9a-f-]{36}$/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(async () => (await import('/src/core/i18n.js')).setLanguage('en'));
  await expect(content.getByRole('heading', { name: 'Catering connections', exact: true })).toBeVisible();
  await expect(content.getByRole('button', { name: 'Set up connection', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 640, height: 450 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(fixture.unexpectedApiRequests).toEqual([]);
});

test('Catering configuration retains independent provider modes and requires explicit reload after conflict', async ({ page }) => {
  const fixture = await installProductionSettingsFixture(page, { cateringEnabled: true, cateringConflict: true,
    cateringConnections: [cateringConnection(10), cateringConnection(11)] });
  await openTenantSettings(page);
  const content = await openCatering(page);
  const selected = content.locator(`[data-catering-form="${cateringId(10)}"]`);
  const other = content.locator(`[data-catering-form="${cateringId(11)}"]`);
  await selected.locator('select').first().selectOption('after_conference_approval');
  await expect(other.locator('select').first()).toHaveValue('manager_review');
  await expect(selected.locator('option[value="api"]')).toHaveCount(0);
  await selected.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(selected.getByRole('alert')).toBeVisible();
  expect(fixture.cateringWrites).toHaveLength(1);
  await expect(selected.locator('select').first()).toHaveValue('after_conference_approval');
  await selected.getByRole('button', { name: 'Aktuellen Stand laden', exact: true }).click();
  await expect(selected.locator('select').first()).toHaveValue('manager_review');
  await selected.locator('select').first().selectOption('after_conference_approval');
  await selected.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(selected.locator('select').first()).toHaveValue('after_conference_approval');
  expect(fixture.cateringWrites).toHaveLength(2);
  expect(fixture.cateringWrites.map((write) => write.body.expectedRevision)).toEqual([1, 2]);
  expect(fixture.state.catering[1].configuration.initialOrderMode).toBe('manager_review');
  expect(fixture.cateringWrites.every((write) => write.csrf === CSRF_TOKEN)).toBe(true);
  expect(fixture.unexpectedApiRequests).toEqual([]);
});

test('Catering list replaces bounded pages without accumulating connection forms', async ({ page }) => {
  const fixture = await installProductionSettingsFixture(page, { cateringEnabled: true,
    cateringConnections: Array.from({ length: 21 }, (_, i) => cateringConnection(i + 10)) });
  await openTenantSettings(page);
  const content = await openCatering(page);
  await expect(content.locator('[data-catering-form]')).toHaveCount(21);
  await content.getByRole('button', { name: 'Weitere Verbindungen', exact: true }).click();
  await expect(content.locator('[data-catering-form]')).toHaveCount(2);
  await expect(content.locator(`[data-catering-form="${cateringId(30)}"]`)).toBeVisible();
  await content.getByRole('button', { name: 'Zur ersten Seite', exact: true }).click();
  await expect(content.locator('[data-catering-form]')).toHaveCount(21);
  expect(fixture.cateringWrites).toEqual([]);
  expect(fixture.unexpectedApiRequests).toEqual([]);
});

for (const language of ['de', 'en']) {
  test(`CO-299: ${language} duplicate cost-center code links and focuses the actual invalid field`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('conference_language_v1', value), language);
    const fixture = await installProductionSettingsFixture(page);
    await openTenantSettings(page);
    const content = await openSection(page, 'cost-allocation', 'cost-allocation');
    await content.getByRole('button', { name: language === 'de' ? 'Kostenstelle hinzufügen' : 'Add cost center' }).click();
    const code = content.locator('#tenant-cost-center-1-code');
    await code.fill('EVENTS');
    await content.locator('#tenant-cost-centers-search').fill('No match');
    await submit(content, 'cost-allocation');
    await expect(code).toBeFocused();
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    await expect(code).toHaveAttribute('aria-describedby', /tenant-cost-allocation-error/);
    const summary = content.locator('.validation-summary');
    await expect(summary).toHaveAttribute('role', 'alert');
    await expect(summary).toContainText(language === 'de' ? 'Der Kostenstellencode EVENTS wird bereits verwendet.' : 'The cost center code EVENTS is already in use.');
    const link = summary.getByRole('link');
    await link.focus();
    await link.press('Enter');
    await expect(code).toBeFocused();
    await expect(content.locator('#tenant-allocation-required')).not.toHaveAttribute('aria-invalid', 'true');
    expect(fixture.writes).toHaveLength(0);
    await code.fill('EVENTS_2');
    await expect(code).not.toHaveAttribute('aria-invalid', 'true');
    await expect(summary).toHaveCount(0);
    await submit(content, 'cost-allocation');
    await expect.poll(() => fixture.writes.length).toBe(1);
    await expect(content.locator('#tenant-cost-center-1-code')).toHaveValue('EVENTS_2');
  });
}
