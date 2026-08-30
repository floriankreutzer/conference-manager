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
import { roomPlanProjection, siteLocalIsoDate } from '../src/manager/server-room-plan.js';

const EMPLOYEE_SOURCE = new URL('../src/employee/production-application.js', import.meta.url);
const MANAGER_SOURCE = new URL('../src/manager/production-application.js', import.meta.url);
const APP_SOURCE = new URL('../src/app.js', import.meta.url);
const CONTEXT_SOURCE = new URL('../src/platform/application-context.js', import.meta.url);
const SHELL_SOURCE = new URL('../src/platform/app-shell.js', import.meta.url);

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
  const repeated = repeatRequestProjection(source, Date.parse('2026-08-30T10:00:00.000Z'));
  assert.equal(repeated.startsAt, '2026-08-31T08:00:00.000Z');
  assert.equal(repeated.endsAt, '2026-08-31T09:30:00.000Z');
  assert.equal(repeated.details, source.details);
  assert.equal(source.startsAt, '2026-08-03T08:00:00.000Z');
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
  }];
  const berlin = roomPlanProjection({ catalog, requests, siteId: 'berlin', date: '2026-08-31' });
  const newYork = roomPlanProjection({ catalog, requests, siteId: 'new-york', date: '2026-08-30' });
  assert.deepEqual(berlin.map((entry) => entry.requests.map((request) => request.id)), [['request-1']]);
  assert.deepEqual(newYork.map((entry) => entry.requests.map((request) => request.id)), [[]]);
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

test('Platform owns shared server persistence and Composition Root uses only server applications', async () => {
  const [app, context] = await Promise.all([source(APP_SOURCE), source(CONTEXT_SOURCE)]);
  assert.match(context, /createProductionPersistence\(\{ apiClient: authenticationRuntime\.apiClient \}\)/);
  assert.match(app, /context\.serverPersistence\(\)/);
  assert.match(app, /createServerEmployeeApplication/);
  assert.match(app, /createServerManagerApplication/);
  assert.doesNotMatch(app, /createDemo|demo-adapter|demo-store|fixtures/);
  assert.doesNotMatch(app, /production-persistence\.js|localStorage|sessionStorage/);
  assert.match(context, /Promise\.allSettled/);
  assert.match(context, /persistence\.loadProfile\(\)/);
  assert.match(context, /persistence\.loadCatalog\(\)/);
  assert.match(context, /persistence\.listRequests\(\)/);
  assert.match(context, /persistence\.listNotifications\(\)/);
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
