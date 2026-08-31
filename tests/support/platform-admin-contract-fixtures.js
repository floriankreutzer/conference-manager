const ENTITLEMENTS = Object.freeze([
  { id: 'tenant.administration', state: 'enabled' },
  { id: 'tenant.audit_history', state: 'enabled' },
  { id: 'microsoft.calendar', state: 'enabled' },
  { id: 'microsoft.calendar.write', state: 'disabled' },
]);

export function platformTenantFixture(index = 0, lifecycleState = 'active') {
  const suffix = String(index + 1).padStart(12, '0');
  const invitationState = lifecycleState === 'pending' ? 'none' : 'consumed';
  const ready = ['ready', 'active'].includes(lifecycleState);
  return {
    id: `10000000-0000-4000-8000-${suffix}`,
    reference: `TEN-${String(index + 1).padStart(3, '0')}`,
    displayName: `Contract Tenant ${index + 1}`,
    lifecycleState,
    version: 1,
    onboardingState: invitationState === 'none' ? 'not_started' : 'complete',
    identityState: invitationState === 'none' ? 'unbound' : 'active',
    invitationState,
    invitationId: invitationState === 'none' ? null : `90000000-0000-4000-8000-${suffix}`,
    invitationRevision: invitationState === 'none' ? null : 1,
    invitationExpiresAt: invitationState === 'none' ? null : '2099-01-02T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
    readiness: {
      state: ready ? 'ready' : 'blocked',
      blockers: ready ? [] : ['tenant_identity_missing'],
      evaluatedAt: '2026-08-01T08:00:00.000Z',
    },
    entitlements: ENTITLEMENTS,
    integration: {
      state: ready ? 'healthy' : 'not_configured',
      directoryState: ready ? 'healthy' : 'not_configured',
      calendarReadState: ready ? 'healthy' : 'not_configured',
      calendarWriteState: 'not_configured',
      checkedAt: '2026-08-01T08:00:00.000Z',
    },
    diagnostics: { state: 'clear', lastCorrelationId: null, lastFailureCode: null },
    usage: { activeUsers: 2, rooms: 1, requestsThisMonth: 3, quotaState: 'within_limit' },
    runtime: {
      state: 'current',
      frontendVersion: '3.5.0',
      apiVersion: '3.5.0',
      schemaVersion: 34,
    },
    allowedActions: {
      onboarding: ['mark_ready'],
      ready: ['activate'],
      active: ['suspend'],
      suspended: ['reactivate', 'archive'],
    }[lifecycleState] || [],
  };
}

export function platformFleetFixture() {
  const lifecycleStates = ['pending', 'onboarding', 'ready', 'active', 'suspended', 'archived'];
  const tenants = lifecycleStates.map((state, index) => platformTenantFixture(index, state));
  return {
    tenants,
    auditEvents: tenants.map((tenant, index) => ({
      id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      tenantId: tenant.id,
      occurredAt: `2026-08-01T08:0${index}:00.000Z`,
      action: 'tenant_registered',
      actorType: 'system',
      result: 'succeeded',
      correlationId: `31000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    })),
    evaluatedAt: '2026-08-01T08:00:00.000Z',
    nextCursor: null,
  };
}

export function platformOperatorFixture(role = 'platform_support_reader') {
  const permissions = {
    platform_support_reader: [
      'platform:tenant:read', 'platform:readiness:read', 'platform:integration-health:read',
      'platform:diagnostics:read', 'platform:entitlement:read', 'platform:metering:read',
      'platform:runtime:read',
    ],
    platform_tenant_operator: [
      'platform:tenant:read', 'platform:readiness:read', 'platform:integration-health:read',
      'platform:diagnostics:read', 'platform:entitlement:read', 'platform:metering:read',
      'platform:runtime:read', 'platform:invitation:manage', 'platform:lifecycle:manage',
      'platform:entitlement:manage', 'platform:quota:manage',
    ],
    platform_security_admin: [
      'platform:tenant:read', 'platform:diagnostics:read', 'platform:diagnostics:sensitive',
      'platform:recovery:execute', 'platform:audit:read', 'platform:session:revoke',
      'platform:operator:manage', 'platform:break-glass:manage',
    ],
  }[role];
  const stepUp = role !== 'platform_support_reader';
  return {
    id: stepUp
      ? '00000000-0000-4000-8000-000000000102'
      : '00000000-0000-4000-8000-000000000101',
    roles: [role],
    permissions,
    assurance: {
      level: stepUp ? 'step_up' : 'mfa',
      authenticatedAt: '2099-01-01T00:00:00.000Z',
      stepUpExpiresAt: stepUp ? '2099-01-01T00:05:00.000Z' : null,
    },
  };
}
