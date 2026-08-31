import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DemoCustomerSessionError,
  createDemoCustomerSessionRuntime,
  normalizeDemoCustomerSession,
  normalizeDemoCustomerTenants,
} from '../src/platform/demo-session.js';

const NOW = Date.parse('2026-08-30T12:00:00.000Z');
const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '20000000-0000-4000-8000-000000000002';
const USER_A = '30000000-0000-4000-8000-000000000003';
const USER_B = '40000000-0000-4000-8000-000000000004';
const REQUEST_ID = '50000000-0000-4000-8000-000000000005';
const CSRF_TOKEN = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

function sessionPayload({
  tenantId = TENANT_A,
  userId = USER_A,
  persona = 'employee',
} = {}) {
  const roles = ['employee'];
  const permissions = ['request:read', 'request:cancel'];
  if (persona === 'conference_manager') {
    roles.push('conference_manager');
    permissions.push('request:manage');
  }
  if (persona === 'tenant_admin') {
    roles.push('tenant_admin');
    permissions.push(
      'tenant:configure',
      'tenant:users:manage',
      'tenant:integrations:manage',
      'tenant:audit:read',
    );
  }
  return {
    user: { id: userId },
    tenant: { id: tenantId, status: tenantId === TENANT_A ? 'active' : 'ready' },
    roles,
    permissions,
    session: { expiresAt: '2099-12-31T23:59:59.000Z' },
    csrfToken: CSRF_TOKEN,
    demo: { persona },
    requestId: REQUEST_ID,
  };
}

function tenantsPayload() {
  return {
    tenants: [
      { id: TENANT_A, displayName: 'Northwind', lifecycleStatus: 'active', lifecycleRevision: 3 },
      { id: TENANT_B, displayName: 'Contoso', lifecycleStatus: 'ready', lifecycleRevision: 2 },
    ],
    requestId: REQUEST_ID,
  };
}

function jsonResponse(value) {
  const body = JSON.stringify(value);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(body)),
    },
  });
}

test('Customer Demo session accepts only a canonical server-owned persona projection', () => {
  const session = normalizeDemoCustomerSession(sessionPayload({ persona: 'tenant_admin' }), { clock: () => NOW });
  assert.equal(session.demo.persona, 'tenant_admin');
  assert.deepEqual(session.roles, ['employee', 'tenant_admin']);
  assert.equal(Object.hasOwn(session, 'requestId'), false);

  assert.throws(
    () => normalizeDemoCustomerSession({ ...sessionPayload(), browserRole: 'tenant_admin' }, { clock: () => NOW }),
    (error) => error instanceof DemoCustomerSessionError && error.code === 'DEMO_SESSION_INVALID',
  );
  assert.throws(
    () => normalizeDemoCustomerSession({
      ...sessionPayload({ persona: 'employee' }),
      roles: ['employee', 'conference_manager'],
      permissions: ['request:read', 'request:cancel', 'request:manage'],
    }, { clock: () => NOW }),
    (error) => error instanceof DemoCustomerSessionError
      && error.code === 'DEMO_SESSION_PERSONA_MISMATCH',
  );
  for (const payload of [
    { ...sessionPayload(), user: { ...sessionPayload().user, displayName: 'Browser claim' } },
    { ...sessionPayload(), tenant: { ...sessionPayload().tenant, displayName: 'Browser tenant' } },
    { ...sessionPayload(), session: { ...sessionPayload().session, browserExpiresAt: 'never' } },
  ]) {
    assert.throws(
      () => normalizeDemoCustomerSession(payload, { clock: () => NOW }),
      (error) => error instanceof DemoCustomerSessionError && error.code === 'DEMO_SESSION_INVALID',
    );
  }
});

test('Customer Demo tenant inventory is exact, bounded and duplicate-free', () => {
  const tenants = normalizeDemoCustomerTenants(tenantsPayload());
  assert.deepEqual(tenants.map((tenant) => tenant.id), [TENANT_A, TENANT_B]);
  assert.throws(
    () => normalizeDemoCustomerTenants({
      ...tenantsPayload(),
      tenants: [tenantsPayload().tenants[0], tenantsPayload().tenants[0]],
    }),
    (error) => error instanceof DemoCustomerSessionError && error.code === 'DEMO_TENANTS_INVALID',
  );
  assert.throws(
    () => normalizeDemoCustomerTenants({ ...tenantsPayload(), tenantId: TENANT_A }),
    (error) => error instanceof DemoCustomerSessionError && error.code === 'DEMO_TENANTS_INVALID',
  );
});

test('Customer Demo accepts one remaining ready tenant after another tenant is suspended', async () => {
  const remainingTenants = {
    tenants: [tenantsPayload().tenants[1]],
    requestId: REQUEST_ID,
  };
  assert.deepEqual(normalizeDemoCustomerTenants(remainingTenants), remainingTenants.tenants);

  const runtime = createDemoCustomerSessionRuntime({
    origin: 'https://conference.example',
    clock: () => NOW,
    fetchImpl: async (url) => jsonResponse(
      String(url).endsWith('/tenants')
        ? remainingTenants
        : sessionPayload({ tenantId: TENANT_B, userId: USER_B }),
    ),
  });
  const result = await runtime.bootstrap();
  assert.equal(result.session.tenant.id, TENANT_B);
  assert.deepEqual(result.tenants.map((tenant) => tenant.id), [TENANT_B]);
});

test('Customer Demo context switch sends intent only with in-memory CSRF and trusts the returned projection', async () => {
  const calls = [];
  const runtime = createDemoCustomerSessionRuntime({
    origin: 'https://conference.example',
    clock: () => NOW,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith('/api/v1/demo/session') && options.method === 'GET') {
        return jsonResponse(sessionPayload());
      }
      if (String(url).endsWith('/api/v1/demo/tenants')) return jsonResponse(tenantsPayload());
      if (String(url).endsWith('/api/v1/demo/session/context')) {
        return jsonResponse(sessionPayload({
          tenantId: TENANT_B,
          userId: USER_B,
          persona: 'conference_manager',
        }));
      }
      throw new Error('UNEXPECTED_REQUEST');
    },
  });

  const bootstrapped = await runtime.bootstrap();
  assert.equal(bootstrapped.session.demo.persona, 'employee');
  assert.equal(bootstrapped.tenants.length, 2);
  const selected = await runtime.selectContext({
    tenantId: TENANT_B,
    persona: 'conference_manager',
  });
  assert.equal(selected.tenant.id, TENANT_B);
  assert.equal(selected.demo.persona, 'conference_manager');
  assert.equal(calls[2].options.headers['X-CSRF-Token'], CSRF_TOKEN);
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    tenantId: TENANT_B,
    persona: 'conference_manager',
  });
  assert.equal(calls.every((call) => call.options.credentials === 'same-origin'), true);
});

test('Customer Demo rejects unknown and non-inventory context before transport', async () => {
  let calls = 0;
  const runtime = createDemoCustomerSessionRuntime({
    origin: 'https://conference.example',
    clock: () => NOW,
    fetchImpl: async (url) => {
      calls += 1;
      return jsonResponse(String(url).endsWith('/tenants') ? tenantsPayload() : sessionPayload());
    },
  });
  await runtime.bootstrap();
  await assert.rejects(
    runtime.selectContext({ tenantId: '60000000-0000-4000-8000-000000000006', persona: 'employee' }),
    (error) => error instanceof DemoCustomerSessionError && error.code === 'DEMO_CONTEXT_INVALID',
  );
  await assert.rejects(
    runtime.selectContext({ tenantId: TENANT_A, persona: 'platform_admin' }),
    (error) => error instanceof DemoCustomerSessionError && error.code === 'DEMO_SESSION_PERSONA_INVALID',
  );
  assert.equal(calls, 2);
});

test('Customer Demo invalidates local authority when a context response is inconsistent', async () => {
  const runtime = createDemoCustomerSessionRuntime({
    origin: 'https://conference.example',
    clock: () => NOW,
    fetchImpl: async (url) => {
      if (String(url).endsWith('/tenants')) return jsonResponse(tenantsPayload());
      if (String(url).endsWith('/context')) {
        return jsonResponse(sessionPayload({ tenantId: TENANT_A, persona: 'employee' }));
      }
      return jsonResponse(sessionPayload());
    },
  });
  await runtime.bootstrap();
  await assert.rejects(
    runtime.selectContext({ tenantId: TENANT_B, persona: 'conference_manager' }),
    (error) => error instanceof DemoCustomerSessionError
      && error.code === 'DEMO_CONTEXT_RESPONSE_MISMATCH',
  );
  assert.equal(runtime.status(), 'unavailable');
  assert.equal(runtime.currentSession(), null);
  assert.deepEqual(runtime.tenants(), []);
});
