import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TenantUserAdministrationError,
  canonicalElevatedRoles,
  createTenantUserAdministrationService,
  validateTenantUserPage,
} from '../src/platform/tenant-user-administration.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CURSOR_ID = '22222222-2222-4222-8222-222222222222';

function tenantUser(overrides = {}) {
  return {
    id: USER_ID,
    displayName: 'Tenant User',
    active: true,
    roles: ['employee', 'conference_manager'],
    ...overrides,
  };
}

test('tenant user pages accept only minimized user data and a matching server cursor', () => {
  const page = validateTenantUserPage({
    users: [tenantUser()],
    nextAfterId: USER_ID,
    requestId: 'correlation-only',
  });
  assert.equal(page.users[0].id, USER_ID);
  assert.deepEqual(page.users[0].roles, ['employee', 'conference_manager']);
  assert.equal(Object.hasOwn(page.users[0], 'tenantId'), false);

  assert.throws(
    () => validateTenantUserPage({
      users: [tenantUser({ tenantId: 'browser-authority-must-not-be-accepted' })],
      nextAfterId: USER_ID,
    }),
    (error) => error instanceof TenantUserAdministrationError && error.code === 'TENANT_USER_INVALID',
  );
  assert.throws(
    () => validateTenantUserPage({ users: [tenantUser()], nextAfterId: CURSOR_ID }),
    (error) => error instanceof TenantUserAdministrationError && error.code === 'TENANT_USER_CURSOR_INVALID',
  );
});

test('elevated roles are canonical, bounded and cannot include platform authority', () => {
  assert.deepEqual(canonicalElevatedRoles([]), []);
  assert.deepEqual(canonicalElevatedRoles(['conference_manager', 'tenant_admin']), [
    'conference_manager',
    'tenant_admin',
  ]);
  assert.throws(
    () => canonicalElevatedRoles(['tenant_admin', 'conference_manager']),
    (error) => error instanceof TenantUserAdministrationError && error.code === 'TENANT_USER_ROLES_INVALID',
  );
  assert.throws(
    () => canonicalElevatedRoles(['platform_admin']),
    (error) => error instanceof TenantUserAdministrationError && error.code === 'TENANT_USER_ROLES_INVALID',
  );
});

test('tenant user service uses bounded cursor pagination and sends no client-selected Tenant identity', async () => {
  const calls = [];
  const apiClient = {
    async request(path, options = {}) {
      calls.push({ path, options });
      if (options.method === 'PUT') {
        return {
          user: tenantUser({ roles: ['employee', 'tenant_admin'] }),
          requestId: 'mutation-correlation',
        };
      }
      return {
        users: [tenantUser()],
        nextAfterId: USER_ID,
        requestId: 'list-correlation',
      };
    },
  };
  const service = createTenantUserAdministrationService({ apiClient });

  const page = await service.listUsers({ limit: 20, afterId: CURSOR_ID });
  assert.equal(page.nextAfterId, USER_ID);
  assert.equal(calls[0].path, `v1/tenant/users?limit=20&afterId=${CURSOR_ID}`);
  assert.equal(calls[0].path.includes('tenantId'), false);
  assert.deepEqual(calls[0].options, {});

  const updated = await service.setElevatedRoles({ userId: USER_ID, roles: ['tenant_admin'] });
  assert.deepEqual(updated.roles, ['employee', 'tenant_admin']);
  assert.equal(calls[1].path, `v1/tenant/users/${USER_ID}/roles`);
  assert.deepEqual(calls[1].options, {
    method: 'PUT',
    body: { roles: ['tenant_admin'] },
  });
  assert.equal(JSON.stringify(calls[1]).includes('tenantId'), false);
});

test('tenant user service rejects malformed identifiers, page limits and authority-shaped responses before use', async () => {
  const service = createTenantUserAdministrationService({
    apiClient: {
      async request() {
        return {
          users: [tenantUser({ roles: ['employee', 'tenant_admin', 'conference_manager'] })],
          nextAfterId: null,
        };
      },
    },
  });

  await assert.rejects(
    service.listUsers({ limit: 0 }),
    (error) => error instanceof TenantUserAdministrationError && error.code === 'TENANT_USER_PAGE_LIMIT_INVALID',
  );
  await assert.rejects(
    service.setElevatedRoles({ userId: 'not-a-user-id', roles: [] }),
    (error) => error instanceof TenantUserAdministrationError && error.code === 'TENANT_USER_ID_INVALID',
  );
  await assert.rejects(
    service.listUsers(),
    (error) => error instanceof TenantUserAdministrationError && error.code === 'TENANT_USER_ROLES_INVALID',
  );
});
