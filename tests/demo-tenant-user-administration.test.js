import test from 'node:test';
import assert from 'node:assert/strict';

import { createDemoTenantUserAdministration } from '../src/tenant-admin/demo-user-administration.js';

const CURRENT_USER_ID = 'demo-current-user';

function createAdministration() {
  return createDemoTenantUserAdministration({
    currentUserId: CURRENT_USER_ID,
    currentDisplayName: 'Demo Admin',
  });
}

test('demo Tenant Admin exposes bounded example users without platform authority', async () => {
  const administration = createAdministration();
  const users = await administration.listUsers();

  assert.equal(users.length, 4);
  assert.deepEqual(users[0].roles, ['employee', 'tenant_admin']);
  assert.equal(users.some((user) => user.roles.includes('platform_admin')), false);
  assert.equal(users.every((user) => Object.isFrozen(user) && Object.isFrozen(user.roles)), true);
});

test('demo Tenant Admin can assign elevated roles to an active example user', async () => {
  const administration = createAdministration();
  const updated = await administration.setRoles('demo-employee', ['conference_manager', 'tenant_admin']);

  assert.deepEqual(updated.roles, ['employee', 'conference_manager', 'tenant_admin']);
  const users = await administration.listUsers();
  assert.deepEqual(
    users.find((user) => user.id === 'demo-employee').roles,
    ['employee', 'conference_manager', 'tenant_admin'],
  );
});

test('demo Tenant Admin rejects self changes, unknown roles, and privilege additions to inactive users', async () => {
  const administration = createAdministration();

  await assert.rejects(
    administration.setRoles(CURRENT_USER_ID, []),
    (error) => error.code === 'HTTP_403',
  );
  await assert.rejects(
    administration.setRoles('demo-employee', ['platform_admin']),
    (error) => error.code === 'HTTP_400',
  );
  await assert.rejects(
    administration.setRoles('demo-inactive-manager', ['conference_manager', 'tenant_admin']),
    (error) => error.code === 'HTTP_409',
  );
});

test('demo Tenant Admin allows removing an existing elevated role from an inactive user', async () => {
  const administration = createAdministration();
  const updated = await administration.setRoles('demo-inactive-manager', []);

  assert.deepEqual(updated.roles, ['employee']);
});
