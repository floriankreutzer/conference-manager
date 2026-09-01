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
        price: { amountMinor: 0, currency: 'EUR' },
      }],
      services: [],
      cateringPackages: [],
      cateringItems: [],
    },
  };
}

function locationSettingsPayload() {
  return {
    locations: {
      schemaVersion: 1,
      revision: 1,
      configuration: {
        sites: [{
          id: 'berlin', name: 'Berlin', active: true, timeZone: 'Europe/Berlin', address: null,
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
          mediaAssetIds: [],
        }],
      },
      providerContext: [],
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
  return asProductionHtml(source);
}

async function installProductionApplicationFixture(page, {
  roles = ['employee'],
  timeZone = 'Europe/Berlin',
  catalog = catalogPayload(timeZone),
  catalogLocationsRevision = 1,
  catalogueSettings: initialCatalogueSettings = null,
  bookingChange: initialBookingChange = null,
  bookingChangeProposalError = null,
  availabilityResponses = [{ available: true, conflictCount: 0 }],
  requestCreateErrors = [],
  requestRoomContext = undefined,
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
  const reportReads = [];
  const requestHistoryReads = [];
  const roomContextReads = [];
  const catalogReads = [];
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

  function replaceRequests(nextRequests) {
    requests = nextRequests.map((entry) => structuredClone(entry));
  }

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

    if (url.pathname === '/api/v1/tenant/settings/locations' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ locations: locationSettings }),
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
      locationSettings = {
        ...locationSettings,
        revision: body.expectedRevision + 1,
        configuration: body.configuration,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ locations: locationSettings }),
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
          costAllocation: { allocationRequired: false },
          context: catalogLoad.context,
          section,
          entries: section === 'costCenters' ? [] : catalogLoad.catalog.catalog[section],
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
      const currentRoomContext = requestRoomContext === undefined
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
      roomContextReads.push(current.id);
      if (roomContextGate) await roomContextGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          schemaVersion: 1,
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
      writes.push({ path: url.pathname, csrf: request.headers()['x-csrf-token'], body });
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
      const projection = appliedRequest(current, change);
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
    requestHistoryReads,
    roomContextReads,
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

test('Employee reconciles one held cancellation after cross-navigation from pre-cancel state', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, { holdTransition: true });
  fixture.requests().push(confirmedRequestFixture());
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="requests"]').click();
  await page.getByRole('button', { name: 'Anfrage stornieren' }).click();
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
  const resubmission = {
    ...confirmedV2RequestFixture(),
    status: 'Change Requested',
    statusReason: 'Please revise the request.',
  };
  fixture.requests().push(resubmission);
  await page.goto(`${ORIGIN}/`);

  await page.locator('[data-view="employee"]').click();
  await page.locator('#productionTitle').fill('Detached draft');
  await expect.poll(() => page.evaluate(() => (
    Object.values(sessionStorage).some((value) => value.includes('Detached draft'))
  ))).toBe(true);
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
  await expect(page.locator('#productionRoom option:checked')).toHaveText('Current Room · 24');
  await expect(page.locator('#productionInternal')).toHaveValue('2');
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
    { context: olderLoad.context, section: 'cateringPackages' },
    { context: olderLoad.context, section: 'cateringItems' },
    { context: olderLoad.context, section: 'costCenters' },
  ]);
  await expect(page.locator('#productionTitle')).toHaveValue('Updated conference');
  await expect(page.locator('#productionRoom option:checked')).toHaveText('Current Room · 24');
  await expect(page.locator('#productionInternal')).toHaveValue('2');
  await expect(page.locator('#toast')).toBeEmpty();
  await expect(page.locator('#viewTitle')).toHaveText('Konferenzanfrage');
  expect(fixture.writes).toHaveLength(0);
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
  const operationalActions = page.locator(
    '[data-manager-operational-root] > section.card > .button-row',
  ).first();
  await expect(operationalActions).toBeVisible();
  expect(await operationalActions.getByRole('button').allTextContents()).toEqual([
    'Aktualisieren', 'Raumplanung', 'Bericht',
  ]);
  await expect(operationalActions).not.toHaveAttribute('role', 'tablist');
  await page.getByRole('button', { name: 'Prüfung starten' }).click();
  await expect(page.locator('#toast')).toContainText('Workflow-Status wurde aktualisiert.');
  await expect(page.locator(`[data-production-request-id="${REQUEST_ID}"]`)).toBeFocused();

  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({
    csrf: CSRF_TOKEN,
    body: { transition: 'start_review' },
  });
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

test('Conference Manager creates every owned catalogue entry type and package variants through CSRF contract', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Business-Einstellungen' }).click();
  await expect(page.locator('#viewTitle')).toBeFocused();
  await page.getByRole('button', { name: 'Katalog & Preise' }).click();
  await expect(page.locator('#viewTitle')).toBeFocused();
  await page.getByRole('button', { name: 'Räume' }).click();
  await expect(page.locator('#viewTitle')).toBeFocused();
  await page.getByRole('button', { name: 'Katalog & Preise' }).click();
  await expect(page.locator('#viewTitle')).toBeFocused();
  const catalogueBulk = page.locator('[data-tenant-bulk-transfer]');
  await expect(catalogueBulk).toBeVisible();
  expect(await catalogueBulk.locator('option').evaluateAll((options) => (
    options.map(({ value }) => value)
  ))).toEqual([
    'services', 'catering-items', 'catering-packages',
  ]);

  await page.locator('[data-add-catalogue-entry="services"]').click();
  await expect(page.locator('[data-catalogue-entry-id="services-1"] input').first()).toBeFocused();
  await page.locator('[data-add-catalogue-entry="equipment"]').click();
  await page.locator('[data-add-catalogue-entry="cateringItems"]').click();
  await page.locator('[data-add-catalogue-entry="cateringPackages"]').click();
  await page.locator('[data-add-catalogue-variant="package-coffee"]').click();

  await expect(page.locator('[data-catalogue-entry-id="equipment-1"]')).toBeVisible();
  await expect(page.locator('[data-catalogue-entry-id="cateringItems-1"]')).toBeVisible();
  await expect(page.locator('[data-catalogue-entry-id="cateringPackages-1"]')).toBeVisible();
  await expect(page.locator('[data-catalogue-variant-id="package-coffee-variant-1"]')).toBeVisible();

  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('#toast')).toContainText('Business-Einstellungen wurden gespeichert.');
  await expect(page.locator('#viewTitle')).toBeFocused();

  expect(fixture.catalogueWrites).toHaveLength(1);
  expect(fixture.catalogueWrites[0].csrf).toBe(CSRF_TOKEN);
  const saved = fixture.catalogueWrites[0].body.catalogue;
  expect(saved.services.map((entry) => entry.id)).toContain('services-1');
  expect(saved.equipment.map((entry) => entry.id)).toContain('equipment-1');
  expect(saved.cateringItems.map((entry) => entry.id)).toContain('cateringItems-1');
  expect(saved.cateringPackages.map((entry) => entry.id)).toContain('cateringPackages-1');
  expect(saved.cateringPackages.find((entry) => entry.id === 'package-coffee').variants)
    .toMatchObject([{ id: 'package-coffee-variant-1', price: { currency: 'EUR' } }]);
  expect(fixture.catalogueWrites[0].body).not.toHaveProperty('tenantId');
});

test('Conference Manager preserves an absent Room price and receives accessible trimmed-name validation', async ({ page }) => {
  const initialCatalogue = structuredClone(catalogueSettingsPayload().catalogue);
  initialCatalogue.roomPrices = [];
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    catalogueSettings: initialCatalogue,
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Business-Einstellungen' }).click();
  await page.getByRole('button', { name: 'Katalog & Preise' }).click();

  const amount = page.locator('#manager-room-price-amount-0');
  const currency = page.locator('#manager-room-price-currency-0');
  await expect(amount).toHaveValue('');
  await expect(amount).not.toHaveAttribute('required');
  await expect(amount).toHaveAttribute(
    'aria-describedby',
    'manager-room-price-not-configured-0',
  );
  await expect(currency).toBeDisabled();
  await expect(currency).toHaveAttribute(
    'aria-describedby',
    'manager-room-price-not-configured-0',
  );
  await expect(page.locator('#manager-room-price-not-configured-0')).toHaveText(
    'Noch nicht konfiguriert. Ein leeres Feld bewahrt den Raum ohne Preis.',
  );

  const catalogueName = page.locator('#manager-catalogue-cateringItems-item-coffee-name');
  const catalogueNameError = page.locator(
    '#manager-catalogue-cateringItems-item-coffee-name-error',
  );
  await catalogueName.fill('   ');
  await page.getByRole('button', { name: 'Speichern' }).click();
  expect(fixture.catalogueWrites).toHaveLength(0);
  await expect(catalogueName).toBeFocused();
  await expect(catalogueName).toHaveAttribute('aria-invalid', 'true');
  await expect(catalogueName).toHaveAttribute(
    'aria-describedby',
    'manager-catalogue-cateringItems-item-coffee-name-error',
  );
  await expect(catalogueNameError).toHaveText('Bitte geben Sie einen Namen ein.');

  await catalogueName.fill('    ');
  await expect(catalogueName).toHaveAttribute('aria-invalid', 'true');
  await expect(catalogueNameError).toHaveText('Bitte geben Sie einen Namen ein.');
  await catalogueName.fill('Espresso');
  await expect(catalogueName).not.toHaveAttribute('aria-invalid');
  await expect(catalogueNameError).toBeEmpty();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect.poll(() => fixture.catalogueWrites.length).toBe(1);
  await expect(page.locator('#toast')).toContainText('Business-Einstellungen wurden gespeichert.');
  await expect(page.locator('#viewTitle')).toBeFocused();
  expect(fixture.catalogueWrites[0].body.expectedRevision).toBe(1);
  expect(fixture.catalogueWrites[0].body.catalogue).toMatchObject({
    cateringItems: [{ id: 'item-coffee', name: 'Espresso' }],
    roomPrices: [],
  });

  const explicitAmount = page.locator('#manager-room-price-amount-0');
  const explicitCurrency = page.locator('#manager-room-price-currency-0');
  await explicitAmount.fill('0');
  await expect(explicitCurrency).toBeEnabled();
  const explicitSaveResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/v1/tenant/settings/catalogue'
    && response.request().method() === 'PUT'
  ));
  await page.getByRole('button', { name: 'Speichern' }).click();
  await explicitSaveResponse;
  await expect.poll(() => fixture.catalogueWrites.length).toBe(2);
  await expect(page.locator('#viewTitle')).toBeFocused();
  await expect(page.locator('#manager-room-price-amount-0')).toHaveValue('0');
  await expect(page.locator('#manager-room-price-amount-0')).toHaveAttribute('required', 'required');
  expect(fixture.catalogueWrites[1].body.expectedRevision).toBe(2);
  expect(fixture.catalogueWrites[1].body.catalogue.roomPrices).toEqual([{
    roomId: 'room-a',
    price: { amountMinor: 0, currency: 'EUR' },
  }]);
});

test('Conference Manager updates complete Room business snapshots and surfaces revision conflicts', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
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
  await page.getByRole('button', { name: 'Speichern' }).click();
  expect(fixture.locationWrites).toHaveLength(0);
  await expect(roomName).toBeFocused();
  await expect(roomName).toHaveAttribute('aria-invalid', 'true');
  await expect(roomName).toHaveAttribute('aria-describedby', 'manager-room-name-0-error');
  await expect(roomNameError).toHaveText('Bitte geben Sie einen Raumnamen ein.');

  await roomName.fill('Executive Room');
  await expect(roomName).not.toHaveAttribute('aria-invalid');
  await expect(roomNameError).toBeEmpty();
  await room.locator('#manager-room-capacity-0').fill('16');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('#toast')).toContainText('Business-Einstellungen wurden gespeichert.');
  await expect(page.locator('#viewTitle')).toBeFocused();

  expect(fixture.locationWrites).toHaveLength(1);
  expect(fixture.locationWrites[0]).toMatchObject({
    csrf: CSRF_TOKEN,
    body: {
      schemaVersion: 1,
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
  await page.getByRole('button', { name: 'Business-Einstellungen' }).click();
  await page.locator('#manager-room-name-0').fill('Conflicting Room');
  const save = page.getByRole('button', { name: 'Speichern' });
  await save.click();
  await expect(page.locator('#toast')).toContainText('zwischenzeitlich geändert');
  await expect(save).toBeEnabled();
  expect(conflictFixture.locationWrites).toHaveLength(1);
});

test('stale Catalogue save cannot restore Manager settings after navigation', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    holdCatalogueSave: true,
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Business-Einstellungen' }).click();
  await page.getByRole('button', { name: 'Katalog & Preise' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
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
  await page.getByRole('button', { name: 'Bericht' }).click();
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
  await expect(page.locator(`[data-production-request-id="${REQUEST_ID}"]`)).toBeVisible();
  await expect(page.locator('#toast')).toBeEmpty();
});

test('inactivity lock suppresses delayed Manager report feedback and clears live regions', async ({ page }) => {
  const fixture = await installProductionApplicationFixture(page, {
    roles: ['employee', 'conference_manager'],
    holdReport: true,
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('button', { name: 'Bericht' }).click();
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

test('Tenant Admin bulk surfaces expose only owned types and apply a receipt-bound Room document', async ({ page }) => {
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
  const documentValue = { schemaVersion: 1, type: 'rooms', rows: [] };
  await locationsBulk.locator('input[type="file"]').setInputFiles({
    name: 'rooms.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(documentValue)),
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
