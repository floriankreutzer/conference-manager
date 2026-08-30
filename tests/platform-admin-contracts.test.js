import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertPlatformActionRequest,
  normalizePlatformFleet,
  normalizePlatformOperator,
  normalizePlatformTenant,
  normalizePlatformTenantDirectoryResponse,
  platformActionNeedsStepUp,
  platformPermissionRequiresStepUp,
  shouldPresentPlatformPermission,
  PlatformAdminContractError,
  shouldPresentPlatformAction,
} from '../src/platform-admin/contracts.js';
import {
  platformFleetFixture,
  platformOperatorFixture,
  platformTenantFixture,
} from './support/platform-admin-contract-fixtures.js';
import {
  platformAdminFleetHash,
  platformAdminRouteFromHash,
  platformAdminTenantHash,
} from '../src/platform-admin/route.js';

function fleetPayload() {
  return platformFleetFixture();
}

test('Platform Admin fleet contract accepts the bounded deterministic lifecycle matrix', () => {
  const fleet = normalizePlatformFleet(fleetPayload());
  assert.deepEqual(fleet.tenants.map(({ lifecycleState }) => lifecycleState), [
    'pending',
    'onboarding',
    'ready',
    'active',
    'suspended',
    'archived',
  ]);
  assert.equal(Object.isFrozen(fleet.tenants), true);
  assert.equal(Object.isFrozen(fleet.tenants[0].readiness.blockers), true);
});

test('Platform Admin tenant contract rejects expanded and malformed server data', () => {
  const tenant = platformTenantFixture(0, 'pending');
  assert.throws(
    () => normalizePlatformTenant({ ...tenant, secret: 'must-not-pass' }),
    (error) => error instanceof PlatformAdminContractError && error.code === 'PLATFORM_TENANT_INVALID',
  );
  assert.throws(
    () => normalizePlatformTenant({ ...tenant, readiness: { ...tenant.readiness, blockers: [] } }),
    (error) => error instanceof PlatformAdminContractError
      && error.code === 'PLATFORM_TENANT_READINESS_INVALID',
  );
});

test('Platform Admin Tenant names preserve the canonical 160-character API bound', () => {
  const tenant = platformTenantFixture(0, 'pending');
  const displayName = 'N'.repeat(160);
  assert.equal(normalizePlatformTenant({ ...tenant, displayName }).displayName, displayName);
  assert.equal(normalizePlatformTenantDirectoryResponse({
    schemaVersion: 1,
    snapshotAt: '2026-08-01T08:00:00.000Z',
    items: [{
      tenantId: tenant.id,
      displayName,
      lifecycle: { status: tenant.lifecycleState, revision: tenant.version },
      onboardingState: tenant.onboardingState,
      identityState: tenant.identityState,
      invitation: {
        id: tenant.invitationId,
        state: tenant.invitationState,
        revision: tenant.invitationRevision,
        expiresAt: tenant.invitationExpiresAt,
      },
      updatedAt: tenant.updatedAt,
    }],
    nextCursor: null,
  }).items[0].displayName, displayName);
});

test('operator roles use the accepted permission matrix and all high-impact permissions require step-up', () => {
  const reader = normalizePlatformOperator(platformOperatorFixture('platform_support_reader'));
  const tenantOperator = normalizePlatformOperator(platformOperatorFixture('platform_tenant_operator'));
  const securityAdmin = normalizePlatformOperator(platformOperatorFixture('platform_security_admin'));
  const tenant = normalizePlatformTenant(platformTenantFixture(4, 'suspended'));
  const now = Date.parse('2099-01-01T00:01:00.000Z');

  assert.equal(shouldPresentPlatformAction(reader, tenant, 'reactivate', now), false);
  assert.equal(shouldPresentPlatformAction(tenantOperator, tenant, 'reactivate', now), true);
  assert.equal(shouldPresentPlatformPermission(tenantOperator, 'platform:recovery:execute', now), false);
  assert.equal(shouldPresentPlatformPermission(securityAdmin, 'platform:recovery:execute', now), true);

  const mfaTenantOperator = normalizePlatformOperator({
    ...tenantOperator,
    assurance: {
      level: 'mfa',
      authenticatedAt: '2099-01-01T00:00:00.000Z',
      stepUpExpiresAt: null,
    },
  });
  assert.equal(shouldPresentPlatformAction(mfaTenantOperator, tenant, 'reactivate', now), false);
  assert.equal(platformActionNeedsStepUp(mfaTenantOperator, tenant, 'reactivate', now), true);

  for (const permission of [
    'platform:invitation:manage',
    'platform:lifecycle:manage',
    'platform:entitlement:manage',
    'platform:quota:manage',
    'platform:diagnostics:sensitive',
    'platform:recovery:execute',
    'platform:audit:export',
    'platform:session:revoke',
    'platform:operator:manage',
    'platform:break-glass:manage',
  ]) assert.equal(platformPermissionRequiresStepUp(permission), true, permission);
  assert.equal(platformPermissionRequiresStepUp('platform:tenant:read'), false);

  assert.throws(() => normalizePlatformOperator({
    ...reader,
    permissions: [...reader.permissions, 'platform:tenants:operate'],
  }), (error) => error instanceof PlatformAdminContractError && error.code === 'PLATFORM_OPERATOR_INVALID');
});

test('action requests require explicit aggregate revision, exact target confirmation, and invitation identity', () => {
  const tenantId = '10000000-0000-4000-8000-000000000003';
  const request = assertPlatformActionRequest({
    action: 'activate',
    tenantId,
    expectedRevision: 3,
    reason: 'Approved rollout window',
    confirmation: { action: 'activate', tenantId },
  });
  assert.equal(request.expectedRevision, 3);
  assert.throws(
    () => assertPlatformActionRequest({ ...request, confirmation: { action: 'suspend', tenantId } }),
    (error) => error instanceof PlatformAdminContractError
      && error.code === 'PLATFORM_ACTION_REQUEST_INVALID',
  );
  assert.throws(
    () => assertPlatformActionRequest({
      ...request,
      action: 'invitation_revoke',
      confirmation: { action: 'invitation_revoke', tenantId },
    }),
    (error) => error instanceof PlatformAdminContractError
      && error.code === 'PLATFORM_ACTION_REQUEST_INVALID',
  );
});

test('Production directory contract keeps lifecycle and invitation revisions distinct', () => {
  const tenantId = '10000000-0000-4000-8000-000000000003';
  const invitationId = '90000000-0000-4000-8000-000000000003';
  const directory = normalizePlatformTenantDirectoryResponse({
    schemaVersion: 1,
    snapshotAt: '2026-08-01T08:00:00.000Z',
    items: [{
      tenantId,
      displayName: 'Cedar Services',
      lifecycle: { status: 'ready', revision: 7 },
      onboardingState: 'complete',
      identityState: 'active',
      invitation: {
        id: invitationId,
        state: 'consumed',
        revision: 4,
        expiresAt: '2026-08-02T08:00:00.000Z',
      },
      updatedAt: '2026-08-01T08:00:00.000Z',
    }],
    nextCursor: null,
  });
  assert.equal(directory.items[0].lifecycle.revision, 7);
  assert.equal(directory.items[0].invitation.revision, 4);
});

test('Platform Admin routes derive the target exclusively from a validated hash', () => {
  const tenantId = '10000000-0000-4000-8000-000000000004';
  const hash = platformAdminTenantHash(tenantId, 'runtime-status');
  assert.deepEqual(platformAdminRouteFromHash(hash), {
    view: 'tenant',
    tenantId,
    section: 'runtime-status',
  });
  assert.deepEqual(platformAdminRouteFromHash('#tenant=../../other&section=lifecycle'), {
    view: 'fleet',
    tenantId: null,
    section: null,
  });
  assert.equal(platformAdminTenantHash(tenantId, 'customer-admin'), platformAdminFleetHash());
});
