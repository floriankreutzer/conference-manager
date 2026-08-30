import assert from 'node:assert/strict';
import test from 'node:test';
import { PRODUCTION_AUTH_STATUS } from '../src/platform/production-session.js';

const previousDocumentAtImport = globalThis.document;
const previousLocalStorageAtImport = globalThis.localStorage;
globalThis.document = {
  documentElement: { lang: 'de' },
  querySelector(selector) {
    if (selector !== 'meta[name="conference-runtime"]') return null;
    return { getAttribute: () => 'production' };
  },
};
globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};
const {
  createApplicationContext,
  createApplicationContextFromState,
} = await import('../src/platform/application-context.js');
if (previousDocumentAtImport === undefined) delete globalThis.document;
else globalThis.document = previousDocumentAtImport;
if (previousLocalStorageAtImport === undefined) delete globalThis.localStorage;
else globalThis.localStorage = previousLocalStorageAtImport;

function withProductionDocument(run) {
  const previousDocument = globalThis.document;
  globalThis.document = {
    documentElement: { lang: 'de' },
    querySelector(selector) {
      if (selector !== 'meta[name="conference-runtime"]') return null;
      return { getAttribute: () => 'production' };
    },
  };
  try {
    return run();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

function session({ roles, permissions }) {
  return Object.freeze({
    user: Object.freeze({ id: '11111111-1111-4111-8111-111111111111' }),
    tenant: Object.freeze({ id: '22222222-2222-4222-8222-222222222222', status: 'active' }),
    roles: Object.freeze(roles),
    permissions: Object.freeze(permissions),
    session: Object.freeze({ expiresAt: '2026-08-25T18:00:00.000Z' }),
  });
}

function startupCatalogPage(section) {
  return {
    schemaVersion: 2,
    configurationRevisions: {
      organization: 1, locations: 1, catalogue: 1, bookingPolicies: 1, costAllocation: 1,
    },
    bookingPolicy: {
      policyVersionId: 'policy-1',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      evaluatedAt: '2026-08-30T12:00:00.000Z',
      rules: {
        minimumLeadTimeMinutes: 0,
        maximumAdvanceMinutes: 527040,
        cancellationWindowMinutes: 0,
        changeWindowMinutes: 0,
        maximumParticipants: 500,
        allowedSiteIds: [],
        allowedRoomIds: [],
        allowedServiceIds: [],
      },
    },
    organization: { defaultCurrency: 'EUR' },
    costAllocation: { allocationRequired: false },
    context: 'startup_context',
    section,
    entries: [],
    page: { limit: 10, complete: true, nextCursor: null },
  };
}

function productionContext(productionSession, status = PRODUCTION_AUTH_STATUS.AUTHENTICATED) {
  return withProductionDocument(() => createApplicationContextFromState({
    productionSession,
    productionAuthenticationStatus: status,
  }));
}

test('production capability checks preserve independent Employee, Conference Manager and Tenant Admin roles', () => {
  const employee = productionContext(session({
    roles: ['employee'],
    permissions: ['request:read', 'request:cancel'],
  }));
  assert.equal(employee.isAuthenticated(), true);
  assert.equal(employee.isManager(), false);
  assert.equal(employee.canManageTenantUsers(), false);

  const manager = productionContext(session({
    roles: ['employee', 'conference_manager'],
    permissions: ['request:read', 'request:cancel', 'request:manage'],
  }));
  assert.equal(manager.isManager(), true);
  assert.equal(manager.canManageTenantUsers(), false);

  const tenantAdmin = productionContext(session({
    roles: ['employee', 'tenant_admin'],
    permissions: [
      'request:read',
      'request:cancel',
      'tenant:configure',
      'tenant:users:manage',
      'tenant:integrations:manage',
      'tenant:audit:read',
    ],
  }));
  assert.equal(tenantAdmin.isManager(), false);
  assert.equal(tenantAdmin.canManageTenantUsers(), true);

  const combined = productionContext(session({
    roles: ['employee', 'conference_manager', 'tenant_admin'],
    permissions: [
      'request:read',
      'request:cancel',
      'request:manage',
      'tenant:configure',
      'tenant:users:manage',
      'tenant:integrations:manage',
      'tenant:audit:read',
    ],
  }));
  assert.equal(combined.isManager(), true);
  assert.equal(combined.canManageTenantUsers(), true);
});

test('production context requires authenticated session status before exposing any privileged presentation capability', () => {
  const elevated = session({
    roles: ['employee', 'conference_manager', 'tenant_admin'],
    permissions: [
      'request:read',
      'request:cancel',
      'request:manage',
      'tenant:configure',
      'tenant:users:manage',
      'tenant:integrations:manage',
      'tenant:audit:read',
    ],
  });

  for (const status of [PRODUCTION_AUTH_STATUS.UNAUTHENTICATED, PRODUCTION_AUTH_STATUS.UNAVAILABLE, 'browser-forged']) {
    const context = productionContext(elevated, status);
    assert.equal(context.isAuthenticated(), false);
    assert.equal(context.isManager(), false);
    assert.equal(context.canManageTenantUsers(), false);
    assert.equal(context.role(), 'employee');
    assert.equal(context.authenticationRuntime(), null);
  }
});

test('production context never reads browser demo role state to establish authority', () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = new Proxy({}, {
    get() {
      throw new Error('PRODUCTION_LOCAL_STORAGE_ACCESSED');
    },
  });
  try {
    const context = productionContext(null, PRODUCTION_AUTH_STATUS.UNAUTHENTICATED);
    assert.equal(context.isAuthenticated(), false);
    assert.equal(context.isManager(), false);
    assert.equal(context.canManageTenantUsers(), false);
    assert.equal(context.canSwitchRole(), false);
    assert.equal(context.setRole('manager'), false);
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
});

test('Customer Demo context derives identity and capabilities only from the validated server session', async () => {
  const calls = [];
  const demoSession = Object.freeze({
    ...session({
      roles: ['employee', 'conference_manager'],
      permissions: ['request:read', 'request:cancel', 'request:manage'],
    }),
    demo: Object.freeze({ persona: 'conference_manager' }),
  });
  const runtime = Object.freeze({
    apiClient: Object.freeze({ async request() { throw new Error('NOT_EXPECTED'); } }),
    status() { return PRODUCTION_AUTH_STATUS.AUTHENTICATED; },
    async selectContext(value) { calls.push(value); },
  });
  const tenants = Object.freeze([
    Object.freeze({ id: demoSession.tenant.id, displayName: 'Northwind' }),
    Object.freeze({ id: '33333333-3333-4333-8333-333333333333', displayName: 'Contoso' }),
  ]);
  const context = createApplicationContextFromState({
    runtimeMode: 'demo',
    productionSession: demoSession,
    productionAuthenticationStatus: PRODUCTION_AUTH_STATUS.AUTHENTICATED,
    authenticationRuntime: runtime,
    demoTenants: tenants,
    serverProfile: { displayName: 'Demo Manager' },
  });

  assert.equal(context.isDemoRuntime(), true);
  assert.equal(context.isAuthenticated(), true);
  assert.equal(context.isManager(), true);
  assert.equal(context.canManageTenantUsers(), false);
  assert.equal(context.userId(), demoSession.user.id);
  assert.equal(context.tenantId(), demoSession.tenant.id);
  assert.equal(context.demoPersona(), 'conference_manager');
  assert.equal(context.fullName(), 'Demo Manager');
  assert.equal(context.serverPersistence(), context.productionPersistence());
  assert.deepEqual(context.demoTenants(), tenants);
  await context.switchDemoContext({ tenantId: tenants[1].id, persona: 'tenant_admin' });
  await context.setRole('manager');
  assert.deepEqual(calls, [
    { tenantId: tenants[1].id, persona: 'tenant_admin' },
    { tenantId: demoSession.tenant.id, persona: 'conference_manager' },
  ]);
});

test('authenticated context refreshes its Request projection from server persistence', async () => {
  const runtime = Object.freeze({
    apiClient: Object.freeze({
      async request(path) {
        assert.match(path, /^v1\/application\/requests\?/);
        return {
          schemaVersion: 2,
          asOf: '2026-08-30T12:00:00.000Z',
          requests: [],
          page: { limit: 10, complete: true, nextCursor: null },
        };
      },
    }),
    status() { return PRODUCTION_AUTH_STATUS.AUTHENTICATED; },
  });
  const context = createApplicationContextFromState({
    runtimeMode: 'production',
    productionSession: session({
      roles: ['employee'],
      permissions: ['request:read', 'request:cancel'],
    }),
    productionAuthenticationStatus: PRODUCTION_AUTH_STATUS.AUTHENTICATED,
    authenticationRuntime: runtime,
    serverRequests: [{ id: 'stale-request' }],
  });

  assert.deepEqual(context.requests(), [{ id: 'stale-request' }]);
  assert.deepEqual(await context.refreshRequests(), []);
  assert.deepEqual(context.requests(), []);
});

test('authenticated context refreshes its notification projection from server persistence', async () => {
  const runtime = Object.freeze({
    apiClient: Object.freeze({
      async request(path, options) {
        assert.equal(path, 'v1/application/notifications');
        assert.equal(options.signal instanceof AbortSignal, true);
        return {
          schemaVersion: 1,
          notifications: [{ id: 'notification-2', title: 'Request changed' }],
        };
      },
    }),
    status() { return PRODUCTION_AUTH_STATUS.AUTHENTICATED; },
  });
  const context = createApplicationContextFromState({
    runtimeMode: 'production',
    productionSession: session({
      roles: ['employee'],
      permissions: ['request:read', 'request:cancel'],
    }),
    productionAuthenticationStatus: PRODUCTION_AUTH_STATUS.AUTHENTICATED,
    authenticationRuntime: runtime,
    serverNotifications: [{ id: 'notification-1', title: 'Stale' }],
    optionalProjectionTimeoutMs: 50,
  });

  assert.deepEqual(context.notifications(), [{ id: 'notification-1', title: 'Stale' }]);
  assert.deepEqual(await context.refreshNotifications(), [
    { id: 'notification-2', title: 'Request changed' },
  ]);
  assert.deepEqual(context.notifications(), [{ id: 'notification-2', title: 'Request changed' }]);
});

test('stalled optional startup projections are aborted without blocking authenticated rendering', async () => {
  const authenticatedSession = session({
    roles: ['employee'],
    permissions: ['request:read', 'request:cancel'],
  });
  let aborted = 0;
  const context = await createApplicationContext({
    runtimeMode: 'production',
    optionalProjectionTimeoutMs: 5,
    async authenticationBootstrap() {
      return {
        status: PRODUCTION_AUTH_STATUS.AUTHENTICATED,
        session: authenticatedSession,
        runtime: Object.freeze({
          apiClient: Object.freeze({
            async request(path, options = {}) {
              if (path === 'v1/application/profile') {
                return { schemaVersion: 1, profile: { displayName: 'Demo Employee' } };
              }
              if (path.startsWith('v1/application/catalog?')) {
                const section = new URL(`https://example.test/${path}`).searchParams.get('section');
                return startupCatalogPage(section);
              }
              if (path.startsWith('v1/application/requests?')) {
                return {
                  schemaVersion: 2,
                  asOf: '2026-08-30T12:00:00.000Z',
                  requests: [],
                  page: { limit: 10, complete: true, nextCursor: null },
                };
              }
              if (['v1/application/site-info', 'v1/application/notifications'].includes(path)) {
                return new Promise((resolve, reject) => {
                  options.signal.addEventListener('abort', () => {
                    aborted += 1;
                    reject(new Error('OPTIONAL_PROJECTION_ABORTED'));
                  }, { once: true });
                });
              }
              throw new Error('UNEXPECTED_STARTUP_PATH');
            },
          }),
        }),
      };
    },
  });

  assert.equal(context.authenticationStatus(), PRODUCTION_AUTH_STATUS.AUTHENTICATED);
  assert.equal(context.isAuthenticated(), true);
  assert.equal(aborted, 2);
  assert.deepEqual(context.getSiteInfo(), {});
  assert.deepEqual(context.notifications(), []);
});

test('required startup projection failure invalidates the effective authenticated context', async () => {
  const authenticatedSession = session({
    roles: ['employee', 'conference_manager'],
    permissions: ['request:read', 'request:cancel', 'request:manage'],
  });
  const context = await createApplicationContext({
    runtimeMode: 'production',
    async authenticationBootstrap() {
      return {
        status: PRODUCTION_AUTH_STATUS.AUTHENTICATED,
        session: authenticatedSession,
        runtime: Object.freeze({
          apiClient: Object.freeze({
            async request() { throw new Error('REQUIRED_PROJECTION_UNAVAILABLE'); },
          }),
        }),
      };
    },
  });

  assert.equal(context.authenticationStatus(), PRODUCTION_AUTH_STATUS.UNAVAILABLE);
  assert.equal(context.isAuthenticated(), false);
  assert.equal(context.isManager(), false);
  assert.deepEqual(context.requests(), []);
});
