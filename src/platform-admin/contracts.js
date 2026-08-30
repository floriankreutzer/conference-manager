const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const REFERENCE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i;
const CURSOR_PATTERN = /^[A-Za-z0-9_.-]{1,4096}$/;
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export const PLATFORM_ADMIN_ROLES = Object.freeze([
  'platform_support_reader',
  'platform_tenant_operator',
  'platform_security_auditor',
  'platform_security_admin',
]);

export const PLATFORM_ADMIN_PERMISSIONS = Object.freeze([
  'platform:tenant:read',
  'platform:readiness:read',
  'platform:integration-health:read',
  'platform:invitation:manage',
  'platform:lifecycle:manage',
  'platform:entitlement:read',
  'platform:entitlement:manage',
  'platform:quota:manage',
  'platform:metering:read',
  'platform:runtime:read',
  'platform:diagnostics:read',
  'platform:diagnostics:sensitive',
  'platform:audit:read',
  'platform:audit:export',
  'platform:recovery:execute',
  'platform:session:revoke',
  'platform:operator:manage',
  'platform:break-glass:manage',
]);

export const PLATFORM_ADMIN_ACTIONS = Object.freeze([
  'invitation_revoke',
  'invitation_reissue',
  'mark_ready',
  'activate',
  'suspend',
  'reactivate',
  'archive',
]);

export const PLATFORM_ADMIN_SECTIONS = Object.freeze([
  'overview',
  'lifecycle',
  'entitlements',
  'diagnostics',
  'recovery',
  'metering',
  'runtime-status',
]);

const ROLE_SET = new Set(PLATFORM_ADMIN_ROLES);
const PERMISSION_SET = new Set(PLATFORM_ADMIN_PERMISSIONS);
const ROLE_PERMISSIONS = Object.freeze({
  platform_support_reader: Object.freeze([
    'platform:tenant:read',
    'platform:readiness:read',
    'platform:integration-health:read',
    'platform:diagnostics:read',
    'platform:entitlement:read',
    'platform:metering:read',
    'platform:runtime:read',
  ]),
  platform_tenant_operator: Object.freeze([
    'platform:tenant:read',
    'platform:readiness:read',
    'platform:integration-health:read',
    'platform:diagnostics:read',
    'platform:entitlement:read',
    'platform:metering:read',
    'platform:runtime:read',
    'platform:invitation:manage',
    'platform:lifecycle:manage',
    'platform:entitlement:manage',
    'platform:quota:manage',
  ]),
  platform_security_auditor: Object.freeze([
    'platform:tenant:read',
    'platform:diagnostics:read',
    'platform:diagnostics:sensitive',
    'platform:audit:read',
    'platform:audit:export',
    'platform:runtime:read',
  ]),
  platform_security_admin: Object.freeze([
    'platform:tenant:read',
    'platform:diagnostics:read',
    'platform:diagnostics:sensitive',
    'platform:recovery:execute',
    'platform:audit:read',
    'platform:session:revoke',
    'platform:operator:manage',
    'platform:break-glass:manage',
  ]),
});
const ACTION_SET = new Set(PLATFORM_ADMIN_ACTIONS);
const SECTION_SET = new Set(PLATFORM_ADMIN_SECTIONS);
const LIFECYCLE_STATES = new Set(['pending', 'onboarding', 'ready', 'active', 'suspended', 'archived']);
const ONBOARDING_STATES = new Set(['not_started', 'invited', 'claim_pending', 'claimed', 'complete']);
const IDENTITY_STATES = new Set(['unbound', 'pending', 'active']);
const READINESS_STATES = new Set(['blocked', 'in_progress', 'ready', 'stale']);
const READINESS_BLOCKERS = new Set([
  'tenant_identity_missing',
  'microsoft_connection_missing',
  'room_mapping_incomplete',
  'provider_permission_missing',
  'verification_stale',
]);
const ENTITLEMENT_IDS = new Set([
  'tenant.administration',
  'tenant.audit_history',
  'microsoft.calendar',
  'microsoft.calendar.write',
]);
const ENTITLEMENT_STATES = new Set(['enabled', 'disabled']);
const HEALTH_STATES = new Set(['healthy', 'degraded', 'unavailable', 'not_configured']);
const DIAGNOSTIC_STATES = new Set(['clear', 'attention', 'incident']);
const FAILURE_CODES = new Set([
  'provider_permission_expired',
  'directory_sync_delayed',
  'projection_out_of_sync',
]);
const QUOTA_STATES = new Set(['within_limit', 'approaching_limit', 'exceeded']);
const RUNTIME_STATES = new Set(['current', 'upgrade_scheduled', 'migration_required']);
const INVITATION_STATES = new Set(['none', 'open', 'expired', 'revoked', 'consumed']);
const AUDIT_ACTIONS = new Set([
  'tenant_registered',
  'invitation_created',
  'invitation_revoked',
  'invitation_reissued',
  'tenant_marked_ready',
  'tenant_activated',
  'tenant_suspended',
  'tenant_reactivated',
  'tenant_archived',
  'entitlement_enabled',
  'entitlement_disabled',
  'projection_recovered',
  'quota_changed',
  'recovery_executed',
]);
const AUDIT_RESULTS = new Set(['succeeded', 'denied', 'failed']);
const ACTION_PERMISSION = Object.freeze({
  invitation_revoke: 'platform:invitation:manage',
  invitation_reissue: 'platform:invitation:manage',
  mark_ready: 'platform:lifecycle:manage',
  activate: 'platform:lifecycle:manage',
  suspend: 'platform:lifecycle:manage',
  reactivate: 'platform:lifecycle:manage',
  archive: 'platform:lifecycle:manage',
});
const STEP_UP_PERMISSIONS = new Set([
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
]);

export class PlatformAdminContractError extends Error {
  constructor(code, options = {}) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PlatformAdminContractError';
    this.code = code;
  }
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!plain(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function boundedString(value, min, max) {
  return typeof value === 'string' && value === value.trim() && value.length >= min && value.length <= max;
}

function safeBoundedText(value, min, max) {
  return boundedString(value, min, max) && !CONTROL_CHARACTERS.test(value);
}

function utcInstant(value) {
  return typeof value === 'string'
    && UTC_INSTANT_PATTERN.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function uniqueKnownStrings(value, allowed, maximum = allowed.size) {
  return Array.isArray(value)
    && value.length <= maximum
    && new Set(value).size === value.length
    && value.every((item) => typeof item === 'string' && allowed.has(item));
}

function freezeStrings(value) {
  return Object.freeze([...value]);
}

export function normalizePlatformOperator(value) {
  if (!exactKeys(value, ['id', 'roles', 'permissions', 'assurance'])) {
    throw new PlatformAdminContractError('PLATFORM_OPERATOR_INVALID');
  }
  const expectedPermissions = Array.isArray(value.roles)
    ? [...new Set(value.roles.flatMap((role) => ROLE_PERMISSIONS[role] || []))].sort()
    : [];
  if (
    !UUID_PATTERN.test(value.id)
    || !uniqueKnownStrings(value.roles, ROLE_SET)
    || value.roles.length === 0
    || !uniqueKnownStrings(value.permissions, PERMISSION_SET)
    || [...value.permissions].sort().join('\u0000') !== expectedPermissions.join('\u0000')
    || !exactKeys(value.assurance, ['level', 'authenticatedAt', 'stepUpExpiresAt'])
    || !['mfa', 'step_up'].includes(value.assurance.level)
    || !utcInstant(value.assurance.authenticatedAt)
    || (value.assurance.stepUpExpiresAt !== null && !utcInstant(value.assurance.stepUpExpiresAt))
    || (value.assurance.level === 'mfa' && value.assurance.stepUpExpiresAt !== null)
    || (value.assurance.level === 'step_up' && value.assurance.stepUpExpiresAt === null)
    || (value.assurance.stepUpExpiresAt !== null
      && (Date.parse(value.assurance.stepUpExpiresAt) <= Date.parse(value.assurance.authenticatedAt)
        || Date.parse(value.assurance.stepUpExpiresAt) - Date.parse(value.assurance.authenticatedAt) > 300_000))
  ) throw new PlatformAdminContractError('PLATFORM_OPERATOR_INVALID');

  return Object.freeze({
    id: value.id,
    roles: freezeStrings(value.roles),
    permissions: freezeStrings(value.permissions),
    assurance: Object.freeze({ ...value.assurance }),
  });
}

export function normalizePlatformOperatorSession(value) {
  if (!exactKeys(value, [
    'operatorId',
    'roles',
    'permissions',
    'assurance',
    'expiresAt',
    'stepUpExpiresAt',
    'csrfToken',
  ])) {
    throw new PlatformAdminContractError('PLATFORM_SESSION_INVALID');
  }
  if (
    typeof value.csrfToken !== 'string'
    || !CSRF_TOKEN_PATTERN.test(value.csrfToken)
    || !utcInstant(value.expiresAt)
    || Date.parse(value.expiresAt) <= Date.now()
    || !exactKeys(value.assurance, ['level', 'authenticatedAt'])
    || !['mfa', 'step_up'].includes(value.assurance.level)
    || !utcInstant(value.assurance.authenticatedAt)
    || (value.stepUpExpiresAt !== null && !utcInstant(value.stepUpExpiresAt))
    || (value.assurance.level === 'mfa' && value.stepUpExpiresAt !== null)
    || (value.assurance.level === 'step_up' && value.stepUpExpiresAt === null)
    || (value.stepUpExpiresAt !== null
      && (Date.parse(value.stepUpExpiresAt) <= Date.parse(value.assurance.authenticatedAt)
        || Date.parse(value.stepUpExpiresAt) - Date.parse(value.assurance.authenticatedAt) > 300_000
        || Date.parse(value.stepUpExpiresAt) > Date.parse(value.expiresAt)))
  ) throw new PlatformAdminContractError('PLATFORM_SESSION_INVALID');
  return Object.freeze({
    operator: normalizePlatformOperator({
      id: value.operatorId,
      roles: value.roles,
      permissions: value.permissions,
      assurance: {
        level: value.assurance.level,
        authenticatedAt: value.assurance.authenticatedAt,
        stepUpExpiresAt: value.stepUpExpiresAt,
      },
    }),
    csrfToken: value.csrfToken,
    expiresAt: value.expiresAt,
  });
}

function normalizeReadiness(value) {
  if (
    !exactKeys(value, ['state', 'blockers', 'evaluatedAt'])
    || !READINESS_STATES.has(value.state)
    || !uniqueKnownStrings(value.blockers, READINESS_BLOCKERS)
    || !utcInstant(value.evaluatedAt)
    || (value.state === 'ready' && value.blockers.length !== 0)
    || (value.state === 'blocked' && value.blockers.length === 0)
  ) throw new PlatformAdminContractError('PLATFORM_TENANT_READINESS_INVALID');
  return Object.freeze({ ...value, blockers: freezeStrings(value.blockers) });
}

function normalizeEntitlement(value) {
  if (
    !exactKeys(value, ['id', 'state'])
    || !ENTITLEMENT_IDS.has(value.id)
    || !ENTITLEMENT_STATES.has(value.state)
  ) throw new PlatformAdminContractError('PLATFORM_TENANT_ENTITLEMENT_INVALID');
  return Object.freeze({ ...value });
}

function normalizeIntegration(value) {
  if (
    !exactKeys(value, ['state', 'directoryState', 'calendarReadState', 'calendarWriteState', 'checkedAt'])
    || !HEALTH_STATES.has(value.state)
    || !HEALTH_STATES.has(value.directoryState)
    || !HEALTH_STATES.has(value.calendarReadState)
    || !HEALTH_STATES.has(value.calendarWriteState)
    || !utcInstant(value.checkedAt)
  ) throw new PlatformAdminContractError('PLATFORM_TENANT_INTEGRATION_INVALID');
  return Object.freeze({ ...value });
}

function normalizeDiagnostics(value) {
  if (
    !exactKeys(value, ['state', 'lastCorrelationId', 'lastFailureCode'])
    || !DIAGNOSTIC_STATES.has(value.state)
    || (value.lastCorrelationId !== null && !UUID_PATTERN.test(value.lastCorrelationId))
    || (value.lastFailureCode !== null && !FAILURE_CODES.has(value.lastFailureCode))
    || (value.state === 'clear' && (value.lastCorrelationId !== null || value.lastFailureCode !== null))
    || (value.state !== 'clear' && value.lastFailureCode === null)
  ) throw new PlatformAdminContractError('PLATFORM_TENANT_DIAGNOSTICS_INVALID');
  return Object.freeze({ ...value });
}

function normalizeUsage(value) {
  if (
    !exactKeys(value, ['activeUsers', 'rooms', 'requestsThisMonth', 'quotaState'])
    || !Number.isSafeInteger(value.activeUsers)
    || value.activeUsers < 0
    || value.activeUsers > 1_000_000
    || !Number.isSafeInteger(value.rooms)
    || value.rooms < 0
    || value.rooms > 100_000
    || !Number.isSafeInteger(value.requestsThisMonth)
    || value.requestsThisMonth < 0
    || value.requestsThisMonth > 10_000_000
    || !QUOTA_STATES.has(value.quotaState)
  ) throw new PlatformAdminContractError('PLATFORM_TENANT_USAGE_INVALID');
  return Object.freeze({ ...value });
}

function normalizeRuntime(value) {
  if (
    !exactKeys(value, ['state', 'frontendVersion', 'apiVersion', 'schemaVersion'])
    || !RUNTIME_STATES.has(value.state)
    || !VERSION_PATTERN.test(value.frontendVersion)
    || !VERSION_PATTERN.test(value.apiVersion)
    || !Number.isSafeInteger(value.schemaVersion)
    || value.schemaVersion < 1
    || value.schemaVersion > 1_000_000
  ) throw new PlatformAdminContractError('PLATFORM_TENANT_RUNTIME_INVALID');
  return Object.freeze({ ...value });
}

export function normalizePlatformTenant(value) {
  if (!exactKeys(value, [
    'id',
    'reference',
    'displayName',
    'lifecycleState',
    'version',
    'onboardingState',
    'identityState',
    'invitationState',
    'invitationId',
    'invitationRevision',
    'invitationExpiresAt',
    'updatedAt',
    'readiness',
    'entitlements',
    'integration',
    'diagnostics',
    'usage',
    'runtime',
    'allowedActions',
  ])) throw new PlatformAdminContractError('PLATFORM_TENANT_INVALID');
  if (
    !UUID_PATTERN.test(value.id)
    || (value.reference !== null && !REFERENCE_PATTERN.test(value.reference))
    || !boundedString(value.displayName, 1, 160)
    || !LIFECYCLE_STATES.has(value.lifecycleState)
    || !Number.isSafeInteger(value.version)
    || value.version < 1
    || !ONBOARDING_STATES.has(value.onboardingState)
    || !IDENTITY_STATES.has(value.identityState)
    || !INVITATION_STATES.has(value.invitationState)
    || (value.invitationId !== null && !UUID_PATTERN.test(value.invitationId))
    || (value.invitationState === 'none' && value.invitationId !== null)
    || (value.invitationState !== 'none' && value.invitationId === null)
    || (value.invitationRevision !== null && (!Number.isSafeInteger(value.invitationRevision)
      || value.invitationRevision < 1))
    || (value.invitationState === 'none' && value.invitationRevision !== null)
    || (value.invitationState !== 'none' && value.invitationRevision === null)
    || (value.invitationExpiresAt !== null && !utcInstant(value.invitationExpiresAt))
    || (value.invitationState === 'none' && value.invitationExpiresAt !== null)
    || (value.invitationState !== 'none' && value.invitationExpiresAt === null)
    || !utcInstant(value.updatedAt)
    || (value.entitlements !== null && (!Array.isArray(value.entitlements)
      || value.entitlements.length !== ENTITLEMENT_IDS.size))
    || !uniqueKnownStrings(value.allowedActions, ACTION_SET)
  ) throw new PlatformAdminContractError('PLATFORM_TENANT_INVALID');

  let entitlements = null;
  if (value.entitlements !== null) {
    entitlements = value.entitlements.map(normalizeEntitlement);
    const ids = new Set(entitlements.map(({ id }) => id));
    if (ids.size !== ENTITLEMENT_IDS.size || [...ENTITLEMENT_IDS].some((id) => !ids.has(id))) {
      throw new PlatformAdminContractError('PLATFORM_TENANT_ENTITLEMENTS_INCOMPLETE');
    }
  }
  return Object.freeze({
    ...value,
    readiness: value.readiness === null ? null : normalizeReadiness(value.readiness),
    entitlements: entitlements === null ? null : Object.freeze(entitlements),
    integration: value.integration === null ? null : normalizeIntegration(value.integration),
    diagnostics: value.diagnostics === null ? null : normalizeDiagnostics(value.diagnostics),
    usage: value.usage === null ? null : normalizeUsage(value.usage),
    runtime: value.runtime === null ? null : normalizeRuntime(value.runtime),
    allowedActions: freezeStrings(value.allowedActions),
  });
}

export function normalizePlatformAuditEvent(value) {
  if (
    !exactKeys(value, ['id', 'tenantId', 'occurredAt', 'action', 'actorType', 'result', 'correlationId'])
    || !UUID_PATTERN.test(value.id)
    || !UUID_PATTERN.test(value.tenantId)
    || !utcInstant(value.occurredAt)
    || !AUDIT_ACTIONS.has(value.action)
    || !['operator', 'system'].includes(value.actorType)
    || !AUDIT_RESULTS.has(value.result)
    || !UUID_PATTERN.test(value.correlationId)
  ) throw new PlatformAdminContractError('PLATFORM_AUDIT_EVENT_INVALID');
  return Object.freeze({ ...value });
}

export function normalizePlatformFleet(value) {
  if (
    !exactKeys(value, ['tenants', 'auditEvents', 'evaluatedAt', 'nextCursor'])
    || !Array.isArray(value.tenants)
    || value.tenants.length > 100
    || !Array.isArray(value.auditEvents)
    || value.auditEvents.length > 500
    || !utcInstant(value.evaluatedAt)
    || (value.nextCursor !== null && (typeof value.nextCursor !== 'string' || !CURSOR_PATTERN.test(value.nextCursor)))
  ) throw new PlatformAdminContractError('PLATFORM_FLEET_INVALID');
  const tenants = value.tenants.map(normalizePlatformTenant);
  const tenantIds = new Set(tenants.map(({ id }) => id));
  if (tenantIds.size !== tenants.length) throw new PlatformAdminContractError('PLATFORM_FLEET_DUPLICATE_TENANT');
  const auditEvents = value.auditEvents.map(normalizePlatformAuditEvent);
  if (auditEvents.some(({ tenantId }) => !tenantIds.has(tenantId))) {
    throw new PlatformAdminContractError('PLATFORM_AUDIT_TENANT_INVALID');
  }
  return Object.freeze({
    tenants: Object.freeze(tenants),
    auditEvents: Object.freeze(auditEvents),
    evaluatedAt: value.evaluatedAt,
    nextCursor: value.nextCursor,
  });
}

function normalizeDirectoryInvitation(value) {
  if (
    !exactKeys(value, ['id', 'state', 'revision', 'expiresAt'])
    || (value.id !== null && !UUID_PATTERN.test(value.id))
    || !INVITATION_STATES.has(value.state)
    || (value.state === 'none' && value.id !== null)
    || (value.state !== 'none' && value.id === null)
    || (value.revision !== null && (!Number.isSafeInteger(value.revision) || value.revision < 1))
    || (value.state === 'none' && value.revision !== null)
    || (value.state !== 'none' && value.revision === null)
    || (value.expiresAt !== null && !utcInstant(value.expiresAt))
    || (value.state === 'none' && value.expiresAt !== null)
    || (value.state !== 'none' && value.expiresAt === null)
  ) throw new PlatformAdminContractError('PLATFORM_DIRECTORY_INVITATION_INVALID');
  return Object.freeze({ ...value });
}

function normalizeDirectoryItem(value) {
  if (
    !exactKeys(value, [
      'tenantId',
      'displayName',
      'lifecycle',
      'onboardingState',
      'identityState',
      'invitation',
      'updatedAt',
    ])
    || !UUID_PATTERN.test(value.tenantId)
    || !boundedString(value.displayName, 1, 160)
    || !exactKeys(value.lifecycle, ['status', 'revision'])
    || !LIFECYCLE_STATES.has(value.lifecycle.status)
    || !Number.isSafeInteger(value.lifecycle.revision)
    || value.lifecycle.revision < 1
    || !ONBOARDING_STATES.has(value.onboardingState)
    || !IDENTITY_STATES.has(value.identityState)
    || !utcInstant(value.updatedAt)
  ) throw new PlatformAdminContractError('PLATFORM_DIRECTORY_ITEM_INVALID');
  return Object.freeze({
    ...value,
    lifecycle: Object.freeze({ ...value.lifecycle }),
    invitation: normalizeDirectoryInvitation(value.invitation),
  });
}

export function normalizePlatformTenantDirectoryResponse(value) {
  if (
    !exactKeys(value, ['schemaVersion', 'snapshotAt', 'items', 'nextCursor'])
    || value.schemaVersion !== 1
    || !utcInstant(value.snapshotAt)
    || !Array.isArray(value.items)
    || value.items.length > 100
    || (value.nextCursor !== null && (typeof value.nextCursor !== 'string' || !CURSOR_PATTERN.test(value.nextCursor)))
  ) throw new PlatformAdminContractError('PLATFORM_DIRECTORY_RESPONSE_INVALID');
  const items = value.items.map(normalizeDirectoryItem);
  if (new Set(items.map(({ tenantId }) => tenantId)).size !== items.length) {
    throw new PlatformAdminContractError('PLATFORM_DIRECTORY_DUPLICATE_TENANT');
  }
  return Object.freeze({
    schemaVersion: 1,
    snapshotAt: value.snapshotAt,
    items: Object.freeze(items),
    nextCursor: value.nextCursor,
  });
}

export function normalizePlatformLifecycleMutationResponse(value, tenantId, targetStatus) {
  if (
    !exactKeys(value, ['schemaVersion', 'outcome', 'lifecycle'])
    || value.schemaVersion !== 1
    || !['updated', 'idempotent'].includes(value.outcome)
    || !exactKeys(value.lifecycle, ['tenantId', 'status', 'revision', 'changedAt'])
    || value.lifecycle.tenantId !== tenantId
    || value.lifecycle.status !== targetStatus
    || !LIFECYCLE_STATES.has(value.lifecycle.status)
    || !Number.isSafeInteger(value.lifecycle.revision)
    || value.lifecycle.revision < 1
    || !utcInstant(value.lifecycle.changedAt)
  ) throw new PlatformAdminContractError('PLATFORM_LIFECYCLE_RESPONSE_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    outcome: value.outcome,
    lifecycle: Object.freeze({ ...value.lifecycle }),
  });
}

function normalizeOneTimeDelivery(value) {
  if (exactKeys(value, ['available']) && value.available === false) {
    return Object.freeze({ available: false });
  }
  if (
    !exactKeys(value, ['available', 'token', 'expiresAt'])
    || value.available !== true
    || typeof value.token !== 'string'
    || !INVITATION_TOKEN_PATTERN.test(value.token)
    || !utcInstant(value.expiresAt)
  ) throw new PlatformAdminContractError('PLATFORM_INVITATION_DELIVERY_INVALID');
  return Object.freeze({ available: true, token: value.token, expiresAt: value.expiresAt });
}

export function normalizePlatformInvitationMutationResponse(
  value,
  invitationId,
  expectedState,
  { oneTimeDelivery = false } = {},
) {
  const keys = oneTimeDelivery
    ? ['schemaVersion', 'outcome', 'invitation', 'oneTimeDelivery']
    : ['schemaVersion', 'outcome', 'invitation'];
  if (
    !exactKeys(value, keys)
    || value.schemaVersion !== 1
    || !['updated', 'idempotent'].includes(value.outcome)
    || !exactKeys(value.invitation, ['invitationId', 'state', 'revision', 'expiresAt'])
    || value.invitation.invitationId !== invitationId
    || value.invitation.state !== expectedState
    || !Number.isSafeInteger(value.invitation.revision)
    || value.invitation.revision < 1
    || (value.invitation.expiresAt !== null && !utcInstant(value.invitation.expiresAt))
  ) throw new PlatformAdminContractError('PLATFORM_INVITATION_RESPONSE_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    outcome: value.outcome,
    invitation: Object.freeze({ ...value.invitation }),
    ...(oneTimeDelivery ? { oneTimeDelivery: normalizeOneTimeDelivery(value.oneTimeDelivery) } : {}),
  });
}

export function normalizePlatformTenantCreateResponse(value) {
  if (
    !exactKeys(value, ['schemaVersion', 'outcome', 'tenant', 'invitation', 'oneTimeDelivery'])
    || value.schemaVersion !== 1
    || !['updated', 'idempotent'].includes(value.outcome)
    || !exactKeys(value.tenant, ['tenantId', 'displayName', 'status', 'revision', 'createdAt'])
    || !UUID_PATTERN.test(value.tenant.tenantId)
    || !safeBoundedText(value.tenant.displayName, 1, 160)
    || value.tenant.status !== 'pending'
    || !Number.isSafeInteger(value.tenant.revision)
    || value.tenant.revision < 1
    || !utcInstant(value.tenant.createdAt)
    || !exactKeys(value.invitation, ['invitationId', 'state', 'revision', 'expiresAt'])
    || !UUID_PATTERN.test(value.invitation.invitationId)
    || value.invitation.invitationId === value.tenant.tenantId
    || value.invitation.state !== 'open'
    || !Number.isSafeInteger(value.invitation.revision)
    || value.invitation.revision < 1
    || !utcInstant(value.invitation.expiresAt)
  ) throw new PlatformAdminContractError('PLATFORM_TENANT_CREATE_RESPONSE_INVALID');
  const oneTimeDelivery = normalizeOneTimeDelivery(value.oneTimeDelivery);
  if (
    (value.outcome === 'updated' && oneTimeDelivery.available !== true)
    || (value.outcome === 'idempotent' && oneTimeDelivery.available !== false)
    || (oneTimeDelivery.available && oneTimeDelivery.expiresAt !== value.invitation.expiresAt)
  ) throw new PlatformAdminContractError('PLATFORM_TENANT_CREATE_RESPONSE_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    outcome: value.outcome,
    tenant: Object.freeze({ ...value.tenant }),
    invitation: Object.freeze({ ...value.invitation }),
    oneTimeDelivery,
  });
}

export function normalizePlatformActionResult(value) {
  if (!exactKeys(value, ['tenant', 'auditEvent'])) {
    throw new PlatformAdminContractError('PLATFORM_ACTION_RESULT_INVALID');
  }
  const tenant = normalizePlatformTenant(value.tenant);
  const auditEvent = normalizePlatformAuditEvent(value.auditEvent);
  if (auditEvent.tenantId !== tenant.id) {
    throw new PlatformAdminContractError('PLATFORM_ACTION_RESULT_INVALID');
  }
  return Object.freeze({ tenant, auditEvent });
}

export function normalizePlatformDirectoryQuery(value = {}) {
  const query = typeof value.query === 'string' ? value.query.trim() : '';
  const lifecycle = typeof value.lifecycle === 'string' ? value.lifecycle : 'all';
  const health = typeof value.health === 'string' ? value.health : 'all';
  const cursor = value.cursor === undefined || value.cursor === null ? null : value.cursor;
  if (
    query.length > 80
    || (lifecycle !== 'all' && !LIFECYCLE_STATES.has(lifecycle))
    || (health !== 'all' && !HEALTH_STATES.has(health))
    || (cursor !== null && (typeof cursor !== 'string' || !CURSOR_PATTERN.test(cursor)))
  ) throw new PlatformAdminContractError('PLATFORM_DIRECTORY_QUERY_INVALID');
  return Object.freeze({ query, lifecycle, health, cursor });
}

export function assertPlatformActionRequest({
  action,
  tenantId,
  invitationId = null,
  expectedRevision,
  reason,
  confirmation,
} = {}) {
  const invitationAction = ['invitation_revoke', 'invitation_reissue'].includes(action);
  if (
    !ACTION_SET.has(action)
    || typeof tenantId !== 'string'
    || !UUID_PATTERN.test(tenantId)
    || (invitationId !== null && (typeof invitationId !== 'string' || !UUID_PATTERN.test(invitationId)))
    || (invitationAction && invitationId === null)
    || (!invitationAction && invitationId !== null)
    || !Number.isSafeInteger(expectedRevision)
    || expectedRevision < 1
    || !safeBoundedText(reason, 1, 500)
    || !exactKeys(confirmation, ['action', 'tenantId'])
    || confirmation.action !== action
    || confirmation.tenantId !== tenantId
  ) throw new PlatformAdminContractError('PLATFORM_ACTION_REQUEST_INVALID');
  return Object.freeze({
    action,
    tenantId,
    invitationId,
    expectedRevision,
    reason,
    confirmation: Object.freeze({ action, tenantId }),
  });
}

export function assertPlatformTenantCreateRequest({ displayName, reason, confirmation } = {}) {
  if (
    !safeBoundedText(displayName, 1, 160)
    || !safeBoundedText(reason, 1, 500)
    || !exactKeys(confirmation, ['action', 'displayName'])
    || confirmation.action !== 'tenant.invitation.create'
    || confirmation.displayName !== displayName
  ) throw new PlatformAdminContractError('PLATFORM_TENANT_CREATE_REQUEST_INVALID');
  return Object.freeze({
    displayName,
    reason,
    confirmation: Object.freeze({ action: 'tenant.invitation.create', displayName }),
  });
}

export function platformPermissionRequiresStepUp(permission) {
  if (!PERMISSION_SET.has(permission)) throw new PlatformAdminContractError('PLATFORM_PERMISSION_INVALID');
  return STEP_UP_PERMISSIONS.has(permission);
}

export function shouldPresentPlatformPermission(operator, permission, now = Date.now()) {
  if (!operator || !PERMISSION_SET.has(permission) || !operator.permissions.includes(permission)) return false;
  if (!STEP_UP_PERMISSIONS.has(permission)) return true;
  return operator.assurance.level === 'step_up'
    && Number.isSafeInteger(now)
    && Date.parse(operator.assurance.stepUpExpiresAt) > now;
}

// This is presentation-only. The Platform API must independently authorize permission,
// assurance, server-owned target scope, object version, and the requested transition.
export function shouldPresentPlatformAction(operator, tenant, action, now = Date.now()) {
  if (!operator || !tenant || !ACTION_SET.has(action)) return false;
  const permission = ACTION_PERMISSION[action];
  return tenant.allowedActions.includes(action)
    && shouldPresentPlatformPermission(operator, permission, now);
}

export function platformActionNeedsStepUp(operator, tenant, action, now = Date.now()) {
  if (!operator || !tenant || !ACTION_SET.has(action) || !tenant.allowedActions.includes(action)) return false;
  const permission = ACTION_PERMISSION[action];
  return operator.permissions.includes(permission)
    && STEP_UP_PERMISSIONS.has(permission)
    && !shouldPresentPlatformPermission(operator, permission, now);
}

export function isPlatformAdminSection(value) {
  return SECTION_SET.has(value);
}

export function isPlatformAdminAction(value) {
  return ACTION_SET.has(value);
}
