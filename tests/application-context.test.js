import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicationContextFromState } from '../src/platform/application-context.js';
import { PRODUCTION_AUTH_STATUS } from '../src/platform/production-session.js';

function withProductionDocument(run) {
  const previousDocument = globalThis.document;
  globalThis.document = {
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
