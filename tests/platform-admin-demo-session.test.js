import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PLATFORM_ADMIN_DEMO_PERSONAS,
  PlatformDemoSessionError,
  createPlatformDemoSessionApi,
} from '../src/platform-admin/demo/operator-session.js';

const readerPermissions = Object.freeze([
  'platform:tenant:read',
  'platform:readiness:read',
  'platform:integration-health:read',
  'platform:diagnostics:read',
  'platform:entitlement:read',
  'platform:metering:read',
  'platform:runtime:read',
]);

function sessionPayload(overrides = {}) {
  return {
    operatorId: '00000000-0000-4000-8000-000000000101',
    roles: ['platform_support_reader'],
    permissions: readerPermissions,
    assurance: { level: 'mfa', authenticatedAt: '2099-01-01T00:00:00.000Z' },
    expiresAt: '2099-01-01T04:00:00.000Z',
    stepUpExpiresAt: null,
    csrfToken: 'a'.repeat(43),
    demo: { persona: 'support_reader' },
    requestId: '10000000-0000-4000-8000-000000000001',
    ...overrides,
  };
}

test('Demo Platform session accepts only server-issued personas and permission projections', async () => {
  const requests = [];
  const api = createPlatformDemoSessionApi({
    apiClient: {
      async request(path, options) {
        requests.push({ path, options });
        return sessionPayload();
      },
    },
  });
  const session = await api.loadSession();
  assert.equal(session.persona, 'support_reader');
  assert.deepEqual(session.operator.permissions, readerPermissions);
  assert.deepEqual(requests, [{ path: 'demo/session', options: undefined }]);
  assert.deepEqual(PLATFORM_ADMIN_DEMO_PERSONAS, [
    'support_reader', 'tenant_operator', 'security_auditor', 'security_admin',
  ]);
});

test('Demo Platform persona selection sends intent only and accepts the matching server projection', async () => {
  let request;
  const api = createPlatformDemoSessionApi({
    apiClient: {
      async request(path, options) {
        request = { path, options };
        return sessionPayload({ demo: { persona: 'tenant_operator' } });
      },
    },
  });
  await api.selectPersona('tenant_operator');
  assert.deepEqual(request, {
    path: 'demo/session/persona',
    options: { method: 'PUT', body: { persona: 'tenant_operator' } },
  });
  await assert.rejects(
    () => api.selectPersona('platform_security_admin'),
    (error) => error instanceof PlatformDemoSessionError
      && error.code === 'PLATFORM_DEMO_PERSONA_INVALID',
  );
});

test('Demo Platform persona selection rejects a different server persona without local authority', async () => {
  const api = createPlatformDemoSessionApi({
    apiClient: {
      async request() {
        return sessionPayload({ demo: { persona: 'support_reader' } });
      },
    },
  });
  await assert.rejects(
    () => api.selectPersona('tenant_operator'),
    (error) => error instanceof PlatformDemoSessionError
      && error.code === 'PLATFORM_DEMO_PERSONA_RESPONSE_MISMATCH',
  );
});

test('Demo reset uses the protected server endpoint and rejects malformed evidence', async () => {
  const calls = [];
  const api = createPlatformDemoSessionApi({
    apiClient: {
      async request(path, options) {
        calls.push({ path, options });
        return {
          seedVersion: 'saas-3.5-shared-demo-v1',
          checksum: 'b'.repeat(64),
          requestId: '10000000-0000-4000-8000-000000000002',
        };
      },
    },
  });
  assert.deepEqual(await api.reset(), {
    seedVersion: 'saas-3.5-shared-demo-v1',
    checksum: 'b'.repeat(64),
  });
  assert.deepEqual(calls[0], {
    path: 'demo/reset',
    options: { method: 'POST', body: { confirm: true } },
  });

  const malformed = createPlatformDemoSessionApi({
    apiClient: {
      async request() {
        return { seedVersion: 'saas-3.5-shared-demo-v1', checksum: 'browser-value' };
      },
    },
  });
  await assert.rejects(
    () => malformed.reset(),
    (error) => error instanceof PlatformDemoSessionError
      && error.code === 'PLATFORM_DEMO_RESET_RESPONSE_INVALID',
  );
});
