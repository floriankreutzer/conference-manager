import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  formatProductionDateTime,
  isProductionTimeZone,
  productionUtcInstant,
} from '../src/employee/production-time.js';

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
  assert.match(manager, /persistence\.transitionRequest/);
  assert.match(employee, /isProductionTimeZone\(timeZone\)/);
  assert.match(employee, /Date\.parse\(startsAt\) <= Date\.now\(\)/);
  assert.match(employee, /loadOpenBookingChanges/);
  assert.match(manager, /loadOpenBookingChanges/);
  assert.match(manager, /decisionInFlight/);
});

test('Platform owns production persistence and Composition Root preserves demo applications', async () => {
  const [app, context] = await Promise.all([source(APP_SOURCE), source(CONTEXT_SOURCE)]);
  assert.match(context, /createProductionPersistence\(\{ apiClient: authenticationRuntime\.apiClient \}\)/);
  assert.match(app, /context\.productionPersistence\(\)/);
  assert.match(app, /context\.isDemoRuntime\(\)[\s\S]*createEmployeeApplication/);
  assert.match(app, /context\.isDemoRuntime\(\)[\s\S]*createManagerApplication/);
  assert.doesNotMatch(app, /production-persistence\.js|localStorage|sessionStorage/);
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
  const contextAwait = app.indexOf('const context = await createApplicationContext();');
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
