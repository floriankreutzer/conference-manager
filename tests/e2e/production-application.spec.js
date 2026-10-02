import { expect, test } from '@playwright/test';
import { asProductionHtml } from './fixtures/production-html.js';
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
  if (roles.includes('conference_manager')) {
    permissions.push(
      'request:manage',
      'tenant:rooms:business:manage',
      'tenant:catalogue:manage',
    );
  }
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
    session: { expiresAt: '2099-09-24T12:00:00.000Z' },
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
        description: 'Tageslicht und variable Bestuhlung · <b>Nur Text</b>',
        price: { amountMinor: 0, currency: 'EUR' },
        equipment: ['Display', 'Whiteboard'],
        floorplanAssetId: 'floorplan-room-a',
        mediaAssetIds: ['room-a-front'],
      }],
      services: [],
      equipment: [],
      cateringPackages: [],
      cateringItems: [],
    },
  };
}

function locationSettingsPayload() {
  return {
    locations: {
      schemaVersion: 2,
      revision: 1,
      configuration: {
        sites: [{
          id: 'berlin', name: 'Berlin', active: true, timeZone: 'Europe/Berlin', address: null,
          guestInformation: null, guestPublicValues: null,
        }],
        rooms: [{
          id: 'room-a',
          siteId: 'berlin',
          name: 'Room A',
          capacity: 12,
          active: true,
          floor: '1',
          equipment: [],
          accessibility: [],
          serviceIds: [],
          cateringPackageIds: [],
          floorplanAssetId: null,
          mediaAssetIds: [], guestPublicValues: null,
        }],
      },
      providerContext: [],
    },
  };
}

function locationSettingsProjection(settings, schemaVersion) {
  return {
    ...settings,
    schemaVersion,
    configuration: {
      ...settings.configuration,
      sites: settings.configuration.sites.map((site) => {
        if (schemaVersion === 3) return structuredClone(site);
        if (schemaVersion === 2) {
          const { guestPublicValues: omitted, ...v2 } = site;
          return v2;
        }
        const { guestInformation: omitted, guestPublicValues: omittedPublic, ...legacy } = site;
        return legacy;
      }),
      rooms: settings.configuration.rooms.map((room) => {
        if (schemaVersion === 3) return structuredClone(room);
        const { guestPublicValues: omitted, ...legacy } = room;
        return legacy;
      }),
    },
  };
}

function catalogueSettingsPayload(catalogue = null) {
  return {
    schemaVersion: 1,
    revision: 1,
    catalogue: catalogue || {
      services: [],
      equipment: [],
      cateringItems: [{
        id: 'item-coffee',
        name: 'Coffee',
        description: null,
        price: { amountMinor: 250, currency: 'EUR' },
        active: true,
        order: 1,
        siteIds: [],
        roomIds: [],
      }],
      cateringPackages: [{
        id: 'package-coffee',
        name: 'Coffee package',
        description: null,
        price: { amountMinor: 500, currency: 'EUR' },
        active: true,
        order: 1,
        siteIds: [],
        roomIds: [],
        itemIds: ['item-coffee'],
        variants: [],
      }],
      roomPrices: [{ roomId: 'room-a', price: { amountMinor: 2_500, currency: 'EUR' } }],
    },
  };
}

function publicRequest(value) {
  if (value.schemaVersion === 2 || value.schemaVersion === 3) return value;
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

function appliedRequest(current, change, submittedRequest = null) {
  const request = submittedRequest || {
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
      title: request.title,
      specialRequirements: request.specialRequirements,
      dietaryRequirements: request.dietaryRequirements,
      serviceIds: request.serviceIds,
      ...(Array.isArray(request.equipmentIds) ? { equipmentIds: request.equipmentIds } : {}),
      catering: request.catering,
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
  return asProductionHtml(source);
}

async function installProductionApplicationFixture(page, {
  roles = ['employee'],
  timeZone = 'Europe/Berlin',
  catalog = catalogPayload(timeZone),
  catalogLocationsRevision = 1,
  allocationRequired = false,
  catalogueSettings: initialCatalogueSettings = null,
  bookingChange: initialBookingChange = null,
  bookingChangeProposalError = null,
  availabilityResponses = [{ available: true, conflictCount: 0 }],
  requestCreateErrors = [],
  requestRoomContext = undefined,
  requestRoomContextSchemaVersion = null,
  holdAvailability = false,
  holdBookingDecision = false,
  holdBookingProposal = false,
  holdCatalogueSave = false,
  holdLocationSave = false,
  holdReport = false,
  holdRequestHistory = false,
  holdRoomContext = false,
  holdSession = false,
  holdTransition = false,
  locationSaveError = null,
  microsoft365 = null,
  session = null,
  showApplyingDuringBookingDecision = false,
  transitionError = null,
} = {}) {
  const writes = [];
  const decisionWrites = [];
  const availabilityChecks = [];
  const bulkWrites = [];
  const catalogueWrites = [];
  const locationWrites = [];
  const roomMediaUploads = [];
  const reportReads = [];
  const requestHistoryReads = [];
  const roomContextReads = [];
  const catalogReads = [];
  const requestEnvelopes = [];
  let catalogueSettings = structuredClone(
    initialCatalogueSettings ?? catalogueSettingsPayload().catalogue,
  );
  let catalogueSettingsRevision = 1;
  let locationSettings = locationSettingsPayload().locations;
  let applicationCatalog = structuredClone(catalog);
  let applicationCatalogLocationsRevision = catalogLocationsRevision;
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
  let releaseBookingProposal = () => {};
  const bookingProposalGate = holdBookingProposal
    ? new Promise((resolve) => { releaseBookingProposal = resolve; })
    : null;
  let releaseCatalogueSave = () => {};
  const catalogueSaveGate = holdCatalogueSave
    ? new Promise((resolve) => { releaseCatalogueSave = resolve; })
    : null;
  let releaseLocationSave = () => {};
  const locationSaveGate = holdLocationSave
    ? new Promise((resolve) => { releaseLocationSave = resolve; })
    : null;
  let releaseTransition = () => {};
  const transitionGate = holdTransition
    ? new Promise((resolve) => { releaseTransition = resolve; })
    : null;
  let releaseReport = () => {};
  const reportGate = holdReport
    ? new Promise((resolve) => { releaseReport = resolve; })
    : null;
  let releaseRequestHistory = () => {};
  const requestHistoryGate = holdRequestHistory
    ? new Promise((resolve) => { releaseRequestHistory = resolve; })
    : null;
  let releaseRoomContext = () => {};
  const roomContextGate = holdRoomContext
    ? new Promise((resolve) => { releaseRoomContext = resolve; })
    : null;
  let availabilityIndex = 0;
  let requestCreateIndex = 0;
  let nextRequestRead = null;
  let nextRequestReadFailure = null;
  let nextCatalogLoad = null;
  let catalogContextSequence = 0;
  const catalogLoadsByContext = new Map();

  function catalogLoadSnapshot(context, gate = null) {
    return {
      context,
      gate,
      catalog: structuredClone(applicationCatalog),
      locationsRevision: applicationCatalogLocationsRevision,
    };
  }

  function holdNextCatalogLoad() {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const context = `fixture_catalog_context_${++catalogContextSequence}`;
    nextCatalogLoad = catalogLoadSnapshot(context, gate);
    return { context, release };
  }

  function replaceCatalog(
    nextCatalog,
    { locationsRevision = applicationCatalogLocationsRevision } = {},
  ) {
    applicationCatalog = structuredClone(nextCatalog);
    applicationCatalogLocationsRevision = locationsRevision;
  }

  function holdNextRequestRead() {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    nextRequestRead = {
      gate,
      snapshot: requests.map((entry) => structuredClone(entry)),
    };
    return release;
  }

  function failNextRequestRead(status = 503) {
    nextRequestReadFailure = { gate: Promise.resolve(), status };
  }

  function holdNextFailingRequestRead(status = 503) {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    nextRequestReadFailure = { gate, status };
    return release;
  }

  function replaceRequests(nextRequests) {
    requests = nextRequests.map((entry) => structuredClone(entry));
  }

  // Detached windows have their own Page; static print resources share the context.
  await page.context().route(`${ORIGIN}/assets/{tokens,employee-ux}.css`, async (route) => {
    const filePath = path.join(ROOT, new URL(route.request().url()).pathname);
    await route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: await readFile(filePath) });
  });

  await page.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/api/v1/session') {
      if (sessionGate) await sessionGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(session || sessionPayload(roles)),
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

    const roomMediaUpload = url.pathname.match(
      /^\/api\/v1\/tenant\/rooms\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/media$/,
    );
    if (roomMediaUpload && request.method() === 'POST') {
      roomMediaUploads.push({
        roomId: roomMediaUpload[1],
        csrf: request.headers()['x-csrf-token'],
        contentType: request.headers()['content-type'],
        bytes: request.postDataBuffer(),
      });
      await route.fulfill({
        status: 201,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ assetId: '11111111-1111-4111-8111-111111111111' }),
      });
      return;
    }

    if (url.pathname === '/api/v1/tenant/settings/locations' && request.method() === 'GET') {
      const schemaVersion = Number(url.searchParams.get('schemaVersion') || 1);
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ locations: locationSettingsProjection(locationSettings, schemaVersion) }),
      });
      return;
    }

    if (url.pathname === '/api/v1/tenant/settings/locations' && request.method() === 'PUT') {
      const body = request.postDataJSON();
      locationWrites.push({ csrf: request.headers()['x-csrf-token'], body });
      if (locationSaveGate) await locationSaveGate;
      if (locationSaveError) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({
            error: {
              code: 'TENANT_SETTINGS_REVISION_CONFLICT',
              currentRevision: locationSaveError.currentRevision || 2,
              requestId: API_REQUEST_ID,
            },
          }),
        });
        return;
      }
      const guestBySite = new Map(locationSettings.configuration.sites.map((site) => [
        site.id, site.guestInformation,
      ]));
      const configuration = body.schemaVersion === 3
        ? body.configuration
        : {
          ...body.configuration,
          sites: body.configuration.sites.map((site) => ({
            ...site,
            guestInformation: guestBySite.get(site.id) ?? null,
            guestPublicValues: locationSettings.configuration.sites
              .find((existing) => existing.id === site.id)?.guestPublicValues ?? null,
          })),
          rooms: body.configuration.rooms.map((room) => ({
            ...room, guestPublicValues: locationSettings.configuration.rooms
              .find((existing) => existing.id === room.id)?.guestPublicValues ?? null,
          })),
        };
      locationSettings = {
        ...locationSettings,
        revision: body.expectedRevision + 1,
        configuration,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          locations: locationSettingsProjection(locationSettings, body.schemaVersion),
        }),
      });
      return;
    }

    if (url.pathname === '/api/v1/tenant/settings/locations/history' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ history: [] }),
      });
      return;
    }

    if (
      url.pathname === '/api/v1/tenant/settings/locations/bulk/rooms/validate'
      && request.method() === 'POST'
    ) {
      const body = request.postDataJSON();
      bulkWrites.push({ path: url.pathname, csrf: request.headers()['x-csrf-token'], body });
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 1,
          valid: true,
          changed: true,
          sourceRevision: locationSettings.revision,
          errors: [],
          receipt: { id: 'bulk-receipt-1', expiresAt: '2099-09-24T12:00:00.000Z' },
        }),
      });
      return;
    }

    if (
      url.pathname === '/api/v1/tenant/settings/locations/bulk/rooms/apply'
      && request.method() === 'POST'
    ) {
      const body = request.postDataJSON();
      bulkWrites.push({ path: url.pathname, csrf: request.headers()['x-csrf-token'], body });
      locationSettings = { ...locationSettings, revision: locationSettings.revision + 1 };
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ locations: locationSettings }),
      });
      return;
    }

    if (url.pathname === '/api/v1/tenant/settings/cost-allocation' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          costAllocation: {
            schemaVersion: 1,
            revision: 1,
            configuration: { allocationRequired: false, costCenters: [] },
          },
        }),
      });
      return;
    }

    if (
      url.pathname === '/api/v1/tenant/settings/cost-allocation/history'
      && request.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ history: [] }),
      });
      return;
    }

    if (url.pathname === '/api/v1/tenant/settings/catalogue' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          ...catalogueSettingsPayload(catalogueSettings),
          revision: catalogueSettingsRevision,
        }),
      });
      return;
    }

    if (url.pathname === '/api/v1/tenant/settings/catalogue' && request.method() === 'PUT') {
      const body = request.postDataJSON();
      catalogueWrites.push({ csrf: request.headers()['x-csrf-token'], body });
      if (catalogueSaveGate) await catalogueSaveGate;
      if (body.expectedRevision !== catalogueSettingsRevision) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({
            error: {
              code: 'TENANT_SETTINGS_REVISION_CONFLICT',
              currentRevision: catalogueSettingsRevision,
              requestId: API_REQUEST_ID,
            },
          }),
        });
        return;
      }
      catalogueSettings = body.catalogue;
      catalogueSettingsRevision += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          ...catalogueSettingsPayload(catalogueSettings),
          revision: catalogueSettingsRevision,
        }),
      });
      return;
    }

    if (url.pathname === '/api/v1/tenant/settings/catalogue/history' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ schemaVersion: 1, revisions: [], nextBeforeRevision: null }),
      });
      return;
    }

    if (
      request.method() === 'GET'
      && ['/api/v1/application/profile', '/api/v1/application/notifications']
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
      const requestedContext = url.searchParams.get('context');
      let catalogLoad = requestedContext === null
        ? null
        : catalogLoadsByContext.get(requestedContext);
      if (catalogLoad === undefined) {
        await route.fulfill({ status: 409, body: 'Unknown catalog context' });
        return;
      }
      if (catalogLoad === null) {
        catalogLoad = nextCatalogLoad || catalogLoadSnapshot(
          `fixture_catalog_context_${++catalogContextSequence}`,
        );
        nextCatalogLoad = null;
        catalogLoadsByContext.set(catalogLoad.context, catalogLoad);
      }
      catalogReads.push({ context: catalogLoad.context, section });
      if (catalogLoad.gate) await catalogLoad.gate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 2,
          configurationRevisions: {
            organization: 1,
            locations: catalogLoad.locationsRevision,
            catalogue: 1,
            bookingPolicies: 1,
            costAllocation: 1,
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
          costAllocation: { allocationRequired },
          context: catalogLoad.context,
          section,
          entries: catalogLoad.catalog.catalog[section] || [],
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
      if (nextRequestReadFailure) {
        const failure = nextRequestReadFailure;
        nextRequestReadFailure = null;
        await failure.gate;
        const code = failure.status === 401
          ? 'UNAUTHENTICATED'
          : failure.status === 403 ? 'FORBIDDEN' : 'SERVICE_UNAVAILABLE';
        await route.fulfill({
          status: failure.status,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({ error: { code, requestId: API_REQUEST_ID } }),
        });
        return;
      }
      let responseRequests = requests;
      if (nextRequestRead) {
        const pendingRead = nextRequestRead;
        nextRequestRead = null;
        await pendingRead.gate;
        responseRequests = pendingRead.snapshot;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 2,
          asOf: '2026-09-24T12:00:00.000Z',
          requests: responseRequests.map(publicRequest),
          page: { limit: 10, complete: true, nextCursor: null },
        }),
      });
      return;
    }

    if (url.pathname === '/api/v1/application/reports/requests' && request.method() === 'GET') {
      const fromInclusive = url.searchParams.get('from');
      const toExclusive = url.searchParams.get('to');
      reportReads.push({ fromInclusive, toExclusive });
      if (reportGate) await reportGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 2,
          asOf: '2026-09-01T12:00:00.000Z',
          range: { field: 'startsAt', fromInclusive, toExclusive, timeZone: 'UTC' },
          requests: [],
          page: { limit: 10, complete: true, nextCursor: null },
        }),
      });
      return;
    }

    if (url.pathname === '/api/v1/application/requests' && request.method() === 'POST') {
      const envelope = request.postDataJSON();
      const body = envelope.request;
      requestEnvelopes.push(structuredClone(envelope));
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
      let created = {
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
      if (envelope.schemaVersion === 3) {
        const room = applicationCatalog.catalog.rooms.find((entry) => entry.id === body.roomId);
        const equipment = body.equipmentIds.map((id) => (
          applicationCatalog.catalog.equipment.find((entry) => entry.id === id)
        ));
        const roomMinor = room.price.amountMinor;
        const equipmentMinor = equipment.reduce((sum, entry) => sum + entry.price.amountMinor, 0);
        const totalMinor = roomMinor + equipmentMinor;
        created = {
          schemaVersion: 3,
          version: 1,
          ...created,
          createdAt: '2026-08-25T20:00:00.000Z',
          details: {
            title: body.title,
            serviceIds: body.serviceIds,
            equipmentIds: body.equipmentIds,
            catering: body.catering,
            dietaryRequirements: body.dietaryRequirements,
            specialRequirements: body.specialRequirements,
          },
          pricing: {
            currency: room.price.currency,
            totalMinor,
            breakdown: {
              roomMinor,
              servicesMinor: 0,
              equipmentMinor,
              cateringPackageMinor: 0,
              cateringItemsMinor: 0,
            },
            room: {
              id: room.id,
              siteId: room.siteId,
              name: room.name,
              price: room.price,
            },
            services: [],
            equipment: equipment.map((entry) => ({
              equipment: {
                id: entry.id,
                name: entry.name,
                description: entry.description,
                price: entry.price,
              },
              lineTotalMinor: entry.price.amountMinor,
            })),
            catering: { participantCount: 0, packageSelection: null, items: [] },
          },
          configurationRevisions: body.configurationRevisions,
          policy: {
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
          allocations: {
            schemaVersion: 1,
            configurationRevision: body.configurationRevisions.costAllocation,
            snapshottedAt: '2026-08-27T12:00:00.000Z',
            model: 'percentage_basis_points',
            totalBasisPoints: 0,
            totalMinor,
            allocatedMinor: 0,
            unallocatedMinor: totalMinor,
            currency: room.price.currency,
            entries: [],
          },
        };
      }
      requests = [created];
      await route.fulfill({
        status: 201,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ schemaVersion: 2, request: publicRequest(created), requestId: API_REQUEST_ID }),
      });
      return;
    }

    if (url.pathname === `/api/v1/application/requests/${REQUEST_ID}/resubmissions`
        && request.method() === 'POST') {
      const body = request.postDataJSON();
      writes.push({ path: url.pathname, csrf: request.headers()['x-csrf-token'], body });
      const createError = requestCreateErrors[requestCreateIndex];
      requestCreateIndex += 1;
      if (createError) {
        if (Number.isSafeInteger(createError.latestVersion) && requests[0]) {
          requests = [{ ...requests[0], version: createError.latestVersion }];
        }
        await route.fulfill({
          status: createError.status,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({ error: { code: createError.code, requestId: API_REQUEST_ID } }),
        });
        return;
      }
      const current = requests[0];
      const resubmitted = {
        ...current,
        schemaVersion: body.schemaVersion,
        id: REQUEST_ID,
        roomId: body.request.roomId,
        startsAt: body.request.startsAt,
        endsAt: body.request.endsAt,
        internalParticipants: body.request.internalParticipants,
        externalParticipants: body.request.externalParticipants,
        version: body.expectedVersion + 1,
        status: 'Submitted',
        statusReason: null,
        details: {
          ...current.details,
          title: body.request.title,
          specialRequirements: body.request.specialRequirements,
          dietaryRequirements: body.request.dietaryRequirements,
          serviceIds: body.request.serviceIds,
          ...(body.schemaVersion === 3 ? { equipmentIds: body.request.equipmentIds } : {}),
          catering: body.request.catering,
        },
        ...(body.schemaVersion === 3 ? {
          pricing: {
            ...current.pricing,
            breakdown: { ...current.pricing.breakdown, equipmentMinor: 0 },
            equipment: [],
          },
        } : {}),
        configurationRevisions: body.request.configurationRevisions,
      };
      requests = [resubmitted];
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 2,
          request: publicRequest(resubmitted),
          requestId: API_REQUEST_ID,
        }),
      });
      return;
    }

    if (url.pathname === `/api/v1/requests/${REQUEST_ID}` && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 2,
          request: publicRequest(requests[0]),
          requestId: API_REQUEST_ID,
        }),
      });
      return;
    }

    if (url.pathname === `/api/v1/requests/${REQUEST_ID}/room-context` && request.method() === 'GET') {
      const current = requests[0];
      const activeRoom = applicationCatalog.catalog.rooms.find((entry) => entry.id === current.roomId);
      const activeSite = applicationCatalog.catalog.sites.find((entry) => entry.id === activeRoom?.siteId);
      let currentRoomContext = requestRoomContext === undefined
        ? {
          locationsRevision: 1,
          room: {
            id: activeRoom.id,
            siteId: activeRoom.siteId,
            name: activeRoom.name,
            capacity: activeRoom.capacity,
            active: activeRoom.active,
          },
          site: {
            id: activeSite.id,
            name: activeSite.name,
            active: activeSite.active,
            timeZone: activeSite.timeZone,
          },
        }
        : requestRoomContext;
      const projection = url.searchParams.get('projection');
      const responseSchemaVersion = requestRoomContextSchemaVersion
        ?? (projection === 'guest' ? 3 : 1);
      if (currentRoomContext !== null) {
        const commonRoom = {
          id: currentRoomContext.room.id,
          siteId: currentRoomContext.room.siteId,
          name: currentRoomContext.room.name,
          capacity: currentRoomContext.room.capacity,
          active: currentRoomContext.room.active,
        };
        currentRoomContext = responseSchemaVersion >= 2
          ? {
            locationsRevision: currentRoomContext.locationsRevision,
            room: {
              ...commonRoom,
              floor: responseSchemaVersion === 3 ? null : currentRoomContext.room.floor ?? null,
              accessibility: responseSchemaVersion === 3 ? [] : currentRoomContext.room.accessibility ?? [],
              floorplanAssetId: currentRoomContext.room.floorplanAssetId ?? null,
              mediaAssetIds: currentRoomContext.room.mediaAssetIds ?? [],
              ...(responseSchemaVersion === 3 ? { guestPublicValues: currentRoomContext.room.guestPublicValues ?? null } : {}),
            },
            site: currentRoomContext.site,
            guestPresentation: responseSchemaVersion === 3 && currentRoomContext.guestPresentation
              ? {
                ...currentRoomContext.guestPresentation,
                publicTransport: null, arrival: null, parking: null, reception: null,
                building: null, visitorNotes: null, accessibility: null, wifiNetworkName: null,
              }
              : currentRoomContext.guestPresentation ?? null,
            ...(responseSchemaVersion === 3 ? { guestPublicValues: currentRoomContext.guestPublicValues ?? null } : {}),
          }
          : {
            locationsRevision: currentRoomContext.locationsRevision,
            room: commonRoom,
            site: currentRoomContext.site,
          };
      }
      roomContextReads.push(current.id);
      if (roomContextGate) await roomContextGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: responseSchemaVersion,
          requestRef: requestRef(current),
          currentRoomContext,
          requestId: API_REQUEST_ID,
        }),
      });
      return;
    }

    if (url.pathname === `/api/v1/requests/${REQUEST_ID}/history` && request.method() === 'GET') {
      const current = publicRequest(requests[0]);
      requestHistoryReads.push(current.id);
      if (requestHistoryGate) await requestHistoryGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 2,
          requestId: API_REQUEST_ID,
          asOfVersion: current.version,
          history: [{
            version: current.version,
            schemaVersion: current.schemaVersion,
            operation: 'transitioned',
            capturedAt: '2026-08-26T11:00:00.000Z',
            request: current,
          }],
          page: { limit: 10, complete: true, nextCursor: null },
        }),
      });
      return;
    }

    if (url.pathname === `/api/v1/requests/${REQUEST_ID}/transitions` && request.method() === 'POST') {
      const body = request.postDataJSON();
      writes.push({ path: url.pathname, csrf: request.headers()['x-csrf-token'], body,
        ifMatch: request.headers()['if-match'] });
      if (transitionGate) await transitionGate;
      if (transitionError) {
        await route.fulfill({
          status: transitionError.status,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({ error: { code: transitionError.code, requestId: API_REQUEST_ID } }),
        });
        return;
      }
      const current = requests[0];
      if (request.headers()['if-match'] !== `"${current.version ?? 1}"`) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({ error: { code: 'REQUEST_STATE_CONFLICT', requestId: API_REQUEST_ID } }),
        });
        return;
      }
      const nextStatus = {
        start_review: 'In Review',
        confirm: 'Confirmed',
        reject: 'Rejected',
        request_change: 'Change Requested',
        cancel: 'Cancelled',
      }[body.transition] || current.status;
      const transitioned = {
        ...current,
        version: (current.version ?? 1) + 1,
        status: nextStatus,
        statusReason: body.reason || null,
      };
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
      if (bookingProposalGate) await bookingProposalGate;
      if (bookingChangeProposalError) {
        await route.fulfill({
          status: bookingChangeProposalError.status,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({
            error: { code: bookingChangeProposalError.code, requestId: API_REQUEST_ID },
          }),
        });
        return;
      }
      const current = requests[0];
      const change = {
        id: '33333333-3333-4333-8333-333333333333',
        roomId: body.request.roomId,
        startsAt: body.request.startsAt,
        endsAt: body.request.endsAt,
        internalParticipants: body.request.internalParticipants,
        externalParticipants: body.request.externalParticipants,
        rejectionReason: null,
        createdAt: '2026-08-26T10:00:00.000Z',
        updatedAt: '2026-08-26T10:00:00.000Z',
        baseRequestVersion: body.expectedVersion,
      };
      const projection = appliedRequest(current, change, body.request);
      const compositionOnly = current.schemaVersion === 2
        && current.roomId === change.roomId
        && current.startsAt === change.startsAt
        && current.endsAt === change.endsAt;
      bookingChange = {
        ...change,
        status: compositionOnly ? 'applied' : 'pending',
        requestSchemaVersion: 2,
        request: projection.request,
        proposedRequest: projection.proposedRequest,
      };
      const responseChange = bookingChange;
      if (compositionOnly) {
        requests = [projection.proposedRequest];
        bookingChange = null;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 2,
          result: { change: responseChange, requestRef: requestRef(requests[0]) },
        }),
      });
      return;
    }

    if (bookingChange && url.pathname === `/api/v1/requests/${REQUEST_ID}/booking-change/${bookingChange.id}/decision` && request.method() === 'POST') {
      const body = request.postDataJSON();
      decisionWrites.push({ path: url.pathname, csrf: request.headers()['x-csrf-token'], body });
      const decidedChange = bookingChange;
      if (showApplyingDuringBookingDecision && body.decision === 'approve') {
        bookingChange = {
          ...decidedChange,
          status: 'applying',
          updatedAt: '2026-08-26T10:30:00.000Z',
        };
      }
      if (bookingDecisionGate) await bookingDecisionGate;
      if (body.decision === 'reject') {
        const rejectedChange = {
          ...decidedChange,
          status: 'rejected',
          rejectionReason: body.reason,
          updatedAt: '2026-08-26T11:00:00.000Z',
        };
        const current = requests[0];
        bookingChange = null;
        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({
            schemaVersion: 2,
            result: { change: rejectedChange, requestRef: requestRef(current) },
          }),
        });
        return;
      }
      const applied = appliedRequest(requests[0], decidedChange);
      const appliedChange = {
        ...decidedChange, status: 'applied', updatedAt: '2026-08-26T11:00:00.000Z',
        requestSchemaVersion: 2, request: applied.request, proposedRequest: applied.proposedRequest,
      };
      requests = [applied.proposedRequest];
      bookingChange = null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 2,
          result: { change: appliedChange, requestRef: requestRef(requests[0]) },
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
    bookingChange: () => bookingChange,
    bulkWrites,
    catalogReads,
    catalogueWrites,
    decisionWrites,
    failNextRequestRead,
    holdNextFailingRequestRead,
    holdNextCatalogLoad,
    holdNextRequestRead,
    locationWrites,
    replaceRequests,
    releaseAvailability,
    releaseBookingDecision,
    releaseBookingProposal,
    releaseCatalogueSave,
    releaseLocationSave,
    releaseReport,
    releaseRequestHistory,
    releaseRoomContext,
    releaseSession,
    releaseTransition,
    replaceCatalog,
    reportReads,
    requestEnvelopes,
    requestHistoryReads,
    roomContextReads,
    roomMediaUploads,
    requests: () => requests,
    writes,
  };
}

function futureDate(days = 14) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

async function fillEmployeeSchedule(page, {
  title = 'Customer workshop',
  date = futureDate(),
  start = '09:00',
  end = '10:00',
  internal = '1',
  external = '0',
} = {}) {
  await page.locator('#productionTitle').fill(title);
  await page.locator('#productionDate').fill(date);
  await page.locator('#productionStart').fill(start);
  await page.locator('#productionEnd').fill(end);
  await page.locator('#productionInternal').fill(internal);
  await page.locator('#productionExternal').fill(external);
}

async function openEmployeeRoomStep(page, schedule = {}) {
  await fillEmployeeSchedule(page, schedule);
  await page.getByRole('button', { name: 'Weiter' }).click();
}

async function advanceEmployeeToReview(page) {
  for (let step = 3; step <= 6; step += 1) {
    await page.getByRole('button', { name: 'Weiter' }).click();
  }
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
  const change = {
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
    baseRequestVersion: 1,
  };
  const projection = appliedRequest(request, change);
  return {
    ...change,
    requestSchemaVersion: 2,
    request: projection.request,
    proposedRequest: projection.proposedRequest,
  };
}

function confirmedV2RequestFixture() {
  const request = confirmedRequestFixture();
  return appliedRequest({ ...request, version: 0 }, request).proposedRequest;
}

async function lockProductionApplication(page) {
  await page.evaluate(async () => {
    const channel = new BroadcastChannel('conference-manager-customer-session-lock-v1');
    channel.postMessage({ type: 'lock' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    channel.close();
  });
  await expect(page.locator('html')).toHaveAttribute('data-session-locked', 'true');
  await expect(page.locator('dialog[data-inactivity-lock="true"]')).toBeVisible();
}

test('EMP-01 EMP-02 EMP-03 EMP-06 EMP-07: Employee production flow uses server catalog and CSRF-protected request persistence', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  const requestUrls = [];
  page.on('request', (request) => requestUrls.push(request.url()));
  const requestDate = futureDate();
  await page.goto(`${ORIGIN}/`);

  await expect(page.locator('[data-view="manager"]')).toHaveCount(0);
  await expect(page.locator('[data-view="tenantAdmin"]')).toHaveCount(0);
  await page.locator('[data-view="employee"]').click();
  await expect(page.locator('#viewTitle')).toBeFocused();
  await expect(page.locator('[data-step-panel]')).toHaveCount(6);
  await expect(page.locator('[data-step-panel]:visible')).toHaveCount(1);
  await expect(page.locator('.participant-total strong')).toHaveText('1');
  await expect(page.getByText('settings.catalogue.title')).toHaveCount(0);
  await openEmployeeRoomStep(page, {
    date: requestDate, internal: '2', external: '1',
  });
  await expect(page.getByText('Kapazität passend')).toBeVisible();
  await expect(page.getByText('Dieses Raumbild ist nicht verfügbar.', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Ausstattung: Display, Whiteboard')).toBeVisible();
  const roomPreviewTrigger = page.getByRole('button', { name: 'Raumbilder anzeigen' });
  await roomPreviewTrigger.click();
  const previewDialog = page.getByRole('dialog', { name: 'Raumbilder · Room A' });
  await expect(previewDialog).toBeVisible();
  await expect(previewDialog).toContainText('Tageslicht und variable Bestuhlung · <b>Nur Text</b>');
  await expect(previewDialog.locator('b')).toHaveCount(0);
  await expect(previewDialog.getByRole('img')).toHaveCount(0);
  await expect(previewDialog).toContainText(
    'Ältere Referenzen müssen erneut hochgeladen werden.',
  );
  await expect(previewDialog).not.toContainText('floorplan-room-a');
  await expect(previewDialog).not.toContainText('room-a-front');
  await previewDialog.getByRole('button', { name: 'Schließen' }).click();
  await expect(roomPreviewTrigger).toBeFocused();
  expect(requestUrls.some((url) => url.includes('floorplan-room-a') || url.includes('room-a-front'))).toBe(false);
  await expect(page.getByText('Verfügbar', { exact: true })).toHaveCount(0);
  const roomOption = page.getByRole('radio', { name: /Room A/ });
  await expect(roomOption).toBeVisible();
  await roomOption.check();
  await expect(page.getByRole('radio', { name: /Room A/ })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeDisabled();
  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();
  await expect(page.getByText('Der Raum ist im gewählten Zeitraum verfügbar.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeEnabled();

  await page.getByRole('button', { name: 'Zurück' }).click();
  await page.locator('#productionEnd').fill('10:30');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeDisabled();
  await expect(page.getByText('Prüfen Sie die Verfügbarkeit für den aktuell gewählten Raum und Zeitraum.')).toBeVisible();
  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeEnabled();
  await advanceEmployeeToReview(page);
  await expect(page.getByRole('heading', { name: 'Anfrage prüfen' })).toBeVisible();
  await expect(page.locator('[data-step-panel="6"] .review-card')).toHaveCount(6);
  const review = page.locator('[data-step-panel="6"]');
  await expect(review.getByRole('heading', { name: 'Veranstaltung & Teilnehmende' })).toBeVisible();
  await expect(review.getByText('Customer workshop', { exact: true })).toBeVisible();
  await expect(review.getByRole('heading', { name: 'Services & buchbare Ausstattung' })).toBeVisible();
  await expect(review.getByRole('heading', { name: 'Preisübersicht' })).toBeVisible();
  await expect(review.getByRole('button', { name: /Veranstaltung & Teilnehmende ändern/ })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Anfrage absenden' });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('#toast')).toContainText('Anfrage wurde abgesendet.');
  const completion = page.locator('[data-ux-submission-success]');
  await expect(completion).toBeFocused();
  await expect(completion.getByText('Anfrage erfolgreich gesendet', { exact: true })).toBeVisible();
  await expect(completion).toContainText('Das Conference Management prüft jetzt');
  fixture.failNextRequestRead();
  await page.getByRole('button', { name: 'Aktualisieren' }).click();
  await expect(page.locator('#toast')).toContainText('Die Produktionsdaten konnten nicht sicher geladen werden.');
  await expect(completion).toBeVisible();
  await completion.getByRole('button', { name: 'Schließen' }).click();
  await expect(page.locator(`[data-production-request-id="${REQUEST_ID}"]`)).toBeFocused();

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
  const cancelTrigger = page.getByRole('button', { name: 'Anfrage stornieren' });
  const writesBeforeCancellation = fixture.writes.length;
  await cancelTrigger.click();
  const cancelDialog = page.getByRole('dialog', { name: 'Anfrage wirklich stornieren?' });
  await expect(cancelDialog).toBeVisible();
  await expect(cancelDialog).toContainText('Die Anfragedaten werden nicht gelöscht.');
  expect(fixture.writes).toHaveLength(writesBeforeCancellation);
  await cancelDialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(cancelTrigger).toBeFocused();
  expect(fixture.writes).toHaveLength(writesBeforeCancellation);
  await cancelTrigger.click();
  await page.getByRole('dialog', { name: 'Anfrage wirklich stornieren?' })
    .getByRole('button', { name: 'Anfrage stornieren' }).click();
  await expect(page.locator('#toast')).toContainText('Anfrage wurde storniert.');
  await expect(page.locator(`[data-production-request-id="${REQUEST_ID}"]`)).toBeFocused();
  expect(fixture.writes[1]).toMatchObject({
    csrf: CSRF_TOKEN,
    body: { transition: 'cancel' },
  });
});

test('API-01: Employee selects applicable Equipment by keyboard and persists the exact Request v3 contract', async ({ page }) => {
  const catalog = catalogPayload();
  const longDescription = 'Bildschirmtransportversicherungskonfigurationshinweis'.repeat(8);
  catalog.catalog.rooms.push({
    id: 'room-b', siteId: 'berlin', name: 'Room B', capacity: 20, active: true,
    price: { amountMinor: 0, currency: 'EUR' }, equipment: [],
    floorplanAssetId: null, mediaAssetIds: [],
  });
  catalog.catalog.equipment = [
    {
      id: 'alpha-long-copy',
      name: 'Mobiles Display',
      description: longDescription,
      active: true,
      order: 20,
      price: { amountMinor: 1250, currency: 'EUR' },
      siteIds: ['berlin'],
      roomIds: ['room-a'],
    },
    {
      id: 'room-b-only',
      name: 'Nur für Room B',
      description: null,
      active: true,
      order: 0,
      price: { amountMinor: 500, currency: 'EUR' },
      siteIds: ['berlin'],
      roomIds: ['room-b'],
    },
    {
      id: 'zulu-first',
      name: 'Priorisiertes Mikrofon',
      description: 'Für hybride Besprechungen',
      active: true,
      order: 1,
      price: { amountMinor: 2500, currency: 'EUR' },
      siteIds: ['berlin'],
      roomIds: ['room-a'],
    },
  ];
  const fixture = await installProductionApplicationFixture(page, { catalog });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await openEmployeeRoomStep(page);
  await page.getByRole('radio', { name: /Room A/ }).check();
  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();

  const serviceGroup = page.getByRole('group', { name: 'Services', exact: true });
  await expect(serviceGroup).toBeVisible();
  await expect(serviceGroup.getByText(
    'Für den gewählten Raum sind keine Optionen verfügbar.', { exact: true },
  )).toBeVisible();
  const equipmentGroup = page.getByRole('group', { name: 'Buchbare Ausstattung' });
  await expect(equipmentGroup).toBeVisible();
  await expect(equipmentGroup.getByRole('checkbox')).toHaveCount(2);
  expect(await equipmentGroup.getByRole('checkbox').evaluateAll(
    (controls) => controls.map((control) => control.value),
  )).toEqual(['zulu-first', 'alpha-long-copy']);
  await expect(equipmentGroup.locator('input[value="room-b-only"]')).toHaveCount(0);

  const longCopyCard = equipmentGroup.locator('.option-card').filter({ hasText: longDescription });
  await expect(longCopyCard).toHaveCount(1);
  await expect(longCopyCard).toHaveCSS('overflow-wrap', 'anywhere');
  expect(await longCopyCard.evaluate((card) => card.scrollWidth <= card.clientWidth)).toBe(true);

  const equipment = equipmentGroup.locator('input[value="zulu-first"]');
  const equipmentCard = equipment.locator('..');
  await expect(equipmentCard).toHaveClass(/\boption-card\b/);
  await expect(equipmentCard.locator('.price')).toContainText('pro Anfrage');
  await equipment.focus();
  await equipment.press('Space');
  await expect(equipment).toBeChecked();
  await expect(equipmentCard).toHaveClass(/\bselected\b/);
  for (let step = 4; step <= 6; step += 1) {
    await page.getByRole('button', { name: 'Weiter' }).click();
  }

  const review = page.locator('[data-step-panel="6"]');
  await expect(review.getByRole('heading', { name: 'Buchbare Ausstattung' })).toBeVisible();
  await expect(review.getByText('Priorisiertes Mikrofon', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Anfrage absenden' }).click();
  await expect(page.locator('[data-ux-submission-success]')).toBeFocused();

  expect(fixture.requestEnvelopes).toHaveLength(1);
  expect(fixture.requestEnvelopes[0]).toMatchObject({
    schemaVersion: 3,
    request: {
      equipmentIds: ['zulu-first'],
      serviceIds: [],
    },
  });
  expect(fixture.requestEnvelopes[0].request).not.toHaveProperty('totalMinor');
  expect(fixture.requestEnvelopes[0].request).not.toHaveProperty('tenantId');
  await page.locator('[data-ux-submission-success]').getByRole('button', { name: 'Schließen' }).click();
  await expect(page.locator(
    '[data-production-request-id] dt:has-text("Buchbare Ausstattung") + dd',
  )).toHaveText('Priorisiertes Mikrofon');
});

test('EMP-05 EMP-07: Catering cards and complete review retain package, quantities, allocations, and reflow', async ({ page }) => {
  const catalog = catalogPayload();
  const longDescription = 'Veranstaltungsbewirtungskonfigurationshinweis'.repeat(8);
  catalog.catalog.rooms[0].price = { amountMinor: 2_500, currency: 'EUR' };
  catalog.catalog.services = [{
    id: 'service-host', name: 'Service host', description: 'Support during the meeting',
    active: true, order: 1, price: { amountMinor: 1_000, currency: 'EUR' },
    siteIds: [], roomIds: [],
  }];
  catalog.catalog.equipment = [{
    id: 'portable-display', name: 'Portable display', description: 'Large presentation screen',
    active: true, order: 1, price: { amountMinor: 1_250, currency: 'EUR' },
    siteIds: [], roomIds: [],
  }];
  catalog.catalog.cateringItems = [
    {
      id: 'cake', name: 'Cake', description: longDescription, active: true, order: 2,
      price: { amountMinor: 300, currency: 'EUR' }, siteIds: [], roomIds: [],
    },
    {
      id: 'coffee', name: 'Coffee', description: 'Freshly brewed', active: true, order: 1,
      price: { amountMinor: 200, currency: 'EUR' }, siteIds: [], roomIds: [],
    },
  ];
  catalog.catalog.cateringPackages = [{
    id: 'workshop-package', name: 'Workshop package', description: longDescription,
    active: true, order: 1, price: { amountMinor: 0, currency: 'EUR' },
    siteIds: [], roomIds: [], itemIds: ['coffee'],
    variants: [{
      id: 'standard', name: 'Standard', description: 'For focused workshops',
      active: true, order: 1, price: { amountMinor: 500, currency: 'EUR' },
    }],
  }];
  catalog.catalog.costCenters = [{
    id: 'operations', code: '471100', name: 'Operations', group: null,
  }];
  await installProductionApplicationFixture(page, { catalog, allocationRequired: true });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await openEmployeeRoomStep(page, {
    title: 'Catering review', internal: '2', external: '1',
  });
  await page.getByRole('radio', { name: /Room A/ }).check();
  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await page.getByRole('checkbox', { name: /Service host/ }).check();
  await page.getByRole('checkbox', { name: /Portable display/ }).check();
  await page.getByRole('button', { name: 'Weiter' }).click();

  const packageGroup = page.getByRole('group', { name: 'Catering-Pakete und Varianten' });
  const itemGroup = page.getByRole('group', { name: 'Einzeloptionen' });
  const packageChoice = packageGroup.getByRole('radio', { name: 'Workshop package · Standard' });
  await packageChoice.focus();
  await packageChoice.press('Space');
  await expect(packageChoice).toBeChecked();
  await expect(packageChoice.locator('..')).toHaveClass(/\bselected\b/);
  await expect(packageChoice.locator('..')).toHaveCSS('outline-style', 'solid');
  const noPackageChoice = packageGroup.getByRole('radio', { name: 'Kein Catering-Paket' });
  await packageGroup.getByText(
    'Sie können Einzeloptionen wählen oder ohne Catering fortfahren.', { exact: true },
  ).click();
  await expect(noPackageChoice).toBeChecked();
  await expect(noPackageChoice).toBeFocused();
  await packageGroup.getByText('For focused workshops', { exact: true }).click();
  await expect(packageChoice).toBeChecked();
  await expect(packageChoice).toBeFocused();
  await page.locator('#productionCateringParticipants').fill('3');
  await itemGroup.getByLabel('Menge für Coffee').fill('3');
  await itemGroup.getByLabel('Menge für Cake').fill('2');
  await page.locator('#productionDietary').fill('Vegetarian');
  await expect(packageGroup.getByText('Enthalten: Coffee', { exact: true })).toBeVisible();
  await expect(packageGroup.locator('.price')).toContainText('5,00');
  await expect(itemGroup.locator('.price').first()).toContainText('je Einheit');
  await expect(page.locator('[data-step-panel="4"] img')).toHaveCount(0);

  await page.setViewportSize({ width: 640, height: 900 });
  const longCopyCards = page.locator('[data-step-panel="4"] .option-card').filter({ hasText: longDescription });
  await expect(longCopyCards).toHaveCount(2);
  expect(await longCopyCards.evaluateAll((cards) => cards.every(
    (card) => card.scrollWidth <= card.clientWidth,
  ))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth
    <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.locator('#productionAllocationPercent-0')).toHaveValue('100');
  await page.getByRole('button', { name: 'Weiter' }).click();

  const review = page.locator('[data-step-panel="6"]');
  await expect(review.getByText('Intern')).toBeVisible();
  await expect(review.getByText('Extern')).toBeVisible();
  await expect(review.getByText('Service host', { exact: true })).toBeVisible();
  await expect(review.getByText('Portable display', { exact: true })).toBeVisible();
  await expect(review.getByText('Workshop package · Standard', { exact: true })).toBeVisible();
  await expect(review.locator('dd').filter({ hasText: 'Coffee × 3 · im Paket enthalten' }))
    .toContainText('Cake × 2');
  await expect(review.getByText('Vegetarian', { exact: true })).toBeVisible();
  await expect(review.getByText(/471100 · Operations: 100/)).toBeVisible();
  await expect(review.getByText(/68,50\s*€/)).toBeVisible();
  await expect(review.getByRole('button', { name: 'Catering-Details ändern' })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Preisübersicht ändern' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth
    <= document.documentElement.clientWidth)).toBe(true);

  await review.getByRole('button', { name: 'Catering-Details ändern' }).click();
  await expect(page.getByRole('heading', { name: 'Bewirtung' })).toBeFocused();
  await expect(packageChoice).toBeChecked();
  await expect(itemGroup.getByLabel('Menge für Cake')).toHaveValue('2');
});

test('EMP-09: scoped session draft resumes the exact active wizard step and state after reload', async ({ page }) => {
  const catalog = catalogPayload();
  catalog.catalog.cateringItems = [{
    id: 'coffee', name: 'Coffee', description: null, active: true, order: 1,
    price: { amountMinor: 200, currency: 'EUR' }, siteIds: [], roomIds: [],
  }];
  await installProductionApplicationFixture(page, { catalog });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await openEmployeeRoomStep(page, { title: 'Resume me', internal: '2' });
  await page.getByRole('radio', { name: /Room A/ }).check();
  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.locator('#productionCateringParticipants').fill('2');
  await page.getByLabel('Menge für Coffee').fill('2');

  await expect.poll(() => page.evaluate(() => JSON.parse(
    sessionStorage.getItem('conference_server_request_draft_v1'),
  ))).toMatchObject({
    schemaVersion: 4,
    tenantId: TENANT_ID,
    userId: USER_ID,
    expiresAt: '2099-09-24T12:00:00.000Z',
    createdAt: expect.any(String),
    draft: {
      activeStep: 4,
      title: 'Resume me',
      cateringParticipants: '2',
      itemQuantities: { coffee: '2' },
    },
  });

  await page.reload();
  await page.locator('[data-view="employee"]').click();
  await expect(page.locator('#toast')).toContainText('Entwurf wiederhergestellt.');
  await expect(page.locator('[data-step-panel="4"]')).toBeVisible();
  await expect(page.locator('[data-step-panel]:visible')).toHaveCount(1);
  await expect(page.locator('.step[aria-current="step"]')).toContainText('4. Bewirtung');
  await expect(page.locator('#productionTitle')).toHaveValue('Resume me');
  await expect(page.locator('#productionCateringParticipants')).toHaveValue('2');
  await expect(page.getByLabel('Menge für Coffee')).toHaveValue('2');
});

test('EMP-03: Room preview exposes explicit empty and fail-closed catalog-error states', async ({ page }) => {
  const emptyCatalog = catalogPayload();
  emptyCatalog.catalog.rooms[0].floorplanAssetId = null;
  emptyCatalog.catalog.rooms[0].mediaAssetIds = [];
  await installProductionApplicationFixture(page, { catalog: emptyCatalog });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await openEmployeeRoomStep(page);
  await expect(page.getByText(
    'Für diesen Raum sind keine Bilder oder Grundrisse hinterlegt.',
  )).toBeVisible();
  await page.getByRole('button', { name: 'Raumbilder anzeigen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Raumbilder · Room A' });
  await expect(dialog.getByText(
    'Für diesen Raum sind keine Bilder oder Grundrisse hinterlegt.',
  )).toBeVisible();
  await expect(dialog.getByRole('img')).toHaveCount(0);
});

test('EMP-03: managed Room images load from same-origin API and keep dialog focus', async ({ page }) => {
  const id = '11111111-1111-4111-8111-111111111111';
  const catalog = catalogPayload();
  catalog.catalog.rooms[0].floorplanAssetId = id;
  catalog.catalog.rooms[0].mediaAssetIds = [id];
  await installProductionApplicationFixture(page, { catalog });
  const imageRequests = [];
  await page.route(`**/api/v1/tenant/rooms/room-a/media/${id}`, async (route) => {
    imageRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'image/webp',
      headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
      body: Buffer.from('UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAMAAUAmJaACdLoB+AAETAAA/uLgv996A3k//72C+9APegH9fAAA', 'base64'),
    });
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await openEmployeeRoomStep(page);
  const preview = page.getByRole('button', { name: 'Raumbilder anzeigen' });
  await preview.click();
  const dialog = page.getByRole('dialog', { name: 'Raumbilder · Room A' });
  const floorplan = dialog.getByRole('img', { name: 'Grundriss des Raums Room A' });
  await expect(floorplan).toBeVisible();
  await expect.poll(() => floorplan.evaluate((image) => image.complete && image.naturalWidth)).toBe(2);
  await expect(dialog.getByText('Bild wird geladen …')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Schließen' }).click();
  await expect(preview).toBeFocused();
  expect(imageRequests.length).toBeGreaterThan(0);
  expect(imageRequests.every((url) => url.startsWith(`${ORIGIN}/api/v1/tenant/rooms/room-a/media/`))).toBe(true);
});

test('EMP-03: remote Room asset references fail the complete catalog projection closed', async ({ page }) => {
  const invalidCatalog = catalogPayload();
  invalidCatalog.catalog.rooms[0].floorplanAssetId = 'https://attacker.invalid/room.png';
  await installProductionApplicationFixture(page, { catalog: invalidCatalog });
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('#viewTitle')).toHaveText('Sichere Anmeldung nicht verfügbar');
  await expect(page.locator('[data-view="employee"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Raumbilder anzeigen' })).toHaveCount(0);
});

test('EMP-13: session lock closes cancellation confirmation without a transition write', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  fixture.replaceRequests([confirmedRequestFixture()]);
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  await page.getByRole('button', { name: 'Anfrage stornieren' }).click();
  await expect(page.getByRole('dialog', { name: 'Anfrage wirklich stornieren?' })).toBeVisible();
  expect(fixture.writes).toHaveLength(0);

  await lockProductionApplication(page);
  await expect(page.getByRole('dialog', { name: 'Anfrage wirklich stornieren?' })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
});

test('EMP-03 EMP-04: English asset placeholders, Service, and Equipment states are explicit', async ({ page }) => {
  const catalog = catalogPayload();
  catalog.catalog.equipment = [{
    id: 'portable-display',
    name: 'Portable display',
    description: 'Large presentation screen',
    active: true,
    order: 1,
    price: { amountMinor: 2500, currency: 'EUR' },
    siteIds: ['berlin'],
    roomIds: ['room-a'],
  }];
  await page.addInitScript(() => {
    window.localStorage.setItem('conference_language_v1', 'en');
  });
  await installProductionApplicationFixture(page, { catalog });
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('[data-view="employee"]').click();
  await fillEmployeeSchedule(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.room-asset-empty:visible').filter({ hasText: 'This room image is unavailable.' })).toBeVisible();
  const assetAvailabilityTrigger = page.getByRole('button', { name: 'Show room images' });
  await assetAvailabilityTrigger.click();
  const assetAvailabilityDialog = page.getByRole('dialog', { name: 'Room images · Room A' });
  await expect(assetAvailabilityDialog.getByRole('img')).toHaveCount(0);
  await expect(assetAvailabilityDialog).toContainText(
    'Older references must be uploaded again.',
  );
  await assetAvailabilityDialog.getByRole('button', { name: 'Close' }).click();
  await expect(assetAvailabilityTrigger).toBeFocused();
  await page.getByRole('radio', { name: /Room A/ }).check();
  await page.getByRole('button', { name: 'Check room availability' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  const serviceGroup = page.getByRole('group', { name: 'Services' });
  await expect(serviceGroup.getByText(
    'No options are available for the selected room.', { exact: true },
  )).toBeVisible();
  const equipmentGroup = page.getByRole('group', { name: 'Bookable equipment' });
  await expect(equipmentGroup.getByRole('checkbox', { name: /Portable display/ })).toBeVisible();
  await expect(equipmentGroup.locator('.price')).toContainText('per request');
  await page.getByRole('button', { name: 'Next' }).click();
  const packageGroup = page.getByRole('group', { name: 'Catering packages and variants' });
  await expect(packageGroup.getByRole('radio', { name: 'No catering package' })).toBeChecked();
  await expect(packageGroup.getByText(
    'No catering packages are available for the selected room.', { exact: true },
  )).toBeVisible();
  await expect(page.getByRole('group', { name: 'Individual items' }).getByText(
    'No individual items', { exact: true },
  )).toBeVisible();
});

test('EMP-08: first post-submit list failure retains completion and restores focus to the error', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await openEmployeeRoomStep(page);
  await page.getByRole('radio', { name: /Room A/ }).check();
  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();
  await advanceEmployeeToReview(page);
  fixture.failNextRequestRead();
  await page.getByRole('button', { name: 'Anfrage absenden' }).click();

  const completion = page.locator('[data-ux-submission-success]');
  const loadError = page.getByText('Die Produktionsdaten konnten nicht sicher geladen werden.', { exact: true });
  await expect(completion).toBeFocused();
  await expect(loadError).toBeVisible();
  await completion.getByRole('button', { name: 'Schließen' }).click();
  await expect(loadError).toBeFocused();
  expect(fixture.writes).toHaveLength(1);
});

test('EMP-08: completion dismissal during refresh restores focus after the new projection commits', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await openEmployeeRoomStep(page);
  await page.getByRole('radio', { name: /Room A/ }).check();
  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();
  await advanceEmployeeToReview(page);
  await page.getByRole('button', { name: 'Anfrage absenden' }).click();

  const completion = page.locator('[data-ux-submission-success]');
  await expect(completion).toBeFocused();
  const releaseRefresh = fixture.holdNextRequestRead();
  await page.getByRole('button', { name: 'Aktualisieren' }).click();
  await completion.getByRole('button', { name: 'Schließen' }).click();
  releaseRefresh();

  await expect(page.locator(`[data-production-request-id="${REQUEST_ID}"]`)).toBeFocused();
  expect(fixture.writes).toHaveLength(1);
});

test('EMP-08: completion dismissal during a failing refresh restores retained-card focus', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await openEmployeeRoomStep(page);
  await page.getByRole('radio', { name: /Room A/ }).check();
  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();
  await advanceEmployeeToReview(page);
  await page.getByRole('button', { name: 'Anfrage absenden' }).click();

  const completion = page.locator('[data-ux-submission-success]');
  await expect(completion).toBeFocused();
  const releaseRefresh = fixture.holdNextFailingRequestRead();
  await page.getByRole('button', { name: 'Aktualisieren' }).click();
  await completion.getByRole('button', { name: 'Schließen' }).click();
  releaseRefresh();

  await expect(page.locator(`[data-production-request-id="${REQUEST_ID}"]`)).toBeFocused();
  await expect(page.locator('#toast')).toContainText(
    'Die Produktionsdaten konnten nicht sicher geladen werden.',
  );
  expect(fixture.writes).toHaveLength(1);
});

test('EMP-02: Employee schedule keeps both participant counts required', async ({ page }) => {
  await installProductionApplicationFixture(page);
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();

  const requestDate = futureDate();
  await page.locator('#productionTitle').fill('Pflichtfeldprüfung');
  await page.locator('#productionDate').fill(requestDate);
  await page.locator('#productionStart').fill('09:00');
  await page.locator('#productionEndDate').fill(requestDate);
  await page.locator('#productionEnd').fill('10:30');
  const externalParticipants = page.locator('#productionExternal');
  await externalParticipants.fill('');
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.locator('[data-step-panel="1"]')).toBeVisible();
  await expect(externalParticipants).toHaveAttribute('aria-invalid', 'true');
  await expect(externalParticipants).toBeFocused();
});

test('EMP-11: Employee can navigate own server-backed Requests as a keyboard-safe mobile calendar', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  const sourceRequest = confirmedV2RequestFixture();
  fixture.requests().push(sourceRequest);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();

  const list = page.getByRole('button', { name: 'Liste', exact: true });
  const calendar = page.getByRole('button', { name: 'Kalender', exact: true });
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await calendar.click();
  await expect(calendar).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.calendar-table')).toBeVisible();
  await expect(page.locator(`[data-calendar-date="${sourceRequest.startsAt.slice(0, 10)}"] .calendar-event`))
    .toHaveCount(1);

  const monthCaption = await page.locator('.calendar-table caption').textContent();
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await expect(page.locator('.calendar-table caption')).not.toHaveText(monthCaption);
  await page.getByRole('button', { name: 'Vorheriger Monat' }).click();
  await expect(page.locator('.calendar-table caption')).toHaveText(monthCaption);
  const event = page.locator(`[data-calendar-date="${sourceRequest.startsAt.slice(0, 10)}"] .calendar-event`);
  await event.focus();
  await event.press('Enter');

  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`[data-production-request-id="${sourceRequest.id}"]`)).toBeFocused();
  const reflow = await page.evaluate(() => {
    const describe = (element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          element: element.tagName.toLowerCase(),
          className: typeof element.className === 'string' ? element.className : '',
          id: element.id,
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          display: style.display,
          position: style.position,
          overflowX: style.overflowX,
          outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineOffset}`,
          boxShadow: style.boxShadow,
        };
    };
    const elements = [...document.querySelectorAll('body *')].map(describe);
    return {
      fits: document.documentElement.scrollWidth <= window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      root: [document.body, ...document.body.children].map(describe),
      active: describe(document.activeElement),
      edge: elements.filter(({ right }) => right >= window.innerWidth).slice(0, 20),
      intrinsicOverflow: elements
        .filter(({ scrollWidth, clientWidth }) => scrollWidth > clientWidth)
        .slice(0, 24),
      overflow: elements
      .filter(({ left, right }) => left < 0 || right > window.innerWidth)
      .slice(0, 12),
    };
  });
  expect(reflow.fits, JSON.stringify(reflow)).toBe(true);
});

test('EMP-12: Employee history is an accessible localized server timeline with focus return', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();

  const history = page.getByRole('button', { name: 'Verlauf' });
  await history.click();
  const dialog = page.getByRole('dialog', { name: 'Verlauf' });
  await expect(dialog.locator('.request-timeline li')).toHaveCount(1);
  await expect(dialog.getByText('Status geändert', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Version 1/)).toBeVisible();
  await expect(dialog.getByText('Status: Bestätigt', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Schließen' }).click();

  await expect(history).toBeFocused();
  expect(fixture.requestHistoryReads).toEqual([REQUEST_ID]);
});

test('Employee reconciles one held cancellation after cross-navigation from pre-cancel state', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, { holdTransition: true });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  await page.getByRole('button', { name: 'Anfrage stornieren' }).click();
  await page.getByRole('dialog', { name: 'Anfrage wirklich stornieren?' })
    .getByRole('button', { name: 'Anfrage stornieren' }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);

  await page.locator('[data-view="welcome"]').click();
  await page.locator('[data-view="requests"]').click();
  await expect(page.getByText('Status: Bestätigt')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anfrage stornieren' })).toBeDisabled();
  expect(fixture.writes).toHaveLength(1);

  const response = page.waitForResponse((value) => (
    new URL(value.url()).pathname === `/api/v1/requests/${REQUEST_ID}/transitions`
  ));
  fixture.releaseTransition();
  await response;

  await expect(page.locator('#toast')).toContainText('Anfrage wurde storniert.');
  await expect(page.getByText('Status: Storniert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anfrage stornieren' })).toHaveCount(0);
  expect(fixture.writes).toEqual([{
    path: `/api/v1/requests/${REQUEST_ID}/transitions`,
    csrf: CSRF_TOKEN,
    body: { transition: 'cancel' },
    ifMatch: '"1"',
  }]);
});

test('Employee keeps one booking-change proposal in flight across a Requests refresh', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, { holdBookingProposal: true });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  await page.getByRole('button', { name: 'Bestätigte Buchung ändern' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bestätigte Buchung ändern' });
  await dialog.locator(`#changeInternal-${REQUEST_ID}`).fill('3');
  await dialog.getByRole('button', { name: 'Änderung einreichen' }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);

  const refreshResponse = page.waitForResponse((value) => (
    new URL(value.url()).pathname === '/api/v1/application/requests'
    && value.request().method() === 'GET'
  ));
  await page.getByRole('button', { name: 'Aktualisieren' }).evaluate((control) => control.click());
  await refreshResponse;
  const replacementChange = page.getByRole('button', { name: 'Bestätigte Buchung ändern' });
  await expect(replacementChange).toBeDisabled();
  await replacementChange.evaluate((control) => control.click());
  await expect(page.getByRole('dialog', { name: 'Bestätigte Buchung ändern' })).toHaveCount(1);
  expect(fixture.roomContextReads).toHaveLength(1);
  expect(fixture.writes).toHaveLength(1);

  const proposalResponse = page.waitForResponse((value) => (
    new URL(value.url()).pathname === `/api/v1/requests/${REQUEST_ID}/booking-change`
    && value.request().method() === 'POST'
  ));
  fixture.releaseBookingProposal();
  await proposalResponse;

  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Der Änderungsantrag wurde eingereicht.');
  await expect(page.getByText('Freigabe ausstehend')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bestätigte Buchung ändern' })).toHaveCount(0);
  expect(fixture.bookingChange()).toMatchObject({ status: 'pending', internalParticipants: 3 });
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({
    path: `/api/v1/requests/${REQUEST_ID}/booking-change`,
    csrf: CSRF_TOKEN,
    body: {
      schemaVersion: 2,
      expectedVersion: 1,
      request: { internalParticipants: 3 },
    },
  });
});

test('Employee keeps the current resubmission editor when a detached create load settles last', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  const detachedDraftTitle = 'Detached draft';
  const resubmission = {
    ...confirmedV2RequestFixture(),
    status: 'Change Requested',
    statusReason: 'Please revise the request.',
  };
  fixture.requests().push(resubmission);
  await page.goto(`${ORIGIN}/`);

  await page.locator('#mainContent').getByRole('button', { name: 'Neue Konferenz anfragen' }).click();
  const title = page.locator('#productionTitle');
  await title.fill(detachedDraftTitle);
  await expect(title).toHaveValue(detachedDraftTitle);
  await expect.poll(() => page.evaluate((expectedTitle) => (
    Object.values(sessionStorage).some((storedValue) => {
      try {
        return JSON.parse(storedValue)?.draft?.title === expectedTitle;
      } catch {
        return false;
      }
    })
  ), detachedDraftTitle)).toBe(true);
  await page.locator('[data-view="requests"]').click();
  await expect(page.getByRole('button', { name: 'Änderung bearbeiten' })).toBeVisible();

  const olderLoad = fixture.holdNextCatalogLoad();
  await page.locator('[data-view="employee"]').click();
  await expect.poll(() => fixture.catalogReads.filter(
    ({ context }) => context === olderLoad.context,
  )).toEqual([{ context: olderLoad.context, section: 'sites' }]);

  const currentCatalog = catalogPayload();
  currentCatalog.catalog.rooms[0] = {
    ...currentCatalog.catalog.rooms[0],
    name: 'Current Room',
    capacity: 24,
  };
  fixture.replaceCatalog(currentCatalog);
  await page.locator('[data-view="requests"]').click();
  await page.getByRole('button', { name: 'Änderung bearbeiten' }).click();

  await expect(page.locator('#productionTitle')).toHaveValue('Updated conference');
  await expect(page.locator('#productionRoom')).toHaveValue('room-a');
  await expect(page.locator('[data-room-id="room-a"]')).toContainText('Current Room');
  await expect(page.locator('#productionInternal')).toHaveValue('2');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();
  await expect(page.getByText('Der Raum ist im gewählten Zeitraum verfügbar.')).toBeVisible();
  expect(fixture.availabilityChecks).toEqual([{
    path: '/api/v1/application/room-availability',
    csrf: CSRF_TOKEN,
    body: {
      roomId: 'room-a',
      startsAt: resubmission.startsAt,
      endsAt: resubmission.endsAt,
      resubmissionRequestId: REQUEST_ID,
    },
  }]);
  await expect(page.locator('#toast')).toBeEmpty();

  const staleCompletion = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/v1/application/catalog'
      && url.searchParams.get('section') === 'costCenters'
      && url.searchParams.get('context') === olderLoad.context;
  });
  olderLoad.release();
  await staleCompletion;
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));

  expect(fixture.catalogReads.filter(({ context }) => context === olderLoad.context)).toEqual([
    { context: olderLoad.context, section: 'sites' },
    { context: olderLoad.context, section: 'rooms' },
    { context: olderLoad.context, section: 'services' },
    { context: olderLoad.context, section: 'equipment' },
    { context: olderLoad.context, section: 'cateringPackages' },
    { context: olderLoad.context, section: 'cateringItems' },
    { context: olderLoad.context, section: 'costCenters' },
  ]);
  await expect(page.locator('#productionTitle')).toHaveValue('Updated conference');
  await expect(page.locator('[data-room-id="room-a"]')).toContainText('Current Room');
  await expect(page.locator('#productionInternal')).toHaveValue('2');
  await expect(page.locator('#toast')).toBeEmpty();
  await expect(page.locator('#viewTitle')).toHaveText('Konferenzanfrage');
  expect(fixture.writes).toHaveLength(0);
});

test('EMP-01 EMP-07: Employee production flow invalidates availability after a non-conflict request creation failure', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    requestCreateErrors: [{ status: 503, code: 'SERVICE_UNAVAILABLE' }],
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await openEmployeeRoomStep(page);
  await page.getByRole('radio', { name: /Room A/ }).check();

  const availability = page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' });
  await availability.click();
  await advanceEmployeeToReview(page);
  const submit = page.getByRole('button', { name: 'Anfrage absenden' });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(submit).toBeDisabled();
  await page.getByRole('button', { name: 'Raum ändern' }).click();
  await expect(availability).toBeVisible();

  await availability.click();
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeEnabled();
  expect(fixture.availabilityChecks).toHaveLength(2);
  expect(fixture.writes).toHaveLength(1);
});

test('EMP-03: Employee room cards use each projected price currency', async ({ page }) => {
  const catalog = catalogPayload();
  catalog.catalog.rooms[0].price = { amountMinor: 2_500, currency: 'CHF' };
  await installProductionApplicationFixture(page, { catalog });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await openEmployeeRoomStep(page);

  await expect(page.locator('[data-room-id="room-a"] .price')).toContainText('CHF');
});

test('EMP-07: Employee rebases a conflicted resubmission and preserves the editor draft', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    requestCreateErrors: [{ status: 409, code: 'REQUEST_CONFLICT', latestVersion: 2 }],
  });
  fixture.requests().push({
    ...confirmedV2RequestFixture(),
    status: 'Change Requested',
    statusReason: 'Please revise the request.',
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  await page.getByRole('button', { name: 'Änderung bearbeiten' }).click();

  await page.locator('#productionTitle').fill('Preserved resubmission draft');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();
  await advanceEmployeeToReview(page);
  await page.getByRole('button', { name: 'Änderung erneut einreichen' }).click();

  await expect(page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' })).toBeVisible();
  await expect(page.locator('#productionTitle')).toHaveValue('Preserved resubmission draft');
  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();
  await advanceEmployeeToReview(page);
  await page.getByRole('button', { name: 'Änderung erneut einreichen' }).click();

  await expect(page.locator('#viewTitle')).toHaveText('Meine Anfragen');
  const completion = page.locator('[data-ux-submission-success]');
  await expect(completion).toBeFocused();
  await expect(completion.getByText('Änderung erfolgreich eingereicht', { exact: true })).toBeVisible();
  expect(fixture.writes).toHaveLength(2);
  expect(fixture.writes.map(({ body }) => body.expectedVersion)).toEqual([1, 2]);
  expect(fixture.writes.map(({ body }) => body.request.title)).toEqual([
    'Preserved resubmission draft',
    'Preserved resubmission draft',
  ]);
});

test('EMP-03: Employee production flow exposes occupied, transport-error, and available states', async ({ page }) => {
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
  await openEmployeeRoomStep(page);
  await page.getByRole('radio', { name: /Room A/ }).check();
  const check = page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' });

  await check.click();
  await expect(page.getByText('Raumverfügbarkeit wird serverseitig geprüft …')).toBeVisible();
  await expect(check).toBeDisabled();
  fixture.releaseAvailability();
  await expect(page.getByText(/Der Raum ist im gewählten Zeitraum belegt/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeDisabled();
  await check.click();
  await expect(page.getByText(/konnte nicht sicher geprüft werden/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeDisabled();
  await check.click();
  await expect(page.getByText('Der Raum ist im gewählten Zeitraum verfügbar.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeEnabled();
  expect(fixture.availabilityChecks).toHaveLength(3);
  expect(fixture.writes).toHaveLength(0);
});

test('EMP-02 EMP-03: Employee production flow blocks availability checks without an authoritative site timezone', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, { timeZone: null });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="employee"]').click();
  await openEmployeeRoomStep(page);
  await page.getByRole('radio', { name: /Room A/ }).check();

  await page.getByRole('button', { name: 'Raumverfügbarkeit prüfen' }).click();

  await expect(page.getByText(/keine gültige Zeitzone konfiguriert/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeDisabled();
  expect(fixture.availabilityChecks).toHaveLength(0);
  expect(fixture.writes).toHaveLength(0);
});

test('confirmed-booking dialog presents an inactive current Room but accepts only active targets', async ({ page }) => {
  const catalog = catalogPayload();
  const currentRequest = confirmedRequestFixture();
  catalog.catalog.rooms = [{
    id: 'room-b', siteId: 'berlin', name: 'Room B', capacity: 20, active: true,
    price: { amountMinor: 0, currency: 'EUR' },
  }];
  const fixture = await installProductionApplicationFixture(page, {
    catalog,
    requestRoomContext: {
      locationsRevision: 1,
      room: {
        id: 'room-a', siteId: 'retired-site', name: 'Retired Room', capacity: 12, active: false,
      },
      site: {
        id: 'retired-site', name: 'Retired Site', active: false, timeZone: 'Europe/Berlin',
      },
    },
  });
  fixture.requests().push(currentRequest);
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  await expect(page.getByText('Retired Room · 12')).toBeVisible();
  await page.getByRole('button', { name: 'Bestätigte Buchung ändern' }).click();
  const dialog = page.getByRole('dialog');

  await expect(dialog.locator('select')).toHaveValue('room-a');
  await expect(dialog.locator('option[value="room-a"]')).toHaveCount(1);
  await expect(dialog.locator('option[value="room-a"]')).toHaveAttribute('disabled', 'disabled');
  await expect(dialog.locator('option[value="room-a"]')).toHaveJSProperty('disabled', true);
  await expect(dialog.locator('option[value="room-b"]')).toBeEnabled();
  await expect(dialog).toContainText('Wählen Sie für die Änderung einen aktiven Raum');
  await dialog.getByRole('button', { name: 'Änderung einreichen' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Bitte wählen Sie einen Raum');

  await dialog.locator('select').selectOption('room-b');
  await dialog.locator(`#changeInternal-${REQUEST_ID}`).fill('500');
  await dialog.locator(`#changeExternal-${REQUEST_ID}`).fill('1');
  await dialog.getByRole('button', { name: 'Änderung einreichen' }).click();

  await expect(dialog.getByRole('alert')).toContainText(
    'Bitte wählen Sie einen Raum, ein gültiges zukünftiges Zeitfenster und mindestens eine teilnehmende Person.',
  );
  expect(fixture.writes).toHaveLength(0);

  await dialog.locator(`#changeInternal-${REQUEST_ID}`).fill('3');
  await dialog.locator(`#changeExternal-${REQUEST_ID}`).fill('0');
  await dialog.getByRole('button', { name: 'Änderung einreichen' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Der Änderungsantrag wurde eingereicht.');
  await expect(page.getByText('Freigabe ausstehend')).toBeVisible();
  expect(fixture.writes).toEqual([{
    path: `/api/v1/requests/${REQUEST_ID}/booking-change`,
    csrf: CSRF_TOKEN,
    body: {
      schemaVersion: 2,
      expectedVersion: 1,
      request: {
        title: 'Konferenzanfrage',
        roomId: 'room-b',
        startsAt: currentRequest.startsAt,
        endsAt: currentRequest.endsAt,
        internalParticipants: 3,
        externalParticipants: 0,
        serviceIds: [],
        catering: { participantCount: 0, packageSelection: null, itemQuantities: [] },
        dietaryRequirements: null,
        specialRequirements: null,
        allocations: [],
        configurationRevisions: {
          organization: 1,
          locations: 1,
          catalogue: 1,
          bookingPolicies: 1,
          costAllocation: 1,
        },
      },
    },
  }]);
  expect(fixture.bookingChange()).toMatchObject({
    status: 'pending',
    roomId: 'room-b',
    internalParticipants: 3,
    externalParticipants: 0,
  });
});

test('confirmed-booking dialog fails closed when the current inactive Site has no timezone', async ({ page }) => {
  const catalog = catalogPayload();
  catalog.catalog.rooms = [];
  const fixture = await installProductionApplicationFixture(page, {
    catalog,
    requestRoomContext: {
      locationsRevision: 1,
      room: {
        id: 'room-a', siteId: 'retired-site', name: 'Retired Room', capacity: 12, active: false,
      },
      site: { id: 'retired-site', name: 'Retired Site', active: false, timeZone: null },
    },
  });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  await page.getByRole('button', { name: 'Bestätigte Buchung ändern' }).click();

  await expect(page.getByText(/keine gültige Zeitzone konfiguriert/)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
});

test('confirmed inactive Room context with a stale locations revision fails closed', async ({ page }) => {
  const catalog = catalogPayload();
  catalog.catalog.rooms = [];
  const fixture = await installProductionApplicationFixture(page, {
    catalog,
    catalogLocationsRevision: 1,
    requestRoomContext: {
      locationsRevision: 2,
      room: {
        id: 'room-a', siteId: 'retired-site', name: 'Stale Retired Room', capacity: 12, active: false,
      },
      site: {
        id: 'retired-site', name: 'Retired Site', active: false, timeZone: 'Europe/Berlin',
      },
    },
  });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();

  await expect(page.getByText('Stale Retired Room · 12')).toHaveCount(0);
  await page.getByRole('button', { name: 'Bestätigte Buchung ändern' }).click();
  await expect(page.locator('#toast')).toContainText('zwischenzeitlich geändert');
  await expect(page.getByRole('dialog', { name: 'Bestätigte Buchung ändern' })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
});

test('confirmed inactive Room print uses the authoritative context label and timezone', async ({ page }) => {
  const catalog = catalogPayload();
  catalog.catalog.rooms = [];
  const currentRequest = confirmedRequestFixture();
  const fixture = await installProductionApplicationFixture(page, {
    catalog,
    requestRoomContext: {
      locationsRevision: 1,
      room: {
        id: 'room-a', siteId: 'retired-site', name: 'Retired Room', capacity: 12, active: false,
      },
      site: {
        id: 'retired-site', name: 'Retired Site', active: false, timeZone: 'Europe/Berlin',
      },
    },
  });
  fixture.requests().push(currentRequest);
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  await expect(page.getByText('Retired Room · 12')).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Drucken / Als PDF speichern' }).click();
  const popup = await popupPromise;
  const expectedStart = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(Date.parse(currentRequest.startsAt));
  await expect(popup.locator('body')).toContainText('Retired Room · 12');
  await expect(popup.locator('body')).toContainText(expectedStart);
});

test('EMP-14 EMP-15 API-02 Guest and print show finite values and conceal legacy prose', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    requestRoomContextSchemaVersion: 3,
    requestRoomContext: {
      locationsRevision: 1,
      room: {
        id: 'room-a', siteId: 'berlin', name: 'Room A', capacity: 12, active: true,
        floor: '1', floorplanAssetId: null, mediaAssetIds: [],
        accessibility: ['Step-free access'],
        guestPublicValues: { floorNumber: 1, accessibilityFeatures: ['step_free_entry'] },
      },
      site: {
        id: 'berlin', name: 'Berlin', active: true, timeZone: 'Europe/Berlin',
      },
      guestPublicValues: {
        publicTransport: 'available', parking: 'available', arrival: 'reception',
        accessibilityFeatures: ['lift'],
      },
      guestPresentation: {
        address: {
          line1: 'Main Street 1', line2: null, postalCode: '10115', city: 'Berlin', countryCode: 'DE',
        },
        publicTransport: 'S-Bahn Hauptbahnhof',
        arrival: 'Use the south entrance',
        parking: 'Visitor parking P2',
        reception: 'Show a photo ID at reception',
        building: 'Building B, second floor',
        visitorNotes: 'Please arrive 15 minutes early',
        accessibility: 'Aufzug vorhanden',
        wifiPolicy: 'credentials_on_arrival',
        wifiNetworkName: 'Conference Guest',
        contact: {
          name: 'Conference Management', email: 'events@example.test', phone: '+49 30 555 0100',
        },
        routeUrl: 'https://www.openstreetmap.org/',
      },
    },
  });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();

  await page.getByRole('button', { name: 'Gästeinformationen' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Main Street 1, 10115 Berlin, DE');
  await expect(dialog.getByText('Beginn', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Ende', { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText(confirmedRequestFixture().startsAt);
  await expect(dialog).toContainText('Etage');
  await expect(dialog).toContainText('Stufenloser Zugang');
  await expect(dialog).toContainText('Aufzug');
  await expect(dialog).toContainText('An der Rezeption anmelden');
  await expect(dialog).toContainText('1');
  await expect(dialog).not.toContainText('Step-free access');
  await expect(dialog).not.toContainText('S-Bahn Hauptbahnhof');
  await expect(dialog).not.toContainText('Use the south entrance');
  await expect(dialog).not.toContainText('Visitor parking P2');
  await expect(dialog).not.toContainText('Show a photo ID at reception');
  await expect(dialog).not.toContainText('Building B, second floor');
  await expect(dialog).not.toContainText('Please arrive 15 minutes early');
  await expect(dialog).toContainText('Zugangsdaten bei Ankunft');
  await expect(dialog).not.toContainText('Conference Guest');
  await expect(dialog).toContainText('events@example.test');
  await expect(dialog.getByRole('link', { name: 'Route öffnen' }))
    .toHaveAttribute('href', 'https://www.openstreetmap.org/');
  await expect(dialog).not.toContainText(/Passwort|provider/i);

  const popupPromise = page.waitForEvent('popup');
  await dialog.getByRole('button', { name: 'Drucken / Als PDF speichern' }).click();
  const popup = await popupPromise;
  await expect(popup.locator('body')).not.toContainText('Use the south entrance');
  await expect(popup.locator('body')).not.toContainText('Building B, second floor');
  await expect(popup.locator('body')).not.toContainText('Please arrive 15 minutes early');
  await expect(popup.locator('body')).not.toContainText('Conference Guest');
  await expect(popup.locator('body')).toContainText('An der Rezeption anmelden');
  await expect(popup.getByRole('link', { name: 'Route öffnen' }))
    .toHaveAttribute('href', 'https://www.openstreetmap.org/');
  await expect(popup.locator('body')).not.toContainText(/Passwort|provider/i);
  await expect(popup.locator('body')).not.toContainText(REQUEST_ID);
  expect(await popup.title()).toBe('Willkommens-PDF');
  await expect(popup.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /default-src 'none'.*script-src 'none'.*img-src 'none'.*connect-src 'none'/,
  );
  await expect(popup.locator('script, style, img')).toHaveCount(0);
  await expect(popup.locator('link[rel="stylesheet"]')).toHaveCount(2);
  await expect(popup.getByRole('button', { name: 'Drucken / Als PDF speichern' })).toBeEnabled();
  await expect(popup.locator('.guest-print-hero')).toHaveCSS('background-color', 'rgb(23, 23, 23)');
  await expect(popup.locator('.guest-print-hero')).toHaveCSS('border-bottom-color', 'rgb(194, 154, 107)');
  await expect(popup.locator('.guest-print-facts article')).toHaveCount(4);
  expect(await popup.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await popup.getByRole('button', { name: 'Drucken / Als PDF speichern' }).focus();
  await expect(popup.getByRole('button', { name: 'Drucken / Als PDF speichern' })).toBeFocused();
  await popup.emulateMedia({ media: 'print' });
  await expect(popup.locator('.print-action')).toBeHidden();
  await expect(popup.locator('.guest-print-grid')).toHaveCSS('display', 'grid');
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await popup.close();
});

test('EMP-15 unavailable print styles close the detached surface with a recoverable message', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  await page.getByRole('button', { name: 'Gästeinformationen' }).click();
  await page.context().route(`${ORIGIN}/assets/employee-ux.css`, (route) => route.abort());
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('dialog').getByRole('button', { name: 'Drucken / Als PDF speichern' }).click();
  const popup = await popupPromise;
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.getByText('Die Druckansicht konnte nicht geladen werden. Bitte erneut versuchen.', { exact: true })).toBeVisible();
});

test('API-02 print popup is reserved inside the click before Guest context resolves', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    holdRoomContext: true,
    requestRoomContextSchemaVersion: 3,
    requestRoomContext: {
      locationsRevision: 1,
      room: {
        id: 'room-a', siteId: 'berlin', name: 'Room A', capacity: 12, active: true,
        floor: null, floorplanAssetId: null, mediaAssetIds: [], accessibility: [],
      },
      site: { id: 'berlin', name: 'Berlin', active: true, timeZone: 'Europe/Berlin' },
      guestPresentation: null,
    },
  });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Drucken / Als PDF speichern' }).click();
  const popup = await popupPromise;
  await expect.poll(() => fixture.roomContextReads.length).toBe(1);
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  fixture.releaseRoomContext();
  await expect(popup.locator('body')).toContainText('Room A · 12');
  await popup.close();
});

test('API-02 downgraded Guest context clears and closes its reserved print popup', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    requestRoomContextSchemaVersion: 1,
  });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Drucken / Als PDF speichern' }).click();
  const popup = await popupPromise;

  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.locator('#toast')).toContainText('Die Aktion konnte nicht sicher abgeschlossen werden.');
  expect(fixture.roomContextReads).toEqual([REQUEST_ID]);
});

test('API-02 blocked print popup reports a localized recoverable error', async ({ page }) => {
  await page.addInitScript(() => {
    window.open = () => null;
  });
  const fixture = await installProductionApplicationFixture(page);
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();

  await page.getByRole('button', { name: 'Drucken / Als PDF speichern' }).click();
  await expect(page.locator('#toast')).toContainText('Druckfenster wurde vom Browser blockiert');
  expect(fixture.roomContextReads).toHaveLength(0);
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
  const managerTabs = page.getByRole('tablist', { name: 'Conference Manager' });
  await expect(managerTabs).toBeVisible();
  expect(await managerTabs.getByRole('tab').allTextContents()).toEqual([
    'Anfragen & Buchungen', 'Raumplanung', 'Reports', 'Administration',
  ]);
  await expect(managerTabs.getByRole('tab', { name: 'Anfragen & Buchungen' }))
    .toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.dashboard-grid').getByRole('button', { name: '1 Handlungsbedarf' }))
    .toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Suche' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Status' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Standort' })).toBeVisible();
  await page.getByRole('button', { name: 'Prüfung starten' }).click();
  await expect(page.locator('#toast')).toContainText('Workflow-Status wurde aktualisiert.');
  await expect(page.locator(`[data-production-request-id="${REQUEST_ID}"]`)).toBeFocused();

  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({
    csrf: CSRF_TOKEN,
    body: { transition: 'start_review' },
  });
});

test('MGR-01 MGR-04 MGR-05: Manager tabs expose inline room planning and visible server reports', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  fixture.requests().push({
    ...confirmedRequestFixture(),
    details: {
      title: 'Leadership Summit',
      serviceIds: ['svc-video'],
      cateringPackageId: 'package-standard',
      cateringQuantities: { coffee: 4 },
    },
  });

  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Raumplanung' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Tagesübersicht der Raumbelegung.');
  await expect(page.getByRole('table')).toContainText('Room A');

  await page.getByRole('tab', { name: 'Reports' }).click();
  await expect.poll(() => fixture.reportReads.length).toBe(1);
  const report = page.getByRole('tabpanel');
  await expect(report).toContainText('Raumauslastung');
  await expect(report).toContainText('Service-Nutzung');
  await expect(report).toContainText('Catering-Nutzung');
  await expect(report.locator('.dashboard-grid')).toContainText('Gebuchte Raumstunden');

  await page.getByRole('tab', { name: 'Administration' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Business-Einstellungen');
  await page.getByRole('button', { name: 'Business-Einstellungen' }).click();
  await expect(page.locator('[data-manager-business-settings-root]')).toBeVisible();
});

test('Conference Manager cancels a confirmed request through the exact non-destructive transition', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  fixture.requests().push(confirmedRequestFixture());

  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Anfrage stornieren' }).click();
  const dialog = page.getByRole('dialog', { name: 'Anfrage wirklich stornieren?' });

  await expect(dialog).toContainText('Die Anfragedaten werden nicht gelöscht.');
  await dialog.getByRole('button', { name: 'Anfrage stornieren' }).click();
  await expect(page.locator('#toast')).toContainText('Die Anfrage wurde storniert.');

  expect(fixture.writes).toEqual([{
    path: `/api/v1/requests/${REQUEST_ID}/transitions`,
    csrf: CSRF_TOKEN,
    body: { transition: 'cancel' },
    ifMatch: '"1"',
  }]);
  expect(fixture.requests()[0].status).toBe('Cancelled');
});

test('Conference Manager keeps a pending cancellation modal and surfaces the server conflict', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    holdTransition: true,
    transitionError: { status: 409, code: 'REQUEST_CONFLICT' },
  });
  fixture.requests().push(confirmedRequestFixture());

  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Anfrage stornieren' }).click();
  const dialog = page.getByRole('dialog', { name: 'Anfrage wirklich stornieren?' });
  const confirm = dialog.getByRole('button', { name: 'Anfrage stornieren' });
  const dismiss = dialog.getByRole('button', { name: 'Abbrechen' });
  await confirm.click();
  await expect.poll(() => fixture.writes.length).toBe(1);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(confirm).toBeDisabled();
  await expect(dismiss).toBeDisabled();

  const response = page.waitForResponse((value) => (
    new URL(value.url()).pathname === `/api/v1/requests/${REQUEST_ID}/transitions`
  ));
  fixture.releaseTransition();
  await response;
  await expect(dialog.getByRole('alert')).toContainText('zwischenzeitlich geändert');
  await expect(confirm).toBeEnabled();
  await expect(dismiss).toBeEnabled();
  expect(fixture.writes).toHaveLength(1);
});

test('Conference Manager serializes a direct transition across workspace navigation', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    holdTransition: true,
  });
  fixture.requests().push({
    ...confirmedRequestFixture(),
    status: 'Submitted',
  });

  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Prüfung starten' }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  await page.locator('[data-view="welcome"]').click();
  await page.locator('[data-view="manager"]').click();
  await expect(page.getByRole('button', { name: 'Prüfung starten' })).toBeDisabled();

  const response = page.waitForResponse((value) => (
    new URL(value.url()).pathname === `/api/v1/requests/${REQUEST_ID}/transitions`
  ));
  fixture.releaseTransition();
  await response;
  await expect(page.getByRole('button', { name: 'Bestätigen' })).toBeEnabled();
  expect(fixture.writes).toHaveLength(1);
});

test('Conference Manager proposes and self-approves one confirmed booking change in the same session', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  fixture.requests().push(confirmedRequestFixture());

  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Bestätigte Buchung ändern' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bestätigte Buchung ändern' });
  await dialog.locator(`#changeInternal-${REQUEST_ID}`).fill('3');
  await dialog.getByRole('button', { name: 'Änderung einreichen' }).click();

  await expect(page.locator('#toast')).toContainText('Der Änderungsantrag wurde eingereicht.');
  await expect(page.getByRole('button', { name: 'Änderung freigeben' })).toBeVisible();
  await page.getByRole('button', { name: 'Änderung freigeben' }).click();
  await expect(page.locator('#toast')).toContainText('Die Änderung wurde erfolgreich umgesetzt.');

  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({
    path: `/api/v1/requests/${REQUEST_ID}/booking-change`,
    csrf: CSRF_TOKEN,
    body: {
      schemaVersion: 2,
      expectedVersion: 1,
      request: { internalParticipants: 3 },
    },
  });
  expect(fixture.writes[0].body).not.toHaveProperty('tenantId');
  expect(fixture.writes[0].body).not.toHaveProperty('userId');
  expect(fixture.decisionWrites).toEqual([{
    path: `/api/v1/requests/${REQUEST_ID}/booking-change/33333333-3333-4333-8333-333333333333/decision`,
    csrf: CSRF_TOKEN,
    body: { decision: 'approve' },
  }]);
});

test('Conference Manager rejects a booking change through the exact accessible decision contract', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    bookingChange: bookingChangeFixture(),
    holdBookingDecision: true,
  });
  const currentRequest = confirmedRequestFixture();
  fixture.requests().push(currentRequest);

  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Änderung ablehnen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Änderung ablehnen' });
  const reason = dialog.getByLabel('Begründung');
  const reject = dialog.getByRole('button', { name: 'Änderung ablehnen' });
  const dismiss = dialog.getByRole('button', { name: 'Abbrechen' });

  await expect(reason).toHaveAttribute('required', 'required');
  await reject.click();
  await expect(reason).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByRole('alert')).toHaveText('Für diese Aktion ist eine Begründung erforderlich.');
  await expect(reason).toBeFocused();

  await reason.fill('The requested room change is not available.');
  await expect(reason).not.toHaveAttribute('aria-invalid');
  await expect(dialog.getByRole('alert')).toBeEmpty();
  await reject.click();
  await expect.poll(() => fixture.decisionWrites.length).toBe(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(reject).toBeDisabled();
  await expect(dismiss).toBeDisabled();

  const response = page.waitForResponse((value) => (
    new URL(value.url()).pathname
      === `/api/v1/requests/${REQUEST_ID}/booking-change/33333333-3333-4333-8333-333333333333/decision`
  ));
  fixture.releaseBookingDecision();
  await response;

  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Der Änderungsantrag wurde abgelehnt.');
  await expect(page.getByRole('button', { name: 'Bestätigte Buchung ändern' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Anfrage stornieren' })).toBeEnabled();
  expect(fixture.decisionWrites).toEqual([{
    path: `/api/v1/requests/${REQUEST_ID}/booking-change/33333333-3333-4333-8333-333333333333/decision`,
    csrf: CSRF_TOKEN,
    body: {
      decision: 'reject',
      reason: 'The requested room change is not available.',
    },
  }]);
  expect(fixture.requests()[0]).toEqual(currentRequest);
  expect(fixture.bookingChange()).toBeNull();
});

test('Conference Manager restores request controls after one failed booking-change proposal', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    bookingChangeProposalError: { status: 409, code: 'REQUEST_CONFLICT' },
    holdBookingProposal: true,
  });
  fixture.requests().push(confirmedRequestFixture());

  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  const change = page.getByRole('button', { name: 'Bestätigte Buchung ändern' });
  const cancelRequest = page.getByRole('button', { name: 'Anfrage stornieren' });
  await change.click();
  const dialog = page.getByRole('dialog', { name: 'Bestätigte Buchung ändern' });
  await dialog.locator(`#changeInternal-${REQUEST_ID}`).fill('3');
  const submit = dialog.getByRole('button', { name: 'Änderung einreichen' });
  const dismiss = dialog.getByRole('button', { name: 'Abbrechen' });
  await submit.evaluate((control) => {
    control.click();
    control.click();
  });
  await expect.poll(() => fixture.writes.length).toBe(1);
  await expect(submit).toBeDisabled();
  await expect(dismiss).toBeDisabled();
  await expect(change).toBeDisabled();
  await expect(cancelRequest).toBeDisabled();

  const response = page.waitForResponse((value) => (
    new URL(value.url()).pathname === `/api/v1/requests/${REQUEST_ID}/booking-change`
    && value.request().method() === 'POST'
  ));
  fixture.releaseBookingProposal();
  await response;

  await expect(dialog.getByRole('alert')).toContainText('zwischenzeitlich geändert');
  await expect(submit).toBeEnabled();
  await expect(dismiss).toBeEnabled();
  await expect(change).toBeEnabled();
  await expect(cancelRequest).toBeEnabled();
  await dismiss.click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
});

test('Conference Manager applies a participant-only v2 booking change without a decision step', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  fixture.requests().push(confirmedV2RequestFixture());

  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Bestätigte Buchung ändern' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bestätigte Buchung ändern' });
  await dialog.locator(`#changeInternal-${REQUEST_ID}`).fill('3');
  await dialog.getByRole('button', { name: 'Änderung einreichen' }).click();

  await expect(page.locator('#toast')).toContainText('Die Änderung wurde erfolgreich umgesetzt.');
  await expect(page.getByRole('button', { name: 'Änderung freigeben' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bestätigte Buchung ändern' })).toBeEnabled();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.decisionWrites).toHaveLength(0);
  expect(fixture.requests()[0]).toMatchObject({
    schemaVersion: 2,
    version: 2,
    internalParticipants: 3,
    status: 'Confirmed',
  });
});

test('Conference Manager separates Services and Catering business settings through CSRF contract', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Administration' }).click();
  await page.getByRole('button', { name: 'Business-Einstellungen' }).click();
  await expect(page.locator('#viewTitle')).toBeFocused();

  await page.getByRole('button', { name: 'Services & Ausstattung' }).click();
  await expect(page.getByRole('heading', { name: 'Services & Ausstattung', exact: true })).toBeVisible();
  const serviceBulk = page.locator('[data-tenant-bulk-transfer]');
  expect(await serviceBulk.locator('option').evaluateAll((options) => options.map(({ value }) => value)))
    .toEqual(['services']);
  await page.locator('[data-add-catalogue-entry="services"]').click();
  await page.locator('[data-add-catalogue-entry="equipment"]').click();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(() => fixture.catalogueWrites.length).toBe(1);

  await page.getByRole('button', { name: 'Catering', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Catering', exact: true })).toBeVisible();
  const cateringBulk = page.locator('[data-tenant-bulk-transfer]');
  expect(await cateringBulk.locator('option').evaluateAll((options) => options.map(({ value }) => value)))
    .toEqual(['catering-items', 'catering-packages']);
  await page.locator('[data-add-catalogue-entry="cateringItems"]').click();
  await page.locator('[data-add-catalogue-entry="cateringPackages"]').click();
  await page.locator('[data-add-catalogue-variant="package-coffee"]').click();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(() => fixture.catalogueWrites.length).toBe(2);

  const servicesSaved = fixture.catalogueWrites[0].body.catalogue;
  expect(servicesSaved.services.map((entry) => entry.id)).toContain('services-1');
  expect(servicesSaved.equipment.map((entry) => entry.id)).toContain('equipment-1');
  const cateringSaved = fixture.catalogueWrites[1].body.catalogue;
  expect(cateringSaved.cateringItems.map((entry) => entry.id)).toContain('cateringItems-1');
  expect(cateringSaved.cateringPackages.map((entry) => entry.id)).toContain('cateringPackages-1');
  expect(cateringSaved.cateringPackages.find((entry) => entry.id === 'package-coffee').variants)
    .toMatchObject([{ id: 'package-coffee-variant-1', price: { currency: 'EUR' } }]);
  expect(fixture.catalogueWrites.every((write) => write.csrf === CSRF_TOKEN)).toBe(true);
  expect(fixture.catalogueWrites[1].body).not.toHaveProperty('tenantId');
});

test('Conference Manager edits normal Room prices with Rooms and validates Catering names', async ({ page }) => {
  const initialCatalogue = structuredClone(catalogueSettingsPayload().catalogue);
  initialCatalogue.roomPrices = [];
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    catalogueSettings: initialCatalogue,
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Administration' }).click();
  await page.getByRole('button', { name: 'Business-Einstellungen' }).click();

  const amount = page.locator('#manager-room-price-amount-0');
  await expect(amount).toHaveValue('');
  await expect(amount).not.toHaveAttribute('required');
  await amount.fill('12.50');
  await page.getByRole('button', { name: 'Raumpreis speichern', exact: true }).first().click();
  await expect.poll(() => fixture.catalogueWrites.length).toBe(1);
  expect(fixture.catalogueWrites[0].body.catalogue.roomPrices).toEqual([{
    roomId: 'room-a', price: { amountMinor: 1250, currency: 'EUR' },
  }]);

  await page.getByRole('button', { name: 'Catering', exact: true }).click();
  const catalogueName = page.locator('#manager-catalogue-cateringItems-item-coffee-name');
  const catalogueNameError = page.locator('#manager-catalogue-cateringItems-item-coffee-name-error');
  await catalogueName.fill('   ');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(catalogueName).toBeFocused();
  await expect(catalogueName).toHaveAttribute('aria-invalid', 'true');
  await expect(catalogueNameError).toHaveText('Bitte geben Sie einen Namen ein.');
  await catalogueName.fill('Espresso');
  await expect(catalogueName).not.toHaveAttribute('aria-invalid');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(() => fixture.catalogueWrites.length).toBe(2);
  expect(fixture.catalogueWrites[1].body.catalogue.cateringItems)
    .toMatchObject([{ id: 'item-coffee', name: 'Espresso' }]);
});

test('Conference Manager updates complete Room business snapshots and surfaces revision conflicts', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Administration' }).click();
  await page.getByRole('button', { name: 'Business-Einstellungen' }).click();
  await expect(page.locator('#viewTitle')).toBeFocused();

  const room = page.locator('[data-manager-room-id="room-a"]');
  await expect(room).toBeVisible();
  expect(await page.locator('[data-tenant-bulk-transfer] option').evaluateAll((options) => (
    options.map(({ value }) => value)
  ))).toEqual(['rooms']);
  const roomName = room.locator('#manager-room-name-0');
  const roomNameError = room.locator('#manager-room-name-0-error');
  await roomName.fill('   ');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  expect(fixture.locationWrites).toHaveLength(0);
  await expect(roomName).toBeFocused();
  await expect(roomName).toHaveAttribute('aria-invalid', 'true');
  await expect(roomName).toHaveAttribute('aria-describedby', 'manager-room-name-0-error');
  await expect(roomNameError).toHaveText('Bitte geben Sie einen Raumnamen ein.');

  await roomName.fill('Executive Room');
  await expect(roomName).not.toHaveAttribute('aria-invalid');
  await expect(roomNameError).toBeEmpty();
  await room.locator('#manager-room-capacity-0').fill('16');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Business-Einstellungen wurden gespeichert.');
  await expect(page.locator('#viewTitle')).toBeFocused();

  expect(fixture.locationWrites).toHaveLength(1);
  expect(fixture.locationWrites[0]).toMatchObject({
    csrf: CSRF_TOKEN,
    body: {
      schemaVersion: 3,
      expectedRevision: 1,
      configuration: {
        sites: [{
          id: 'berlin',
          name: 'Berlin',
          active: true,
          timeZone: 'Europe/Berlin',
          address: null,
        }],
        rooms: [{
          id: 'room-a',
          siteId: 'berlin',
          name: 'Executive Room',
          capacity: 16,
          active: true,
          floor: '1',
        }],
      },
    },
  });
  expect(fixture.locationWrites[0].body).not.toHaveProperty('providerContext');

  const conflictFixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    locationSaveError: { currentRevision: 2 },
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Administration' }).click();
  await page.getByRole('button', { name: 'Business-Einstellungen' }).click();
  await page.locator('#manager-room-name-0').fill('Conflicting Room');
  const save = page.getByRole('button', { name: 'Speichern', exact: true });
  await save.click();
  await expect(page.locator('#toast')).toContainText('zwischenzeitlich geändert');
  await expect(save).toBeEnabled();
  expect(conflictFixture.locationWrites).toHaveLength(1);
});

test('H-034 Conference Manager uploads a private Room floorplan and attaches it by Locations revision', async ({ page }, testInfo) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Administration' }).click();
  await page.getByRole('button', { name: 'Business-Einstellungen' }).click();

  const room = page.locator('[data-manager-room-id="room-a"]');
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAD91JpzAAAAFElEQVR42mP4z8DAwMDAxAADCBYAOx0BA8VudC8AAAAASUVORK5CYII=',
    'base64',
  );
  await room.getByLabel('Grundrissdatei (PNG, JPEG oder WebP; bis 2 MiB)').setInputFiles({
    name: 'room-a-floorplan.png',
    mimeType: 'image/png',
    buffer: bytes,
  });
  await room.getByRole('button', { name: 'Grundriss hochladen' }).click();

  await expect(page.locator('#toast')).toContainText('Raumbild gespeichert.');
  expect(fixture.roomMediaUploads).toHaveLength(1);
  expect(fixture.roomMediaUploads[0]).toMatchObject({
    roomId: 'room-a',
    csrf: CSRF_TOKEN,
    contentType: 'image/png',
  });
  // Playwright/WebKit does not expose a native File request through postDataBuffer().
  // The API-client unit contract proves the exact File body; this browser contract
  // proves that both engines submit the bounded media request and attach its result.
  if (testInfo.project.name === 'webkit-mobile') {
    expect(fixture.roomMediaUploads[0].bytes).toBeNull();
  } else {
    expect(fixture.roomMediaUploads[0].bytes).toEqual(bytes);
  }
  expect(fixture.locationWrites).toHaveLength(1);
  expect(fixture.locationWrites[0].body).toMatchObject({
    schemaVersion: 3,
    expectedRevision: 1,
    configuration: {
      rooms: [{
        id: 'room-a',
        floorplanAssetId: '11111111-1111-4111-8111-111111111111',
        mediaAssetIds: [],
      }],
    },
  });
});

test('stale Catalogue save cannot restore Manager settings after navigation', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    holdCatalogueSave: true,
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Administration' }).click();
  await page.getByRole('button', { name: 'Business-Einstellungen' }).click();
  await page.getByRole('button', { name: 'Catering', exact: true }).click();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(() => fixture.catalogueWrites.length).toBe(1);
  await page.locator('[data-view="welcome"]').click();

  const response = page.waitForResponse((value) => (
    new URL(value.url()).pathname === '/api/v1/tenant/settings/catalogue'
    && value.request().method() === 'PUT'
  ));
  fixture.releaseCatalogueSave();
  await response;
  await expect(page.locator('#welcomeHeading')).toBeVisible();
  await expect(page.locator('[data-manager-business-settings-root]')).toHaveCount(0);
});

test('stale asynchronous Manager render cannot write its settings card into a later view', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('#welcomeHeading')).toBeVisible();
  const releaseManagerRead = fixture.holdNextRequestRead();

  await page.locator('[data-view="manager"]').click();
  await expect(page.locator('[data-manager-operational-root]')).toContainText('Daten werden geladen');
  await page.locator('[data-view="welcome"]').click();
  releaseManagerRead();

  await expect(page.locator('#welcomeHeading')).toBeVisible();
  await expect(page.locator('[data-manager-workspace-root]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Business-Einstellungen' })).toHaveCount(0);
});

test('Employee request refresh keeps the newest response when an older response settles last', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  const original = {
    ...confirmedRequestFixture(),
    status: 'Submitted',
  };
  fixture.requests().push(original);
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  await expect(page.getByText('Status: Zur Prüfung')).toBeVisible();

  const releaseOlderRead = fixture.holdNextRequestRead();
  fixture.replaceRequests([{
    ...original,
    version: 2,
    status: 'Change Requested',
    statusReason: 'Newest response',
    updatedAt: '2026-08-26T12:00:00.000Z',
  }]);
  const olderResponse = page.waitForResponse((value) => (
    new URL(value.url()).pathname === '/api/v1/application/requests'
    && value.request().method() === 'GET'
  ));
  await page.getByRole('button', { name: 'Aktualisieren' }).evaluate((control) => {
    control.click();
    control.click();
  });

  await expect(page.getByText('Status: Änderung angefordert')).toBeVisible();
  await expect(page.getByText('Newest response')).toBeVisible();
  releaseOlderRead();
  await olderResponse;
  await expect(page.getByText('Status: Änderung angefordert')).toBeVisible();
  await expect(page.getByText('Newest response')).toBeVisible();
  await expect(page.getByText('Status: Zur Prüfung')).toHaveCount(0);
});

test('EMP-10 Employee keeps the last committed projection interactive after a harmless refresh outage', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  const card = page.locator(`[data-production-request-id="${REQUEST_ID}"]`);
  await expect(card.getByRole('button', { name: 'Gästeinformationen' })).toBeEnabled();

  fixture.failNextRequestRead(503);
  await page.getByRole('button', { name: 'Aktualisieren' }).click();

  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Gästeinformationen' })).toBeEnabled();
  await expect(card.getByRole('button', { name: 'Drucken / Als PDF speichern' })).toBeEnabled();
  await expect(page.locator('#toast')).toContainText(
    'Die Produktionsdaten konnten nicht sicher geladen werden.',
  );
});

for (const [status, message] of [
  [401, 'Ihre Sitzung ist nicht mehr gültig. Melden Sie sich erneut an.'],
  [403, 'Sie sind für diese Aktion nicht berechtigt.'],
]) {
  test(`Employee refresh ${status} clears Requests, Guest, Print and mutation authority`, async ({ page }) => {
    const fixture = await installProductionApplicationFixture(page, {
      requestRoomContextSchemaVersion: 3,
      requestRoomContext: {
        locationsRevision: 1,
        room: {
          id: 'room-a', siteId: 'berlin', name: 'Room A', capacity: 12, active: true,
          floor: null, accessibility: [], floorplanAssetId: null, mediaAssetIds: [],
        },
        site: { id: 'berlin', name: 'Berlin', active: true, timeZone: 'Europe/Berlin' },
        guestPresentation: null,
      },
    });
    fixture.requests().push(confirmedRequestFixture());
    await page.goto(`${ORIGIN}/`);
    await page.locator('[data-view="requests"]').click();

    await page.getByRole('button', { name: 'Gästeinformationen' }).click();
    const guestDialog = page.getByRole('dialog', { name: /Willkommen/ });
    await expect(guestDialog).toBeVisible();
    const popupPromise = page.waitForEvent('popup');
    await guestDialog.getByRole('button', { name: 'Drucken / Als PDF speichern' }).click();
    const popup = await popupPromise;
    await expect(popup.locator('body')).toContainText('Room A · 12');

    fixture.failNextRequestRead(status);
    await page.getByRole('button', { name: 'Aktualisieren' }).evaluate((control) => control.click());

    const authorityStatus = page.locator('[data-authority-invalid="true"]');
    await expect(authorityStatus).toHaveText(message);
    await expect(authorityStatus).toBeFocused();
    await expect(page.locator('[data-production-request-id]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Gästeinformationen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Drucken / Als PDF speichern' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Anfrage stornieren' })).toHaveCount(0);
    await expect(guestDialog).toHaveCount(0);
    await expect(page.locator('dialog:not([data-inactivity-lock="true"])')).toHaveCount(0);
    await expect(page.locator('#primaryNavigation button')).toHaveCount(0);
    await expect.poll(() => popup.isClosed()).toBe(true);
    expect(fixture.writes).toHaveLength(0);
  });
}

for (const [status, message] of [
  [401, 'Ihre Sitzung ist nicht mehr gültig. Melden Sie sich erneut an.'],
  [403, 'Sie sind für diese Aktion nicht berechtigt.'],
]) {
  test(`Conference Manager refresh ${status} closes an open History dialog and clears authority`, async ({ page }) => {
    const fixture = await installProductionApplicationFixture(page, {
      roles: ['employee', 'conference_manager'],
    });
    fixture.requests().push(confirmedRequestFixture());
    await page.goto(`${ORIGIN}/`);
    await page.locator('[data-view="manager"]').click();
    await page.getByRole('button', { name: 'Verlauf' }).click();
    const historyDialog = page.getByRole('dialog', { name: 'Verlauf' });
    await expect(historyDialog).toBeVisible();

    fixture.failNextRequestRead(status);
    await page.getByRole('button', { name: 'Aktualisieren' }).evaluate((control) => control.click());

    const authorityStatus = page.locator('[data-authority-invalid="true"]');
    await expect(authorityStatus).toHaveText(message);
    await expect(authorityStatus).toBeFocused();
    await expect(historyDialog).toHaveCount(0);
    await expect(page.locator('[data-production-request-id]')).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Anfrage stornieren' })).toHaveCount(0);
    await expect(page.locator('#primaryNavigation button')).toHaveCount(0);
  });
}

test('Conference Manager History 401 invalidates instead of showing a stale toast', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  fixture.requests().push(confirmedRequestFixture());
  await page.route(new RegExp(`/api/v1/requests/${REQUEST_ID}/history(?:\\?.*)?$`), async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', requestId: API_REQUEST_ID } }),
    });
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();

  await page.getByRole('button', { name: 'Verlauf' }).click();

  const authorityStatus = page.locator('[data-authority-invalid="true"]');
  await expect(authorityStatus).toHaveText('Ihre Sitzung ist nicht mehr gültig. Melden Sie sich erneut an.');
  await expect(authorityStatus).toBeFocused();
  await expect(page.getByRole('dialog', { name: 'Verlauf' })).toHaveCount(0);
  await expect(page.locator('#toast')).toBeEmpty();
});

test('Conference Manager proposal 403 closes the editor and invalidates mutation authority', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    bookingChangeProposalError: { status: 403, code: 'FORBIDDEN' },
  });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Bestätigte Buchung ändern' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bestätigte Buchung ändern' });
  await dialog.locator(`#changeInternal-${REQUEST_ID}`).fill('3');

  await dialog.getByRole('button', { name: 'Änderung einreichen' }).click();

  const authorityStatus = page.locator('[data-authority-invalid="true"]');
  await expect(authorityStatus).toHaveText('Sie sind für diese Aktion nicht berechtigt.');
  await expect(authorityStatus).toBeFocused();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-production-request-id]')).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
});

test('Conference Manager report 403 clears the complete projection instead of rendering inline data', async ({ page }) => {
  await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  await page.route(/\/api\/v1\/application\/reports\/requests(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: { code: 'FORBIDDEN', requestId: API_REQUEST_ID } }),
    });
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();

  await page.getByRole('tab', { name: 'Reports' }).click();

  const authorityStatus = page.locator('[data-authority-invalid="true"]');
  await expect(authorityStatus).toHaveText('Sie sind für diese Aktion nicht berechtigt.');
  await expect(authorityStatus).toBeFocused();
  await expect(page.locator('[data-report-content]')).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('Conference Manager transition 401 closes its confirmation and rejects stale completion', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    transitionError: { status: 401, code: 'UNAUTHENTICATED' },
  });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Anfrage stornieren' }).click();
  const dialog = page.getByRole('dialog', { name: 'Anfrage wirklich stornieren?' });

  await dialog.getByRole('button', { name: 'Anfrage stornieren' }).click();

  const authorityStatus = page.locator('[data-authority-invalid="true"]');
  await expect(authorityStatus).toHaveText('Ihre Sitzung ist nicht mehr gültig. Melden Sie sich erneut an.');
  await expect(authorityStatus).toBeFocused();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-production-request-id]')).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
});

for (const [status, message] of [
  [401, 'Ihre Sitzung ist nicht mehr gültig. Melden Sie sich erneut an.'],
  [403, 'Sie sind für diese Aktion nicht berechtigt.'],
]) {
  test(`application Notification refresh ${status} clears global profile, dialogs and detached prints`, async ({ page }) => {
    await installProductionApplicationFixture(page);
    await page.goto(`${ORIGIN}/`);
    await expect(page.locator('#welcomeHeading')).toBeVisible();

    const popupPromise = page.waitForEvent('popup');
    await page.evaluate(async () => {
      const { openDetachedPrintWindow } = await import('/src/shared/detached-print-window.js');
      const popup = openDetachedPrintWindow();
      popup.document.body.textContent = 'authority-bound print';
    });
    const popup = await popupPromise;
    await expect(popup.locator('body')).toHaveText('authority-bound print');

    let releaseFailure;
    let markStarted;
    const failureGate = new Promise((resolve) => { releaseFailure = resolve; });
    const failureStarted = new Promise((resolve) => { markStarted = resolve; });
    await page.route(/\/api\/v1\/application\/notifications$/, async (route) => {
      markStarted();
      await failureGate;
      await route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          error: {
            code: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
            requestId: API_REQUEST_ID,
          },
        }),
      });
    });

    await page.locator('[data-view="welcome"]').click();
    await failureStarted;
    await page.locator('#primaryNavigation button[aria-haspopup="dialog"]').click();
    const profileDialog = page.getByRole('dialog', { name: 'Profil' });
    await expect(profileDialog).toBeVisible();
    releaseFailure();

    const authorityStatus = page.locator('[data-authority-invalid="true"]');
    await expect(authorityStatus).toHaveText(message);
    await expect(authorityStatus).toBeFocused();
    await expect(profileDialog).toHaveCount(0);
    await expect(page.locator('#primaryNavigation button')).toHaveCount(0);
    await expect(page.locator('[data-production-request-id]')).toHaveCount(0);
    await expect.poll(() => popup.isClosed()).toBe(true);
  });
}

test('a harmless Notification refresh outage keeps the authenticated Welcome projection', async ({ page }) => {
  await installProductionApplicationFixture(page);
  await page.goto(`${ORIGIN}/`);
  await page.route(/\/api\/v1\/application\/notifications$/, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', requestId: API_REQUEST_ID } }),
    });
  });

  await page.locator('[data-view="welcome"]').click();

  await expect(page.locator('#welcomeHeading')).toBeVisible();
  await expect(page.locator('[data-authority-invalid="true"]')).toHaveCount(0);
  await expect(page.locator('#primaryNavigation button[aria-haspopup="dialog"]')).toBeVisible();
});

test('profile logout 403 closes the dialog and clears global authority', async ({ page }) => {
  await installProductionApplicationFixture(page);
  await page.goto(`${ORIGIN}/`);
  await page.route(/\/api\/v1\/session$/, async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 403,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: { code: 'FORBIDDEN', requestId: API_REQUEST_ID } }),
    });
  });

  await page.locator('#primaryNavigation button[aria-haspopup="dialog"]').click();
  const profileDialog = page.getByRole('dialog', { name: 'Profil' });
  await profileDialog.getByRole('button', { name: 'Logout' }).click();

  const authorityStatus = page.locator('[data-authority-invalid="true"]');
  await expect(authorityStatus).toHaveText('Sie sind für diese Aktion nicht berechtigt.');
  await expect(authorityStatus).toBeFocused();
  await expect(profileDialog).toHaveCount(0);
  await expect(page.locator('#primaryNavigation button')).toHaveCount(0);
  await expect(page.locator('#toast')).toBeEmpty();
});

test('a held Welcome Notification 401 invalidates a newer Request view globally', async ({ page }) => {
  await installProductionApplicationFixture(page);
  await page.goto(`${ORIGIN}/`);
  let releaseFailure;
  let markStarted;
  const failureGate = new Promise((resolve) => { releaseFailure = resolve; });
  const failureStarted = new Promise((resolve) => { markStarted = resolve; });
  await page.route(/\/api\/v1\/application\/notifications$/, async (route) => {
    markStarted();
    await failureGate;
    await route.fulfill({
      status: 401,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', requestId: API_REQUEST_ID } }),
    });
  });

  await page.locator('[data-view="welcome"]').click();
  await failureStarted;
  await page.locator('[data-view="requests"]').click();
  releaseFailure();

  const authorityStatus = page.locator('[data-authority-invalid="true"]');
  await expect(authorityStatus).toHaveText('Ihre Sitzung ist nicht mehr gültig. Melden Sie sich erneut an.');
  await expect(authorityStatus).toBeFocused();
  await expect(page.getByRole('button', { name: 'Aktualisieren' })).toHaveCount(0);
  await expect(page.locator('#primaryNavigation button')).toHaveCount(0);
});

test('Manager Business Settings load 401 invalidates the global shell instead of retaining Retry authority', async ({ page }) => {
  await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  await page.route(/\/api\/v1\/tenant\/settings\/locations(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', requestId: API_REQUEST_ID } }),
    });
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();

  await page.getByRole('tab', { name: 'Administration' }).click();

  const authorityStatus = page.locator('[data-authority-invalid="true"]');
  await expect(authorityStatus).toHaveText('Ihre Sitzung ist nicht mehr gültig. Melden Sie sich erneut an.');
  await expect(authorityStatus).toBeFocused();
  await expect(page.locator('[data-manager-business-settings-root]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Erneut versuchen' })).toHaveCount(0);
  await expect(page.locator('#primaryNavigation button')).toHaveCount(0);
});

test('Manager Business Settings save 403 clears forms, cockpit and cached shell authority', async ({ page }) => {
  await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Administration' }).click();
  await expect(page.locator('#manager-room-name-0')).toBeVisible();
  await page.route(/\/api\/v1\/tenant\/settings\/locations$/, async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 403,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: { code: 'FORBIDDEN', requestId: API_REQUEST_ID } }),
    });
  });

  await page.locator('#manager-room-name-0').fill('Must not remain editable');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();

  const authorityStatus = page.locator('[data-authority-invalid="true"]');
  await expect(authorityStatus).toHaveText('Sie sind für diese Aktion nicht berechtigt.');
  await expect(authorityStatus).toBeFocused();
  await expect(page.locator('[data-manager-business-settings-root]')).toHaveCount(0);
  await expect(page.locator('.manager-surface')).toHaveCount(0);
  await expect(page.locator('#primaryNavigation button')).toHaveCount(0);
  await expect(page.locator('#toast')).toBeEmpty();
});

test('detached Manager Business Settings save 403 still invalidates the newer shell view', async ({ page }) => {
  await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Administration' }).click();
  await expect(page.locator('#manager-room-name-0')).toBeVisible();
  let releaseFailure;
  let markStarted;
  const failureGate = new Promise((resolve) => { releaseFailure = resolve; });
  const failureStarted = new Promise((resolve) => { markStarted = resolve; });
  await page.route(/\/api\/v1\/tenant\/settings\/locations$/, async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    markStarted();
    await failureGate;
    await route.fulfill({
      status: 403,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: { code: 'FORBIDDEN', requestId: API_REQUEST_ID } }),
    });
  });

  await page.locator('[data-manager-business-settings-root] form')
    .getByRole('button', { name: 'Speichern', exact: true }).click();
  await failureStarted;
  await page.locator('[data-view="welcome"]').click();
  await expect(page.locator('#welcomeHeading')).toBeVisible();
  releaseFailure();

  const authorityStatus = page.locator('[data-authority-invalid="true"]');
  await expect(authorityStatus).toHaveText('Sie sind für diese Aktion nicht berechtigt.');
  await expect(authorityStatus).toBeFocused();
  await expect(page.locator('#welcomeHeading')).toHaveCount(0);
  await expect(page.locator('#primaryNavigation button')).toHaveCount(0);
});

test('detached Tenant Admin load 401 invalidates every privileged shell surface', async ({ page }) => {
  await installProductionApplicationFixture(page, {
    roles: ['employee', 'tenant_admin'],
  });
  let releaseFailure;
  let markStarted;
  const failureGate = new Promise((resolve) => { releaseFailure = resolve; });
  const failureStarted = new Promise((resolve) => { markStarted = resolve; });
  await page.route(/\/api\/v1\/tenant\/settings\/organization$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    markStarted();
    await failureGate;
    await route.fulfill({
      status: 401,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', requestId: API_REQUEST_ID } }),
    });
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="tenantAdmin"]').click();
  await page.locator('[data-tenant-admin-section="organization"]').click();
  await failureStarted;
  await page.locator('[data-view="welcome"]').click();
  releaseFailure();

  const authorityStatus = page.locator('[data-authority-invalid="true"]');
  await expect(authorityStatus).toHaveText('Ihre Sitzung ist nicht mehr gültig. Melden Sie sich erneut an.');
  await expect(authorityStatus).toBeFocused();
  await expect(page.locator('[data-tenant-admin-shell]')).toHaveCount(0);
  await expect(page.locator('#primaryNavigation button')).toHaveCount(0);
});

test('detached Tenant Admin save 403 cannot preserve Locations or Welcome authority', async ({ page }) => {
  await installProductionApplicationFixture(page, {
    roles: ['employee', 'tenant_admin'],
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="tenantAdmin"]').click();
  await page.locator('[data-tenant-admin-section="locations"]').click();
  await expect(page.locator('[data-tenant-settings-form="locations-technical"]')).toBeVisible();
  let releaseFailure;
  let markStarted;
  const failureGate = new Promise((resolve) => { releaseFailure = resolve; });
  const failureStarted = new Promise((resolve) => { markStarted = resolve; });
  await page.route(/\/api\/v1\/tenant\/settings\/locations$/, async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    markStarted();
    await failureGate;
    await route.fulfill({
      status: 403,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: { code: 'FORBIDDEN', requestId: API_REQUEST_ID } }),
    });
  });

  await page.locator('[data-tenant-settings-form="locations-technical"]')
    .getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await failureStarted;
  await page.locator('[data-view="welcome"]').click();
  releaseFailure();

  const authorityStatus = page.locator('[data-authority-invalid="true"]');
  await expect(authorityStatus).toHaveText('Sie sind für diese Aktion nicht berechtigt.');
  await expect(authorityStatus).toBeFocused();
  await expect(page.locator('[data-tenant-settings-form]')).toHaveCount(0);
  await expect(page.locator('#welcomeHeading')).toHaveCount(0);
  await expect(page.locator('#primaryNavigation button')).toHaveCount(0);
});

test('Employee held Room context preparation cannot open a stale dialog after refresh', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, { holdRoomContext: true });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  await page.getByRole('button', { name: 'Bestätigte Buchung ändern' }).click();
  await expect.poll(() => fixture.roomContextReads.length).toBe(1);
  const releaseRefresh = fixture.holdNextRequestRead();
  const refreshStarted = page.waitForRequest((value) => (
    new URL(value.url()).pathname === '/api/v1/application/requests'
    && value.method() === 'GET'
  ));
  await page.getByRole('button', { name: 'Aktualisieren' }).click();
  await refreshStarted;

  const contextResponse = page.waitForResponse((value) => (
    new URL(value.url()).pathname === `/api/v1/requests/${REQUEST_ID}/room-context`
  ));
  fixture.releaseRoomContext();
  await contextResponse;
  await expect(page.getByRole('dialog', { name: 'Bestätigte Buchung ändern' })).toHaveCount(0);
  const refreshResponse = page.waitForResponse((value) => (
    new URL(value.url()).pathname === '/api/v1/application/requests'
    && value.request().method() === 'GET'
  ));
  releaseRefresh();
  await refreshResponse;
  await expect(page.getByRole('button', { name: 'Bestätigte Buchung ändern' })).toBeEnabled();
  expect(fixture.writes).toHaveLength(0);
});

const HISTORY_SURFACES = Object.freeze([
  {
    capability: 'Employee',
    roles: ['employee'],
    view: 'requests',
  },
  {
    capability: 'Conference Manager',
    roles: ['employee', 'conference_manager'],
    view: 'manager',
  },
]);

HISTORY_SURFACES.forEach(({ capability, roles, view }) => {
  test(`${capability} stale request history cannot open after a newer refresh starts`, async ({ page }) => {
    const fixture = await installProductionApplicationFixture(page, {
      roles,
      holdRequestHistory: true,
    });
    fixture.requests().push(confirmedRequestFixture());
    await page.goto(`${ORIGIN}/`);
    await page.locator(`[data-view="${view}"]`).click();
    await page.getByRole('button', { name: 'Verlauf' }).click();
    await expect.poll(() => fixture.requestHistoryReads.length).toBe(1);

    const releaseRefresh = fixture.holdNextRequestRead();
    const refreshStarted = page.waitForRequest((value) => (
      new URL(value.url()).pathname === '/api/v1/application/requests'
      && value.method() === 'GET'
    ));
    await page.getByRole('button', { name: 'Aktualisieren' }).click();
    await refreshStarted;

    const historyResponse = page.waitForResponse((value) => (
      new URL(value.url()).pathname === `/api/v1/requests/${REQUEST_ID}/history`
    ));
    fixture.releaseRequestHistory();
    await historyResponse;
    await expect(page.getByRole('dialog', { name: 'Verlauf' })).toHaveCount(0);
    await expect(page.getByText('Status geändert')).toHaveCount(0);

    const refreshResponse = page.waitForResponse((value) => (
      new URL(value.url()).pathname === '/api/v1/application/requests'
      && value.request().method() === 'GET'
    ));
    releaseRefresh();
    await refreshResponse;
    await expect(page.locator(`[data-production-request-id="${REQUEST_ID}"]`)).toBeVisible();
  });
});

HISTORY_SURFACES.forEach(({ capability, roles, view }) => {
  test(`${capability} delayed request history stays hidden after inactivity lock`, async ({ page }) => {
    const fixture = await installProductionApplicationFixture(page, {
      roles,
      holdRequestHistory: true,
    });
    fixture.requests().push(confirmedRequestFixture());
    await page.goto(`${ORIGIN}/`);
    await page.locator(`[data-view="${view}"]`).click();
    await page.getByRole('button', { name: 'Verlauf' }).click();
    await expect.poll(() => fixture.requestHistoryReads.length).toBe(1);
    await lockProductionApplication(page);

    const response = page.waitForResponse((value) => (
      new URL(value.url()).pathname === `/api/v1/requests/${REQUEST_ID}/history`
    ));
    fixture.releaseRequestHistory();
    await response;
    await expect(page.locator('dialog:not([data-inactivity-lock="true"])')).toHaveCount(0);
    await expect(page.getByText('Status geändert')).toHaveCount(0);
    await expect(page.locator('#app')).toBeEmpty();
  });
});

test('REG-05 inactivity lock clears and closes every detached print surface', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page);
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Drucken / Als PDF speichern' }).click();
  const popup = await popupPromise;
  await expect(popup.locator('body')).toContainText('Room A · 12');

  await lockProductionApplication(page);

  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.locator('#app')).toBeEmpty();
});

test('inactivity lock closes overlays and rejects stale shell or feature renders', async ({ page }) => {
  await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[aria-haspopup="dialog"]').click();
  await expect(page.getByRole('dialog')).toContainText('Profil');

  await page.evaluate(async () => {
    const channel = new BroadcastChannel('conference-manager-customer-session-lock-v1');
    channel.postMessage({ type: 'lock' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    channel.close();
  });

  const lock = page.locator('dialog[data-inactivity-lock="true"]');
  await expect(page.locator('html')).toHaveAttribute('data-session-locked', 'true');
  await expect(lock).toBeVisible();
  await expect(lock).toHaveAttribute('open', '');
  await expect(page.getByText('Profil')).toHaveCount(0);

  await page.evaluate(() => {
    window.dispatchEvent(new Event('conference-language-changed'));
    const stale = document.createElement('button');
    stale.dataset.stalePrivilegedAction = 'true';
    stale.textContent = 'stale';
    document.getElementById('app').appendChild(stale);
    document.querySelector('dialog[data-inactivity-lock="true"]').remove();
  });

  await expect(page.locator('[data-stale-privileged-action]')).toHaveCount(0);
  await expect(page.locator('#primaryNavigation')).toBeEmpty();
  await expect(page.locator('#app')).toBeEmpty();
  await expect(lock).toBeVisible();
  await expect(lock).toHaveAttribute('open', '');
});

test('stale Manager report feedback is suppressed once a newer refresh starts', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    holdReport: true,
  });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Reports' }).click();
  await expect.poll(() => fixture.reportReads.length).toBe(1);

  const releaseRefresh = fixture.holdNextRequestRead();
  const refreshStarted = page.waitForRequest((value) => (
    new URL(value.url()).pathname === '/api/v1/application/requests'
    && value.method() === 'GET'
  ));
  await page.getByRole('button', { name: 'Aktualisieren' }).click();
  await refreshStarted;

  const reportResponse = page.waitForResponse((value) => (
    new URL(value.url()).pathname === '/api/v1/application/reports/requests'
  ));
  fixture.releaseReport();
  await reportResponse;
  await expect(page.locator('#toast')).toBeEmpty();
  await expect(page.locator('#statusRegion')).toBeEmpty();

  const refreshResponse = page.waitForResponse((value) => (
    new URL(value.url()).pathname === '/api/v1/application/requests'
    && value.request().method() === 'GET'
  ));
  releaseRefresh();
  await refreshResponse;
  await expect(page.getByRole('tabpanel')).toContainText('Raumauslastung');
  await expect(page.locator('#toast')).toBeEmpty();
});

test('inactivity lock suppresses delayed Manager report feedback and clears live regions', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    holdReport: true,
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Reports' }).click();
  await expect.poll(() => fixture.reportReads.length).toBe(1);

  await page.evaluate(async () => {
    const channel = new BroadcastChannel('conference-manager-customer-session-lock-v1');
    channel.postMessage({ type: 'lock' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    channel.close();
  });
  await expect(page.locator('html')).toHaveAttribute('data-session-locked', 'true');

  const response = page.waitForResponse((value) => (
    new URL(value.url()).pathname === '/api/v1/application/reports/requests'
  ));
  fixture.releaseReport();
  await response;
  await expect(page.locator('#toast')).toBeEmpty();
  await expect(page.locator('#statusRegion')).toBeEmpty();
  await expect(page.locator('#alertRegion')).toBeEmpty();
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
  await expect(page.getByRole('button', { name: 'Anfrage stornieren' })).toBeDisabled();
  expect(fixture.decisionWrites).toHaveLength(1);

  fixture.releaseBookingDecision();
  await expect(page.locator('#toast')).toContainText('Die Änderung wurde erfolgreich umgesetzt.');
  expect(fixture.decisionWrites).toHaveLength(1);
});

test('Conference Manager settles an applying booking-change decision after an intervening refresh', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    bookingChange: bookingChangeFixture(),
    holdBookingDecision: true,
    showApplyingDuringBookingDecision: true,
  });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Änderung freigeben' }).click();
  await expect.poll(() => fixture.decisionWrites.length).toBe(1);

  await page.getByRole('button', { name: 'Aktualisieren' }).click();
  await expect(page.getByText('Umsetzung läuft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Änderung freigeben' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Änderung ablehnen' })).toHaveCount(0);

  const response = page.waitForResponse((value) => (
    new URL(value.url()).pathname
      === `/api/v1/requests/${REQUEST_ID}/booking-change/33333333-3333-4333-8333-333333333333/decision`
  ));
  fixture.releaseBookingDecision();
  await response;

  await expect(page.locator('#toast')).toContainText('Die Änderung wurde erfolgreich umgesetzt.');
  await expect(page.getByText('Umsetzung läuft')).toHaveCount(0);
  await expect(page.getByText('3 Teilnehmende')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bestätigte Buchung ändern' })).toBeEnabled();
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
  await expect(page.locator(`[data-production-request-id="${REQUEST_ID}"] dd`)
    .filter({ hasText: /15\.09\.2026, 09:00/ })).toBeVisible();
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

test('REG-02: direct Tenant Admin entry never loads Manager reports or Room prices and role loss clears the route', async ({ page }) => {
  await installProductionApplicationFixture(page, { roles: ['employee', 'tenant_admin'] });
  let effectiveRoles = ['employee', 'tenant_admin'];
  const managerReads = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET' && [
      '/api/v1/application/reports/requests',
      '/api/v1/tenant/settings/catalogue',
    ].includes(pathname)) managerReads.push(pathname);
  });
  await page.route(`${ORIGIN}/api/v1/session`, async (route) => {
    await route.fulfill({ json: sessionPayload(effectiveRoles) });
  });

  await page.goto(`${ORIGIN}/#tenant-admin/locations`);
  await expect(page.locator('[data-tenant-admin-section-content="locations"]')).toBeVisible();
  await expect(page.locator('[data-view="manager"]')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Reports' })).toHaveCount(0);
  await expect(page.locator('[data-report-content]')).toHaveCount(0);
  await expect(page.locator('[data-manager-business-settings-root]')).toHaveCount(0);
  await expect(page.locator('#manager-room-price-amount-0')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-tenant-admin-section-content="locations"]')).toBeVisible();
  expect(managerReads).toEqual([]);

  effectiveRoles = ['employee', 'conference_manager'];
  await page.reload();
  await expect(page.locator('[data-view="tenantAdmin"]')).toHaveCount(0);
  await expect(page.locator('[data-tenant-admin-shell]')).toHaveCount(0);
  await expect(page.locator('[data-view="manager"]')).toHaveCount(1);
  await expect(page).toHaveURL(`${ORIGIN}/`);
  expect(managerReads).toEqual([]);
  await page.goto(`${ORIGIN}/#tenant-admin/locations`);
  await expect(page.locator('[data-tenant-admin-shell]')).toHaveCount(0);
  await expect(page).toHaveURL(`${ORIGIN}/`);
});

test('Tenant Admin bulk surfaces expose only owned types and apply a receipt-bound Room document', async ({ page }) => {
  const documentValue = { schemaVersion: 1, type: 'rooms', rows: [] };
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'tenant_admin'],
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="tenantAdmin"]').click();
  await expect(page.locator(
    '[data-tenant-admin-section="catalog"], [data-tenant-admin-section="catalogue"]',
  )).toHaveCount(0);

  await page.locator('[data-tenant-admin-section="locations"]').click();
  const locations = page.locator('[data-tenant-admin-section-content="locations"]');
  await expect(locations.locator('[data-tenant-settings-form="locations-technical"]')).toBeVisible();
  const locationsBulk = locations.locator('[data-tenant-bulk-transfer]');
  expect(await locationsBulk.locator('option').evaluateAll((options) => (
    options.map(({ value }) => value)
  ))).toEqual(['sites', 'rooms']);
  await locationsBulk.locator('select').selectOption('rooms');
  await locationsBulk.locator('input[type="file"]').setInputFiles({
    name: 'rooms.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '"id","name","description","capacity","active","floor","equipment","accessibility","serviceIds","cateringPackageIds","guestPublicValues"\r\n',
    ),
  });
  await locationsBulk.getByRole('button', { name: 'Datei prüfen' }).click();
  await expect(locationsBulk.getByRole('status')).toContainText('gültig und enthält Änderungen');
  const apply = locationsBulk.getByRole('button', { name: 'Geprüfte Änderungen anwenden' });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect.poll(() => fixture.bulkWrites.length).toBe(2);
  expect(fixture.bulkWrites).toEqual([
    {
      path: '/api/v1/tenant/settings/locations/bulk/rooms/validate',
      csrf: CSRF_TOKEN,
      body: { document: documentValue },
    },
    {
      path: '/api/v1/tenant/settings/locations/bulk/rooms/apply',
      csrf: CSRF_TOKEN,
      body: { receiptId: 'bulk-receipt-1', document: documentValue },
    },
  ]);

  await page.locator('[data-tenant-admin-section="cost-allocation"]').click();
  const costAllocation = page.locator('[data-tenant-admin-section-content="cost-allocation"]');
  await expect(costAllocation.locator('[data-tenant-settings-form="cost-allocation"]')).toBeVisible();
  expect(await costAllocation.locator('[data-tenant-bulk-transfer] option').evaluateAll((options) => (
    options.map(({ value }) => value)
  ))).toEqual([
    'cost-centers',
  ]);
  await expect(costAllocation.locator('[data-tenant-bulk-transfer]')).toHaveCount(1);
});

test('Production dual role exposes both independent workspaces and localized role identity', async ({ page }) => {
  await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager', 'tenant_admin'],
  });
  await page.goto(`${ORIGIN}/`);

  await expect(page.locator('[data-view="manager"]')).toHaveCount(1);
  await expect(page.locator('[data-view="tenantAdmin"]')).toHaveCount(1);
  await expect(page.locator('[data-view="employee"]')).toHaveCount(1);
  await page.locator('[data-view="manager"]').click();
  await expect(page.locator('[data-manager-workspace-root]')).toBeVisible();
  await page.locator('[data-view="tenantAdmin"]').click();
  await expect(page.locator('[data-tenant-admin-shell]')).toBeVisible();

  await page.locator('#primaryNavigation button[aria-haspopup="dialog"]').click();
  const profile = page.getByRole('dialog');
  await expect(profile.getByText('Conference Manager & Tenant-Administration', { exact: true })).toBeVisible();
  await profile.locator('#profileLanguage').selectOption('en');
  await expect(profile).toHaveCount(0);
  await page.locator('#primaryNavigation button[aria-haspopup="dialog"]').click();
  await expect(page.getByRole('dialog')
    .getByText('Conference Manager & tenant administration', { exact: true })).toBeVisible();
});

test('REG-03: dual role restores direct Tenant Admin entry and keeps Manager report and Room-price ownership separate', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager', 'tenant_admin'],
  });
  await page.goto(`${ORIGIN}/#tenant-admin/users`);
  await expect(page.locator('[data-tenant-admin-section-content="users"] h2')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-tenant-admin-section-content="users"] h2')).toBeVisible();
  await expect(page.locator('[data-view="employee"]')).toHaveCount(1);
  await expect(page.locator('[data-view="manager"]')).toHaveCount(1);
  await expect(page.locator('[data-view="tenantAdmin"]')).toHaveCount(1);

  const managerNavigation = page.locator('[data-view="manager"]');
  await managerNavigation.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#viewTitle')).toBeFocused();
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await page.getByRole('tab', { name: 'Reports' }).click();
  await expect.poll(() => fixture.reportReads.length).toBe(1);
  await expect(page.locator('[data-report-content]')).toBeVisible();
  await page.getByRole('tab', { name: 'Administration' }).click();
  await page.getByRole('button', { name: 'Business-Einstellungen' }).click();
  await expect(page.locator('#manager-room-price-amount-0')).toBeVisible();

  await page.locator('[data-view="tenantAdmin"]').click();
  await page.locator('[data-tenant-admin-section="locations"]').click();
  await expect(page.locator('[data-tenant-admin-section-content="locations"]')).toBeVisible();
  await expect(page.locator('#manager-room-price-amount-0')).toHaveCount(0);
  await expect(page.locator('[data-report-content]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-tenant-admin-section-content="locations"]')).toBeVisible();
  await expect(page.locator('[data-view="manager"]')).toHaveCount(1);
  await expect(page.locator('[data-view="tenantAdmin"]')).toHaveCount(1);
});

test('Production session with a partial Manager permission union fails closed', async ({ page }) => {
  const malformed = sessionPayload(['employee', 'conference_manager']);
  malformed.permissions = malformed.permissions.filter((permission) => (
    permission !== 'tenant:catalogue:manage'
  ));
  await installProductionApplicationFixture(page, { session: malformed });
  await page.goto(`${ORIGIN}/`);

  await expect(page.locator('#viewTitle')).toHaveText('Sichere Anmeldung nicht verfügbar');
  await expect(page.locator('[data-view="manager"]')).toHaveCount(0);
  await expect(page.locator('[data-view="tenantAdmin"]')).toHaveCount(0);
  await expect(page.locator('[data-view="employee"]')).toHaveCount(0);
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
      connectError: { status: 409, code: 'ONBOARDING_UNAVAILABLE' },
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

test('MGR-01 MGR-02 MGR-03 MGR-11 MGR-12 MGR-14: restored Manager cockpit keeps filters and keyboard tabs with embedded business administration', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, { roles: ['employee', 'conference_manager'] });
  fixture.requests().push({ ...confirmedV2RequestFixture(), status: 'Submitted' });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByRole('heading', { name: 'Jetzt zu bearbeiten' })).toBeVisible();
  await expect(panel.locator('.manager-filter-count')).toContainText('1 von 1');
  await page.getByLabel('Suche').fill('No matching request');
  await page.getByLabel('Suche').press('Enter');
  await expect(panel).toContainText('Keine Anfragen passen zu diesen Filtern.');
  await page.getByRole('button', { name: 'Filter zurücksetzen' }).click();
  await expect(page.locator('#managerSearch')).toBeFocused();
  await expect(panel.locator('[data-production-request-id]')).toHaveCount(1);
  const bookings = page.locator('[data-manager-tab="BOOKINGS"]');
  await bookings.focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Administration' })).toBeFocused();
  await expect(panel).toHaveAttribute('aria-labelledby', 'managerTab-ADMIN');
  await expect(panel.locator('[data-manager-business-settings-root]')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(4);
  await expect(page.locator('[data-view="tenantAdmin"]')).toHaveCount(0);
  await expect(panel).not.toContainText('Microsoft 365');
  await page.locator('[data-view="welcome"]').click();
  await page.locator('[data-view="manager"]').click();
  await expect(page.getByRole('tab', { name: 'Administration' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-manager-business-settings-root]')).toBeVisible();
  await page.locator('#primaryNavigation button[aria-haspopup="dialog"]').click();
  await page.getByRole('dialog').locator('#profileLanguage').selectOption('en');
  await expect(page.getByRole('tab', { name: 'Room planning' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Administration' })).toHaveAttribute('aria-selected', 'true');
  for (const viewport of [{ width: 320, height: 640 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      rightEdges: [...document.querySelectorAll('body *')]
        .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 12)
        .map((element) => ({
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          width: Math.ceil(element.getBoundingClientRect().width),
          right: Math.ceil(element.getBoundingClientRect().right),
          ancestors: [...(function* parents() {
            let parent = element.parentElement;
            while (parent && parent !== document.body) {
              yield `${parent.tagName.toLowerCase()}${parent.id ? `#${parent.id}` : ''}${parent.classList.length ? `.${[...parent.classList].join('.')}` : ''}:${Math.ceil(parent.getBoundingClientRect().width)}`;
              parent = parent.parentElement;
            }
          }())].slice(0, 7),
        })),
    }));
    expect(overflow.documentWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewportWidth);
  }
});

test('MGR-04 MGR-08 MGR-09: Manager room plan offers a bounded timeline, retained date and keyboard entry to request history', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, { roles: ['employee', 'conference_manager'] });
  const request = confirmedV2RequestFixture();
  fixture.requests().push(request);
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Raumplanung' }).click();
  await page.locator('#productionRoomPlanDate').fill(request.startsAt.slice(0, 10));
  await page.locator('#productionRoomPlanDate').dispatchEvent('change');
  await expect(page.getByRole('table')).toContainText('Updated conference');
  await page.getByRole('radio', { name: 'Zeitplan' }).check();
  const timeline = page.getByRole('region', { name: 'Raumbelegung' });
  await expect(timeline).toBeVisible();
  const entry = timeline.getByRole('button', { name: /Updated conference/ });
  await expect(entry).toBeVisible();
  await entry.focus();
  await page.keyboard.press('Enter');
  const card = page.locator(`[data-production-request-id="${REQUEST_ID}"]`);
  await expect(card).toBeFocused();
  await expect(card).toContainText('Angefragt von: Nicht dokumentiert');
  await card.getByRole('button', { name: 'Verlauf' }).click();
  const history = page.getByRole('dialog', { name: 'Verlauf' });
  await expect(history.getByRole('list')).toBeVisible();
  await expect(history).toContainText('Rolle bei der Aktion: Nicht dokumentiert');
  await page.keyboard.press('Escape');
  await expect(card.getByRole('button', { name: 'Verlauf' })).toBeFocused();
  await page.getByRole('tab', { name: 'Raumplanung' }).click();
  await expect(page.locator('#productionRoomPlanDate')).toHaveValue(request.startsAt.slice(0, 10));
  await expect(page.getByRole('radio', { name: 'Zeitplan' })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('EMP-13 MGR-04 MGR-06 MGR-08: API-03 attribution stays historical and a latest terminal change permits a new proposal', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, { roles: ['employee', 'conference_manager'] });
  const requesterAttribution = { displayName: 'Historical Requester' };
  const current = { ...confirmedV2RequestFixture(), requesterAttribution };
  fixture.requests().push(current);
  const changeBase = {
    id: '33333333-3333-4333-8333-333333333333',
    status: 'rejected',
    roomId: current.roomId,
    startsAt: current.startsAt,
    endsAt: current.endsAt,
    internalParticipants: 3,
    externalParticipants: 0,
    rejectionReason: 'The requested change was declined.',
    createdAt: '2026-08-26T10:00:00.000Z',
    updatedAt: '2026-08-26T11:00:00.000Z',
    baseRequestVersion: current.version,
  };
  const projection = appliedRequest(current, changeBase);
  const terminalChange = {
    ...changeBase,
    requestSchemaVersion: 2,
    request: projection.request,
    proposedRequest: { ...projection.proposedRequest, requesterAttribution },
    initiatorAttribution: {
      displayName: 'Historical Proposal Author', roleAtAction: 'employee',
    },
    deciderAttribution: {
      displayName: 'Historical Decision Owner', roleAtAction: 'conference_manager',
    },
  };
  await page.route(/\/api\/v1\/application\/requests(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({
      schemaVersion: 3,
      asOf: '2026-09-24T12:00:00.000Z',
      requests: [current],
      page: { limit: 10, complete: true, nextCursor: null },
    }) });
  });
  await page.route(`${ORIGIN}/api/v1/requests/${REQUEST_ID}/history?**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({
      schemaVersion: 3,
      requestId: API_REQUEST_ID,
      asOfVersion: current.version,
      history: [{
        version: current.version,
        schemaVersion: current.schemaVersion,
        operation: 'transitioned',
        capturedAt: '2026-08-26T11:00:00.000Z',
        request: current,
        actorAttribution: {
          displayName: 'Historical Audit Actor', roleAtAction: 'conference_manager',
        },
      }],
      page: { limit: 10, complete: true, nextCursor: null },
    }) });
  });
  await page.route(`${ORIGIN}/api/v1/requests/${REQUEST_ID}/booking-change`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({
      schemaVersion: 3,
      result: { change: terminalChange, requestRef: requestRef(current) },
    }) });
  });

  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  const card = page.locator(`[data-production-request-id="${REQUEST_ID}"]`);
  await expect(card).toContainText('Angefragt von: Historical Requester');
  await expect(card).not.toContainText('Angefragt von: Conference Manager');
  await expect(card).toContainText('Änderung vorgeschlagen von: Historical Proposal Author');
  await expect(card).toContainText('Entschieden von: Historical Decision Owner');
  await expect(card.getByRole('button', { name: 'Bestätigte Buchung ändern' })).toBeEnabled();
  await card.getByRole('button', { name: 'Verlauf' }).click();
  const history = page.getByRole('dialog', { name: 'Verlauf' });
  await expect(history).toContainText('Historical Audit Actor');
  await expect(history).not.toContainText('Conference Manager · Rolle bei der Aktion');
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Bestätigte Buchung ändern' }).click();
  await expect(page.getByRole('dialog', { name: 'Bestätigte Buchung ändern' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('[data-view="requests"]').click();
  const employeeCard = page.locator(`[data-production-request-id="${REQUEST_ID}"]`);
  await expect(employeeCard).toContainText('Abgelehnt');
  await expect(employeeCard.getByRole('button', { name: 'Bestätigte Buchung ändern' })).toBeEnabled();
});

test('MGR-05 MGR-07 MGR-13: Manager confirmation requires review and cancellation retains the request', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, { roles: ['employee', 'conference_manager'] });
  fixture.requests().push({ ...confirmedV2RequestFixture(), status: 'In Review' });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  const card = page.locator(`[data-production-request-id="${REQUEST_ID}"]`);
  await card.getByRole('button', { name: 'Bestätigen', exact: true }).click();
  expect(fixture.writes).toHaveLength(0);
  const review = page.getByRole('dialog', { name: 'Anfrage verbindlich bestätigen?' });
  await expect(review).toContainText('Updated conference');
  await review.getByRole('button', { name: 'Bestätigen', exact: true }).click();
  await expect(card).toContainText('Bestätigt');
  expect(fixture.writes[0].body).toEqual({ transition: 'confirm' });
  await card.getByRole('button', { name: 'Anfrage stornieren' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Anfrage stornieren' }).click();
  await expect(card).toContainText('Storniert');
  expect(fixture.requests()).toHaveLength(1);
  await expect(page.getByRole('button', { name: /löschen|delete/i })).toHaveCount(0);
});

test('MGR-10: reports render server results and date periods with localized hours, empty recovery and reflow', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, { roles: ['employee', 'conference_manager'] });
  const request = confirmedV2RequestFixture();
  const ranges = [];
  await page.route(`${ORIGIN}/api/v1/application/reports/requests?**`, async (route) => {
    const url = new URL(route.request().url());
    const fromInclusive = url.searchParams.get('from');
    const toExclusive = url.searchParams.get('to');
    ranges.push({ fromInclusive, toExclusive });
    const included = request.startsAt >= fromInclusive && request.startsAt < toExclusive;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      schemaVersion: 2, asOf: '2026-09-01T12:00:00.000Z',
      range: { field: 'startsAt', fromInclusive, toExclusive, timeZone: 'UTC' },
      requests: included ? [request] : [], page: { limit: 10, complete: true, nextCursor: null },
    }) });
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Reports' }).click();
  const results = page.locator('[data-report-content]');
  await expect(results.getByRole('table', { name: 'Raumauslastung' })).toContainText('Room A');
  await expect(results).toContainText('Operative Hinweise');
  await page.locator('#managerReportPeriod').selectOption('DAY');
  await page.locator('#managerReportDate').fill('2026-03-29');
  await page.locator('#managerReportDate').dispatchEvent('change');
  await expect.poll(() => ranges.at(-1)).toEqual({ fromInclusive: '2026-03-28T23:00:00.000Z', toExclusive: '2026-03-29T22:00:00.000Z' });
  await expect(results).toContainText('Keine bestätigten Raumbuchungen im Zeitraum.');
  await page.locator('#managerReportDate').fill(request.startsAt.slice(0, 10));
  await page.locator('#managerReportDate').dispatchEvent('change');
  await expect(results.getByRole('table', { name: 'Raumauslastung' })).toContainText('Room A');
  for (const period of ['MONTH', 'QUARTER', 'YEAR']) {
    await page.locator('#managerReportPeriod').selectOption(period);
    await expect(results.getByRole('table', { name: 'Raumauslastung' })).toContainText('Room A');
  }
  await page.locator('#managerReportDate').fill('');
  await page.locator('#managerReportDate').dispatchEvent('change');
  await expect(page.locator('#managerReportDate')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#managerReportDate')).toBeFocused();
  await expect(results).toBeEmpty();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(fixture.writes).toHaveLength(0);
});

test('MGR-10: reports retain a historical Site after its last Room moves elsewhere', async ({ page }) => {
  const catalog = catalogPayload();
  catalog.catalog.sites.push({
    id: 'new-york', name: 'New York', active: true, timeZone: 'America/New_York',
  });
  catalog.catalog.rooms[0] = {
    ...catalog.catalog.rooms[0], siteId: 'new-york', name: 'Room A now in New York',
  };
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'], catalog,
  });
  const request = confirmedV2RequestFixture();
  await page.route(`${ORIGIN}/api/v1/application/reports/requests?**`, async (route) => {
    const url = new URL(route.request().url());
    const fromInclusive = url.searchParams.get('from');
    const toExclusive = url.searchParams.get('to');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      schemaVersion: 2,
      asOf: '2026-09-01T12:00:00.000Z',
      range: { field: 'startsAt', fromInclusive, toExclusive, timeZone: 'UTC' },
      requests: [request],
      page: { limit: 10, complete: true, nextCursor: null },
    }) });
  });

  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Reports' }).click();
  await expect(page.locator('#managerReportSite')).toHaveValue('berlin');
  await expect(page.locator('#managerReportSite option')).toHaveText(['Berlin', 'New York']);
  await page.locator('#managerReportDate').fill(request.startsAt.slice(0, 10));
  await page.locator('#managerReportDate').dispatchEvent('change');
  await expect(page.locator('[data-report-content]')
    .getByRole('table', { name: 'Raumauslastung' })).toContainText('Room A');
  await expect(page.locator('[data-report-content]')).not.toContainText('Room A now in New York');
  expect(fixture.writes).toHaveLength(0);
});

test('Production onboarding opens Tenant Admin without loading unavailable business projections', async ({ page }) => {
  const roles = ['employee', 'tenant_admin'];
  const session = sessionPayload(roles);
  session.tenant.status = 'onboarding';
  const fixture = await installProductionApplicationFixture(page, { session, roles });
  const businessReads = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/application/requests')) businessReads.push(request.url());
  });
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('[data-view="tenantAdmin"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-tenant-admin-shell]')).toBeVisible();
  expect(fixture.catalogReads).toEqual([]);
  expect(businessReads).toEqual([]);
});
