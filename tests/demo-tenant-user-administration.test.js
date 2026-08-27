import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoTenantUserAdministration } from '../src/tenant-admin/demo-user-administration.js';
import { createDemoTenantUserOperations } from '../src/tenant-admin/demo-user-operations.js';

const CURRENT_USER_ID = 'demo-current-user';

function createAdministration() {
  return createDemoTenantUserAdministration({
    currentUserId: CURRENT_USER_ID,
    currentDisplayName: 'Demo Admin',
  });
}

test('compatibility and canonical demo factories expose deterministic bounded operational users', async () => {
  assert.equal(createDemoTenantUserAdministration, createDemoTenantUserOperations);
  const administration = createAdministration();
  const page = await administration.listUsers();

  assert.equal(page.users.length, 4);
  assert.deepEqual(page.users[0].roles, ['employee', 'tenant_admin']);
  assert.equal(page.users.some((user) => user.roles.includes('platform_admin')), false);
  assert.equal(page.users.every((user) => Object.isFrozen(user) && Object.isFrozen(user.roles)), true);
  assert.equal(page.users.every((user) => user.requestOwnership.ownershipPreservedOnDisable), true);
});

test('demo filters and cursor pagination are deterministic and make no external calls', async () => {
  const administration = createAdministration();
  const first = await administration.listUsers({ limit: 1, status: 'active' });
  const second = await administration.listUsers({ limit: 1, status: 'active', afterId: first.nextAfterId });
  const search = await administration.listUsers({ search: 'David', providerLink: 'unlinked' });
  assert.equal(first.users.length, 1);
  assert.equal(second.users.length, 1);
  assert.notEqual(first.users[0].id, second.users[0].id);
  assert.deepEqual(search.users.map((user) => user.id), ['demo-employee']);
});

test('demo lifecycle preserves request ownership and rejects self and stale changes', async () => {
  const administration = createAdministration();
  const before = (await administration.listUsers({ search: 'Anna' })).users[0];
  const disabled = await administration.setAccess(before.id, false, before.lifecycle.version);
  assert.equal(disabled.active, false);
  assert.equal(disabled.lifecycle.version, before.lifecycle.version + 1);
  assert.equal(disabled.requestOwnership.openRequestCount, before.requestOwnership.openRequestCount);
  assert.equal(disabled.identityProvider.linked, true);

  await assert.rejects(
    administration.setAccess(CURRENT_USER_ID, false, 1),
    (error) => error.code === 'HTTP_403',
  );
  await assert.rejects(
    administration.setAccess(before.id, true, before.lifecycle.version),
    (error) => error.code === 'TENANT_USER_LIFECYCLE_VERSION_CONFLICT',
  );
});

test('demo role administration retains current security constraints', async () => {
  const administration = createAdministration();
  const updated = await administration.setRoles('demo-employee', ['conference_manager', 'tenant_admin']);
  assert.deepEqual(updated.roles, ['employee', 'conference_manager', 'tenant_admin']);
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

test('demo reset restores the exact initial state', async () => {
  const administration = createAdministration();
  const initial = await administration.listUsers();
  await administration.setRoles('demo-employee', ['conference_manager']);
  const user = (await administration.listUsers({ search: 'David' })).users[0];
  await administration.setAccess(user.id, false, user.lifecycle.version);
  administration.reset();
  assert.deepEqual(await administration.listUsers(), initial);
});
