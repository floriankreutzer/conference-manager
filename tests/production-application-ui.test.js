import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { productionUtcInstant } from '../src/employee/production-application.js';

const EMPLOYEE_SOURCE = new URL('../src/employee/production-application.js', import.meta.url);
const MANAGER_SOURCE = new URL('../src/manager/production-application.js', import.meta.url);
const APP_SOURCE = new URL('../src/app.js', import.meta.url);
const CONTEXT_SOURCE = new URL('../src/platform/application-context.js', import.meta.url);
const SHELL_SOURCE = new URL('../src/platform/app-shell.js', import.meta.url);

async function source(url) {
  return readFile(url, 'utf8');
}

test('production request time conversion uses a valid UTC machine timestamp', () => {
  const result = productionUtcInstant('2026-09-15', '09:30');
  assert.equal(typeof result, 'string');
  assert.match(result, /^2026-09-15T\d{2}:30:00\.000Z$/);
  assert.equal(productionUtcInstant('not-a-date', '09:30'), null);
  assert.equal(productionUtcInstant('2026-09-15', 'bad-time'), null);
});

test('production Employee and Manager applications cannot depend on browser persistence authority', async () => {
  const employee = await source(EMPLOYEE_SOURCE);
  const manager = await source(MANAGER_SOURCE);
  for (const moduleSource of [employee, manager]) {
    assert.doesNotMatch(moduleSource, /core\/storage|localStorage|sessionStorage/);
    assert.doesNotMatch(moduleSource, /tenantId|tenant_id|requesterUserId|requester_user_id/);
  }
  assert.match(employee, /persistence\.createRequest/);
  assert.match(employee, /persistence\.transitionRequest/);
  assert.match(manager, /persistence\.transitionRequest/);
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
