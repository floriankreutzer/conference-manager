import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlatformAdminDemoAdapter, PlatformAdminDemoError } from '../src/platform-admin/demo/demo-adapter.js';
import {
  createPlatformAdminDemoStore,
  PLATFORM_ADMIN_DEMO_STORAGE_KEY,
} from '../src/platform-admin/demo/demo-store.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    values,
  };
}

function runtime() {
  const storage = memoryStorage();
  const store = createPlatformAdminDemoStore({ storage });
  return { storage, store, adapter: createPlatformAdminDemoAdapter({ store }) };
}

function actionRequest(tenant, action, reason) {
  const invitationAction = ['invitation_revoke', 'invitation_reissue'].includes(action);
  return {
    action,
    tenantId: tenant.id,
    invitationId: invitationAction ? tenant.invitationId : null,
    expectedRevision: invitationAction ? tenant.invitationRevision : tenant.version,
    reason,
    confirmation: { action, tenantId: tenant.id },
  };
}

test('isolated Demo seeds six deterministic tenant lifecycle states without network authority', async () => {
  const { storage, adapter } = runtime();
  const fleet = await adapter.loadFleet();
  assert.equal(fleet.tenants.length, 6);
  assert.deepEqual(fleet.tenants.map(({ lifecycleState }) => lifecycleState), [
    'pending',
    'onboarding',
    'ready',
    'active',
    'suspended',
    'archived',
  ]);
  assert.equal(storage.values.has(PLATFORM_ADMIN_DEMO_STORAGE_KEY), true);
  assert.equal([...storage.values.keys()].some((key) => key.startsWith('conference_')), false);
});

test('Demo adapter enforces simulated operator permissions, presentation actions, and revision checks', async () => {
  const { adapter } = runtime();
  const tenant = (await adapter.loadFleet()).tenants[3];
  const request = actionRequest(tenant, 'suspend', 'Simulated incident response');
  await assert.rejects(
    () => adapter.runTenantAction(request),
    (error) => error instanceof PlatformAdminDemoError
      && error.code === 'PLATFORM_ADMIN_DEMO_OPERATOR_DENIED',
  );
  adapter.setRole('tenant_operator');
  const result = await adapter.runTenantAction(request);
  assert.equal(result.tenant.lifecycleState, 'suspended');
  assert.equal(result.tenant.version, 2);
  assert.equal(result.auditEvent.action, 'tenant_suspended');
  await assert.rejects(
    () => adapter.runTenantAction(request),
    (error) => error instanceof PlatformAdminDemoError
      && error.code === 'PLATFORM_ADMIN_DEMO_VERSION_CONFLICT',
  );
});

test('Demo recovery is available only to the step-up security-admin role', async () => {
  const { adapter } = runtime();
  const tenant = (await adapter.loadFleet()).tenants[4];
  adapter.setRole('tenant_operator');
  await assert.rejects(
    () => adapter.previewRecovery({ tenantId: tenant.id, recoveryId: 'tenant-reactivation' }),
    (error) => error instanceof PlatformAdminDemoError
      && error.code === 'PLATFORM_ADMIN_DEMO_OPERATOR_DENIED',
  );
  adapter.setRole('security_admin');
  const preview = await adapter.previewRecovery({ tenantId: tenant.id, recoveryId: 'tenant-reactivation' });
  const result = await adapter.executeRecovery({
    tenantId: tenant.id,
    recoveryId: 'tenant-reactivation',
    recoveryContextId: preview.recoveryContextId,
    reason: 'Restore the approved suspended Demo Tenant',
    confirmation: { action: 'tenant.recovery.reactivate', tenantId: tenant.id },
  });
  assert.equal(result.result.status, 'active');
});

test('Demo rejects lifecycle and entitlement transitions forbidden by the canonical API policy', async () => {
  const { adapter } = runtime();
  adapter.setRole('tenant_operator');
  const fleet = await adapter.loadFleet();
  const onboarding = fleet.tenants[1];
  const ready = fleet.tenants[2];
  const archived = fleet.tenants[5];

  for (const [tenant, action] of [
    [onboarding, 'archive'],
    [ready, 'archive'],
    [archived, 'reactivate'],
  ]) {
    await assert.rejects(
      () => adapter.runTenantAction(actionRequest(tenant, action, 'Forbidden Demo transition')),
      (error) => error instanceof PlatformAdminDemoError
        && error.code === 'PLATFORM_ADMIN_DEMO_ACTION_DENIED',
    );
  }
});

test('Demo filtering is bounded and reset removes only the Platform Admin namespace', async () => {
  const { storage, adapter } = runtime();
  storage.setItem('unrelated_key', 'preserved');
  const active = await adapter.loadFleet({ query: 'Dune', lifecycle: 'active', health: 'healthy' });
  assert.deepEqual(active.tenants.map(({ reference }) => reference), ['TEN-004']);
  adapter.setRole('tenant_operator');
  adapter.reset();
  assert.equal(adapter.operator().roles[0], 'platform_support_reader');
  assert.equal(storage.getItem('unrelated_key'), 'preserved');
  assert.equal((await adapter.loadFleet()).tenants.length, 6);
});
