import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TenantUserAdministrationApiError,
  createTenantUserAdministrationApi,
} from '../src/platform/tenant-user-administration-api.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function user(overrides = {}) {
  return {
    id: USER_ID,
    displayName: 'Ada Lovelace',
    active: true,
    roles: ['employee'],
    ...overrides,
  };
}

test('list users uses the fixed tenant-scoped endpoint and validates the response', async () => {
  const calls = [];
  const api = createTenantUserAdministrationApi({
    apiClient: {
      async request(path, options) {
        calls.push({ path, options });
        return { users: [user()] };
      },
    },
  });
  const users = await api.listUsers();
  assert.deepEqual(calls, [{ path: 'v1/tenant/users?limit=100', options: undefined }]);
  assert.deepEqual(users, [user()]);
});

test('role update sends only allowlisted elevated roles and no tenant authority', async () => {
  const calls = [];
  const api = createTenantUserAdministrationApi({
    apiClient: {
      async request(path, options) {
        calls.push({ path, options });
        return { user: user({ roles: ['employee', 'conference_manager', 'tenant_admin'] }) };
      },
    },
  });
  const result = await api.setRoles(USER_ID, ['tenant_admin', 'conference_manager']);
  assert.equal(calls[0].path, `v1/tenant/users/${USER_ID}/roles`);
  assert.deepEqual(calls[0].options, {
    method: 'PUT',
    body: { roles: ['conference_manager', 'tenant_admin'] },
  });
  assert.equal(Object.hasOwn(calls[0].options.body, 'tenantId'), false);
  assert.deepEqual(result.roles, ['employee', 'conference_manager', 'tenant_admin']);
});

test('role injection and duplicate roles fail before transport', async () => {
  let calls = 0;
  const api = createTenantUserAdministrationApi({
    apiClient: { async request() { calls += 1; } },
  });
  for (const roles of [
    ['platform_admin'],
    ['employee'],
    ['tenant_admin', 'tenant_admin'],
    ['conference_manager', 'unexpected'],
  ]) {
    await assert.rejects(
      api.setRoles(USER_ID, roles),
      (error) => error instanceof TenantUserAdministrationApiError
        && error.code === 'TENANT_USER_ROLES_INVALID',
    );
  }
  assert.equal(calls, 0);
});

test('malformed server user data fails closed', async () => {
  const api = createTenantUserAdministrationApi({
    apiClient: {
      async request() {
        return { users: [user({ roles: ['employee', 'platform_admin'] })] };
      },
    },
  });
  await assert.rejects(
    api.listUsers(),
    (error) => error instanceof TenantUserAdministrationApiError
      && error.code === 'TENANT_USERS_RESPONSE_INVALID',
  );
});

test('HTTP classifications are preserved for presentation-safe error handling', async () => {
  const api = createTenantUserAdministrationApi({
    apiClient: {
      async request() {
        const error = new Error('forbidden');
        error.code = 'HTTP_403';
        throw error;
      },
    },
  });
  await assert.rejects(
    api.setRoles(USER_ID, ['conference_manager']),
    (error) => error instanceof TenantUserAdministrationApiError && error.code === 'HTTP_403',
  );
});
