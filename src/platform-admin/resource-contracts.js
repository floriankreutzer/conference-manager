import {
  PLATFORM_ADMIN_PERMISSIONS,
  PLATFORM_ADMIN_ROLES,
  PlatformAdminContractError,
} from './contracts.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CURSOR_PATTERN = /^[A-Za-z0-9_.-]{1,4096}$/;
const SAFE_CODE_PATTERN = /^[a-z][a-z0-9_.-]{0,95}$/;
const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const LIFECYCLE_STATES = new Set(['pending', 'onboarding', 'ready', 'active', 'suspended', 'archived']);
const ROLE_SET = new Set(PLATFORM_ADMIN_ROLES);
const PERMISSION_SET = new Set(PLATFORM_ADMIN_PERMISSIONS);

export const PLATFORM_RECOVERY_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'last-tenant-admin', action: 'tenant.recovery.last_admin', targetField: 'targetUserId' }),
  Object.freeze({ id: 'microsoft-reconsent', action: 'tenant.recovery.microsoft_reconsent', targetField: null }),
  Object.freeze({ id: 'room-mapping-repair', action: 'tenant.recovery.room_mapping', targetField: 'mappingId' }),
  Object.freeze({ id: 'identity-unbind', action: 'tenant.recovery.identity_unbind', targetField: null }),
  Object.freeze({ id: 'tenant-session-revocation', action: 'tenant.recovery.tenant_sessions', targetField: null }),
  Object.freeze({ id: 'user-session-revocation', action: 'tenant.recovery.user_sessions', targetField: 'targetUserId' }),
  Object.freeze({ id: 'tenant-suspension', action: 'tenant.recovery.suspend', targetField: null }),
  Object.freeze({ id: 'tenant-reactivation', action: 'tenant.recovery.reactivate', targetField: null }),
]);

const RECOVERY_BY_ID = new Map(PLATFORM_RECOVERY_DEFINITIONS.map((entry) => [entry.id, entry]));

function invalid(code) {
  throw new PlatformAdminContractError(code);
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exact(value, keys, code) {
  if (!plain(value)) invalid(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid(code);
  return value;
}

function closed(value, allowedKeys, requiredKeys, code) {
  if (!plain(value)) invalid(code);
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) invalid(code);
  if (requiredKeys.some((key) => !Object.hasOwn(value, key))) invalid(code);
  return value;
}

function text(value, maximum, code, { minimum = 1, pattern } = {}) {
  if (
    typeof value !== 'string'
    || value !== value.trim()
    || value.length < minimum
    || value.length > maximum
    || CONTROL_CHARACTERS.test(value)
    || (pattern && !pattern.test(value))
  ) invalid(code);
  return value;
}

function code(value, errorCode) {
  return text(value, 96, errorCode, { pattern: SAFE_CODE_PATTERN });
}

function id(value, errorCode) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) invalid(errorCode);
  return value.toLowerCase();
}

function instant(value, errorCode, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (
    typeof value !== 'string'
    || !UTC_INSTANT_PATTERN.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) invalid(errorCode);
  return value;
}

function integer(value, errorCode, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER, nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) invalid(errorCode);
  return value;
}

function boolean(value, errorCode) {
  if (typeof value !== 'boolean') invalid(errorCode);
  return value;
}

function oneOf(value, allowed, errorCode) {
  if (typeof value !== 'string' || !allowed.has(value)) invalid(errorCode);
  return value;
}

function cursor(value, errorCode) {
  if (value === null) return null;
  if (typeof value !== 'string' || !CURSOR_PATTERN.test(value)) invalid(errorCode);
  return value;
}

function list(value, maximum, map, errorCode, { minimum = 0, uniqueBy } = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) invalid(errorCode);
  const result = value.map(map);
  if (uniqueBy && new Set(result.map(uniqueBy)).size !== result.length) invalid(errorCode);
  return Object.freeze(result);
}

function safeScalarRecord(value, errorCode, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!plain(value) || Object.keys(value).length > 16) invalid(errorCode);
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!/^[a-z][a-zA-Z0-9_]{0,63}$/.test(key) || /(password|secret|token|cookie|csrf|credential)/i.test(key)) {
      invalid(errorCode);
    }
    if (!['string', 'number', 'boolean'].includes(typeof entry) && entry !== null) invalid(errorCode);
    if (typeof entry === 'string' && (entry.length > 512 || CONTROL_CHARACTERS.test(entry))) invalid(errorCode);
    if (typeof entry === 'number' && !Number.isFinite(entry)) invalid(errorCode);
    result[key] = entry;
  }
  return Object.freeze(result);
}

function normalizedPage(value, itemNormalizer, codeValue) {
  exact(value, ['schemaVersion', 'snapshotAt', 'items', 'nextCursor'], codeValue);
  if (value.schemaVersion !== 1) invalid(codeValue);
  return Object.freeze({
    schemaVersion: 1,
    snapshotAt: instant(value.snapshotAt, codeValue),
    items: list(value.items, 100, itemNormalizer, codeValue),
    nextCursor: cursor(value.nextCursor, codeValue),
  });
}

function readinessCheck(value) {
  const errorCode = 'PLATFORM_READINESS_RESPONSE_INVALID';
  exact(value, ['checkId', 'category', 'state', 'reasonCode', 'observedAt', 'freshness'], errorCode);
  return Object.freeze({
    checkId: code(value.checkId, errorCode),
    category: code(value.category, errorCode),
    state: oneOf(value.state, new Set(['pass', 'fail', 'unknown']), errorCode),
    reasonCode: value.reasonCode === null ? null : code(value.reasonCode, errorCode),
    observedAt: instant(value.observedAt, errorCode, { nullable: true }),
    freshness: oneOf(value.freshness, new Set(['fresh', 'stale', 'unknown']), errorCode),
  });
}

function readinessEvidence(value) {
  const errorCode = 'PLATFORM_READINESS_RESPONSE_INVALID';
  exact(value, ['kind', 'state', 'release', 'verifiedAt', 'validUntil'], errorCode);
  return Object.freeze({
    kind: oneOf(value.kind, new Set(['repository', 'deployment', 'external']), errorCode),
    state: oneOf(value.state, new Set(['verified', 'missing', 'invalid', 'unknown']), errorCode),
    release: value.release === null ? null : text(value.release, 80, errorCode, { pattern: /^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/ }),
    verifiedAt: instant(value.verifiedAt, errorCode, { nullable: true }),
    validUntil: instant(value.validUntil, errorCode, { nullable: true }),
  });
}

function readinessItem(value) {
  const errorCode = 'PLATFORM_READINESS_RESPONSE_INVALID';
  exact(value, ['tenantId', 'displayName', 'lifecycle', 'onboardingState', 'readiness', 'entitlements', 'evidence'], errorCode);
  exact(value.lifecycle, ['status', 'revision'], errorCode);
  exact(value.readiness, ['state', 'blockerCodes', 'checks'], errorCode);
  exact(value.entitlements, ['enabledCount', 'requiredMissingCount'], errorCode);
  return Object.freeze({
    tenantId: id(value.tenantId, errorCode),
    displayName: text(value.displayName, 160, errorCode),
    lifecycle: Object.freeze({
      status: oneOf(value.lifecycle.status, LIFECYCLE_STATES, errorCode),
      revision: integer(value.lifecycle.revision, errorCode, { minimum: 1 }),
    }),
    onboardingState: code(value.onboardingState, errorCode),
    readiness: Object.freeze({
      state: oneOf(value.readiness.state, new Set(['ready', 'blocked', 'stale', 'unknown']), errorCode),
      blockerCodes: list(value.readiness.blockerCodes, 64, (entry) => code(entry, errorCode), errorCode, { uniqueBy: (entry) => entry }),
      checks: list(value.readiness.checks, 64, readinessCheck, errorCode, { uniqueBy: (entry) => entry.checkId }),
    }),
    entitlements: Object.freeze({
      enabledCount: integer(value.entitlements.enabledCount, errorCode),
      requiredMissingCount: integer(value.entitlements.requiredMissingCount, errorCode),
    }),
    evidence: list(value.evidence, 3, readinessEvidence, errorCode, { uniqueBy: (entry) => entry.kind }),
  });
}

export function normalizePlatformReadinessPage(value) {
  return normalizedPage(value, readinessItem, 'PLATFORM_READINESS_RESPONSE_INVALID');
}

function microsoftCapability(value) {
  const errorCode = 'PLATFORM_MICROSOFT_HEALTH_RESPONSE_INVALID';
  exact(value, ['capability', 'status', 'reasonCode', 'checkedAt', 'lastSuccessAt', 'freshness', 'incidentScope'], errorCode);
  return Object.freeze({
    capability: code(value.capability, errorCode),
    status: code(value.status, errorCode),
    reasonCode: value.reasonCode === null ? null : code(value.reasonCode, errorCode),
    checkedAt: instant(value.checkedAt, errorCode, { nullable: true }),
    lastSuccessAt: instant(value.lastSuccessAt, errorCode, { nullable: true }),
    freshness: oneOf(value.freshness, new Set(['fresh', 'stale', 'unknown']), errorCode),
    incidentScope: code(value.incidentScope, errorCode),
  });
}

function microsoftHealthItem(value) {
  const errorCode = 'PLATFORM_MICROSOFT_HEALTH_RESPONSE_INVALID';
  exact(value, ['tenantId', 'displayName', 'lifecycle', 'connectionState', 'permissions', 'mappings', 'capabilities'], errorCode);
  exact(value.lifecycle, ['status', 'revision'], errorCode);
  exact(value.permissions, ['places', 'calendars'], errorCode);
  exact(value.mappings, ['active', 'missing', 'total'], errorCode);
  const mappings = Object.freeze({
    active: integer(value.mappings.active, errorCode),
    missing: integer(value.mappings.missing, errorCode),
    total: integer(value.mappings.total, errorCode),
  });
  if (mappings.active + mappings.missing > mappings.total) invalid(errorCode);
  return Object.freeze({
    tenantId: id(value.tenantId, errorCode),
    displayName: text(value.displayName, 160, errorCode),
    lifecycle: Object.freeze({
      status: oneOf(value.lifecycle.status, LIFECYCLE_STATES, errorCode),
      revision: integer(value.lifecycle.revision, errorCode, { minimum: 1 }),
    }),
    connectionState: code(value.connectionState, errorCode),
    permissions: Object.freeze({
      places: code(value.permissions.places, errorCode),
      calendars: code(value.permissions.calendars, errorCode),
    }),
    mappings,
    capabilities: list(value.capabilities, 32, microsoftCapability, errorCode, { uniqueBy: (entry) => entry.capability }),
  });
}

export function normalizePlatformMicrosoftHealthPage(value) {
  return normalizedPage(value, microsoftHealthItem, 'PLATFORM_MICROSOFT_HEALTH_RESPONSE_INVALID');
}

function capability(value) {
  const errorCode = 'PLATFORM_CAPABILITY_RESPONSE_INVALID';
  exact(value, ['capabilityId', 'dependencies'], errorCode);
  return Object.freeze({
    capabilityId: code(value.capabilityId, errorCode),
    dependencies: list(value.dependencies, 64, (entry) => code(entry, errorCode), errorCode, { uniqueBy: (entry) => entry }),
  });
}

export function normalizePlatformCapabilities(value) {
  const errorCode = 'PLATFORM_CAPABILITY_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'items'], errorCode);
  if (value.schemaVersion !== 1) invalid(errorCode);
  return Object.freeze({
    schemaVersion: 1,
    items: list(value.items, 128, capability, errorCode, { uniqueBy: (entry) => entry.capabilityId }),
  });
}

function packageItem(value) {
  const errorCode = 'PLATFORM_PACKAGE_RESPONSE_INVALID';
  exact(value, ['packageId', 'revision', 'name', 'description', 'status'], errorCode);
  return Object.freeze({
    packageId: code(value.packageId, errorCode),
    revision: integer(value.revision, errorCode, { minimum: 1 }),
    name: text(value.name, 120, errorCode),
    description: text(value.description, 500, errorCode, { minimum: 0 }),
    status: oneOf(value.status, new Set(['active', 'retired']), errorCode),
  });
}

export function normalizePlatformPackages(value) {
  return normalizedPage(value, packageItem, 'PLATFORM_PACKAGE_RESPONSE_INVALID');
}

function entitlementState(value) {
  const errorCode = 'PLATFORM_ENTITLEMENT_RESPONSE_INVALID';
  exact(value, ['tenantId', 'tenantStatus', 'revision', 'entries'], errorCode);
  return Object.freeze({
    tenantId: id(value.tenantId, errorCode),
    tenantStatus: oneOf(value.tenantStatus, LIFECYCLE_STATES, errorCode),
    revision: integer(value.revision, errorCode, { minimum: 1 }),
    entries: list(value.entries, 128, (entry) => {
      exact(entry, ['capabilityId', 'enabled', 'effectiveAt'], errorCode);
      return Object.freeze({
        capabilityId: code(entry.capabilityId, errorCode),
        enabled: boolean(entry.enabled, errorCode),
        effectiveAt: instant(entry.effectiveAt, errorCode, { nullable: true }),
      });
    }, errorCode, { uniqueBy: (entry) => entry.capabilityId }),
  });
}

export function normalizePlatformTenantEntitlements(value, expectedTenantId) {
  const errorCode = 'PLATFORM_ENTITLEMENT_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'entitlements'], errorCode);
  if (value.schemaVersion !== 1) invalid(errorCode);
  const entitlements = entitlementState(value.entitlements);
  if (entitlements.tenantId !== expectedTenantId) invalid(errorCode);
  return Object.freeze({ schemaVersion: 1, entitlements });
}

function entitlementPlan(value, errorCode) {
  exact(value, ['tenantId', 'tenantStatus', 'sourceRevision', 'changed', 'changes'], errorCode);
  return Object.freeze({
    tenantId: id(value.tenantId, errorCode),
    tenantStatus: oneOf(value.tenantStatus, LIFECYCLE_STATES, errorCode),
    sourceRevision: integer(value.sourceRevision, errorCode, { minimum: 1 }),
    changed: boolean(value.changed, errorCode),
    changes: list(value.changes, 128, (entry) => {
      exact(entry, ['capabilityId', 'previousEnabled', 'enabled'], errorCode);
      return Object.freeze({
        capabilityId: code(entry.capabilityId, errorCode),
        previousEnabled: boolean(entry.previousEnabled, errorCode),
        enabled: boolean(entry.enabled, errorCode),
      });
    }, errorCode, { uniqueBy: (entry) => entry.capabilityId }),
  });
}

export function normalizePlatformEntitlementPreview(value, expectedTenantId) {
  const errorCode = 'PLATFORM_ENTITLEMENT_PREVIEW_RESPONSE_INVALID';
  if (!plain(value) || value.schemaVersion !== 1 || !['direct', 'package'].includes(value.source)) invalid(errorCode);
  const expectedKeys = value.source === 'direct'
    ? ['schemaVersion', 'source', 'plan']
    : ['schemaVersion', 'source', 'package', 'plan'];
  exact(value, expectedKeys, errorCode);
  const plan = entitlementPlan(value.plan, errorCode);
  if (plan.tenantId !== expectedTenantId || plan.changed !== (plan.changes.length > 0)) invalid(errorCode);
  let packageValue;
  if (value.source === 'package') {
    exact(value.package, ['packageId', 'revision', 'name', 'description'], errorCode);
    packageValue = Object.freeze({
      packageId: code(value.package.packageId, errorCode),
      revision: integer(value.package.revision, errorCode, { minimum: 1 }),
      name: text(value.package.name, 120, errorCode),
      description: text(value.package.description, 500, errorCode, { minimum: 0 }),
    });
  }
  return Object.freeze({ schemaVersion: 1, source: value.source, ...(packageValue ? { package: packageValue } : {}), plan });
}

export function normalizePlatformEntitlementApplication(value, expectedTenantId) {
  const errorCode = 'PLATFORM_ENTITLEMENT_APPLICATION_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'outcome', 'entitlements'], errorCode);
  if (value.schemaVersion !== 1) invalid(errorCode);
  const entitlements = entitlementState(value.entitlements);
  if (entitlements.tenantId !== expectedTenantId) invalid(errorCode);
  return Object.freeze({
    schemaVersion: 1,
    outcome: oneOf(value.outcome, new Set(['updated', 'idempotent', 'unchanged']), errorCode),
    entitlements,
  });
}

function diagnosticSummary(value) {
  const errorCode = 'PLATFORM_DIAGNOSTIC_RESPONSE_INVALID';
  exact(value, ['tenant', 'readiness', 'entitlements', 'microsoft', 'mappings', 'deployment', 'recentFailures'], errorCode);
  exact(value.tenant, ['tenantId', 'displayName', 'lifecycleStatus', 'lifecycleRevision'], errorCode);
  exact(value.readiness, ['state', 'blockerCodes', 'evaluatedAt'], errorCode);
  exact(value.entitlements, ['revision', 'enabledCount'], errorCode);
  exact(value.microsoft, ['connectionState', 'healthState', 'freshness', 'lastCheckedAt'], errorCode);
  exact(value.mappings, ['active', 'missing', 'total'], errorCode);
  exact(value.deployment, ['release', 'observedAt'], errorCode);
  return Object.freeze({
    tenant: Object.freeze({
      tenantId: id(value.tenant.tenantId, errorCode),
      displayName: text(value.tenant.displayName, 160, errorCode),
      lifecycleStatus: oneOf(value.tenant.lifecycleStatus, LIFECYCLE_STATES, errorCode),
      lifecycleRevision: integer(value.tenant.lifecycleRevision, errorCode, { minimum: 1 }),
    }),
    readiness: Object.freeze({
      state: code(value.readiness.state, errorCode),
      blockerCodes: list(value.readiness.blockerCodes, 64, (entry) => code(entry, errorCode), errorCode, { uniqueBy: (entry) => entry }),
      evaluatedAt: instant(value.readiness.evaluatedAt, errorCode, { nullable: true }),
    }),
    entitlements: Object.freeze({
      revision: integer(value.entitlements.revision, errorCode, { minimum: 1 }),
      enabledCount: integer(value.entitlements.enabledCount, errorCode),
    }),
    microsoft: Object.freeze({
      connectionState: code(value.microsoft.connectionState, errorCode),
      healthState: code(value.microsoft.healthState, errorCode),
      freshness: code(value.microsoft.freshness, errorCode),
      lastCheckedAt: instant(value.microsoft.lastCheckedAt, errorCode, { nullable: true }),
    }),
    mappings: Object.freeze({
      active: integer(value.mappings.active, errorCode),
      missing: integer(value.mappings.missing, errorCode),
      total: integer(value.mappings.total, errorCode),
    }),
    deployment: Object.freeze({
      release: value.deployment.release === null ? null : text(value.deployment.release, 80, errorCode, { pattern: REFERENCE_PATTERN }),
      observedAt: instant(value.deployment.observedAt, errorCode, { nullable: true }),
    }),
    recentFailures: list(value.recentFailures, 32, (entry) => {
      exact(entry, ['category', 'occurredAt'], errorCode);
      return Object.freeze({ category: code(entry.category, errorCode), occurredAt: instant(entry.occurredAt, errorCode) });
    }, errorCode),
  });
}

export function normalizePlatformDiagnosticSummary(value, expectedTenantId) {
  const errorCode = 'PLATFORM_DIAGNOSTIC_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'summary'], errorCode);
  if (value.schemaVersion !== 1) invalid(errorCode);
  const summary = diagnosticSummary(value.summary);
  if (summary.tenant.tenantId !== expectedTenantId) invalid(errorCode);
  return Object.freeze({ schemaVersion: 1, summary });
}

export function normalizePlatformCorrelation(value, expectedTenantId, expectedCorrelationId) {
  const errorCode = 'PLATFORM_CORRELATION_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'tenantId', 'lookupCorrelationId', 'from', 'to', 'items'], errorCode);
  if (
    value.schemaVersion !== 1
    || id(value.tenantId, errorCode) !== expectedTenantId
    || id(value.lookupCorrelationId, errorCode) !== expectedCorrelationId
  ) invalid(errorCode);
  return Object.freeze({
    schemaVersion: 1,
    tenantId: expectedTenantId,
    lookupCorrelationId: expectedCorrelationId,
    from: instant(value.from, errorCode),
    to: instant(value.to, errorCode),
    items: list(value.items, 100, (entry) => {
      exact(entry, ['source', 'occurredAt', 'action', 'outcome', 'category', 'targetType'], errorCode);
      return Object.freeze({
        source: code(entry.source, errorCode),
        occurredAt: instant(entry.occurredAt, errorCode),
        action: code(entry.action, errorCode),
        outcome: code(entry.outcome, errorCode),
        category: code(entry.category, errorCode),
        targetType: code(entry.targetType, errorCode),
      });
    }, errorCode),
  });
}

function auditEvent(value) {
  const errorCode = 'PLATFORM_AUDIT_RESPONSE_INVALID';
  exact(value, [
    'sequence', 'operatorId', 'roles', 'permissions', 'assuranceLevel', 'targetTenantId', 'action',
    'targetType', 'targetId', 'previousState', 'newState', 'occurredAt', 'correlationId', 'outcome',
    'metadata', 'retentionClass',
  ], errorCode);
  return Object.freeze({
    sequence: integer(value.sequence, errorCode, { minimum: 1 }),
    operatorId: value.operatorId === null ? null : id(value.operatorId, errorCode),
    roles: list(value.roles, ROLE_SET.size, (entry) => oneOf(entry, ROLE_SET, errorCode), errorCode, { uniqueBy: (entry) => entry }),
    permissions: list(value.permissions, PERMISSION_SET.size, (entry) => oneOf(entry, PERMISSION_SET, errorCode), errorCode, { uniqueBy: (entry) => entry }),
    assuranceLevel: oneOf(value.assuranceLevel, new Set(['unverified', 'mfa', 'step_up', 'break_glass']), errorCode),
    targetTenantId: value.targetTenantId === null ? null : id(value.targetTenantId, errorCode),
    action: text(value.action, 96, errorCode, { pattern: /^[a-z][a-z0-9_.-]{0,95}$/ }),
    targetType: text(value.targetType, 64, errorCode, { pattern: /^[a-z][a-z0-9_:-]{0,63}$/ }),
    targetId: text(value.targetId, 128, errorCode, { pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/ }),
    previousState: safeScalarRecord(value.previousState, errorCode, { nullable: true }),
    newState: safeScalarRecord(value.newState, errorCode, { nullable: true }),
    occurredAt: instant(value.occurredAt, errorCode),
    correlationId: id(value.correlationId, errorCode),
    outcome: oneOf(value.outcome, new Set(['success', 'failure', 'denied']), errorCode),
    metadata: safeScalarRecord(value.metadata, errorCode),
    retentionClass: oneOf(value.retentionClass, new Set(['security', 'administrative', 'recovery']), errorCode),
  });
}

export function normalizePlatformAuditPage(value) {
  const errorCode = 'PLATFORM_AUDIT_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'items'], errorCode);
  if (value.schemaVersion !== 1) invalid(errorCode);
  return Object.freeze({
    schemaVersion: 1,
    items: list(value.items, 100, auditEvent, errorCode, { uniqueBy: (entry) => entry.sequence }),
  });
}

function quota(value, errorCode) {
  exact(value, ['dimension', 'state', 'softLimit', 'hardLimit', 'revision'], errorCode);
  const state = oneOf(value.state, new Set(['configured', 'not_configured', 'unknown']), errorCode);
  const result = Object.freeze({
    dimension: oneOf(value.dimension, new Set(['active_users', 'active_rooms', 'requests_created', 'bookings_confirmed', 'integration_operations']), errorCode),
    state,
    softLimit: integer(value.softLimit, errorCode, { nullable: true }),
    hardLimit: integer(value.hardLimit, errorCode, { nullable: true }),
    revision: integer(value.revision, errorCode, { nullable: true }),
  });
  if (
    (state === 'configured' && result.softLimit === null && result.hardLimit === null)
    || (state === 'not_configured' && (result.softLimit !== null || result.hardLimit !== null))
    || (state === 'unknown' && result.revision !== null)
    || (state !== 'unknown' && result.revision === null)
    || (state === 'configured' && result.revision < 1)
    || (result.softLimit !== null && result.hardLimit !== null && result.softLimit > result.hardLimit)
  ) invalid(errorCode);
  return result;
}

export function normalizePlatformMeteringUsage(value, expectedTenantId) {
  const errorCode = 'PLATFORM_METERING_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'tenantId', 'period', 'dataState', 'measuredAt', 'reconciledAt', 'dimensions', 'quotas'], errorCode);
  exact(value.period, ['start', 'end', 'timeZone'], errorCode);
  if (value.schemaVersion !== 1 || id(value.tenantId, errorCode) !== expectedTenantId || value.period.timeZone !== 'UTC') invalid(errorCode);
  const dimensions = list(value.dimensions, 5, (entry) => {
    exact(entry, ['dimension', 'value'], errorCode);
    return Object.freeze({
      dimension: oneOf(entry.dimension, new Set(['active_users', 'active_rooms', 'requests_created', 'bookings_confirmed', 'integration_operations']), errorCode),
      value: integer(entry.value, errorCode, { nullable: true }),
    });
  }, errorCode, { minimum: 5, uniqueBy: (entry) => entry.dimension });
  const dataState = oneOf(value.dataState, new Set(['complete', 'partial', 'unknown']), errorCode);
  if (dataState === 'unknown' && dimensions.some((entry) => entry.value !== null)) invalid(errorCode);
  return Object.freeze({
    schemaVersion: 1,
    tenantId: expectedTenantId,
    period: Object.freeze({ start: instant(value.period.start, errorCode), end: instant(value.period.end, errorCode), timeZone: 'UTC' }),
    dataState,
    measuredAt: instant(value.measuredAt, errorCode, { nullable: true }),
    reconciledAt: instant(value.reconciledAt, errorCode, { nullable: true }),
    dimensions,
    quotas: list(value.quotas, 5, (entry) => quota(entry, errorCode), errorCode, { minimum: 5, uniqueBy: (entry) => entry.dimension }),
  });
}

export function normalizePlatformQuotaMutation(value, expectedTenantId, expectedDimension) {
  const errorCode = 'PLATFORM_QUOTA_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'status', 'tenantId', 'quota'], errorCode);
  if (value.schemaVersion !== 1 || id(value.tenantId, errorCode) !== expectedTenantId) invalid(errorCode);
  const normalizedQuota = quota(value.quota, errorCode);
  if (normalizedQuota.dimension !== expectedDimension || normalizedQuota.state === 'unknown') invalid(errorCode);
  return Object.freeze({
    schemaVersion: 1,
    status: oneOf(value.status, new Set(['updated', 'replay']), errorCode),
    tenantId: expectedTenantId,
    quota: normalizedQuota,
  });
}

function runtime(value) {
  const errorCode = 'PLATFORM_RUNTIME_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'environment', 'deployment', 'components', 'databaseSchema', 'dependencies', 'freshness', 'evidence', 'metadataState', 'operationalState', 'overallState', 'reasonCodes'], errorCode);
  if (value.schemaVersion !== 1) invalid(errorCode);
  exact(value.deployment, ['reference', 'deployedAt'], errorCode);
  exact(value.components, ['frontend', 'api'], errorCode);
  function component(entry) {
    exact(entry, ['expectedVersion', 'expectedBuildId', 'version', 'buildId', 'state'], errorCode);
    return Object.freeze({
      expectedVersion: entry.expectedVersion === null ? null : text(entry.expectedVersion, 80, errorCode, { pattern: REFERENCE_PATTERN }),
      expectedBuildId: entry.expectedBuildId === null ? null : text(entry.expectedBuildId, 80, errorCode, { pattern: REFERENCE_PATTERN }),
      version: entry.version === null ? null : text(entry.version, 80, errorCode, { pattern: REFERENCE_PATTERN }),
      buildId: entry.buildId === null ? null : text(entry.buildId, 80, errorCode, { pattern: REFERENCE_PATTERN }),
      state: oneOf(entry.state, new Set(['current', 'mismatch', 'unknown']), errorCode),
    });
  }
  exact(value.databaseSchema, ['expectedVersion', 'currentVersion', 'state'], errorCode);
  exact(value.dependencies, ['required', 'optional', 'state'], errorCode);
  exact(value.freshness, ['state', 'observedAt', 'maxAgeSeconds'], errorCode);
  exact(value.evidence, ['release', 'change', 'rollback', 'runbook'], errorCode);
  const evidence = {};
  for (const key of ['release', 'change', 'rollback', 'runbook']) {
    evidence[key] = value.evidence[key] === null
      ? null
      : text(value.evidence[key], 128, errorCode, { pattern: REFERENCE_PATTERN });
  }
  return Object.freeze({
    schemaVersion: 1,
    environment: oneOf(value.environment, new Set(['development', 'test', 'pilot', 'production']), errorCode),
    deployment: Object.freeze({
      reference: value.deployment.reference === null
        ? null
        : text(value.deployment.reference, 80, errorCode, { pattern: REFERENCE_PATTERN }),
      deployedAt: instant(value.deployment.deployedAt, errorCode, { nullable: true }),
    }),
    components: Object.freeze({ frontend: component(value.components.frontend), api: component(value.components.api) }),
    databaseSchema: Object.freeze({
      expectedVersion: integer(value.databaseSchema.expectedVersion, errorCode, { nullable: true }),
      currentVersion: integer(value.databaseSchema.currentVersion, errorCode, { nullable: true }),
      state: oneOf(value.databaseSchema.state, new Set(['current', 'mismatch', 'unknown']), errorCode),
    }),
    dependencies: Object.freeze({
      required: code(value.dependencies.required, errorCode),
      optional: code(value.dependencies.optional, errorCode),
      state: code(value.dependencies.state, errorCode),
    }),
    freshness: Object.freeze({
      state: oneOf(value.freshness.state, new Set(['fresh', 'stale', 'unknown']), errorCode),
      observedAt: instant(value.freshness.observedAt, errorCode, { nullable: true }),
      maxAgeSeconds: integer(value.freshness.maxAgeSeconds, errorCode, { minimum: 1 }),
    }),
    evidence: Object.freeze(evidence),
    metadataState: code(value.metadataState, errorCode),
    operationalState: code(value.operationalState, errorCode),
    overallState: oneOf(value.overallState, new Set(['ready', 'degraded', 'not_ready', 'mismatch', 'stale', 'unknown']), errorCode),
    reasonCodes: list(value.reasonCodes, 32, (entry) => code(entry, errorCode), errorCode, { uniqueBy: (entry) => entry }),
  });
}

export function normalizePlatformRuntimeDeployments(value) {
  const errorCode = 'PLATFORM_RUNTIME_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'deployments'], errorCode);
  if (value.schemaVersion !== 1) invalid(errorCode);
  return Object.freeze({ schemaVersion: 1, deployments: list(value.deployments, 32, runtime, errorCode, { uniqueBy: (entry) => entry.deployment.reference }) });
}

export function normalizePlatformTenantRuntime(value, expectedTenantId) {
  const errorCode = 'PLATFORM_RUNTIME_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'tenantId', 'correlationState', 'runtime'], errorCode);
  if (value.schemaVersion !== 1 || id(value.tenantId, errorCode) !== expectedTenantId) invalid(errorCode);
  const correlationState = oneOf(value.correlationState, new Set(['mapped', 'unknown']), errorCode);
  const runtimeValue = value.runtime === null ? null : runtime(value.runtime);
  if ((correlationState === 'mapped') !== (runtimeValue !== null)) invalid(errorCode);
  return Object.freeze({ schemaVersion: 1, tenantId: expectedTenantId, correlationState, runtime: runtimeValue });
}

export function normalizePlatformRecoveryPreview(value, expectedTenantId, expectedDefinition) {
  const errorCode = 'PLATFORM_RECOVERY_PREVIEW_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'action', 'recoveryContextId', 'expiresAt', 'targetId', 'state', 'impactCodes'], errorCode);
  if (value.schemaVersion !== 1 || value.action !== expectedDefinition.action) invalid(errorCode);
  const targetId = id(value.targetId, errorCode);
  const state = safeScalarRecord(value.state, errorCode);
  if (Object.hasOwn(state, 'tenantId') && state.tenantId !== expectedTenantId) invalid(errorCode);
  return Object.freeze({
    schemaVersion: 1,
    action: value.action,
    recoveryContextId: id(value.recoveryContextId, errorCode),
    expiresAt: instant(value.expiresAt, errorCode),
    targetId,
    state,
    impactCodes: list(value.impactCodes, 16, (entry) => code(entry, errorCode), errorCode, { minimum: 1, uniqueBy: (entry) => entry }),
  });
}

export function normalizePlatformRecoveryExecution(value) {
  const errorCode = 'PLATFORM_RECOVERY_EXECUTION_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'outcome', 'result'], errorCode);
  if (value.schemaVersion !== 1 || !plain(value.result)) invalid(errorCode);
  const result = safeScalarRecord(value.result, errorCode);
  if (typeof result.status !== 'string' || !SAFE_CODE_PATTERN.test(result.status)) invalid(errorCode);
  return Object.freeze({
    schemaVersion: 1,
    outcome: oneOf(value.outcome, new Set(['updated', 'idempotent']), errorCode),
    result,
  });
}

export function normalizePlatformRecoveryTargets(value, expectedTenantId, expectedDefinition) {
  const errorCode = 'PLATFORM_RECOVERY_TARGETS_RESPONSE_INVALID';
  exact(value, ['schemaVersion', 'tenantId', 'operation', 'snapshotAt', 'items', 'nextCursor'], errorCode);
  if (
    value.schemaVersion !== 1
    || id(value.tenantId, errorCode) !== expectedTenantId
    || value.operation !== expectedDefinition.id
  ) invalid(errorCode);
  const items = list(value.items, 100, (entry) => {
    if (expectedDefinition.targetField === 'mappingId') {
      exact(entry, ['mappingId', 'eligible', 'mappingState', 'connectionState', 'placesPermission', 'candidateCount'], errorCode);
      return Object.freeze({
        mappingId: id(entry.mappingId, errorCode),
        eligible: boolean(entry.eligible, errorCode),
        mappingState: code(entry.mappingState, errorCode),
        connectionState: code(entry.connectionState, errorCode),
        placesPermission: code(entry.placesPermission, errorCode),
        candidateCount: integer(entry.candidateCount, errorCode, { minimum: 0 }),
      });
    }
    const lastAdmin = expectedDefinition.id === 'last-tenant-admin';
    exact(entry, lastAdmin
      ? ['targetUserId', 'eligible', 'userState', 'activeSessionCount', 'identityState',
        'alreadyTenantAdmin', 'currentTenantAdminCount']
      : ['targetUserId', 'eligible', 'userState', 'activeSessionCount'], errorCode);
    return Object.freeze({
      targetUserId: id(entry.targetUserId, errorCode),
      eligible: boolean(entry.eligible, errorCode),
      userState: code(entry.userState, errorCode),
      activeSessionCount: integer(entry.activeSessionCount, errorCode, { minimum: 0 }),
      ...(lastAdmin ? {
        identityState: code(entry.identityState, errorCode),
        alreadyTenantAdmin: boolean(entry.alreadyTenantAdmin, errorCode),
        currentTenantAdminCount: integer(entry.currentTenantAdminCount, errorCode, { minimum: 0 }),
      } : {}),
    });
  }, errorCode, { uniqueBy: (entry) => entry[expectedDefinition.targetField] });
  return Object.freeze({
    schemaVersion: 1,
    tenantId: expectedTenantId,
    operation: expectedDefinition.id,
    snapshotAt: instant(value.snapshotAt, errorCode),
    items,
    nextCursor: value.nextCursor === null ? null : text(value.nextCursor, 4096, errorCode),
  });
}

export function platformRecoveryDefinition(value) {
  const definition = RECOVERY_BY_ID.get(value);
  if (!definition) invalid('PLATFORM_RECOVERY_ACTION_INVALID');
  return definition;
}

export function assertPlatformEntitlementProposals(value, knownCapabilities) {
  const errorCode = 'PLATFORM_ENTITLEMENT_REQUEST_INVALID';
  const known = new Set(knownCapabilities);
  return list(value, Math.max(known.size, 1), (entry) => {
    exact(entry, ['capabilityId', 'enabled'], errorCode);
    const capabilityId = code(entry.capabilityId, errorCode);
    if (!known.has(capabilityId)) invalid(errorCode);
    return Object.freeze({ capabilityId, enabled: boolean(entry.enabled, errorCode) });
  }, errorCode, { minimum: 1, uniqueBy: (entry) => entry.capabilityId });
}

export function assertPlatformQuotaRequest(value, tenantId, dimension) {
  const errorCode = 'PLATFORM_QUOTA_REQUEST_INVALID';
  exact(value, ['state', 'softLimit', 'hardLimit', 'expectedRevision', 'reason', 'confirmation'], errorCode);
  exact(value.confirmation, ['action', 'tenantId', 'dimension'], errorCode);
  const state = oneOf(value.state, new Set(['configured', 'not_configured']), errorCode);
  const result = Object.freeze({
    state,
    softLimit: integer(value.softLimit, errorCode, { nullable: true }),
    hardLimit: integer(value.hardLimit, errorCode, { nullable: true }),
    expectedRevision: integer(value.expectedRevision, errorCode),
    reason: text(value.reason, 500, errorCode),
    confirmation: Object.freeze({ action: 'tenant.quota.set', tenantId: id(value.confirmation.tenantId, errorCode), dimension: oneOf(value.confirmation.dimension, new Set([dimension]), errorCode) }),
  });
  if (
    result.confirmation.action !== value.confirmation.action
    || result.confirmation.tenantId !== tenantId
    || (state === 'configured' && result.softLimit === null && result.hardLimit === null)
    || (state === 'not_configured' && (result.softLimit !== null || result.hardLimit !== null))
    || (result.softLimit !== null && result.hardLimit !== null && result.softLimit > result.hardLimit)
  ) invalid(errorCode);
  return result;
}

export function assertPlatformRecoveryRequest(value, tenantId, definition, { execution = false } = {}) {
  const errorCode = 'PLATFORM_RECOVERY_REQUEST_INVALID';
  const targetKeys = definition.targetField ? [definition.targetField] : [];
  const required = execution
    ? ['recoveryContextId', 'reason', 'confirmation', ...targetKeys]
    : targetKeys;
  exact(value, required, errorCode);
  const target = definition.targetField ? { [definition.targetField]: id(value[definition.targetField], errorCode) } : {};
  if (!execution) return Object.freeze(target);
  exact(value.confirmation, ['action', 'tenantId'], errorCode);
  if (value.confirmation.action !== definition.action || id(value.confirmation.tenantId, errorCode) !== tenantId) invalid(errorCode);
  return Object.freeze({
    recoveryContextId: id(value.recoveryContextId, errorCode),
    reason: text(value.reason, 500, errorCode),
    confirmation: Object.freeze({ action: definition.action, tenantId }),
    ...target,
  });
}
