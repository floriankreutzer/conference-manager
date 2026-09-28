import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  formatProductionDateTime,
  isProductionTimeZone,
  productionUtcInstant,
} from '../src/employee/production-time.js';
import {
  repeatRequestProjection,
} from '../src/employee/server-request-projection.js';
import { productionRequestRoomTimeZone } from '../src/shared/request-room-context-loader.js';
import { composeServerRequestDraft } from '../src/shared/production-request-draft.js';
import {
  cateringEditorOptions,
  equipmentEditorOptions,
  normalizeAllocationEditorDraft,
  normalizeCateringEditorDraft,
  roomEditorOptions,
  roomSupportsParticipants,
  serviceEditorOptions,
} from '../src/employee/server-request-editor.js';
import { roomPlanProjection, siteLocalIsoDate } from '../src/manager/server-room-plan.js';

const EMPLOYEE_SOURCE = new URL('../src/employee/production-application.js', import.meta.url);
const EMPLOYEE_CSS_SOURCE = new URL('../assets/employee-ux.css', import.meta.url);
const PRODUCTION_MESSAGES_SOURCE = new URL(
  '../src/core/i18n-production-application-messages.js', import.meta.url,
);
const EMPLOYEE_HISTORY_SOURCE = new URL('../src/employee/server-request-history.js', import.meta.url);
const MANAGER_SOURCE = new URL('../src/manager/production-application.js', import.meta.url);
const APP_SOURCE = new URL('../src/app.js', import.meta.url);
const CONTEXT_SOURCE = new URL('../src/platform/application-context.js', import.meta.url);
const SHELL_SOURCE = new URL('../src/platform/app-shell.js', import.meta.url);
const PRODUCTION_DETAILS_SOURCE = new URL('../src/shared/production-request-details.js', import.meta.url);
const BOOKING_CHANGE_EDITOR_SOURCE = new URL('../src/shared/production-booking-change-editor.js', import.meta.url);
const BOOKING_CHANGE_MODEL_SOURCE = new URL('../src/shared/production-booking-change.js', import.meta.url);
const REQUEST_ROOM_CONTEXT_LOADER_SOURCE = new URL('../src/shared/request-room-context-loader.js', import.meta.url);

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

test('Employee request timezone lookup safely handles an unresolved Room context', () => {
  const catalog = Object.freeze({ sites: Object.freeze([]) });
  assert.equal(productionRequestRoomTimeZone(undefined, catalog, null), null);
  const room = Object.freeze({ id: 'room-a', siteId: 'site-a' });
  const historicalContext = Object.freeze({
    room,
    site: Object.freeze({ id: 'site-a', timeZone: 'Europe/Zurich' }),
  });
  assert.equal(productionRequestRoomTimeZone(room, catalog, historicalContext), 'Europe/Zurich');
  assert.equal(productionRequestRoomTimeZone(room, {
    sites: [{ id: 'site-a', timeZone: 'Europe/Berlin' }],
  }, historicalContext), 'Europe/Berlin');
  assert.equal(productionRequestRoomTimeZone(
    Object.freeze({ id: 'room-b', siteId: 'site-b' }),
    catalog,
    historicalContext,
  ), null);
});

test('server history operation codes are localized on Employee and Manager surfaces', async () => {
  const [employee, employeeHistory, manager] = await Promise.all([
    source(EMPLOYEE_SOURCE), source(EMPLOYEE_HISTORY_SOURCE), source(MANAGER_SOURCE),
  ]);

  assert.match(employee, /renderServerRequestHistory\(entries\)/);
  assert.match(employeeHistory, /t\(`timeline\.operation\.\$\{entry\.operation\}`\)/);
  assert.match(manager, /t\(`timeline\.operation\.\$\{entry\.operation\}`\)/);
  assert.doesNotMatch(employeeHistory, /\$\{entry\.operation\} ·/);
  assert.doesNotMatch(manager, /\$\{entry\.operation\} ·/);
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
    employee.indexOf('const renderSelections'),
    employee.indexOf('const renderCateringControls'),
  );
  assert.ok(serviceRender.indexOf('if (!room.value)') < serviceRender.indexOf('selected.delete'));
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
  assert.match(employee, /scheduleDraftSave = \(options = \{\}\) => \{\s*draftDirty = true;/);
  assert.match(employee, /scheduleDraftSave\(\{ immediate: true \}\);/);
  assert.match(employee, /if \(draftTimer\) clearTimeout\(draftTimer\);\s*draftTimer = null;\s*draftStore\.clear\(\);/);
  assert.match(employee, /allocationRows\.splice\(index, 1\);\s*scheduleDraftSave\(\);/);
  assert.match(employee, /allocationRows\.push\([^;]+;\s*scheduleDraftSave\(\);/);
  assert.match(employee, /roomSupportsParticipants\([\s\S]*requestCatalog\.bookingPolicy\?\.rules\?\.maximumParticipants/);
  assert.match(employee, /if \(!sourceRequest && !restoredDraft && !allocationRows\.length/);
});

test('EMP-01 EMP-02 EMP-03 EMP-06 EMP-07: server-backed Employee editor restores the six-step presentation without changing authority', async () => {
  const [employee, messages] = await Promise.all([
    source(EMPLOYEE_SOURCE), source(PRODUCTION_MESSAGES_SOURCE),
  ]);

  assert.match(employee, /const stepLabels = \[[\s\S]*'request\.step\.review'/);
  assert.match(employee, /dataset: \{ stepPanel: '6' \}/);
  assert.match(employee, /className: 'ux-mobile-progress'/);
  assert.match(employee, /className: 'participant-total'/);
  assert.match(employee, /className: 'selection-grid'/);
  assert.match(employee, /const renderReview = \(\) =>/);
  assert.match(employee, /key !== null && key === verifiedAvailabilityKey/);
  assert.match(employee, /String\(value\)\.trim\(\) === ''/);
  assert.match(employee, /next\.disabled = activeStep === 2 && !isAvailabilityVerified\(\)/);
  assert.match(employee, /type: 'radio',[\s\S]*name: 'productionRoomChoice'/);
  assert.match(employee, /roomAssetPreviewState\(entry\)/);
  assert.match(employee, /openRoomPreview\(entry, preview, index\)/);
  assert.match(employee, /production\.employee\.roomAssetsPrivacy/);
  assert.match(messages, /Grundriss des Raums/);
  assert.match(messages, /Floor plan for room/);
  assert.match(employee, /managedRoomMedia\(entry\)/);
  assert.match(employee, /roomPreviewVisual\(managed\.floorplan/);
  assert.doesNotMatch(employee, /room-floorplan-table|room-floorplan-door/);
  assert.doesNotMatch(messages, /Freigegebene (?:Raum|Grundriss)|Approved (?:room|floor-plan)/);
  assert.match(employee, /buildServerRequestReview\(\{/);
  assert.match(employee, /className: 'details-list review-details'/);
  assert.match(employee, /dataset: \{ reviewSection: section \}/);
  assert.match(employee, /let activeStep = restoredDraft\?\.activeStep \|\| 1;/);
  assert.match(employee, /activeStep,\s*\}\);/);
  assert.doesNotMatch(employee, /const room = el\('select'\)/);
  assert.doesNotMatch(employee, /t\('settings\.catalogue\.title'\)/);
});

test('EMP-05: Catering uses native package choices and quantity cards without inventing image sources', async () => {
  const [employee, css] = await Promise.all([
    source(EMPLOYEE_SOURCE), source(EMPLOYEE_CSS_SOURCE),
  ]);
  const catering = employee.slice(
    employee.indexOf('const renderCateringControls'),
    employee.indexOf('const activeCostCenterIds'),
  );

  assert.match(catering, /className: 'catering-option-fieldset'/);
  assert.match(catering, /className: 'catering-package-grid'/);
  assert.match(catering, /className: 'catering-item-grid'/);
  assert.match(catering, /type: 'radio', name: 'productionCateringPackage'/);
  assert.match(catering, /const noPackageCard = el\('label'/);
  assert.match(catering, /const card = el\('label', \{\s*className: `option-card catering-variant-card/);
  assert.match(catering, /production\.employee\.cateringIncludedItems/);
  assert.match(catering, /production\.employee\.cateringQuantity/);
  assert.doesNotMatch(catering, /(?:src|href):\s*(?:item|packageEntry)/);
  assert.match(css, /\.catering-variant-card:has\(input:focus-visible\)/);
});

test('EMP-13: Employee cancellation is confirmation-gated, lock-safe, and never deletes a Request', async () => {
  const employee = await source(EMPLOYEE_SOURCE);
  const confirmation = employee.slice(
    employee.indexOf('function openEmployeeCancellationConfirmation'),
    employee.indexOf('function compositionDraft'),
  );
  const requestCardCancellation = employee.slice(
    employee.indexOf('if (CANCELLABLE_STATUSES.has(request.status))'),
    employee.indexOf("const history = button(t('production.manager.historyTab'))"),
  );

  assert.match(confirmation, /openDialog\(\{/);
  assert.match(confirmation, /dataset\.sessionLocked === 'true'/);
  assert.match(confirmation, /await confirmAction\(\)/);
  assert.match(requestCardCancellation, /onCancelConfirmation\(/);
  assert.match(employee, /authoritySurfaces\.track\(openEmployeeCancellationConfirmation/);
  assert.doesNotMatch(requestCardCancellation, /void runMutation\(\(\) => onCancel/);
  assert.doesNotMatch(employee, /deleteRequest|method:\s*['"]DELETE['"]/);
});

test('EMP-04: Service and Equipment choices use native grouped card semantics and localized prices', async () => {
  const employee = await source(EMPLOYEE_SOURCE);
  const selectionRender = employee.slice(
    employee.indexOf("const servicePanel = el('fieldset'"),
    employee.indexOf('const roomSelectionGrid'),
  );

  assert.match(selectionRender, /const servicePanel = el\('fieldset'/);
  assert.match(selectionRender, /const equipmentPanel = el\('fieldset'/);
  assert.match(selectionRender, /el\('legend', \{ className: 'selection-group-legend'/);
  assert.match(selectionRender, /className: `option-card selection-option-card/);
  assert.match(selectionRender, /className: 'price'/);
  assert.match(selectionRender, /uxPriceBasis: 'request'/);
  assert.match(selectionRender, /t\('price\.perRequest'\)/);
  assert.doesNotMatch(selectionRender, /selection-card/);
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

test('Employee and Manager share one capability-independent booking-change editor', async () => {
  const [employee, manager, editor] = await Promise.all([
    source(EMPLOYEE_SOURCE),
    source(MANAGER_SOURCE),
    source(BOOKING_CHANGE_EDITOR_SOURCE),
  ]);
  for (const application of [employee, manager]) {
    assert.match(application, /from '\.\.\/shared\/production-booking-change-editor\.js'/);
    assert.match(application, /openProductionBookingChangeDialog/);
  }
  assert.doesNotMatch(editor, /\.\.\/(?:employee|manager|tenant-admin|platform)\//);
  assert.match(editor, /persistence\.proposeBookingChange/);
  assert.match(editor, /composeServerRequestDraft/);
  assert.doesNotMatch(manager, /\.\.\/employee\//);
  assert.match(manager, /transitionRequest\(request\.id, \{ transition: 'cancel' \}, request\)/);
  assert.doesNotMatch(manager, /deleteRequest|method:\s*['"]DELETE['"]/);
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
      { id: 'global', active: true, order: 0, siteIds: [], roomIds: [] },
      { id: 'site', active: true, order: 1, siteIds: ['site-1'], roomIds: [] },
      { id: 'room', active: true, order: 2, siteIds: [], roomIds: ['room-1'] },
      { id: 'other-site', active: true, order: 0, siteIds: ['site-2'], roomIds: [] },
      { id: 'other-room', active: true, order: 0, siteIds: [], roomIds: ['room-2'] },
      { id: 'inactive', active: false, order: 0, siteIds: [], roomIds: [] },
    ],
  };
  assert.deepEqual(
    serviceEditorOptions(catalog, 'room-1').map(({ id }) => id),
    ['global', 'site', 'room'],
  );
  assert.deepEqual(serviceEditorOptions(catalog, ''), []);
});

test('Employee editor exposes only active Equipment applicable to the selected authoritative room and site', () => {
  const catalog = {
    rooms: [{ id: 'room-1', siteId: 'site-1' }],
    equipment: [
      { id: 'global', active: true, order: 0, siteIds: [], roomIds: [] },
      { id: 'site', active: true, order: 1, siteIds: ['site-1'], roomIds: [] },
      { id: 'room', active: true, order: 2, siteIds: [], roomIds: ['room-1'] },
      { id: 'other-site', active: true, order: 0, siteIds: ['site-2'], roomIds: [] },
      { id: 'other-room', active: true, order: 0, siteIds: [], roomIds: ['room-2'] },
      { id: 'inactive', active: false, order: 0, siteIds: [], roomIds: [] },
    ],
  };
  assert.deepEqual(
    equipmentEditorOptions(catalog, 'room-1').map(({ id }) => id),
    ['global', 'site', 'room'],
  );
  assert.deepEqual(equipmentEditorOptions(catalog, ''), []);
});

test('Employee editor orders applicable Services and Equipment by configured order then identifier', () => {
  const entries = [
    { id: 'alpha-last', active: true, order: 20, siteIds: [], roomIds: [] },
    { id: 'zulu-second', active: true, order: 1, siteIds: [], roomIds: [] },
    { id: 'beta-first', active: true, order: 1, siteIds: [], roomIds: [] },
  ];
  const catalog = {
    rooms: [{ id: 'room-1', siteId: 'site-1' }],
    services: entries,
    equipment: entries,
  };
  const expected = ['beta-first', 'zulu-second', 'alpha-last'];

  assert.deepEqual(serviceEditorOptions(catalog, 'room-1').map(({ id }) => id), expected);
  assert.deepEqual(equipmentEditorOptions(catalog, 'room-1').map(({ id }) => id), expected);
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
  const bookingChangeEditor = await source(BOOKING_CHANGE_EDITOR_SOURCE);
  const bookingChangeModel = await source(BOOKING_CHANGE_MODEL_SOURCE);
  const roomContextLoader = await source(REQUEST_ROOM_CONTEXT_LOADER_SOURCE);
  for (const moduleSource of [employee, manager]) {
    assert.doesNotMatch(moduleSource, /core\/storage|localStorage|sessionStorage/);
    assert.doesNotMatch(moduleSource, /tenantId|tenant_id|requesterUserId|requester_user_id/);
  }
  assert.match(employee, /persistence\.createRequest/);
  assert.match(employee, /persistence\.checkRoomAvailability/);
  assert.match(employee, /productionRequestRoomTimeZone/);
  assert.match(roomContextLoader, /site\?\.timeZone/);
  assert.match(roomContextLoader, /room && currentRoomContext\?\.site\?\.id === room\.siteId/);
  assert.match(employee, /persistence\.transitionRequest/);
  assert.match(employee, /persistence\.resubmitRequest/);
  assert.match(employee, /currentRequest\.version > sourceRequest\.version/);
  assert.match(employee, /entry\.price\.currency/);
  assert.match(employee, /persistence\.loadRequestHistory/);
  assert.match(employee, /repeatRequestProjection/);
  assert.match(employee, /printWindow\.print/);
  assert.match(manager, /persistence\.transitionRequest/);
  assert.match(manager, /manager\.roomPlan/);
  const analytics = await source(new URL('../src/manager/server-analytics-view.js', import.meta.url));
  assert.match(analytics, /error\.textContent = t\('validation\.date'\)/);
  assert.match(analytics, /roomPlanProjection\(\{ catalog, requests/);
  assert.match(analytics, /date\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(analytics, /results\.replaceChildren\(\)/);
  assert.match(manager, /persistence\.loadRequestReport/);
  assert.match(employee, /isProductionTimeZone\(timeZone\)/);
  assert.match(bookingChangeModel, /Date\.parse\(startsAt\) <= now/);
  assert.match(bookingChangeModel, /total > PRODUCTION_BOOKING_CHANGE_MAX_PARTICIPANTS/);
  assert.match(bookingChangeEditor, /catalog\.rooms\.filter\(\(entry\) => \(\s*entry\.active/);
  assert.match(
    bookingChangeEditor,
    /value: currentRoomContext\.room\.id,[\s\S]*attrs: \{ disabled: 'disabled' \}/,
  );
  assert.doesNotMatch(bookingChangeEditor, /entry\.active \|\| entry\.id === request\.roomId/);
  assert.match(employee, /loadOpenBookingChanges/);
  assert.match(manager, /loadOpenBookingChanges/);
  assert.match(employee, /canProposeProductionBookingChange\(request\.status, openChange\)/);
  assert.match(manager, /requestMutations/);
  assert.match(manager, /bookingChange\.status === 'pending'/);
});

test('MGR-01: Production Manager restores four server-backed cockpit workspaces', async () => {
  const [manager, workspace, analytics, model] = await Promise.all([
    source(MANAGER_SOURCE),
    source(new URL('../src/manager/workspace-application.js', import.meta.url)),
    source(new URL('../src/manager/server-analytics-view.js', import.meta.url)),
    source(new URL('../src/manager/server-cockpit-model.js', import.meta.url)),
  ]);
  assert.match(manager, /role: 'tablist'/);
  assert.match(manager, /\['BOOKINGS', 'manager\.ready\.bookingsTab'\]/);
  assert.match(manager, /\['ROOM_PLAN', 'manager\.roomPlan'\]/);
  assert.match(manager, /\['REPORTS', 'manager\.reports'\]/);
  assert.match(model, /const catering = request\.details\?\.catering/);
  assert.match(model, /catering\?\.packageSelection/);
  assert.match(model, /catering\?\.itemQuantities/);
  assert.doesNotMatch(manager, /cateringPackageId|cateringQuantities/);
  assert.match(manager, /\['ADMIN', 'manager\.admin'\]/);
  assert.match(manager, /className: 'dashboard-grid'/);
  assert.match(analytics, /production\.manager\.utilizationReport/);
  assert.match(analytics, /production\.manager\.serviceReport/);
  assert.match(analytics, /production\.manager\.cateringReport/);
  assert.match(workspace, /onOpenBusinessSettings:[\s\S]*renderManagerSettings/);
});

test('EMP-15: every print popup uses the shared detached, secret-free, lifecycle-bound surface', async () => {
  const [employee, helper, inactivity, demoSecurity, shell] = await Promise.all([
    source(EMPLOYEE_SOURCE),
    source(new URL('../src/shared/detached-print-window.js', import.meta.url)),
    source(new URL('../src/platform/inactivity-lock.js', import.meta.url)),
    source(new URL('../src/platform/demo-security.js', import.meta.url)),
    source(SHELL_SOURCE),
  ]);
  const detach = helper.indexOf('printWindow.opener = null');
  const verifyDetached = helper.indexOf('printWindow.opener !== null', detach);
  const register = helper.indexOf('detachedPrintWindows.add(printWindow)', verifyDetached);
  const documentAccess = helper.indexOf('const doc = printWindow.document', register);
  assert.equal(detach >= 0, true);
  assert.equal(verifyDetached > detach, true);
  assert.equal(register > verifyDetached, true);
  assert.equal(documentAccess > register, true);
  assert.match(helper, /default-src 'none'/);
  assert.match(helper, /script-src 'none'/);
  assert.match(helper, /img-src 'none'/);
  assert.match(helper, /connect-src 'none'/);
  assert.match(helper, /url\\s\*\\\(|@import|@font-face/);
  assert.match(helper, /documentElement[\s\S]*replaceChildren/);
  assert.match(helper, /pagehide', closeDetachedPrintWindows/);
  assert.match(helper, /beforeunload', closeDetachedPrintWindows/);

  for (const printSource of [employee]) {
    assert.match(printSource, /openDetachedPrintWindow/);
    assert.match(printSource, /initializeDetachedPrintDocument/);
    assert.doesNotMatch(printSource, /window\.open\(/);
    assert.doesNotMatch(printSource, /doc\.title\s*=/);
  }
  assert.doesNotMatch(employee, /wifiPassword|wifiInstructions|LOCAL_ROUTE_CODES|<img/);
  assert.doesNotMatch(employee, /title: `\$\{t\('requests\.pdf'\)\}[^`]*request\.id/);
  const productionPrint = employee.slice(
    employee.indexOf('function printRequest('),
    employee.indexOf('function openGuestInfo('),
  );
  assert.doesNotMatch(productionPrint, /roomLabel\(room \|\| \{ id: request\.roomId \}\)/);
  assert.match(employee, /onAbort: \(\) => closeDetachedPrintWindow\(printWindow\)/);
  assert.match(inactivity, /renderLocked\(\)[\s\S]*closeDetachedPrintWindows\(\)/);
  assert.match(demoSecurity, /closeDetachedPrintWindows\(\);[\s\S]*switchDemoContext/);
  assert.match(shell, /logout\.disabled = true;[\s\S]*closeDetachedPrintWindows\(\);[\s\S]*authentication\.signOut\(\);[\s\S]*invalidateAuthorityProjection\(error\)/);

  const printCallback = employee.indexOf('onPrint: (target) =>');
  const reservedWindow = employee.indexOf('const printWindow = openDetachedPrintWindow()', printCallback);
  const guestLoad = employee.indexOf('return withGuestRoomContext(', reservedWindow);
  assert.equal(printCallback >= 0, true);
  assert.equal(reservedWindow > printCallback, true);
  assert.equal(guestLoad > reservedWindow, true);
  for (const key of [
    'guest.arrival',
    'guest.publicAvailability',
    'guest.publicArrival',
    'guest.publicFeature',
    'guest.route',
    'room.floor',
  ]) assert.match(employee, new RegExp(key.replace('.', '\\.')));
  assert.doesNotMatch(productionPrint, /guest\?\.wifiNetworkName/);
  assert.match(employee, /route\.href = guest\.routeUrl/);
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
  assert.match(app, /createServerDraftStore\(\{[\s\S]*tenantId: context\.tenantId\(\),[\s\S]*userId: context\.userId\(\),[\s\S]*sessionExpiresAt: context\.sessionExpiresAt\(\),/);
  assert.doesNotMatch(app, /createDemo|demo-adapter|demo-store|fixtures/);
  assert.doesNotMatch(app, /production-persistence\.js|localStorage|sessionStorage/);
  assert.match(context, /Promise\.allSettled/);
  assert.match(context, /persistence\.loadProfile\(\{ signal \}\)/);
  assert.match(context, /persistence\.loadCatalog\(\{ signal \}\)/);
  assert.match(context, /persistence\.listRequests\(\{ signal \}\)/);
  assert.match(context, /persistence\.listNotifications\(\{ signal \}\)/);
  assert.match(context, /loadBoundedProjection/);
  assert.match(context, /refreshNotifications/);
  assert.match(shell, /Promise\.allSettled\(\[\s*context\.refreshRequests\(\),\s*context\.reloadReferenceData\(\),\s*context\.refreshNotifications\(\)/);
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
  assert.match(employee, /await refresh\(request\.id\)/);
  assert.match(employee, /const requestMutations = new Map\(\)/);
  assert.match(employee, /productionRequestId[\s\S]*\.focus\(\)/);
  assert.match(manager, /await refresh\(request\.id\)/);
  assert.match(manager, /productionRequestId[\s\S]*\.focus\(\)/);
});

test('Employee Requests restores the server-backed list and calendar presentation contract', async () => {
  const employee = await source(EMPLOYEE_SOURCE);
  assert.match(employee, /projectServerRequestCalendar\(\s*requests, nextCatalog, roomContexts/);
  assert.match(employee, /requests\.list[\s\S]*requests\.calendar/);
  assert.match(employee, /aria-pressed[\s\S]*requestDisplay === 'calendar'/);
  assert.match(employee, /renderServerRequestCalendar\(\{/);
  assert.match(employee, /onSelect:[\s\S]*showDisplay\('list'\)[\s\S]*productionRequestId[\s\S]*\.focus\(\)/);
});

test('EMP-08: successful Employee submissions expose a persistent accessible completion state', async () => {
  const employee = await source(EMPLOYEE_SOURCE);
  assert.match(employee, /submissionNotice = Object\.freeze\(\{[\s\S]*requestId: submittedRequest\.id/);
  assert.match(employee, /dataset: \{ uxSubmissionSuccess: 'true' \}[\s\S]*role: 'status', tabindex: '-1'/);
  assert.match(employee, /submission\.resubmittedTitle[\s\S]*submission\.sentTitle/);
  assert.match(employee, /submissionNotice === currentNotice[\s\S]*isInteractiveProjection\(generation\)[\s\S]*productionRequestId === currentNotice\.requestId[\s\S]*\.focus\(\)/);
  assert.match(employee, /else if \(isCurrent\(generation\)\)[\s\S]*querySelector\('\.error-box'\)[\s\S]*\.focus\(\)/);
  assert.match(employee, /pendingSubmissionFocusRequestId = currentNotice\.requestId/);
  assert.match(employee, /const restorePendingSubmissionFocus = \(generation\) =>[\s\S]*productionRequestId === requestId[\s\S]*querySelector\(':scope > \.error-box'\)[\s\S]*getElementById\('viewTitle'\)/);
  assert.match(employee, /production\.employee\.loadError[\s\S]*renderSubmissionNotice\(generation\)/);
});

test('Employee Request history uses the localized server-backed timeline renderer', async () => {
  const [employee, history] = await Promise.all([
    source(EMPLOYEE_SOURCE), source(EMPLOYEE_HISTORY_SOURCE),
  ]);
  assert.match(employee, /renderServerRequestHistory\(entries\)/);
  assert.match(employee, /dialog\.addEventListener\('close',[\s\S]*isCurrentInteraction\(\)[\s\S]*control\.focus\(\)/);
  assert.match(history, /className: 'request-timeline'/);
  assert.match(history, /el\('ol'\)/);
  assert.match(history, /status\.\$\{entry\.request\.status\}/);
});

test('Employee editor and proposal lifecycles reject detached or duplicate async work', async () => {
  const employee = await source(EMPLOYEE_SOURCE);
  const editor = employee.slice(
    employee.indexOf('async function renderRequest()'),
    employee.indexOf('async function renderRequests()'),
  );
  const requests = employee.slice(employee.indexOf('async function renderRequests()'));

  assert.match(employee, /let editorRenderGeneration = 0;/);
  assert.match(editor, /const generation = \+\+editorRenderGeneration;/);
  assert.match(editor, /generation === editorRenderGeneration[\s\S]*root\.parentNode === appRoot/);
  assert.match(editor, /requestCatalog = await persistence\.loadCatalog\(\);\s*if \(!isCurrentEditor\(\)\) return;\s*catalog = requestCatalog;/);
  assert.match(editor, /if \(!draftDirty \|\| !isCurrentEditor\(\)\) return;/);
  assert.match(editor, /await persistence\.createRequest\([\s\S]*if \(!isCurrentEditor\(\)\) return;/);
  assert.match(
    editor,
    /catch \(error\) \{\s*if \(authorityFailureCode\(error\)\) \{\s*invalidateEditorAuthority\(error\);\s*return;\s*\}\s*if \(!isCurrentEditor\(\)\) return;\s*invalidateAvailability\(\);/,
  );
  assert.match(editor, /compositionDraft\(sourceRequest, requestCatalog, overrides\)/);
  assert.match(requests, /reserveRequestMutation\(target\.id, 'proposal'\)/);
  assert.match(requests, /mutationInFlight: \(\) => requestMutations\.has\(request\.id\)/);
  assert.match(requests, /activeMutation\?\.kind === 'cancel'/);
  assert.match(requests, /dialog\.addEventListener\('close',[\s\S]*releaseProposal\(\)/);
});

test('Employee refresh invalidates the complete interactive projection on 401/403 only', async () => {
  const employee = await source(EMPLOYEE_SOURCE);
  const requests = employee.slice(employee.indexOf('async function renderRequests()'));
  assert.match(requests, /let authorityProjectionInvalid = false/);
  assert.match(
    requests,
    /isActiveSurface = \(\) => \([\s\S]*dataset\.sessionLocked !== 'true'[\s\S]*!authorityProjectionInvalid/,
  );
  assert.match(
    requests,
    /invalidateAuthorityProjection = \(error\) => \{[\s\S]*authorityProjectionInvalid = true;[\s\S]*closeDetachedPrintWindows\(\);[\s\S]*requestMutations\.clear\(\);[\s\S]*authoritySurfaces\.closeAll\(\);/,
  );
  assert.match(
    requests,
    /hasCommittedProjection = false;[\s\S]*committedProjectionGeneration = 0;[\s\S]*interactiveProjectionGeneration = 0;[\s\S]*clear\(root\);/,
  );
  assert.match(requests, /text: errorMessage\(error\)[\s\S]*role: 'status'[\s\S]*status\.focus\(\)/);
  assert.match(requests, /authorityFailureCode\(error\) !== null;[\s\S]*invalidateAuthorityProjection\(error\)/);
  assert.match(
    requests,
    /if \(hasCommittedProjection && focusRequestId === null\) \{[\s\S]*interactiveProjectionGeneration = committedProjectionGeneration;[\s\S]*showToast/,
  );
});

test('all Customer authority failures delegate to one shell and context invalidation boundary', async () => {
  const [app, context, shell, employee, manager, workspace, businessSettings, tenantRegistry,
    bookingEditor, analytics, demoBootstrap, demoSecurity] = await Promise.all([
    source(APP_SOURCE),
    source(CONTEXT_SOURCE),
    source(SHELL_SOURCE),
    source(EMPLOYEE_SOURCE),
    source(MANAGER_SOURCE),
    source(new URL('../src/manager/workspace-application.js', import.meta.url)),
    source(new URL('../src/manager/business-settings-application.js', import.meta.url)),
    source(new URL('../src/tenant-admin/section-registry.js', import.meta.url)),
    source(BOOKING_CHANGE_EDITOR_SOURCE),
    source(new URL('../src/manager/server-analytics-view.js', import.meta.url)),
    source(new URL('../src/platform/demo-bootstrap.js', import.meta.url)),
    source(new URL('../src/platform/demo-security.js', import.meta.url)),
  ]);

  assert.match(app, /const onAuthorityFailure = \(error\) => shell\?\.invalidateAuthorityProjection\(error\)/);
  assert.match(app, /createServerEmployeeApplication\(\{[\s\S]*onAuthorityFailure,/);
  assert.match(app, /createServerManagerApplication\(\{[\s\S]*onAuthorityFailure,/);
  assert.match(app, /createTenantAdminApplication\(\{[\s\S]*onAuthorityFailure,/);
  assert.match(context, /function invalidateAuthority\(error\)[\s\S]*trustedSession = null;[\s\S]*roles\.clear\(\);[\s\S]*profile = EMPTY_PROFILE;[\s\S]*notifications = EMPTY_NOTIFICATIONS;/);
  assert.match(shell, /function invalidateAuthorityProjection\(error\)[\s\S]*invalidatePendingRender\(\);[\s\S]*closeDetachedPrintWindows\(\);[\s\S]*clear\(navigationRoot\);[\s\S]*closeAuthorityDialogs\(\)/);
  assert.match(shell, /authorityFailure = \[requestResult, referenceResult, notificationResult\][\s\S]*invalidateAuthorityProjection\(authorityFailure\.reason\)[\s\S]*revision !== renderRevision/);
  assert.match(shell, /interactionRevision === renderRevision[\s\S]*context\.isAuthenticated\(\)[\s\S]*openHelp\(\)/);
  assert.match(shell, /catch \(error\) \{\s*if \(invalidateAuthorityProjection\(error\)\) return;\s*logout\.disabled = false;/);
  assert.match(employee, /authoritySurfaces\.closeAll\(\);\s*if \(onAuthorityFailure\?\.\(error\)\) return true;\s*if \(!root\.isConnected\) return false;/);
  assert.match(manager, /authoritySurfaces\.closeAll\(\);\s*if \(onAuthorityFailure\?\.\(error\)\) return true;\s*if \(!root\.isConnected\) return false;/);
  assert.match(workspace, /onOpenBusinessSettings: \(panel, invalidateAuthorityProjection, \{ focusHeading = false \} = \{\}\)[\s\S]*onAuthorityFailure: invalidateAuthorityProjection/);
  assert.match(businessSettings, /function handleAuthorityFailure\(error\) \{\s*if \(!authorityFailureCode\(error\)\) return false;\s*onAuthorityFailure\(error\)/);
  assert.match(businessSettings, /catch \(error\) \{\s*if \(handleAuthorityFailure\(error\)\) return;\s*if \(!isCurrentRender/);
  assert.match(tenantRegistry, /authorityAwareAdapter[\s\S]*authorityFailureCode\(error\)[\s\S]*onAuthorityFailure\(error\)/);
  assert.match(bookingEditor, /catch \(caught\) \{\s*if \(authorityFailureCode\(caught\)\)[\s\S]*if \(!dialog\.isConnected\) return;/);
  assert.match(analytics, /catch \(caught\) \{\s*if \(authorityFailureCode\(caught\)\)[\s\S]*if \(!isCurrent\(\)/);
  assert.match(demoBootstrap, /onAuthorityFailure: application\.shell\.invalidateAuthorityProjection/);
  assert.match(demoSecurity, /catch \(error\) \{\s*delete documentRoot\.documentElement\.dataset\.demoContextSwitching;\s*if \(authorityFailureCode\(error\) && onAuthorityFailure\?\.\(error\)\) return;/);
});
