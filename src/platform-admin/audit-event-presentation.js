const AUDIT_EVENT_KEYS = Object.freeze({
  'platform.authentication.succeeded': 'authenticationSucceeded',
  'platform.authentication.failed': 'authenticationFailed',
  'platform.authorization.denied': 'authorizationDenied',
  'platform.session.issued': 'sessionIssued',
  'platform.session.rotated': 'sessionRotated',
  'platform.session.revoked': 'sessionRevoked',
  'platform.session.epoch_rejected': 'sessionEpochRejected',
  'platform.break_glass.granted': 'breakGlassGranted',
  'platform.break_glass.revoked': 'breakGlassRevoked',
  'platform.break_glass.used': 'breakGlassUsed',
  'platform.break_glass.denied': 'breakGlassDenied',
  'platform.tenant.directory.read': 'tenantDirectoryRead',
  'platform.tenant.registration.changed': 'tenantRegistrationChanged',
  'platform.tenant.invitation.changed': 'tenantInvitationChanged',
  'platform.tenant.lifecycle.changed': 'tenantLifecycleChanged',
  'platform.tenant.entitlement.changed': 'tenantEntitlementChanged',
  'platform.tenant.quota.changed': 'tenantQuotaChanged',
  'platform.tenant.configuration.changed': 'tenantConfigurationChanged',
  'platform.tenant.integration.changed': 'tenantIntegrationChanged',
  'platform.tenant.readiness.read': 'tenantReadinessRead',
  'platform.diagnostics.read': 'diagnosticsRead',
  'platform.metering.read': 'meteringRead',
  'platform.runtime.read': 'runtimeRead',
  'platform.recovery.previewed': 'recoveryPreviewed',
  'platform.recovery.executed': 'recoveryExecuted',
  'platform.audit.read': 'auditRead',
  'platform.audit.exported': 'auditExported',
  'platform.operator.changed': 'operatorChanged',
  'platform.synthetic_access.approved': 'syntheticAccessApproved',
});

export function auditEventPresentation(action) {
  const eventKey = typeof action === 'string' && Object.hasOwn(AUDIT_EVENT_KEYS, action)
    ? AUDIT_EVENT_KEYS[action]
    : 'unknown';
  return Object.freeze({ messageKey: `platformAdmin.audit.event.${eventKey}` });
}
