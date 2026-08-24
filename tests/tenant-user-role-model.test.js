import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TENANT_ELEVATED_ROLE,
  canSelectRole,
  elevatedRolesFromUser,
  normalizeElevatedRoleSelection,
  roleUpdateErrorKey,
  sameRoleSelection,
} from '../src/tenant-admin/user-role-model.js';

const ACTIVE = Object.freeze({
  active: true,
  roles: ['employee', 'conference_manager'],
});
const INACTIVE = Object.freeze({
  active: false,
  roles: ['employee', 'conference_manager'],
});

test('elevated roles are derived in canonical server order', () => {
  assert.deepEqual(elevatedRolesFromUser({
    roles: ['employee', 'tenant_admin', 'conference_manager'],
  }), ['conference_manager', 'tenant_admin']);
  assert.deepEqual(normalizeElevatedRoleSelection(['tenant_admin', 'conference_manager']), [
    'conference_manager',
    'tenant_admin',
  ]);
});

test('inactive users may remove existing elevated roles but cannot receive new ones', () => {
  assert.equal(canSelectRole(INACTIVE, TENANT_ELEVATED_ROLE.CONFERENCE_MANAGER), true);
  assert.equal(canSelectRole(INACTIVE, TENANT_ELEVATED_ROLE.TENANT_ADMIN), false);
  assert.equal(canSelectRole(ACTIVE, TENANT_ELEVATED_ROLE.TENANT_ADMIN), true);
});

test('selection comparison is order-independent after normalization', () => {
  assert.equal(
    sameRoleSelection(['tenant_admin', 'conference_manager'], ['conference_manager', 'tenant_admin']),
    true,
  );
  assert.equal(sameRoleSelection(['conference_manager'], []), false);
});

test('presentation error mapping exposes no backend internals', () => {
  assert.equal(roleUpdateErrorKey('HTTP_409'), 'tenantAdmin.users.errorConflict');
  assert.equal(roleUpdateErrorKey('HTTP_401'), 'tenantAdmin.users.errorSession');
  assert.equal(roleUpdateErrorKey('HTTP_403'), 'tenantAdmin.users.errorForbidden');
  assert.equal(roleUpdateErrorKey('HTTP_404'), 'tenantAdmin.users.errorForbidden');
  assert.equal(roleUpdateErrorKey('DATABASE_DETAIL'), 'tenantAdmin.users.errorGeneric');
});
