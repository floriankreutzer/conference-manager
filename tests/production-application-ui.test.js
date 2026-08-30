import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  formatProductionDateTime,
  isProductionTimeZone,
  productionUtcInstant,
} from '../src/employee/production-time.js';
import {
  composeServerRequestDraft,
  repeatRequestProjection,
} from '../src/employee/server-request-projection.js';
import {
  cateringEditorOptions,
  normalizeAllocationEditorDraft,
  normalizeCateringEditorDraft,
  roomEditorOptions,
  roomSupportsParticipants,
  serviceEditorOptions,
} from '../src/employee/server-request-editor.js';
import { roomPlanProjection, siteLocalIsoDate } from '../src/manager/server-room-plan.js';

const EMPLOYEE_SOURCE = new URL('../src/employee/production-application.js', import.meta.url);
const MANAGER_SOURCE = new URL('../src/manager/production-application.js', import.meta.url);
const APP_SOURCE = new URL('../src/app.js', import.meta.url);
const CONTEXT_SOURCE = new URL('../src/platform/application-context.js', import.meta.url);
const SHELL_SOURCE = new URL('../src/platform/app-shell.js', import.meta.url);
const PRODUCTION_DETAILS_SOURCE = new URL('../src/shared/production-request-details.js', import.meta.url);

async function source(url) {
  return readFile(url, 'utf8');
}

test('production request time conversion uses the authoritative IANA site timezone', () => {
  assert.equal(
    productionUtcInstant('2026-09-15', '09:30', 'Europe/Berlin'),
    '2026-09-15T07:30:00.000Z',
  );
  assert.equal(isProductionTimeZone('Europe/Berlin'), true);
  assert.equal(isProductionTimeZone('Etc/UTC'), true);
  assert.equal(isProductionTimeZone('UTC'), true);
  assert.equal(isProductionTimeZone('GMT'), true);
  assert.equal(isProductionTimeZone('not/a-zone'), false);
  assert.equal(productionUtcInstant('not-a-date', '09:30', 'Europe/Berlin'), null);
  assert.equal(productionUtcInstant('2026-09-15', 'bad-time', 'Europe/Berlin'), null);
  assert.equal(productionUtcInstant('2026-09-15', '09:30', null), null);
});

test('production request time conversion rejects ambiguous and nonexistent DST wall times', () => {
  assert.equal(productionUtcInstant('2026-03-29', '02:30', 'Europe/Berlin'), null);
  assert.equal(productionUtcInstant('2026-10-25', '02:30', 'Europe/Berlin'), null);
});

test('production request times are displayed with an explicit locale and site timezone', () => {
  const value = '2026-09-15T07:30:00.000Z';
  const german = formatProductionDateTime(value, { locale: 'de-DE', timeZone: 'Europe/Berlin' });
  const english = formatProductionDateTime(value, { locale: 'en-GB', timeZone: 'Europe/Berlin' });
  assert.match(german, /09:30/);
  assert.match(english, /09:30/);
  assert.notEqual(german, english);
  assert.equal(formatProductionDateTime(value, { locale: 'de-DE', timeZone: null }), '');
});

test('server-backed repeat preserves request content while moving an elapsed slot by whole weeks', () => {
  const source = Object.freeze({
    id: 'REQ-1',
    version: 4,
    startsAt: '2026-08-03T08:00:00.000Z',
    endsAt: '2026-08-03T09:30:00.000Z',
    details: Object.freeze({ title: 'Architecture review', serviceIds: Object.freeze(['svc-1']) }),
  });
  const repeated = repeatRequestProjection(
    source,
    Date.parse('2026-08-30T10:00:00.000Z'),
    'Etc/UTC',
  );
  assert.equal(repeated.startsAt, '2026-08-31T08:00:00.000Z');
  assert.equal(repeated.endsAt, '2026-08-31T09:30:00.000Z');
  assert.equal(repeated.details, source.details);
  assert.equal(source.startsAt, '2026-08-03T08:00:00.000Z');
});

test('server-backed repeat preserves site-local wall-clock times across DST', () => {
  const source = Object.freeze({
    startsAt: '2026-03-23T08:00:00.000Z',
    endsAt: '2026-03-23T09:30:00.000Z',
  });
  const repeated = repeatRequestProjection(
    source,
    Date.parse('2026-03-24T10:00:00.000Z'),
    'Europe/Berlin',
  );
  assert.equal(repeated.startsAt, '2026-03-30T07:00:00.000Z');
  assert.equal(repeated.endsAt, '2026-03-30T08:30:00.000Z');
});

test('server-backed repeat selects a same-day future occurrence across the autumn fallback', () => {
  const repeated = repeatRequestProjection(
    {
      startsAt: '2026-10-19T08:00:00.000Z',
      endsAt: '2026-10-19T09:00:00.000Z',
    },
    Date.parse('2026-10-26T08:30:00.000Z'),
    'Europe/Berlin',
  );
  assert.equal(repeated.startsAt, '2026-10-26T09:00:00.000Z');
  assert.equal(repeated.endsAt, '2026-10-26T10:00:00.000Z');
});

test('server-backed Employee actions preserve confirmed cancellation and safely clear unavailable repeat scheduling', async () => {
  const employee = await source(EMPLOYEE_SOURCE);
  assert.match(employee, /CANCELLABLE_STATUSES = new Set\(\[[^\]]*'Confirmed'/);
  assert.match(employee, /isProductionTimeZone\(timeZone\)[\s\S]*roomId: '', startsAt: '', endsAt: ''/);
  const serviceRender = employee.slice(
    employee.indexOf('const renderServiceControls'),
    employee.indexOf('const renderCateringControls'),
  );
  assert.ok(serviceRender.indexOf('if (!room.value)') < serviceRender.indexOf('selectedServices.delete'));
  const cateringRender = employee.slice(
    employee.indexOf('const renderCateringControls'),
    employee.indexOf('const allocationRows'),
  );
  assert.ok(cateringRender.indexOf('if (!room.value)') < cateringRender.indexOf('delete itemQuantities'));
  assert.ok(cateringRender.indexOf('if (!room.value)') < cateringRender.indexOf('packageSelection = null'));
  assert.match(employee, /productionUtcInstant\(endDate\.value, end\.value, timeZone\)/);
  assert.match(employee, /value: sourceEnd\?\.date \|\| restoredDraft\?\.endDate/);
  assert.match(employee, /sum: formatNumber\(sum, \{ maximumFractionDigits: 2 \}\)/);
  assert.doesNotMatch(employee, /allocationStatus\.textContent[\s\S]{0,120}toFixed/);
  assert.match(employee, /scheduleDraftSave = \(\) => \{\s*draftDirty = true;/);
  assert.match(employee, /if \(draftTimer\) clearTimeout\(draftTimer\);\s*draftTimer = null;\s*draftStore\.clear\(\);/);
  assert.match(employee, /allocationRows\.splice\(index, 1\);\s*scheduleDraftSave\(\);/);
  assert.match(employee, /allocationRows\.push\([^;]+;\s*scheduleDraftSave\(\);/);
  assert.match(employee, /roomSupportsParticipants\([\s\S]*catalog\.bookingPolicy\?\.rules\?\.maximumParticipants/);
  assert.match(employee, /if \(!sourceRequest && !restoredDraft && !allocationRows\.length/);
});

test('schema-v2 repeat composition preserves catering and cost allocations from its source projection', () => {
  const request = {
    roomId: 'room-1',
    startsAt: '2026-09-07T08:00:00.000Z',
    endsAt: '2026-09-07T09:00:00.000Z',
    internalParticipants: 4,
    externalParticipants: 2,
    details: {
      title: 'Repeated request',
      serviceIds: ['service-1'],
      catering: {
        participantCount: 6,
        packageSelection: { packageId: 'package-1', variantId: 'variant-1' },
        itemQuantities: [{ itemId: 'item-1', quantity: 6 }],
      },
      dietaryRequirements: 'Vegetarian',
      specialRequirements: 'Accessible room',
    },
    allocations: {
      entries: [
        { costCenterId: 'cost-1', percentageBasisPoints: 6_000 },
        { costCenterId: 'cost-2', percentageBasisPoints: 4_000 },
      ],
    },
  };
  const draft = composeServerRequestDraft({
    request,
    catalog: { configurationRevisions: { catalogue: 4 } },
    defaultTitle: 'Fallback',
    overrides: {
      startsAt: '2026-10-05T08:00:00.000Z',
      endsAt: '2026-10-05T09:00:00.000Z',
    },
  });
  assert.deepEqual(draft.catering, request.details.catering);
  assert.deepEqual(draft.allocations, [
    { costCenterId: 'cost-1', percentageBasisPoints: 6_000 },
    { costCenterId: 'cost-2', percentageBasisPoints: 4_000 },
  ]);
  assert.equal(draft.startsAt, '2026-10-05T08:00:00.000Z');
  assert.notEqual(draft.catering, request.details.catering);
  assert.notEqual(draft.catering.itemQuantities, request.details.catering.itemQuantities);
});

test('server-backed cards expose the complete immutable business projection', async () => {
  const details = await source(PRODUCTION_DETAILS_SOURCE);
  for (const projection of [
    'details.title',
    'pricing.services',
    'pricing.catering.packageSelection',
    'pricing.catering.items',
    'details.dietaryRequirements',
    'details.specialRequirements',
    'pricing.totalMinor',
    'allocations.entries',
  ]) assert.match(details, new RegExp(projection.replaceAll('.', '\\.')));
  const employee = await source(EMPLOYEE_SOURCE);
  const manager = await source(MANAGER_SOURCE);
  assert.match(employee, /renderProductionRequestBusinessDetails\(request\)/);
  assert.match(manager, /renderProductionRequestBusinessDetails\(request\)/);
});

test('Employee editor exposes only catering applicable to the selected authoritative room', () => {
  const catalog = {
    rooms: [{ id: 'room-1', siteId: 'site-1' }],
    cateringPackages: [
      { id: 'site-package', siteIds: ['site-1'], roomIds: [], variants: [] },
      { id: 'other-package', siteIds: ['site-2'], roomIds: [], variants: [] },
    ],
    cateringItems: [
      { id: 'room-item', siteIds: [], roomIds: ['room-1'] },
      { id: 'other-item', siteIds: [], roomIds: ['room-2'] },
    ],
  };
  const options = cateringEditorOptions(catalog, 'room-1');
  assert.deepEqual(options.packages.map(({ id }) => id), ['site-package']);
  assert.deepEqual(options.items.map(({ id }) => id), ['room-item']);
});

test('Employee editor exposes only services applicable to the selected authoritative room and site', () => {
  const catalog = {
    rooms: [{ id: 'room-1', siteId: 'site-1' }],
    services: [
      { id: 'global', active: true, siteIds: [], roomIds: [] },
      { id: 'site', active: true, siteIds: ['site-1'], roomIds: [] },
      { id: 'room', active: true, siteIds: [], roomIds: ['room-1'] },
      { id: 'other-site', active: true, siteIds: ['site-2'], roomIds: [] },
      { id: 'other-room', active: true, siteIds: [], roomIds: ['room-2'] },
      { id: 'inactive', active: false, siteIds: [], roomIds: [] },
    ],
  };
  assert.deepEqual(
    serviceEditorOptions(catalog, 'room-1').map(({ id }) => id),
    ['global', 'site', 'room'],
  );
  assert.deepEqual(serviceEditorOptions(catalog, ''), []);
});

test('Employee editor applies the authoritative booking-policy allowlists to rooms and services', () => {
  const catalog = {
    bookingPolicy: { rules: {
      allowedSiteIds: ['site-1'],
      allowedRoomIds: ['room-1'],
      allowedServiceIds: ['service-1'],
    } },
    rooms: [
      { id: 'room-1', siteId: 'site-1', active: true },
      { id: 'room-2', siteId: 'site-1', active: true },
      { id: 'room-3', siteId: 'site-2', active: true },
    ],
    services: [
      { id: 'service-1', active: true, siteIds: [], roomIds: [] },
      { id: 'service-2', active: true, siteIds: [], roomIds: [] },
    ],
  };
  assert.deepEqual(roomEditorOptions(catalog).map(({ id }) => id), ['room-1']);
  assert.deepEqual(serviceEditorOptions(catalog, 'room-1').map(({ id }) => id), ['service-1']);
});

test('Employee editor rejects rooms below the current participant total', () => {
  assert.equal(roomSupportsParticipants({ capacity: 12 }, 12), true);
  assert.equal(roomSupportsParticipants({ capacity: 12 }, 13), false);
  assert.equal(roomSupportsParticipants({ capacity: 50 }, 20, 10), false);
  assert.equal(roomSupportsParticipants({ capacity: 50 }, 10, 10), true);
  assert.equal(roomSupportsParticipants({ capacity: 12 }, 0), false);
  assert.equal(roomSupportsParticipants({ capacity: 'invalid' }, 1), false);
});

test('Employee editor produces bounded schema-v2 catering and exact cost allocations', () => {
  const catalog = {
    rooms: [{ id: 'room-1', siteId: 'site-1' }],
    cateringPackages: [{
      id: 'package-1', siteIds: [], roomIds: [],
      variants: [{ id: 'variant-1', active: true }],
    }],
    cateringItems: [{ id: 'item-1', siteIds: [], roomIds: [] }],
    costCenters: [{ id: 'cost-1', active: true }, { id: 'cost-2', active: true }],
    costAllocation: { allocationRequired: true },
  };
  assert.deepEqual(normalizeCateringEditorDraft({
    participantCount: '6', totalParticipants: 8, roomId: 'room-1', catalog,
    packageSelection: { packageId: 'package-1', variantId: 'variant-1' },
    itemQuantities: { 'item-1': '3' },
  }), {
    participantCount: 6,
    packageSelection: { packageId: 'package-1', variantId: 'variant-1' },
    itemQuantities: [{ itemId: 'item-1', quantity: 3 }],
  });
  assert.deepEqual(normalizeAllocationEditorDraft({
    catalog,
    allocations: [
      { costCenterId: 'cost-2', percentage: '40' },
      { costCenterId: 'cost-1', percentage: '60.00' },
    ],
  }), [
    { costCenterId: 'cost-1', percentageBasisPoints: 6_000 },
    { costCenterId: 'cost-2', percentageBasisPoints: 4_000 },
  ]);
  assert.throws(() => normalizeAllocationEditorDraft({
    catalog,
    allocations: [{ costCenterId: 'cost-1', percentage: '99.99' }],
  }), /PRODUCTION_REQUEST_EDITOR_INVALID/);
  assert.throws(() => normalizeCateringEditorDraft({
    participantCount: '7', totalParticipants: 6, roomId: 'room-1', catalog,
    packageSelection: null, itemQuantities: {},
  }), /PRODUCTION_REQUEST_EDITOR_INVALID/);
});

test('Manager room planning derives today and request membership from the selected site timezone', () => {
  const instant = Date.parse('2026-08-30T23:30:00.000Z');
  assert.equal(siteLocalIsoDate(instant, 'Europe/Berlin'), '2026-08-31');
  assert.equal(siteLocalIsoDate(instant, 'America/New_York'), '2026-08-30');
  const catalog = {
    sites: [
      { id: 'berlin', timeZone: 'Europe/Berlin' },
      { id: 'new-york', timeZone: 'America/New_York' },
    ],
    rooms: [
      { id: 'room-berlin', siteId: 'berlin' },
      { id: 'room-new-york', siteId: 'new-york' },
    ],
  };
  const requests = [{
    id: 'request-1',
    roomId: 'room-berlin',
    status: 'Confirmed',
    startsAt: '2026-08-30T23:30:00.000Z',
    endsAt: '2026-08-31T00:30:00.000Z',
  }];
  const berlin = roomPlanProjection({ catalog, requests, siteId: 'berlin', date: '2026-08-31' });
  const newYork = roomPlanProjection({ catalog, requests, siteId: 'new-york', date: '2026-08-30' });
  assert.deepEqual(berlin.map((entry) => entry.requests.map((request) => request.id)), [['request-1']]);
  assert.deepEqual(newYork.map((entry) => entry.requests.map((request) => request.id)), [[]]);
});

test('Manager room planning includes bookings on every overlapping site-local day', () => {
  const catalog = {
    sites: [{ id: 'berlin', timeZone: 'Europe/Berlin' }],
    rooms: [{ id: 'room-berlin', siteId: 'berlin' }],
  };
  const requests = [
    {
      id: 'overnight',
      roomId: 'room-berlin',
      status: 'Confirmed',
      startsAt: '2026-08-30T21:30:00.000Z',
      endsAt: '2026-08-31T01:00:00.000Z',
    },
    {
      id: 'ends-at-midnight',
      roomId: 'room-berlin',
      status: 'Confirmed',
      startsAt: '2026-08-30T20:00:00.000Z',
      endsAt: '2026-08-30T22:00:00.000Z',
    },
    {
      id: 'starts-at-midnight',
      roomId: 'room-berlin',
      status: 'Confirmed',
      startsAt: '2026-08-30T22:00:00.000Z',
      endsAt: '2026-08-30T23:00:00.000Z',
    },
  ];
  const august30 = roomPlanProjection({ catalog, requests, siteId: 'berlin', date: '2026-08-30' });
  const august31 = roomPlanProjection({ catalog, requests, siteId: 'berlin', date: '2026-08-31' });
  assert.deepEqual(
    august30[0].requests.map(({ id }) => id),
    ['overnight', 'ends-at-midnight'],
  );
  assert.deepEqual(
    august31[0].requests.map(({ id }) => id),
    ['overnight', 'starts-at-midnight'],
  );
});

test('production Employee and Manager applications cannot depend on browser persistence authority', async () => {
  const employee = await source(EMPLOYEE_SOURCE);
  const manager = await source(MANAGER_SOURCE);
  for (const moduleSource of [employee, manager]) {
    assert.doesNotMatch(moduleSource, /core\/storage|localStorage|sessionStorage/);
    assert.doesNotMatch(moduleSource, /tenantId|tenant_id|requesterUserId|requester_user_id/);
  }
  assert.match(employee, /persistence\.createRequest/);
  assert.match(employee, /persistence\.checkRoomAvailability/);
  assert.match(employee, /site\?\.timeZone/);
  assert.match(employee, /persistence\.transitionRequest/);
  assert.match(employee, /persistence\.resubmitRequest/);
  assert.match(employee, /persistence\.loadRequestHistory/);
  assert.match(employee, /repeatRequestProjection/);
  assert.match(employee, /printWindow\.print/);
  assert.match(manager, /persistence\.transitionRequest/);
  assert.match(manager, /manager\.roomPlan/);
  assert.match(manager, /persistence\.loadRequestReport/);
  assert.match(employee, /isProductionTimeZone\(timeZone\)/);
  assert.match(employee, /Date\.parse\(startsAt\) <= Date\.now\(\)/);
  assert.match(employee, /totalParticipants > MAX_PARTICIPANTS/);
  assert.match(employee, /entry\.active \|\| entry\.id === request\.roomId/);
  assert.match(employee, /loadOpenBookingChanges/);
  assert.match(manager, /loadOpenBookingChanges/);
  assert.match(manager, /bookingChangeDecisions/);
  assert.match(manager, /bookingChange\.status === 'pending'/);
});

test('production print popup detaches its opener before accessing the new document', async () => {
  const employee = await source(EMPLOYEE_SOURCE);
  const helperStart = employee.indexOf('function openDetachedPrintWindow()');
  const openCall = employee.indexOf("globalThis.window?.open?.('', '_blank')", helperStart);
  const detach = employee.indexOf('printWindow.opener = null', openCall);
  const verifyDetached = employee.indexOf('printWindow.opener !== null', detach);
  const helperEnd = employee.indexOf('\n}', verifyDetached);
  const documentAccess = employee.indexOf('const doc = printWindow.document', helperEnd);

  assert.equal(helperStart >= 0, true);
  assert.equal(openCall > helperStart, true);
  assert.equal(detach > openCall, true);
  assert.equal(verifyDetached > detach, true);
  assert.equal(documentAccess > helperEnd, true);
  assert.doesNotMatch(employee.slice(helperStart, helperEnd), /noopener|noreferrer/);
  assert.match(employee.slice(helperStart, helperEnd), /printWindow\.close\?\.\(\)/);
  assert.match(employee, /const printWindow = openDetachedPrintWindow\(\)/);
});

test('Platform owns shared server persistence and Composition Root uses only server applications', async () => {
  const [app, context, shell] = await Promise.all([
    source(APP_SOURCE), source(CONTEXT_SOURCE), source(SHELL_SOURCE),
  ]);
  assert.match(context, /createProductionPersistence\(\{ apiClient: authenticationRuntime\.apiClient \}\)/);
  assert.match(app, /context\.serverPersistence\(\)/);
  assert.match(app, /refreshTimeoutMs: optionalTimeout/);
  assert.match(app, /await tenantPresentation\.refresh\(\)/);
  assert.match(app, /optionalProjectionTimeoutMs: optionalTimeout/);
  assert.match(app, /createServerEmployeeApplication/);
  assert.match(app, /createServerManagerApplication/);
  assert.match(app, /createServerDraftStore\(\{ tenantId: context\.tenantId\(\), userId: context\.userId\(\) \}\)/);
  assert.doesNotMatch(app, /createDemo|demo-adapter|demo-store|fixtures/);
  assert.doesNotMatch(app, /production-persistence\.js|localStorage|sessionStorage/);
  assert.match(context, /Promise\.allSettled/);
  assert.match(context, /persistence\.loadProfile\(\)/);
  assert.match(context, /persistence\.loadCatalog\(\)/);
  assert.match(context, /persistence\.listRequests\(\)/);
  assert.match(context, /persistence\.listNotifications\(\{ signal \}\)/);
  assert.match(context, /loadBoundedOptionalProjection/);
  assert.match(context, /refreshNotifications/);
  assert.match(shell, /Promise\.allSettled\(\[\s*context\.refreshRequests\(\),\s*context\.refreshNotifications\(\)/);
});

test('production navigation keeps Tenant Admin and Conference Manager capabilities independent', async () => {
  const shell = await source(SHELL_SOURCE);
  assert.match(shell, /nextView === 'manager' && context\.isManager\(\) && manager/);
  assert.match(shell, /nextView === 'tenantAdmin' && context\.canManageTenantUsers\(\) && tenantAdmin/);
  assert.match(shell, /context\.isManager\(\) && manager[\s\S]*nav\.manager/);
  assert.match(shell, /context\.canManageTenantUsers\(\) && tenantAdmin[\s\S]*nav\.tenantAdmin/);
});

test('localized loading is rendered before the production session bootstrap await', async () => {
  const [app, shell] = await Promise.all([source(APP_SOURCE), source(SHELL_SOURCE)]);
  const loadingCall = app.indexOf('renderAppBootstrapLoading();');
  const contextAwait = app.indexOf('const context = await createApplicationContext({');
  assert.equal(loadingCall >= 0, true);
  assert.equal(contextAwait > loadingCall, true);
  assert.match(shell, /auth\.production\.loadingTitle/);
  assert.match(shell, /auth\.production\.loadingText/);
  assert.match(shell, /aria-busy/);
});

test('production workflow refreshes restore focus to the mutated request card', async () => {
  const [employee, manager] = await Promise.all([source(EMPLOYEE_SOURCE), source(MANAGER_SOURCE)]);
  assert.match(employee, /await refresh\(requestId\)/);
  assert.match(employee, /productionRequestId[\s\S]*\.focus\(\)/);
  assert.match(manager, /await refresh\(request\.id\)/);
  assert.match(manager, /productionRequestId[\s\S]*\.focus\(\)/);
});
