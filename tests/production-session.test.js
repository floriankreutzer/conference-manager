import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCTION_AUTH_STATUS,
  ProductionSessionError,
  bootstrapProductionAuthentication,
  createProductionSessionRuntime,
  validateProductionSession,
} from '../src/platform/production-session.js';

const NOW = Date.parse('2026-08-24T18:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const CSRF_TOKEN = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

function sessionPayload(overrides = {}) {
  return {
    user: { id: USER_ID },
    tenant: { id: TENANT_ID, status: 'onboarding' },
    roles: ['employee', 'tenant_admin'],
    permissions: [
      'request:read',
      'request:cancel',
      'tenant:configure',
      'tenant:users:manage',
      'tenant:integrations:manage',
      'tenant:audit:read',
    ],
    session: { expiresAt: '2026-08-25T18:00:00.000Z' },
    csrfToken: CSRF_TOKEN,
    requestId: 'request-id-is-not-authority',
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  const text = JSON.stringify(body);
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(text)),
    },
  });
}

test('production session validation accepts only the canonical server role/permission matrix', () => {
  const session = validateProductionSession(sessionPayload(), { clock: () => NOW });
  assert.deepEqual(session.roles, ['employee', 'tenant_admin']);
  assert.equal(session.permissions.includes('tenant:users:manage'), true);
  assert.equal(session.user.id, USER_ID);
  assert.equal(session.tenant.id, TENANT_ID);
  assert.equal(Object.hasOwn(session, 'requestId'), false);

  assert.throws(
    () => validateProductionSession(sessionPayload({
      roles: ['employee', 'conference_manager'],
      permissions: ['request:read', 'request:cancel', 'tenant:users:manage'],
    }), { clock: () => NOW }),
    (error) => error instanceof ProductionSessionError && error.code === 'SESSION_PERMISSIONS_INVALID',
  );

  assert.throws(
    () => validateProductionSession(sessionPayload({
      roles: ['employee', 'platform_admin'],
    }), { clock: () => NOW }),
    (error) => error instanceof ProductionSessionError && error.code === 'SESSION_ROLES_INVALID',
  );
});

test('production session validation fails closed for expired or malformed authority data', () => {
  assert.throws(
    () => validateProductionSession(sessionPayload({
      session: { expiresAt: '2026-08-24T17:59:59.000Z' },
    }), { clock: () => NOW }),
    (error) => error instanceof ProductionSessionError && error.code === 'SESSION_EXPIRED',
  );

  assert.throws(
    () => validateProductionSession(sessionPayload({
      tenant: { id: 'browser-selected-tenant', status: 'active' },
    }), { clock: () => NOW }),
    (error) => error instanceof ProductionSessionError && error.code === 'SESSION_INVALID',
  );

  assert.throws(
    () => validateProductionSession(sessionPayload({ csrfToken: 'short' }), { clock: () => NOW }),
    (error) => error instanceof ProductionSessionError && error.code === 'SESSION_CSRF_INVALID',
  );
});

test('production session runtime keeps CSRF in memory and uses fixed login/logout paths', async () => {
  const calls = [];
  const navigation = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (options.method === 'GET') return jsonResponse(sessionPayload());
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    throw new Error('UNEXPECTED_METHOD');
  };
  const runtime = createProductionSessionRuntime({
    origin: 'https://conference.example',
    fetchImpl,
    navigate: (path) => navigation.push(['assign', path]),
    replace: (path) => navigation.push(['replace', path]),
    clock: () => NOW,
  });

  const authenticated = await runtime.bootstrap();
  assert.equal(authenticated.status, PRODUCTION_AUTH_STATUS.AUTHENTICATED);
  assert.equal(runtime.status(), PRODUCTION_AUTH_STATUS.AUTHENTICATED);
  assert.equal(calls[0].url, 'https://conference.example/api/v1/session');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.headers['X-CSRF-Token'], undefined);

  runtime.signIn();
  assert.deepEqual(navigation[0], ['assign', '/api/v1/auth/microsoft/login']);

  await runtime.signOut();
  assert.equal(calls[1].options.method, 'DELETE');
  assert.equal(calls[1].options.headers['X-CSRF-Token'], CSRF_TOKEN);
  assert.equal(runtime.currentSession(), null);
  assert.equal(runtime.status(), PRODUCTION_AUTH_STATUS.UNAUTHENTICATED);
  assert.deepEqual(navigation.at(-1), ['replace', '/']);
});

test('production session runtime distinguishes signed-out from unavailable and never falls back', async () => {
  const signedOut = createProductionSessionRuntime({
    origin: 'https://conference.example',
    fetchImpl: async () => new Response(null, { status: 401 }),
    clock: () => NOW,
  });
  const result = await signedOut.bootstrap();
  assert.deepEqual(result, { status: PRODUCTION_AUTH_STATUS.UNAUTHENTICATED, session: null });

  const unavailable = createProductionSessionRuntime({
    origin: 'https://conference.example',
    fetchImpl: async () => new Response(null, { status: 503 }),
    clock: () => NOW,
  });
  await assert.rejects(
    unavailable.bootstrap(),
    (error) => error instanceof ProductionSessionError && error.code === 'SESSION_BOOTSTRAP_FAILED',
  );
  assert.equal(unavailable.status(), PRODUCTION_AUTH_STATUS.UNAVAILABLE);
  assert.equal(unavailable.currentSession(), null);
});

test('production bootstrap converts insecure transport or session failures into a non-authoritative unavailable state', async () => {
  const insecure = await bootstrapProductionAuthentication({
    origin: 'http://conference.example',
    fetchImpl: async () => {
      throw new Error('FETCH_MUST_NOT_RUN');
    },
    clock: () => NOW,
  });
  assert.equal(insecure.status, PRODUCTION_AUTH_STATUS.UNAVAILABLE);
  assert.equal(insecure.session, null);
  assert.equal(insecure.runtime, null);

  const unavailable = await bootstrapProductionAuthentication({
    origin: 'https://conference.example',
    fetchImpl: async () => new Response(null, { status: 503 }),
    clock: () => NOW,
  });
  assert.equal(unavailable.status, PRODUCTION_AUTH_STATUS.UNAVAILABLE);
  assert.equal(unavailable.session, null);
  assert.ok(unavailable.runtime);
  assert.equal(unavailable.runtime.status(), PRODUCTION_AUTH_STATUS.UNAVAILABLE);
});
