import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlatformAdminApi, PlatformAdminApiError } from '../src/platform-admin/production/platform-api.js';
import {
  createPlatformOperatorSessionApi,
  PlatformOperatorSessionError,
} from '../src/platform-admin/production/operator-session.js';

const TENANT_ID = '10000000-0000-4000-8000-000000000003';
const INVITATION_ID = '90000000-0000-4000-8000-000000000003';
const IDEMPOTENCY_KEY = '70000000-0000-4000-8000-000000000004';

function directoryPayload() {
  return {
    schemaVersion: 1,
    snapshotAt: '2026-08-01T08:00:00.000Z',
    items: [{
      tenantId: TENANT_ID,
      displayName: 'Cedar Services',
      lifecycle: { status: 'ready', revision: 7 },
      onboardingState: 'complete',
      identityState: 'active',
      invitation: {
        id: INVITATION_ID,
        state: 'consumed',
        revision: 4,
        expiresAt: '2026-08-02T08:00:00.000Z',
      },
      updatedAt: '2026-08-01T08:00:00.000Z',
    }],
    nextCursor: 'next_page',
  };
}

test('Production fleet adapter sends only the explicit bounded directory query keys', async () => {
  const calls = [];
  const api = createPlatformAdminApi({
    apiClient: {
      async request(path, options) {
        calls.push({ path, options });
        return directoryPayload();
      },
    },
  });
  const fleet = await api.loadFleet({ query: 'Cedar', lifecycle: 'ready', cursor: 'current_page' });
  assert.equal(fleet.tenants.length, 1);
  assert.equal(fleet.tenants[0].version, 7);
  assert.equal(fleet.tenants[0].invitationRevision, 4);
  assert.equal(fleet.tenants[0].readiness, null);
  assert.deepEqual(calls, [{
    path: 'tenants?limit=100&cursor=current_page&lifecycleStatus=ready&search=Cedar',
    options: undefined,
  }]);
});

test('Production lifecycle mutations use one transition route, exact confirmation, and UUID idempotency', async () => {
  let captured;
  const api = createPlatformAdminApi({
    apiClient: {
      async request(path, options) {
        captured = { path, options };
        return {
          schemaVersion: 1,
          outcome: 'updated',
          lifecycle: {
            tenantId: TENANT_ID,
            status: 'active',
            revision: 8,
            changedAt: '2026-08-01T09:00:00.000Z',
          },
        };
      },
    },
    idempotencyKeyFactory: () => IDEMPOTENCY_KEY,
  });
  const result = await api.runTenantAction({
    action: 'activate',
    tenantId: TENANT_ID,
    expectedRevision: 7,
    reason: 'Approved rollout window',
    confirmation: { action: 'activate', tenantId: TENANT_ID },
  });
  assert.equal(result.lifecycle.status, 'active');
  assert.deepEqual(captured, {
    path: `tenants/${TENANT_ID}/lifecycle/transitions`,
    options: {
      method: 'POST',
      body: {
        targetStatus: 'active',
        expectedRevision: 7,
        reason: 'Approved rollout window',
        confirmation: { action: 'tenant.lifecycle.transition', tenantId: TENANT_ID },
      },
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  });
});

test('Production invitation mutation uses the directory invitation ID and revision without a current alias', async () => {
  let captured;
  const api = createPlatformAdminApi({
    apiClient: {
      async request(path, options) {
        captured = { path, options };
        return {
          schemaVersion: 1,
          outcome: 'updated',
          invitation: {
            invitationId: INVITATION_ID,
            state: 'open',
            revision: 5,
            expiresAt: '2026-08-03T09:00:00.000Z',
          },
          oneTimeDelivery: {
            available: true,
            token: 'A'.repeat(43),
            expiresAt: '2026-08-03T09:00:00.000Z',
          },
        };
      },
    },
    idempotencyKeyFactory: () => IDEMPOTENCY_KEY,
  });
  const result = await api.runTenantAction({
    action: 'invitation_reissue',
    tenantId: TENANT_ID,
    invitationId: INVITATION_ID,
    expectedRevision: 4,
    reason: 'Replace compromised invitation',
    confirmation: { action: 'invitation_reissue', tenantId: TENANT_ID },
  });
  assert.equal(result.oneTimeDelivery.available, true);
  assert.deepEqual(captured, {
    path: `tenants/${TENANT_ID}/invitations/${INVITATION_ID}/reissue`,
    options: {
      method: 'POST',
      body: {
        expectedRevision: 4,
        reason: 'Replace compromised invitation',
        confirmation: { action: 'tenant.invitation.reissue', tenantId: TENANT_ID },
      },
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  });
  assert.equal(captured.path.includes('/current'), false);
});

test('Production adapter rejects expanded responses and unsupported service-owner actions', async () => {
  const api = createPlatformAdminApi({
    apiClient: { async request() { return { ...directoryPayload(), providerToken: 'hidden' }; } },
    idempotencyKeyFactory: () => IDEMPOTENCY_KEY,
  });
  await assert.rejects(
    () => api.loadFleet(),
    (error) => error instanceof PlatformAdminApiError
      && error.code === 'PLATFORM_FLEET_RESPONSE_INVALID',
  );
  await assert.rejects(
    () => api.runTenantAction({
      action: 'recover_projection',
      tenantId: TENANT_ID,
      expectedRevision: 7,
      reason: 'Attempt unsupported projection recovery',
      confirmation: { action: 'recover_projection', tenantId: TENANT_ID },
    }),
    (error) => error instanceof PlatformAdminApiError
      && error.code === 'PLATFORM_ACTION_UNSUPPORTED',
  );
});

test('Production recovery target discovery uses the bounded Tenant route and rejects expanded targets', async () => {
  const calls = [];
  const api = createPlatformAdminApi({
    apiClient: {
      async request(path) {
        calls.push(path);
        return {
          schemaVersion: 1,
          tenantId: TENANT_ID,
          operation: 'user-session-revocation',
          snapshotAt: '2026-08-28T12:00:00.000Z',
          items: [{
            targetUserId: '22222222-2222-4222-8222-222222222222',
            eligible: true,
            userState: 'active',
            activeSessionCount: 1,
          }],
          nextCursor: 'next_page',
        };
      },
    },
  });
  const targets = await api.loadRecoveryTargets({
    tenantId: TENANT_ID,
    recoveryId: 'user-session-revocation',
    limit: 25,
  });
  assert.equal(targets.items[0].eligible, true);
  assert.deepEqual(calls, [
    `tenants/${TENANT_ID}/recovery/user-session-revocation/targets?limit=25`,
  ]);

  const expanded = createPlatformAdminApi({
    apiClient: {
      async request() {
        return { ...targets, items: [{ ...targets.items[0], email: 'must-not-leak@example.test' }] };
      },
    },
  });
  await assert.rejects(
    () => expanded.loadRecoveryTargets({
      tenantId: TENANT_ID,
      recoveryId: 'user-session-revocation',
    }),
    (error) => error instanceof PlatformAdminApiError
      && error.code === 'PLATFORM_RECOVERY_TARGETS_UNAVAILABLE',
  );
});

test('Production operator session consumes only the direct Platform security projection', async () => {
  const sessionApi = createPlatformOperatorSessionApi({
    apiClient: {
      async request() {
        return {
          operatorId: '00000000-0000-4000-8000-000000000101',
          roles: ['platform_support_reader'],
          permissions: [
            'platform:tenant:read',
            'platform:readiness:read',
            'platform:integration-health:read',
            'platform:diagnostics:read',
            'platform:entitlement:read',
            'platform:metering:read',
            'platform:runtime:read',
          ],
          assurance: { level: 'mfa', authenticatedAt: '2099-01-01T00:00:00.000Z' },
          expiresAt: '2099-01-01T01:00:00.000Z',
          stepUpExpiresAt: null,
          csrfToken: 'A'.repeat(43),
        };
      },
    },
  });
  const session = await sessionApi.loadSession();
  assert.equal(session.operator.roles[0], 'platform_support_reader');
  assert.equal(session.csrfToken, 'A'.repeat(43));
  assert.equal('requestId' in session, false);
});

test('Production operator session distinguishes signed-out, unavailable, and malformed responses', async () => {
  const signedOut = createPlatformOperatorSessionApi({
    apiClient: { async request() { throw Object.assign(new Error('unauthorized'), { code: 'HTTP_401' }); } },
  });
  assert.equal(await signedOut.loadSession(), null);

  const malformed = createPlatformOperatorSessionApi({
    apiClient: { async request() { return { customerRole: 'tenant_admin' }; } },
  });
  await assert.rejects(
    () => malformed.loadSession(),
    (error) => error instanceof PlatformOperatorSessionError
      && error.code === 'PLATFORM_OPERATOR_SESSION_RESPONSE_INVALID',
  );
});
