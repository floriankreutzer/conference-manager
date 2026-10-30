import { readinessNextTaskPresentation } from './readiness-blockers.js';

export function customerNextTask(tenant, readiness) {
  if (['suspended', 'archived'].includes(tenant.lifecycleState)) return {
    titleKey: 'platformAdmin.workbench.task.lifecycle', descriptionKey: 'platformAdmin.workbench.task.lifecycleReason',
    ownerKey: 'platformAdmin.workbench.owner.operator', section: 'lifecycle',
  };
  if (tenant.onboardingState !== 'complete') return {
    titleKey: 'platformAdmin.workbench.task.onboarding', descriptionKey: ['invited', 'claim_pending'].includes(tenant.onboardingState)
      ? 'platformAdmin.workbench.task.claimReason' : 'platformAdmin.workbench.task.onboardingReason',
    ownerKey: ['invited', 'claim_pending'].includes(tenant.onboardingState)
      ? 'platformAdmin.workbench.owner.customerAdmin' : 'platformAdmin.workbench.owner.operator', section: 'lifecycle',
  };
  const blocker = readiness?.blockerCodes?.[0];
  if (blocker) {
    const next = readinessNextTaskPresentation(blocker);
    return { titleKey: 'platformAdmin.workbench.task.readiness', descriptionKey: next.messageKey,
      ownerKey: next.messageKey.endsWith('customerAdmin') ? 'platformAdmin.workbench.owner.customerAdmin' : 'platformAdmin.workbench.owner.operator',
      section: next.section || 'readiness', blocker };
  }
  if (readiness?.state === 'ready') return {
    titleKey: 'platformAdmin.workbench.task.monitor', descriptionKey: 'platformAdmin.workbench.task.monitorReason',
    ownerKey: 'platformAdmin.workbench.owner.operations', section: 'runtime-status',
  };
  return { titleKey: 'platformAdmin.workbench.task.evidence', descriptionKey: 'platformAdmin.readiness.next.evidence',
    ownerKey: 'platformAdmin.workbench.owner.operations', section: 'readiness' };
}

export function customerWorkbenchSummary(tenant, resources, operator) {
  const permitted = permission => operator?.permissions.includes(permission);
  const readinessResource = permitted('platform:readiness:read') ? resources.get('readiness') : null;
  const integrationResource = permitted('platform:integration-health:read') ? resources.get('integration-health') : null;
  const readinessItem = readinessResource?.data?.items.find(item => item.tenantId === tenant.id);
  const integrationItem = integrationResource?.data?.items.find(item => item.tenantId === tenant.id);
  const readiness = readinessItem?.readiness || (permitted('platform:readiness:read') && tenant.readiness
    ? { ...tenant.readiness, blockerCodes: [] } : null);
  return {
    readiness, readinessAt: readinessResource?.data?.snapshotAt || tenant.readiness?.evaluatedAt || null,
    connectionState: integrationItem?.connectionState
      || (permitted('platform:integration-health:read') ? tenant.integration?.state : null) || 'unknown',
    integrationAt: integrationResource?.data?.snapshotAt || tenant.integration?.checkedAt || null,
    audit: permitted('platform:audit:read') ? resources.get('platform-audit') : null,
    auditAllowed: permitted('platform:audit:read'),
    task: customerNextTask(tenant, readiness),
  };
}

