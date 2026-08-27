import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TenantUserAdministrationApiError,
  createTenantUserAdministrationApi,
} from '../src/platform/tenant-user-administration-api.js';
import {
  TenantUserOperationsApiError,
  createTenantUserOperationsApi,
} from '../src/platform/tenant-user-operations-api.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';

function user(overrides = {}) {
  const active = overrides.active ?? true;
  return {
    id: USER_ID,
    displayName: 'Ada Lovelace',
    active,
    roles: ['employee'],
    lifecycle: { status: active ? 'active' : 'disabled', version: 3 },
    identityProvider: { linked: true, linkedAt: '2026-08-20T08:00:00.000Z' },
    lastSignInAt: '2026-08-27T07:45:00.000Z',
    requestOwnership: { openRequestCount: 2, ownershipPreservedOnDisable: true },
    ...overrides,
  };
}

test('canonical and compatibility factories expose the same bounded tenant-user API', () => {
  assert.equal(createTenantUserAdministrationApi, createTenantUserOperationsApi);
  assert.equal(TenantUserAdministrationApiError, TenantUserOperationsApiError);
});

test('list users sends only allowlisted filters and returns one validated cursor page', async () => {
  const calls = [];
  const api = createTenantUserOperationsApi({
    apiClient: {
      async request(path, options) {
        calls.push({ path, options });
        return { users: [user({ id: NEXT_ID })], nextAfterId: NEXT_ID, requestId: REQUEST_ID };
      },
    },
  });
  const page = await api.listUsers({
    limit: 25,
    afterId: USER_ID,
    search: 'Ada',
    status: 'disabled',
    role: 'tenant_admin',
    providerLink: 'linked',
  });
  assert.deepEqual(calls, [{
    path: `v1/tenant/users?limit=25&afterId=${USER_ID}&search=Ada&status=disabled&role=tenant_admin&providerLink=linked`,
    options: undefined,
  }]);
  assert.equal(page.users.length, 1);
  assert.equal(page.nextAfterId, NEXT_ID);
  assert.equal(Object.hasOwn(page, 'requestId'), false);
  assert.equal(Object.hasOwn(calls[0], 'tenantId'), false);
});

test('lifecycle update sends exact optimistic contract without browser-selected tenant authority', async () => {
  const calls = [];
  const api = createTenantUserOperationsApi({
    apiClient: {
      async request(path, options) {
        calls.push({ path, options });
        return { user: user({ active: false }), requestId: REQUEST_ID };
      },
    },
  });
  const result = await api.setAccess(USER_ID, false, 3);
  assert.deepEqual(calls, [{
    path: `v1/tenant/users/${USER_ID}/access`,
    options: { method: 'PUT', body: { active: false, expectedVersion: 3 } },
  }]);
  assert.equal(result.lifecycle.status, 'disabled');
  assert.equal(Object.hasOwn(calls[0].options.body, 'tenantId'), false);
});

test('role update preserves the existing exact elevated-role contract', async () => {
  const calls = [];
  const api = createTenantUserOperationsApi({
    apiClient: {
      async request(path, options) {
        calls.push({ path, options });
        return {
          user: {
            id: USER_ID,
            displayName: 'Ada Lovelace',
            active: true,
            roles: ['employee', 'conference_manager', 'tenant_admin'],
          },
          requestId: REQUEST_ID,
        };
      },
    },
  });
  const result = await api.setRoles(USER_ID, ['tenant_admin', 'conference_manager']);
  assert.deepEqual(calls[0], {
    path: `v1/tenant/users/${USER_ID}/roles`,
    options: {
      method: 'PUT',
      body: { roles: ['conference_manager', 'tenant_admin'] },
    },
  });
  assert.deepEqual(result.roles, ['employee', 'conference_manager', 'tenant_admin']);
});

test('invalid filters, identifiers, versions, and role injection fail before transport', async () => {
  let calls = 0;
  const api = createTenantUserOperationsApi({ apiClient: { async request() { calls += 1; } } });
  const operations = [
    () => api.listUsers({ limit: 0 }),
    () => api.listUsers({ search: ' padded ' }),
    () => api.listUsers({ status: 'suspended' }),
    () => api.listUsers({ role: 'platform_admin' }),
    () => api.listUsers({ providerLink: 'provider-object-id' }),
    () => api.setAccess('not-a-uuid', false, 1),
    () => api.setAccess(USER_ID, false, 0),
    () => api.setRoles(USER_ID, ['platform_admin']),
    () => api.setRoles(USER_ID, ['tenant_admin', 'tenant_admin']),
  ];
  for (const operation of operations) await assert.rejects(operation, TenantUserOperationsApiError);
  assert.equal(calls, 0);
});

test('malformed, inconsistent, or overexposed user responses fail closed', async () => {
  const invalidUsers = [
    user({ roles: ['employee', 'platform_admin'] }),
    user({ active: false, lifecycle: { status: 'active', version: 3 } }),
    user({ identityProvider: { linked: false, linkedAt: '2026-08-20T08:00:00.000Z' } }),
    user({ requestOwnership: { openRequestCount: 2, ownershipPreservedOnDisable: false } }),
    { ...user(), providerObjectId: 'sensitive-provider-id' },
  ];
  for (const invalid of invalidUsers) {
    const api = createTenantUserOperationsApi({
      apiClient: {
        async request() { return { users: [invalid], nextAfterId: null, requestId: REQUEST_ID }; },
      },
    });
    await assert.rejects(
      api.listUsers(),
      (error) => error instanceof TenantUserOperationsApiError
        && error.code === 'TENANT_USERS_RESPONSE_INVALID',
    );
  }
});

test('safe server lifecycle conflicts and HTTP classifications remain presentation-safe', async () => {
  for (const [serverCode, expected] of [
    ['LAST_TENANT_ADMIN_REQUIRED', 'LAST_TENANT_ADMIN_REQUIRED'],
    ['TENANT_USER_LIFECYCLE_VERSION_CONFLICT', 'TENANT_USER_LIFECYCLE_VERSION_CONFLICT'],
    ['SENSITIVE_INTERNAL_FAILURE', 'HTTP_409'],
  ]) {
    const api = createTenantUserOperationsApi({
      apiClient: {
        async request() {
          const error = new Error('transport detail');
          error.code = 'HTTP_409';
          error.serverCode = serverCode;
          throw error;
        },
      },
    });
    await assert.rejects(
      api.setAccess(USER_ID, false, 3),
      (error) => error instanceof TenantUserOperationsApiError && error.code === expected,
    );
  }
});
