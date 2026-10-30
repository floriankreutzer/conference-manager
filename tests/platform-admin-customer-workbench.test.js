import test from 'node:test';
import assert from 'node:assert/strict';
import { customerNextTask, customerWorkbenchSummary } from '../src/platform-admin/customer-workbench-model.js';

const tenant = { id: 'customer-a', lifecycleState: 'active', onboardingState: 'complete', readiness: null, integration: null };
const operator = { permissions: ['platform:readiness:read', 'platform:integration-health:read', 'platform:audit:read'] };

test('customer summary joins only the selected customer and retains independent source times', () => {
  const resources = new Map([
    ['readiness', { status: 'ready', data: { snapshotAt: '2026-10-29T10:00:00.000Z', items: [
      { tenantId: 'customer-b', readiness: { state: 'ready', blockerCodes: [] } },
      { tenantId: tenant.id, readiness: { state: 'blocked', blockerCodes: ['entitlement.microsoft_calendar.missing'] } },
    ] } }],
    ['integration-health', { status: 'ready', data: { snapshotAt: '2026-10-29T09:00:00.000Z', items: [
      { tenantId: tenant.id, connectionState: 'connected' },
    ] } }],
  ]);
  const summary = customerWorkbenchSummary(tenant, resources, operator);
  assert.equal(summary.readiness.state, 'blocked');
  assert.equal(summary.task.section, 'entitlements');
  assert.equal(summary.connectionState, 'connected');
  assert.equal(summary.readinessAt, '2026-10-29T10:00:00.000Z');
  assert.equal(summary.integrationAt, '2026-10-29T09:00:00.000Z');
  assert.equal(customerWorkbenchSummary({ ...tenant, id: 'not-in-loaded-page' }, resources, operator).readiness, null);
});

test('unknown and failed source reads remain unknown and retained resources do not widen a role', () => {
  for (const status of ['loading', 'error']) {
    const summary = customerWorkbenchSummary(tenant, new Map([['readiness', { status, data: null }]]), operator);
    assert.equal(summary.readiness, null);
    assert.equal(summary.connectionState, 'unknown');
    assert.equal(summary.task.titleKey, 'platformAdmin.workbench.task.evidence');
  }
  const summary = customerWorkbenchSummary({ ...tenant, readiness: { state: 'ready' }, integration: { state: 'healthy' } },
    new Map([['platform-audit', { status: 'ready', data: { items: [] } }]]), { permissions: [] });
  assert.equal(summary.readiness, null);
  assert.equal(summary.connectionState, 'unknown');
  assert.equal(summary.audit, null);
  assert.equal(summary.auditAllowed, false);
});

test('next responsibility keeps customer setup, lifecycle review and current evidence distinct', () => {
  assert.equal(customerNextTask({ ...tenant, onboardingState: 'claim_pending' }, null).ownerKey, 'platformAdmin.workbench.owner.customerAdmin');
  assert.equal(customerNextTask({ ...tenant, lifecycleState: 'suspended' }, { state: 'ready' }).section, 'lifecycle');
  assert.equal(customerNextTask(tenant, { state: 'blocked', blockerCodes: ['microsoft.connection.not_connected'] }).ownerKey,
    'platformAdmin.workbench.owner.customerAdmin');
  assert.equal(customerNextTask(tenant, { state: 'ready', blockerCodes: [] }).section, 'runtime-status');
  assert.equal(customerNextTask(tenant, { state: 'unknown', blockerCodes: [] }).titleKey, 'platformAdmin.workbench.task.evidence');
});
