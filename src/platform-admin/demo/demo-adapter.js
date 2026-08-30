import {
  assertPlatformActionRequest,
  assertPlatformTenantCreateRequest,
  normalizePlatformActionResult,
  normalizePlatformDirectoryQuery,
  normalizePlatformFleet,
  normalizePlatformTenantCreateResponse,
  PlatformAdminContractError,
  shouldPresentPlatformAction,
  shouldPresentPlatformPermission,
} from '../contracts.js';
import { PLATFORM_ADMIN_DEMO_ROLE_IDS, platformAdminDemoOperator } from './operator-fixtures.js';
import { createPendingPlatformAdminDemoTenant } from './fixtures.js';
import {
  assertPlatformEntitlementProposals,
  assertPlatformQuotaRequest,
  assertPlatformRecoveryRequest,
  normalizePlatformAuditPage,
  normalizePlatformCapabilities,
  normalizePlatformCorrelation,
  normalizePlatformDiagnosticSummary,
  normalizePlatformEntitlementApplication,
  normalizePlatformEntitlementPreview,
  normalizePlatformMeteringUsage,
  normalizePlatformMicrosoftHealthPage,
  normalizePlatformPackages,
  normalizePlatformQuotaMutation,
  normalizePlatformReadinessPage,
  normalizePlatformRecoveryExecution,
  normalizePlatformRecoveryPreview,
  normalizePlatformRecoveryTargets,
  normalizePlatformRuntimeDeployments,
  normalizePlatformTenantEntitlements,
  normalizePlatformTenantRuntime,
  platformRecoveryDefinition,
} from '../resource-contracts.js';

const ACTION_AUDIT = Object.freeze({
  invitation_revoke: 'invitation_revoked',
  invitation_reissue: 'invitation_reissued',
  mark_ready: 'tenant_marked_ready',
  activate: 'tenant_activated',
  suspend: 'tenant_suspended',
  reactivate: 'tenant_reactivated',
  archive: 'tenant_archived',
});

const EVALUATED_AT = '2026-08-01T08:00:00.000Z';
const DEMO_NOW = Date.parse('2099-01-01T00:01:00.000Z');
const CAPABILITIES = Object.freeze([
  Object.freeze({ capabilityId: 'microsoft.calendar', dependencies: Object.freeze([]) }),
  Object.freeze({ capabilityId: 'microsoft.calendar.write', dependencies: Object.freeze(['microsoft.calendar']) }),
  Object.freeze({ capabilityId: 'tenant.administration', dependencies: Object.freeze([]) }),
  Object.freeze({ capabilityId: 'tenant.audit_history', dependencies: Object.freeze([]) }),
]);
const PACKAGES = Object.freeze([
  Object.freeze({ packageId: 'operations-core', revision: 2, name: 'Operations Core', description: 'Tenant administration and audit history.', status: 'active' }),
  Object.freeze({ packageId: 'microsoft-calendar', revision: 3, name: 'Microsoft Calendar', description: 'Calendar read and write capabilities.', status: 'active' }),
]);
const PACKAGE_PROPOSALS = Object.freeze({
  'operations-core': Object.freeze([
    Object.freeze({ capabilityId: 'tenant.administration', enabled: true }),
    Object.freeze({ capabilityId: 'tenant.audit_history', enabled: true }),
  ]),
  'microsoft-calendar': Object.freeze([
    Object.freeze({ capabilityId: 'microsoft.calendar', enabled: true }),
    Object.freeze({ capabilityId: 'microsoft.calendar.write', enabled: true }),
  ]),
});
const METERING_DIMENSIONS = Object.freeze([
  'active_users',
  'active_rooms',
  'requests_created',
  'bookings_confirmed',
  'integration_operations',
]);

export class PlatformAdminDemoError extends Error {
  constructor(code, options = {}) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PlatformAdminDemoError';
    this.code = code;
  }
}

function allowedActionsFor(tenant) {
  if (tenant.lifecycleState === 'archived') return [];
  if (tenant.lifecycleState === 'pending') {
    return tenant.invitationState === 'open' ? ['invitation_revoke', 'invitation_reissue'] : [];
  }
  if (tenant.lifecycleState === 'onboarding') {
    const invitationActions = tenant.invitationState === 'open'
      ? ['invitation_revoke', 'invitation_reissue']
      : [];
    return [
      ...invitationActions,
      ...(tenant.invitationState === 'consumed' && tenant.readiness.state === 'ready' ? ['mark_ready'] : []),
    ];
  }
  if (tenant.lifecycleState === 'ready') return ['activate'];
  const operational = tenant.lifecycleState === 'active' ? ['suspend'] : ['reactivate', 'archive'];
  return operational;
}

function applyAction(tenant, action) {
  if (action === 'invitation_revoke') {
    tenant.invitationState = 'revoked';
    tenant.invitationRevision += 1;
  } else if (action === 'invitation_reissue') {
    tenant.invitationState = 'open';
    tenant.invitationRevision += 1;
    tenant.invitationExpiresAt = '2099-01-02T08:00:00.000Z';
  } else if (action === 'mark_ready') {
    tenant.lifecycleState = 'ready';
  } else if (action === 'activate') {
    tenant.lifecycleState = 'active';
  } else if (action === 'suspend') {
    tenant.lifecycleState = 'suspended';
  } else if (action === 'reactivate') {
    tenant.lifecycleState = 'active';
  } else if (action === 'archive') {
    tenant.lifecycleState = 'archived';
  }
  tenant.version += 1;
  tenant.updatedAt = '2026-08-01T09:00:00.000Z';
  tenant.allowedActions = allowedActionsFor(tenant);
}

function eventId(counter) {
  return `50000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

function occurredAt(counter) {
  return new Date(Date.parse(EVALUATED_AT) + (counter * 60_000)).toISOString();
}

function requireTenant(document, tenantId) {
  const tenant = document.tenants.find(({ id }) => id === tenantId);
  if (!tenant) throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_TENANT_NOT_FOUND');
  return tenant;
}

function requirePermission(document, permission) {
  const operator = platformAdminDemoOperator(document.roleId);
  if (!shouldPresentPlatformPermission(operator, permission, DEMO_NOW)) {
    throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_OPERATOR_DENIED');
  }
  return operator;
}

function lifecycleFilter(items, query = {}) {
  return items.filter((item) => !query.lifecycleStatus || item.lifecycle.status === query.lifecycleStatus);
}

function entitlementProjection(tenant) {
  return {
    tenantId: tenant.id,
    tenantStatus: tenant.lifecycleState,
    revision: tenant.version,
    entries: tenant.entitlements.map(({ id: capabilityId, state }) => ({
      capabilityId,
      enabled: state === 'enabled',
      effectiveAt: '2026-08-01T08:00:00.000Z',
    })).sort((left, right) => left.capabilityId.localeCompare(right.capabilityId)),
  };
}

function entitlementPlan(tenant, proposals) {
  const current = new Map(tenant.entitlements.map(({ id: capabilityId, state }) => [capabilityId, state === 'enabled']));
  const changes = proposals.filter(({ capabilityId, enabled }) => current.get(capabilityId) !== enabled)
    .map(({ capabilityId, enabled }) => ({ capabilityId, previousEnabled: current.get(capabilityId), enabled }));
  if (tenant.lifecycleState === 'archived' && changes.length) {
    throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_ENTITLEMENT_DENIED');
  }
  if (['pending', 'suspended'].includes(tenant.lifecycleState) && changes.some(({ enabled }) => enabled)) {
    throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_ENTITLEMENT_DENIED');
  }
  const candidate = new Map(current);
  proposals.forEach(({ capabilityId, enabled }) => candidate.set(capabilityId, enabled));
  if (candidate.get('microsoft.calendar.write') && !candidate.get('microsoft.calendar')) {
    throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_ENTITLEMENT_DEPENDENCY_MISSING');
  }
  return {
    tenantId: tenant.id,
    tenantStatus: tenant.lifecycleState,
    sourceRevision: tenant.version,
    changed: changes.length > 0,
    changes,
  };
}

function platformAuditProjection(event, index, operator) {
  const action = Object.freeze({
    tenant_registered: 'platform.tenant.registration.changed',
    invitation_created: 'platform.tenant.invitation.changed',
    invitation_revoked: 'platform.tenant.invitation.changed',
    invitation_reissued: 'platform.tenant.invitation.changed',
    tenant_marked_ready: 'platform.tenant.lifecycle.changed',
    tenant_activated: 'platform.tenant.lifecycle.changed',
    tenant_suspended: 'platform.tenant.lifecycle.changed',
    tenant_reactivated: 'platform.tenant.lifecycle.changed',
    tenant_archived: 'platform.tenant.lifecycle.changed',
    entitlement_enabled: 'platform.tenant.entitlement.changed',
    entitlement_disabled: 'platform.tenant.entitlement.changed',
    quota_changed: 'platform.tenant.quota.changed',
    recovery_executed: 'platform.recovery.executed',
  })[event.action] || 'platform.tenant.configuration.changed';
  return {
    sequence: index + 1,
    operatorId: operator.id,
    roles: operator.roles,
    permissions: operator.permissions,
    assuranceLevel: operator.assurance.level,
    targetTenantId: event.tenantId,
    action,
    targetType: 'tenant',
    targetId: event.tenantId,
    previousState: null,
    newState: null,
    occurredAt: event.occurredAt,
    correlationId: event.correlationId,
    outcome: event.result === 'succeeded' ? 'success' : event.result,
    metadata: {},
    retentionClass: action === 'platform.recovery.executed' ? 'recovery' : 'administrative',
  };
}

function runtimeProjection(tenant, environment = 'pilot') {
  const state = tenant.runtime.state === 'current'
    ? 'ready'
    : tenant.runtime.state === 'migration_required'
      ? 'mismatch'
      : 'degraded';
  return {
    schemaVersion: 1,
    environment,
    deployment: { reference: `demo-${environment}`, deployedAt: '2026-08-01T07:00:00.000Z' },
    components: {
      frontend: { expectedVersion: '3.0.0', expectedBuildId: 'frontend-demo-3', version: tenant.runtime.frontendVersion, buildId: 'frontend-demo-3', state: 'current' },
      api: { expectedVersion: '3.0.0', expectedBuildId: 'api-demo-3', version: tenant.runtime.apiVersion, buildId: 'api-demo-3', state: 'current' },
    },
    databaseSchema: { expectedVersion: 3, currentVersion: tenant.runtime.schemaVersion, state: tenant.runtime.schemaVersion === 3 ? 'current' : 'mismatch' },
    dependencies: { required: state === 'ready' ? 'ready' : 'not_ready', optional: state === 'degraded' ? 'degraded' : 'ready', state: state === 'ready' ? 'ready' : state === 'degraded' ? 'degraded' : 'not_ready' },
    freshness: { state: 'fresh', observedAt: '2026-08-01T08:00:00.000Z', maxAgeSeconds: 300 },
    evidence: { release: 'REL-DEMO-3', change: 'CHG-DEMO-3', rollback: 'RB-DEMO-3', runbook: 'RUN-DEMO-3' },
    metadataState: state === 'mismatch' ? 'mismatch' : 'current',
    operationalState: state === 'ready' ? 'ready' : state === 'degraded' ? 'degraded' : 'not_ready',
    overallState: state,
    reasonCodes: state === 'ready' ? [] : [state === 'mismatch' ? 'schema_version_mismatch' : 'optional_dependencies_degraded'],
  };
}

export function createPlatformAdminDemoAdapter({ store } = {}) {
  if (
    !store
    || typeof store.read !== 'function'
    || typeof store.write !== 'function'
    || typeof store.reset !== 'function'
  ) throw new TypeError('PLATFORM_ADMIN_DEMO_STORE_REQUIRED');

  const recoveryContexts = new Map();

  return Object.freeze({
    supportsHealthFilter: true,

    operator() {
      return platformAdminDemoOperator(store.read().roleId);
    },

    setRole(roleId) {
      if (!PLATFORM_ADMIN_DEMO_ROLE_IDS.includes(roleId)) {
        throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_ROLE_INVALID');
      }
      const document = store.read();
      document.roleId = roleId;
      store.write(document);
      return platformAdminDemoOperator(roleId);
    },

    reset() {
      const document = store.reset();
      return platformAdminDemoOperator(document.roleId);
    },

    async loadFleet(query = {}) {
      const filters = normalizePlatformDirectoryQuery(query);
      const document = store.read();
      const operator = platformAdminDemoOperator(document.roleId);
      const normalizedQuery = filters.query.toLocaleLowerCase('en');
      const tenants = document.tenants.filter((tenant) => (
        (!normalizedQuery
          || tenant.displayName.toLocaleLowerCase('en').includes(normalizedQuery)
          || tenant.reference.toLocaleLowerCase('en').includes(normalizedQuery))
        && (filters.lifecycle === 'all' || tenant.lifecycleState === filters.lifecycle)
        && (filters.health === 'all' || tenant.integration.state === filters.health)
      )).map((tenant) => ({
        ...tenant,
        diagnostics: operator.permissions.includes('platform:diagnostics:sensitive')
          ? tenant.diagnostics
          : { ...tenant.diagnostics, lastCorrelationId: null },
      }));
      const ids = new Set(tenants.map(({ id }) => id));
      return normalizePlatformFleet({
        tenants,
        auditEvents: operator.permissions.includes('platform:audit:read')
          ? document.auditEvents.filter(({ tenantId }) => ids.has(tenantId))
          : [],
        evaluatedAt: occurredAt(document.mutationCounter),
        nextCursor: null,
      });
    },

    async createTenant(request) {
      let normalized;
      try {
        normalized = assertPlatformTenantCreateRequest(request);
      } catch (error) {
        throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_CREATE_INVALID', { cause: error });
      }
      const document = store.read();
      const operator = platformAdminDemoOperator(document.roleId);
      if (!shouldPresentPlatformPermission(
        operator,
        'platform:invitation:manage',
        Date.parse('2099-01-01T00:01:00.000Z'),
      )) throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_OPERATOR_DENIED');

      document.mutationCounter += 1;
      const serial = document.mutationCounter + 100;
      const createdAt = occurredAt(document.mutationCounter);
      const tenant = createPendingPlatformAdminDemoTenant({
        id: `10000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
        invitationId: `90000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
        reference: `TEN-${String(serial).padStart(3, '0')}`,
        displayName: normalized.displayName,
        createdAt,
      });
      document.tenants.push(tenant);
      document.auditEvents.unshift({
        id: eventId(document.mutationCounter),
        tenantId: tenant.id,
        occurredAt: createdAt,
        action: 'invitation_created',
        actorType: 'operator',
        result: 'succeeded',
        correlationId: `80000000-0000-4000-8000-${String(document.mutationCounter).padStart(12, '0')}`,
      });
      store.write(document);
      return normalizePlatformTenantCreateResponse({
        schemaVersion: 1,
        outcome: 'updated',
        tenant: {
          tenantId: tenant.id,
          displayName: tenant.displayName,
          status: 'pending',
          revision: tenant.version,
          createdAt,
        },
        invitation: {
          invitationId: tenant.invitationId,
          state: 'open',
          revision: tenant.invitationRevision,
          expiresAt: tenant.invitationExpiresAt,
        },
        oneTimeDelivery: {
          available: true,
          token: 'D'.repeat(43),
          expiresAt: tenant.invitationExpiresAt,
        },
      });
    },

    async runTenantAction(request) {
      let normalized;
      try {
        normalized = assertPlatformActionRequest(request);
      } catch (error) {
        throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_ACTION_INVALID', { cause: error });
      }
      const document = store.read();
      const tenant = document.tenants.find(({ id }) => id === normalized.tenantId);
      if (!tenant) throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_TENANT_NOT_FOUND');
      if (tenant.version !== normalized.expectedRevision) {
        throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_VERSION_CONFLICT');
      }
      if (!tenant.allowedActions.includes(normalized.action)) {
        throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_ACTION_DENIED');
      }
      const operator = platformAdminDemoOperator(document.roleId);
      if (!shouldPresentPlatformAction(
        operator,
        tenant,
        normalized.action,
        Date.parse('2099-01-01T00:01:00.000Z'),
      )) {
        throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_OPERATOR_DENIED');
      }

      applyAction(tenant, normalized.action);
      document.mutationCounter += 1;
      const auditEvent = {
        id: eventId(document.mutationCounter),
        tenantId: tenant.id,
        occurredAt: occurredAt(document.mutationCounter),
        action: ACTION_AUDIT[normalized.action],
        actorType: 'operator',
        result: 'succeeded',
        correlationId: `80000000-0000-4000-8000-${String(document.mutationCounter).padStart(12, '0')}`,
      };
      document.auditEvents.unshift(auditEvent);
      store.write(document);
      try {
        return normalizePlatformActionResult({ tenant, auditEvent });
      } catch (error) {
        if (error instanceof PlatformAdminContractError) {
          throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_RESULT_INVALID', { cause: error });
        }
        throw error;
      }
    },

    async loadReadiness(query = {}) {
      const document = store.read();
      requirePermission(document, 'platform:readiness:read');
      let items = document.tenants.map((tenant) => ({
        tenantId: tenant.id,
        displayName: tenant.displayName,
        lifecycle: { status: tenant.lifecycleState, revision: tenant.version },
        onboardingState: tenant.onboardingState,
        readiness: {
          state: tenant.readiness.state,
          blockerCodes: tenant.readiness.blockers,
          checks: tenant.readiness.blockers.length
            ? tenant.readiness.blockers.map((reasonCode, index) => ({
              checkId: `check_${index + 1}`,
              category: index === 0 ? 'identity' : 'capability_health',
              state: tenant.readiness.state === 'blocked' ? 'fail' : 'pass',
              reasonCode,
              observedAt: tenant.readiness.evaluatedAt,
              freshness: tenant.readiness.state === 'stale' ? 'stale' : 'fresh',
            }))
            : [{
              checkId: 'core_readiness',
              category: 'capability_health',
              state: 'pass',
              reasonCode: null,
              observedAt: tenant.readiness.evaluatedAt,
              freshness: 'fresh',
            }],
        },
        entitlements: {
          enabledCount: tenant.entitlements.filter(({ state }) => state === 'enabled').length,
          requiredMissingCount: tenant.readiness.state === 'ready' ? 0 : 1,
        },
        evidence: [
          { kind: 'repository', state: 'verified', release: 'demo-3.0.0', verifiedAt: EVALUATED_AT, validUntil: '2099-01-02T08:00:00.000Z' },
          { kind: 'deployment', state: tenant.runtime.state === 'current' ? 'verified' : 'invalid', release: 'demo-3.0.0', verifiedAt: EVALUATED_AT, validUntil: '2099-01-02T08:00:00.000Z' },
          { kind: 'external', state: tenant.integration.state === 'healthy' ? 'verified' : 'missing', release: null, verifiedAt: tenant.integration.state === 'healthy' ? EVALUATED_AT : null, validUntil: tenant.integration.state === 'healthy' ? '2099-01-02T08:00:00.000Z' : null },
        ],
      }));
      items = lifecycleFilter(items, query);
      if (query.readinessState) items = items.filter(({ readiness }) => readiness.state === query.readinessState);
      if (query.blockerCode) items = items.filter(({ readiness }) => readiness.blockerCodes.includes(query.blockerCode));
      return normalizePlatformReadinessPage({
        schemaVersion: 1,
        snapshotAt: EVALUATED_AT,
        items,
        nextCursor: null,
      });
    },

    async loadMicrosoftHealth(query = {}) {
      const document = store.read();
      requirePermission(document, 'platform:integration-health:read');
      let items = document.tenants.map((tenant) => ({
        tenantId: tenant.id,
        displayName: tenant.displayName,
        lifecycle: { status: tenant.lifecycleState, revision: tenant.version },
        connectionState: tenant.integration.state === 'not_configured' ? 'not_configured' : 'connected',
        permissions: {
          places: tenant.integration.directoryState === 'healthy' ? 'granted' : 'missing',
          calendars: tenant.integration.calendarReadState === 'healthy' ? 'granted' : 'missing',
        },
        mappings: { active: tenant.usage.rooms, missing: tenant.integration.state === 'healthy' ? 0 : 1, total: tenant.usage.rooms + (tenant.integration.state === 'healthy' ? 0 : 1) },
        capabilities: [
          {
            capability: 'calendar_read',
            status: tenant.integration.calendarReadState,
            reasonCode: tenant.integration.calendarReadState === 'healthy' ? null : 'calendar_read_unavailable',
            checkedAt: tenant.integration.checkedAt,
            lastSuccessAt: tenant.integration.calendarReadState === 'healthy' ? tenant.integration.checkedAt : null,
            freshness: tenant.readiness.state === 'stale' ? 'stale' : 'fresh',
            incidentScope: tenant.integration.state === 'unavailable' ? 'provider' : 'tenant',
          },
          {
            capability: 'calendar_write',
            status: tenant.integration.calendarWriteState,
            reasonCode: tenant.integration.calendarWriteState === 'healthy' ? null : 'calendar_write_unavailable',
            checkedAt: tenant.integration.checkedAt,
            lastSuccessAt: tenant.integration.calendarWriteState === 'healthy' ? tenant.integration.checkedAt : null,
            freshness: tenant.readiness.state === 'stale' ? 'stale' : 'fresh',
            incidentScope: tenant.integration.state === 'unavailable' ? 'provider' : 'tenant',
          },
        ],
      }));
      items = lifecycleFilter(items, query);
      if (query.capability) items = items.filter(({ capabilities }) => capabilities.some(({ capability }) => capability === query.capability));
      if (query.healthStatus) items = items.filter(({ capabilities }) => capabilities.some(({ status }) => status === query.healthStatus));
      if (query.incidentScope) items = items.filter(({ capabilities }) => capabilities.some(({ incidentScope }) => incidentScope === query.incidentScope));
      return normalizePlatformMicrosoftHealthPage({ schemaVersion: 1, snapshotAt: EVALUATED_AT, items, nextCursor: null });
    },

    async loadEntitlementWorkspace(tenantId) {
      const document = store.read();
      requirePermission(document, 'platform:entitlement:read');
      const tenant = requireTenant(document, tenantId);
      return Object.freeze({
        capabilities: normalizePlatformCapabilities({ schemaVersion: 1, items: CAPABILITIES }),
        packages: normalizePlatformPackages({ schemaVersion: 1, snapshotAt: EVALUATED_AT, items: PACKAGES, nextCursor: null }),
        entitlements: normalizePlatformTenantEntitlements({ schemaVersion: 1, entitlements: entitlementProjection(tenant) }, tenantId),
      });
    },

    async previewEntitlements({ tenantId, proposals, knownCapabilities } = {}) {
      const document = store.read();
      requirePermission(document, 'platform:entitlement:read');
      const tenant = requireTenant(document, tenantId);
      const normalized = assertPlatformEntitlementProposals(proposals, knownCapabilities);
      return normalizePlatformEntitlementPreview({
        schemaVersion: 1,
        source: 'direct',
        plan: entitlementPlan(tenant, normalized),
      }, tenantId);
    },

    async previewPackage({ tenantId, packageId } = {}) {
      const document = store.read();
      requirePermission(document, 'platform:entitlement:read');
      const tenant = requireTenant(document, tenantId);
      const packageValue = PACKAGES.find((entry) => entry.packageId === packageId);
      if (!packageValue) throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_PACKAGE_NOT_FOUND');
      return normalizePlatformEntitlementPreview({
        schemaVersion: 1,
        source: 'package',
        package: {
          packageId: packageValue.packageId,
          revision: packageValue.revision,
          name: packageValue.name,
          description: packageValue.description,
        },
        plan: entitlementPlan(tenant, PACKAGE_PROPOSALS[packageId]),
      }, tenantId);
    },

    async applyEntitlements(request = {}) {
      const document = store.read();
      requirePermission(document, 'platform:entitlement:manage');
      const tenant = requireTenant(document, request.tenantId);
      const proposals = assertPlatformEntitlementProposals(request.proposals, request.knownCapabilities);
      if (
        request.expectedEntitlementRevision !== tenant.version
        || request.confirmation?.action !== 'tenant.entitlement.apply'
        || request.confirmation?.tenantId !== tenant.id
        || typeof request.reason !== 'string'
        || !request.reason.trim()
      ) throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_ENTITLEMENT_STALE');
      const plan = entitlementPlan(tenant, proposals);
      plan.changes.forEach(({ capabilityId, enabled }) => {
        const entry = tenant.entitlements.find(({ id: idValue }) => idValue === capabilityId);
        entry.state = enabled ? 'enabled' : 'disabled';
      });
      if (plan.changed) tenant.version += 1;
      document.mutationCounter += 1;
      document.auditEvents.unshift({
        id: eventId(document.mutationCounter),
        tenantId: tenant.id,
        occurredAt: occurredAt(document.mutationCounter),
        action: plan.changes.some(({ enabled }) => enabled) ? 'entitlement_enabled' : 'entitlement_disabled',
        actorType: 'operator',
        result: 'succeeded',
        correlationId: `80000000-0000-4000-8000-${String(document.mutationCounter).padStart(12, '0')}`,
      });
      store.write(document);
      return normalizePlatformEntitlementApplication({
        schemaVersion: 1,
        outcome: plan.changed ? 'updated' : 'unchanged',
        entitlements: entitlementProjection(tenant),
      }, tenant.id);
    },

    async applyPackage(request = {}) {
      const packageValue = PACKAGES.find(({ packageId }) => packageId === request.packageId);
      if (!packageValue || packageValue.revision !== request.expectedPackageRevision) {
        throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_PACKAGE_STALE');
      }
      return this.applyEntitlements({
        ...request,
        proposals: PACKAGE_PROPOSALS[request.packageId],
        knownCapabilities: CAPABILITIES.map(({ capabilityId }) => capabilityId),
      });
    },

    async loadDiagnostics(tenantId) {
      const document = store.read();
      requirePermission(document, 'platform:diagnostics:read');
      const tenant = requireTenant(document, tenantId);
      return normalizePlatformDiagnosticSummary({
        schemaVersion: 1,
        summary: {
          tenant: { tenantId, displayName: tenant.displayName, lifecycleStatus: tenant.lifecycleState, lifecycleRevision: tenant.version },
          readiness: { state: tenant.readiness.state, blockerCodes: tenant.readiness.blockers, evaluatedAt: tenant.readiness.evaluatedAt },
          entitlements: { revision: tenant.version, enabledCount: tenant.entitlements.filter(({ state }) => state === 'enabled').length },
          microsoft: { connectionState: tenant.integration.state, healthState: tenant.integration.state, freshness: tenant.readiness.state === 'stale' ? 'stale' : 'fresh', lastCheckedAt: tenant.integration.checkedAt },
          mappings: { active: tenant.usage.rooms, missing: tenant.integration.state === 'healthy' ? 0 : 1, total: tenant.usage.rooms + (tenant.integration.state === 'healthy' ? 0 : 1) },
          deployment: { release: 'demo-3.0.0', observedAt: EVALUATED_AT },
          recentFailures: tenant.diagnostics.lastFailureCode ? [{ category: tenant.diagnostics.lastFailureCode, occurredAt: EVALUATED_AT }] : [],
        },
      }, tenantId);
    },

    async lookupCorrelation({ tenantId, correlationId, from, to } = {}) {
      const document = store.read();
      requirePermission(document, 'platform:diagnostics:sensitive');
      const tenant = requireTenant(document, tenantId);
      const matches = tenant.diagnostics.lastCorrelationId === correlationId;
      return normalizePlatformCorrelation({
        schemaVersion: 1,
        tenantId,
        lookupCorrelationId: correlationId,
        from,
        to,
        items: matches ? [{ source: 'platform_audit', occurredAt: EVALUATED_AT, action: 'projection_observed', outcome: 'failure', category: tenant.diagnostics.lastFailureCode, targetType: 'tenant_projection' }] : [],
      }, tenantId, correlationId);
    },

    async loadAudit({ limit = 100, beforeSequence = null } = {}) {
      const document = store.read();
      const operator = requirePermission(document, 'platform:audit:read');
      const projected = document.auditEvents.map((event, index) => platformAuditProjection(event, document.auditEvents.length - index, operator))
        .filter(({ sequence }) => beforeSequence === null || sequence < beforeSequence)
        .slice(0, limit);
      return normalizePlatformAuditPage({ schemaVersion: 1, items: projected });
    },

    async loadMetering(tenantId, periodStart) {
      const document = store.read();
      requirePermission(document, 'platform:metering:read');
      const tenant = requireTenant(document, tenantId);
      const start = new Date(periodStart);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)).toISOString();
      const unknown = tenant.lifecycleState === 'archived';
      const values = Object.freeze({
        active_users: tenant.usage.activeUsers,
        active_rooms: tenant.usage.rooms,
        requests_created: tenant.usage.requestsThisMonth,
        bookings_confirmed: Math.floor(tenant.usage.requestsThisMonth * 0.8),
        integration_operations: tenant.usage.requestsThisMonth * 2,
      });
      return normalizePlatformMeteringUsage({
        schemaVersion: 1,
        tenantId,
        period: { start: periodStart, end, timeZone: 'UTC' },
        dataState: unknown ? 'unknown' : 'complete',
        measuredAt: unknown ? null : EVALUATED_AT,
        reconciledAt: unknown ? null : EVALUATED_AT,
        dimensions: METERING_DIMENSIONS.map((dimension) => ({ dimension, value: unknown ? null : values[dimension] })),
        quotas: METERING_DIMENSIONS.map((dimension) => ({
          dimension,
          state: unknown ? 'unknown' : 'configured',
          softLimit: unknown ? null : 800,
          hardLimit: unknown ? null : 1_000,
          revision: unknown ? null : tenant.version,
        })),
      }, tenantId);
    },

    async setQuota({ tenantId, dimension, ...request } = {}) {
      const document = store.read();
      requirePermission(document, 'platform:quota:manage');
      const tenant = requireTenant(document, tenantId);
      const normalized = assertPlatformQuotaRequest(request, tenantId, dimension);
      if (normalized.expectedRevision !== tenant.version) {
        throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_QUOTA_STALE');
      }
      tenant.version += 1;
      tenant.usage.quotaState = normalized.state === 'not_configured'
        ? 'within_limit'
        : tenant.usage.requestsThisMonth > (normalized.hardLimit ?? Number.MAX_SAFE_INTEGER)
          ? 'exceeded'
          : tenant.usage.requestsThisMonth > (normalized.softLimit ?? Number.MAX_SAFE_INTEGER)
            ? 'approaching_limit'
            : 'within_limit';
      document.mutationCounter += 1;
      document.auditEvents.unshift({
        id: eventId(document.mutationCounter), tenantId, occurredAt: occurredAt(document.mutationCounter),
        action: 'quota_changed', actorType: 'operator', result: 'succeeded',
        correlationId: `80000000-0000-4000-8000-${String(document.mutationCounter).padStart(12, '0')}`,
      });
      store.write(document);
      return normalizePlatformQuotaMutation({
        schemaVersion: 1,
        status: 'updated',
        tenantId,
        quota: { dimension, state: normalized.state, softLimit: normalized.softLimit, hardLimit: normalized.hardLimit, revision: tenant.version },
      }, tenantId, dimension);
    },

    async loadRuntimeDeployments() {
      const document = store.read();
      requirePermission(document, 'platform:runtime:read');
      return normalizePlatformRuntimeDeployments({ schemaVersion: 1, deployments: [runtimeProjection(document.tenants[3])] });
    },

    async loadTenantRuntime(tenantId) {
      const document = store.read();
      requirePermission(document, 'platform:runtime:read');
      const tenant = requireTenant(document, tenantId);
      return normalizePlatformTenantRuntime({ schemaVersion: 1, tenantId, correlationState: 'mapped', runtime: runtimeProjection(tenant) }, tenantId);
    },

    async loadRecoveryTargets({ tenantId, recoveryId, cursor = null } = {}) {
      const document = store.read();
      const definition = platformRecoveryDefinition(recoveryId);
      const permission = recoveryId.includes('session-revocation')
        ? 'platform:session:revoke'
        : 'platform:recovery:execute';
      requirePermission(document, permission);
      requireTenant(document, tenantId);
      if (!definition.targetField || cursor !== null) {
        throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_RECOVERY_TARGET_INVALID');
      }
      const identifier = recoveryId === 'room-mapping-repair'
        ? '33333333-3333-4333-8333-333333333333'
        : '22222222-2222-4222-8222-222222222222';
      const item = recoveryId === 'room-mapping-repair'
        ? {
          mappingId: identifier,
          eligible: true,
          mappingState: 'missing',
          connectionState: 'connected',
          placesPermission: 'granted',
          candidateCount: 1,
        }
        : {
          targetUserId: identifier,
          eligible: true,
          userState: 'active',
          activeSessionCount: 1,
          ...(recoveryId === 'last-tenant-admin' ? {
            identityState: 'active',
            alreadyTenantAdmin: false,
            currentTenantAdminCount: 0,
          } : {}),
        };
      return normalizePlatformRecoveryTargets({
        schemaVersion: 1,
        tenantId,
        operation: recoveryId,
        snapshotAt: '2026-08-28T12:00:00.000Z',
        items: [item],
        nextCursor: null,
      }, tenantId, definition);
    },

    async previewRecovery({ tenantId, recoveryId, ...request } = {}) {
      const document = store.read();
      const definition = platformRecoveryDefinition(recoveryId);
      const permission = recoveryId.includes('session-revocation') ? 'platform:session:revoke' : 'platform:recovery:execute';
      requirePermission(document, permission);
      requireTenant(document, tenantId);
      const normalized = assertPlatformRecoveryRequest(request, tenantId, definition);
      const targetId = definition.targetField ? normalized[definition.targetField] : tenantId;
      const serial = document.mutationCounter + recoveryContexts.size + 1;
      const recoveryContextId = `60000000-0000-4000-8000-${String(serial).padStart(12, '0')}`;
      recoveryContexts.set(recoveryContextId, Object.freeze({ tenantId, recoveryId, targetId }));
      return normalizePlatformRecoveryPreview({
        schemaVersion: 1,
        action: definition.action,
        recoveryContextId,
        expiresAt: '2099-01-01T00:05:00.000Z',
        targetId,
        state: { tenantId, eligible: true },
        impactCodes: [`${recoveryId.replaceAll('-', '_')}.review_required`],
      }, tenantId, definition);
    },

    async executeRecovery({ tenantId, recoveryId, ...request } = {}) {
      const document = store.read();
      const definition = platformRecoveryDefinition(recoveryId);
      const permission = recoveryId.includes('session-revocation') ? 'platform:session:revoke' : 'platform:recovery:execute';
      requirePermission(document, permission);
      const normalized = assertPlatformRecoveryRequest(request, tenantId, definition, { execution: true });
      const context = recoveryContexts.get(normalized.recoveryContextId);
      const targetId = definition.targetField ? normalized[definition.targetField] : tenantId;
      if (!context || context.tenantId !== tenantId || context.recoveryId !== recoveryId || context.targetId !== targetId) {
        throw new PlatformAdminDemoError('PLATFORM_ADMIN_DEMO_RECOVERY_CONTEXT_INVALID');
      }
      recoveryContexts.delete(normalized.recoveryContextId);
      const tenant = requireTenant(document, tenantId);
      let result;
      if (recoveryId === 'tenant-suspension') {
        tenant.lifecycleState = 'suspended';
        tenant.version += 1;
        result = { tenantId, status: 'suspended', revision: tenant.version, changedAt: occurredAt(document.mutationCounter + 1) };
      } else if (recoveryId === 'tenant-reactivation') {
        tenant.lifecycleState = 'active';
        tenant.version += 1;
        result = { tenantId, status: 'active', revision: tenant.version, changedAt: occurredAt(document.mutationCounter + 1) };
      } else if (recoveryId === 'microsoft-reconsent') {
        result = { status: 'customer_action_required', handoffId: `61000000-0000-4000-8000-${String(document.mutationCounter + 1).padStart(12, '0')}`, expiresAt: '2099-01-02T00:00:00.000Z' };
      } else if (recoveryId === 'room-mapping-repair') {
        tenant.integration.state = 'healthy';
        result = { status: 'repaired', mappingRevision: tenant.version + 1 };
      } else if (recoveryId === 'identity-unbind') {
        tenant.identityState = 'unbound';
        result = { status: 'unbound', bindingRevision: tenant.version + 1, revokedSessionCount: 2 };
      } else if (recoveryId.includes('session-revocation')) {
        result = { status: 'revoked', revokedSessionCount: 2, securityRevision: tenant.version + 1 };
      } else {
        result = { status: 'tenant_admin_recovered', tenantRevision: tenant.version + 1, userRevision: 2, revokedSessionCount: 1 };
      }
      tenant.allowedActions = allowedActionsFor(tenant);
      document.mutationCounter += 1;
      document.auditEvents.unshift({
        id: eventId(document.mutationCounter), tenantId, occurredAt: occurredAt(document.mutationCounter),
        action: 'recovery_executed', actorType: 'operator', result: 'succeeded',
        correlationId: `80000000-0000-4000-8000-${String(document.mutationCounter).padStart(12, '0')}`,
      });
      store.write(document);
      return normalizePlatformRecoveryExecution({ schemaVersion: 1, outcome: 'updated', result });
    },
  });
}
