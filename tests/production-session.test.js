import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ProductionSessionError,
  createProductionSessionRuntime,
} from '../src/platform/production-session.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const CSRF = 'c'.repeat(43);

function documentWithMode(mode) {
  return {
    querySelector(selector) {
      if (selector !== 'meta[name="conference-runtime"]') return null;
      return { getAttribute: () => mode };
    },
  };
}

function sessionPayload(overrides = {}) {
  return {
    user: { id: USER_ID },
    tenant: { id: TENANT_ID, status: 'active' },
    roles: ['employee', 'tenant_admin'],
    permissions: [
      'request:read',
      'request:cancel',
      'tenant:configure',
      'tenant:users:manage',
      'tenant:integrations:manage',
      'tenant:audit:read',
    ],
    session: { expiresAt: '2026-08-24T20:00:00.000Z' },
    csrfToken: CSRF,
    requestId: '33333333-3333-4333-8333-333333333333',
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('production session bootstrap accepts only the same-origin server session contract', async () => {
  const calls = [];
  const runtime = await createProductionSessionRuntime({
    documentLike: documentWithMode('production'),
    origin: 'https://conference.example',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return jsonResponse(sessionPayload());
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://conference.example/api/v1/session');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(runtime.session.userId, USER_ID);
  assert.equal(runtime.session.tenantId, TENANT_ID);
  assert.deepEqual(runtime.session.roles, ['employee', 'tenant_admin']);
  assert.equal(runtime.session.csrfToken, CSRF);
});

test('demo runtime performs no production session request', async () => {
  let calls = 0;
  const runtime = await createProductionSessionRuntime({
    documentLike: documentWithMode('demo'),
    origin: 'http://127.0.0.1:4173',
    fetchImpl: async () => {
      calls += 1;
      throw new Error('unexpected');
    },
  });
  assert.equal(runtime, null);
  assert.equal(calls, 0);
});

test('unknown or privilege-shaped role values fail closed', async () => {
  await assert.rejects(
    createProductionSessionRuntime({
      documentLike: documentWithMode('production'),
      origin: 'https://conference.example',
      fetchImpl: async () => jsonResponse(sessionPayload({ roles: ['employee', 'platform_admin'] })),
    }),
    (error) => error instanceof ProductionSessionError && error.code === 'PRODUCTION_SESSION_INVALID',
  );
});

test('network and HTTP failures remain unavailable and do not create a session', async () => {
  await assert.rejects(
    createProductionSessionRuntime({
      documentLike: documentWithMode('production'),
      origin: 'https://conference.example',
      fetchImpl: async () => jsonResponse({ error: { code: 'UNAUTHENTICATED' } }, 401),
    }),
    (error) => error instanceof ProductionSessionError && error.code === 'PRODUCTION_SESSION_UNAVAILABLE',
  );
});
