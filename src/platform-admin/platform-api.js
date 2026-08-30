import {
  assertPlatformActionRequest,
  assertPlatformTenantCreateRequest,
  normalizePlatformDirectoryQuery,
  normalizePlatformFleet,
  normalizePlatformInvitationMutationResponse,
  normalizePlatformLifecycleMutationResponse,
  normalizePlatformTenantCreateResponse,
  normalizePlatformTenantDirectoryResponse,
  PlatformAdminContractError,
} from './contracts.js';
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
} from './resource-contracts.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_CODE_PATTERN = /^[a-z][a-z0-9_.-]{0,95}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const ACTION_REQUEST = Object.freeze({
  invitation_revoke: Object.freeze({
    method: 'DELETE',
    operation: 'tenant.invitation.revoke',
    invitationState: 'revoked',
  }),
  invitation_reissue: Object.freeze({
    method: 'POST',
    operation: 'tenant.invitation.reissue',
    invitationState: 'open',
    oneTimeDelivery: true,
  }),
  mark_ready: Object.freeze({
    method: 'POST',
    operation: 'tenant.lifecycle.transition',
    targetStatus: 'ready',
  }),
  activate: Object.freeze({
    method: 'POST',
    operation: 'tenant.lifecycle.transition',
    targetStatus: 'active',
  }),
  suspend: Object.freeze({
    method: 'POST',
    operation: 'tenant.lifecycle.transition',
    targetStatus: 'suspended',
  }),
  reactivate: Object.freeze({
    method: 'POST',
    operation: 'tenant.lifecycle.transition',
    targetStatus: 'active',
  }),
  archive: Object.freeze({
    method: 'POST',
    operation: 'tenant.lifecycle.transition',
    targetStatus: 'archived',
  }),
});

export class PlatformAdminApiError extends Error {
  constructor(code, options = {}) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PlatformAdminApiError';
    this.code = code;
  }
}

function wrapContract(normalizer, payload, code) {
  try {
    return normalizer(payload);
  } catch (error) {
    if (error instanceof PlatformAdminContractError) {
      throw new PlatformAdminApiError(code, { cause: error });
    }
    throw error;
  }
}

function tenantPath(tenantId) {
  if (typeof tenantId !== 'string' || !UUID_PATTERN.test(tenantId)) {
    throw new PlatformAdminApiError('PLATFORM_TENANT_ID_INVALID');
  }
  return encodeURIComponent(tenantId.toLowerCase());
}

function safeCodePath(value, errorCode) {
  if (typeof value !== 'string' || !SAFE_CODE_PATTERN.test(value)) {
    throw new PlatformAdminApiError(errorCode);
  }
  return encodeURIComponent(value);
}

function canonicalInstant(value, errorCode) {
  if (
    typeof value !== 'string'
    || !UTC_INSTANT_PATTERN.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) throw new PlatformAdminApiError(errorCode);
  return value;
}

function requestFailure(code, error) {
  throw new PlatformAdminApiError(code, { cause: error });
}

function pageParameters(query, allowed) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw new PlatformAdminApiError('PLATFORM_QUERY_INVALID');
  }
  if (Object.keys(query).some((key) => !allowed.has(key))) {
    throw new PlatformAdminApiError('PLATFORM_QUERY_INVALID');
  }
  const parameters = new URLSearchParams({ limit: String(query.limit ?? 100) });
  for (const [key, value] of Object.entries(query)) {
    if (key === 'limit' || value === null || value === undefined || value === '') continue;
    parameters.set(key, String(value));
  }
  return parameters;
}

function entitlementMutationRequest(request, tenantId, knownCapabilities) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new PlatformAdminApiError('PLATFORM_ENTITLEMENT_REQUEST_INVALID');
  }
  const proposals = assertPlatformEntitlementProposals(request.proposals, knownCapabilities);
  if (
    !Number.isSafeInteger(request.expectedEntitlementRevision)
    || request.expectedEntitlementRevision < 1
    || typeof request.reason !== 'string'
    || request.reason !== request.reason.trim()
    || request.reason.length < 1
    || request.reason.length > 500
    || !request.confirmation
    || Object.keys(request.confirmation).sort().join(',') !== 'action,tenantId'
    || request.confirmation.action !== 'tenant.entitlement.apply'
    || request.confirmation.tenantId !== tenantId
  ) throw new PlatformAdminApiError('PLATFORM_ENTITLEMENT_REQUEST_INVALID');
  return Object.freeze({
    proposals,
    expectedEntitlementRevision: request.expectedEntitlementRevision,
    reason: request.reason,
    confirmation: Object.freeze({ action: 'tenant.entitlement.apply', tenantId }),
  });
}

function directoryActions(item) {
  const actions = [];
  if (item.invitation.state === 'open') actions.push('invitation_revoke', 'invitation_reissue');
  if (item.lifecycle.status === 'onboarding' && item.onboardingState === 'complete') actions.push('mark_ready');
  if (item.lifecycle.status === 'ready') actions.push('activate');
  if (item.lifecycle.status === 'active') actions.push('suspend');
  if (item.lifecycle.status === 'suspended') actions.push('reactivate', 'archive');
  return actions;
}

function directoryTenant(item) {
  return {
    id: item.tenantId,
    reference: null,
    displayName: item.displayName,
    lifecycleState: item.lifecycle.status,
    version: item.lifecycle.revision,
    onboardingState: item.onboardingState,
    identityState: item.identityState,
    invitationState: item.invitation.state,
    invitationId: item.invitation.id,
    invitationRevision: item.invitation.revision,
    invitationExpiresAt: item.invitation.expiresAt,
    updatedAt: item.updatedAt,
    readiness: null,
    entitlements: null,
    integration: null,
    diagnostics: null,
    usage: null,
    runtime: null,
    // Presentation hints only. The Platform API remains the authorization authority.
    allowedActions: directoryActions(item),
  };
}

function fleetFromDirectory(value) {
  const directory = normalizePlatformTenantDirectoryResponse(value);
  return normalizePlatformFleet({
    tenants: directory.items.map(directoryTenant),
    auditEvents: [],
    evaluatedAt: directory.snapshotAt,
    nextCursor: directory.nextCursor,
  });
}

function actionPath(request, configuration) {
  const tenant = encodeURIComponent(request.tenantId);
  if (configuration.invitationState) {
    const invitation = encodeURIComponent(request.invitationId);
    const suffix = request.action === 'invitation_reissue' ? '/reissue' : '';
    return `tenants/${tenant}/invitations/${invitation}${suffix}`;
  }
  return `tenants/${tenant}/lifecycle/transitions`;
}

function mutationResponse(payload, request, configuration) {
  if (configuration.invitationState) {
    return normalizePlatformInvitationMutationResponse(
      payload,
      request.invitationId,
      configuration.invitationState,
      { oneTimeDelivery: configuration.oneTimeDelivery === true },
    );
  }
  return normalizePlatformLifecycleMutationResponse(payload, request.tenantId, configuration.targetStatus);
}

export function createPlatformAdminApi({
  apiClient,
  idempotencyKeyFactory = () => globalThis.crypto?.randomUUID?.(),
} = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') {
    throw new TypeError('PLATFORM_ADMIN_API_CLIENT_REQUIRED');
  }
  if (typeof idempotencyKeyFactory !== 'function') {
    throw new TypeError('PLATFORM_ADMIN_IDEMPOTENCY_FACTORY_REQUIRED');
  }

  function newIdempotencyKey() {
    const idempotencyKey = idempotencyKeyFactory();
    if (typeof idempotencyKey !== 'string' || !UUID_PATTERN.test(idempotencyKey)) {
      throw new PlatformAdminApiError('PLATFORM_IDEMPOTENCY_KEY_UNAVAILABLE');
    }
    return idempotencyKey;
  }

  return Object.freeze({
    supportsHealthFilter: false,

    async loadFleet(query = {}) {
      const filters = normalizePlatformDirectoryQuery(query);
      if (filters.health !== 'all') {
        throw new PlatformAdminApiError('PLATFORM_DIRECTORY_HEALTH_FILTER_UNSUPPORTED');
      }
      const parameters = new URLSearchParams({ limit: '100' });
      if (filters.cursor) parameters.set('cursor', filters.cursor);
      if (filters.lifecycle !== 'all') parameters.set('lifecycleStatus', filters.lifecycle);
      if (filters.query) parameters.set('search', filters.query);
      let payload;
      try {
        payload = await apiClient.request(`tenants?${parameters.toString()}`);
      } catch (error) {
        throw new PlatformAdminApiError('PLATFORM_FLEET_UNAVAILABLE', { cause: error });
      }
      return wrapContract(fleetFromDirectory, payload, 'PLATFORM_FLEET_RESPONSE_INVALID');
    },

    async createTenant(request) {
      const normalized = assertPlatformTenantCreateRequest(request);
      let payload;
      try {
        payload = await apiClient.request('tenants', {
          method: 'POST',
          body: normalized,
          idempotencyKey: newIdempotencyKey(),
        });
      } catch (error) {
        throw new PlatformAdminApiError('PLATFORM_TENANT_CREATE_FAILED', { cause: error });
      }
      return wrapContract(
        normalizePlatformTenantCreateResponse,
        payload,
        'PLATFORM_TENANT_CREATE_RESPONSE_INVALID',
      );
    },

    async runTenantAction(request) {
      if (!request || !ACTION_REQUEST[request.action]) {
        throw new PlatformAdminApiError('PLATFORM_ACTION_UNSUPPORTED');
      }
      const normalized = assertPlatformActionRequest(request);
      const configuration = ACTION_REQUEST[normalized.action];
      const idempotencyKey = newIdempotencyKey();
      const body = {
        ...(configuration.targetStatus === undefined ? {} : { targetStatus: configuration.targetStatus }),
        expectedRevision: normalized.expectedRevision,
        reason: normalized.reason,
        confirmation: {
          action: configuration.operation,
          tenantId: normalized.tenantId,
        },
      };
      let payload;
      try {
        payload = await apiClient.request(actionPath(normalized, configuration), {
          method: configuration.method,
          body,
          idempotencyKey,
        });
      } catch (error) {
        throw new PlatformAdminApiError('PLATFORM_ACTION_FAILED', { cause: error });
      }
      return wrapContract(
        (value) => mutationResponse(value, normalized, configuration),
        payload,
        'PLATFORM_ACTION_RESPONSE_INVALID',
      );
    },

    async loadReadiness(query = {}) {
      const parameters = pageParameters(query, new Set(['limit', 'cursor', 'lifecycleStatus', 'readinessState', 'blockerCode']));
      try {
        const payload = await apiClient.request(`readiness?${parameters.toString()}`);
        return wrapContract(normalizePlatformReadinessPage, payload, 'PLATFORM_READINESS_RESPONSE_INVALID');
      } catch (error) {
        requestFailure('PLATFORM_READINESS_UNAVAILABLE', error);
      }
    },

    async loadMicrosoftHealth(query = {}) {
      const parameters = pageParameters(query, new Set(['limit', 'cursor', 'lifecycleStatus', 'capability', 'healthStatus', 'incidentScope']));
      try {
        const payload = await apiClient.request(`microsoft365/health?${parameters.toString()}`);
        return wrapContract(normalizePlatformMicrosoftHealthPage, payload, 'PLATFORM_MICROSOFT_HEALTH_RESPONSE_INVALID');
      } catch (error) {
        requestFailure('PLATFORM_MICROSOFT_HEALTH_UNAVAILABLE', error);
      }
    },

    async loadEntitlementWorkspace(tenantId) {
      const tenant = tenantPath(tenantId);
      try {
        const [capabilitiesPayload, packagesPayload, entitlementsPayload] = await Promise.all([
          apiClient.request('capabilities'),
          apiClient.request('packages?limit=100'),
          apiClient.request(`tenants/${tenant}/entitlements`),
        ]);
        return Object.freeze({
          capabilities: wrapContract(normalizePlatformCapabilities, capabilitiesPayload, 'PLATFORM_CAPABILITY_RESPONSE_INVALID'),
          packages: wrapContract(normalizePlatformPackages, packagesPayload, 'PLATFORM_PACKAGE_RESPONSE_INVALID'),
          entitlements: wrapContract(
            (value) => normalizePlatformTenantEntitlements(value, tenantId),
            entitlementsPayload,
            'PLATFORM_ENTITLEMENT_RESPONSE_INVALID',
          ),
        });
      } catch (error) {
        requestFailure('PLATFORM_ENTITLEMENT_WORKSPACE_UNAVAILABLE', error);
      }
    },

    async previewEntitlements({ tenantId, proposals, knownCapabilities } = {}) {
      const tenant = tenantPath(tenantId);
      const normalizedProposals = assertPlatformEntitlementProposals(proposals, knownCapabilities);
      try {
        const payload = await apiClient.request(`tenants/${tenant}/entitlement-previews`, {
          method: 'POST',
          body: { proposals: normalizedProposals },
        });
        return wrapContract(
          (value) => normalizePlatformEntitlementPreview(value, tenantId),
          payload,
          'PLATFORM_ENTITLEMENT_PREVIEW_RESPONSE_INVALID',
        );
      } catch (error) {
        requestFailure('PLATFORM_ENTITLEMENT_PREVIEW_FAILED', error);
      }
    },

    async previewPackage({ tenantId, packageId } = {}) {
      const tenant = tenantPath(tenantId);
      const packagePath = safeCodePath(packageId, 'PLATFORM_PACKAGE_ID_INVALID');
      try {
        const payload = await apiClient.request(`tenants/${tenant}/package-previews/${packagePath}`);
        return wrapContract(
          (value) => normalizePlatformEntitlementPreview(value, tenantId),
          payload,
          'PLATFORM_PACKAGE_PREVIEW_RESPONSE_INVALID',
        );
      } catch (error) {
        requestFailure('PLATFORM_PACKAGE_PREVIEW_FAILED', error);
      }
    },

    async applyEntitlements(request = {}) {
      const tenantId = request.tenantId;
      const tenant = tenantPath(tenantId);
      const normalized = entitlementMutationRequest(request, tenantId, request.knownCapabilities);
      try {
        const payload = await apiClient.request(`tenants/${tenant}/entitlement-applications`, {
          method: 'POST',
          body: normalized,
          idempotencyKey: newIdempotencyKey(),
        });
        return wrapContract(
          (value) => normalizePlatformEntitlementApplication(value, tenantId),
          payload,
          'PLATFORM_ENTITLEMENT_APPLICATION_RESPONSE_INVALID',
        );
      } catch (error) {
        requestFailure('PLATFORM_ENTITLEMENT_APPLICATION_FAILED', error);
      }
    },

    async applyPackage(request = {}) {
      const tenantId = request.tenantId;
      const tenant = tenantPath(tenantId);
      const packagePath = safeCodePath(request.packageId, 'PLATFORM_PACKAGE_ID_INVALID');
      if (
        !Number.isSafeInteger(request.expectedPackageRevision)
        || request.expectedPackageRevision < 1
        || !Number.isSafeInteger(request.expectedEntitlementRevision)
        || request.expectedEntitlementRevision < 1
        || typeof request.reason !== 'string'
        || request.reason !== request.reason.trim()
        || request.reason.length < 1
        || request.reason.length > 500
        || !request.confirmation
        || request.confirmation.action !== 'tenant.entitlement.apply'
        || request.confirmation.tenantId !== tenantId
        || Object.keys(request.confirmation).sort().join(',') !== 'action,tenantId'
      ) throw new PlatformAdminApiError('PLATFORM_PACKAGE_APPLICATION_REQUEST_INVALID');
      try {
        const payload = await apiClient.request(`tenants/${tenant}/package-applications/${packagePath}`, {
          method: 'POST',
          body: {
            expectedPackageRevision: request.expectedPackageRevision,
            expectedEntitlementRevision: request.expectedEntitlementRevision,
            reason: request.reason,
            confirmation: request.confirmation,
          },
          idempotencyKey: newIdempotencyKey(),
        });
        return wrapContract(
          (value) => normalizePlatformEntitlementApplication(value, tenantId),
          payload,
          'PLATFORM_PACKAGE_APPLICATION_RESPONSE_INVALID',
        );
      } catch (error) {
        requestFailure('PLATFORM_PACKAGE_APPLICATION_FAILED', error);
      }
    },

    async loadDiagnostics(tenantId) {
      const tenant = tenantPath(tenantId);
      try {
        const payload = await apiClient.request(`tenants/${tenant}/diagnostics`);
        return wrapContract(
          (value) => normalizePlatformDiagnosticSummary(value, tenantId),
          payload,
          'PLATFORM_DIAGNOSTIC_RESPONSE_INVALID',
        );
      } catch (error) {
        requestFailure('PLATFORM_DIAGNOSTIC_UNAVAILABLE', error);
      }
    },

    async lookupCorrelation({ tenantId, correlationId, from, to, limit = 100 } = {}) {
      const tenant = tenantPath(tenantId);
      if (!UUID_PATTERN.test(correlationId || '') || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new PlatformAdminApiError('PLATFORM_CORRELATION_REQUEST_INVALID');
      }
      const normalizedFrom = canonicalInstant(from, 'PLATFORM_CORRELATION_REQUEST_INVALID');
      const normalizedTo = canonicalInstant(to, 'PLATFORM_CORRELATION_REQUEST_INVALID');
      if (Date.parse(normalizedFrom) >= Date.parse(normalizedTo)) {
        throw new PlatformAdminApiError('PLATFORM_CORRELATION_REQUEST_INVALID');
      }
      const parameters = new URLSearchParams({ from: normalizedFrom, to: normalizedTo, limit: String(limit) });
      try {
        const payload = await apiClient.request(`tenants/${tenant}/diagnostics/correlations/${encodeURIComponent(correlationId)}?${parameters}`);
        return wrapContract(
          (value) => normalizePlatformCorrelation(value, tenantId, correlationId.toLowerCase()),
          payload,
          'PLATFORM_CORRELATION_RESPONSE_INVALID',
        );
      } catch (error) {
        requestFailure('PLATFORM_CORRELATION_UNAVAILABLE', error);
      }
    },

    async loadAudit({ limit = 100, beforeSequence = null, exportView = false } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (beforeSequence !== null && (!Number.isSafeInteger(beforeSequence) || beforeSequence < 1))) {
        throw new PlatformAdminApiError('PLATFORM_AUDIT_QUERY_INVALID');
      }
      const parameters = new URLSearchParams({ limit: String(limit) });
      if (beforeSequence !== null) parameters.set('beforeSequence', String(beforeSequence));
      try {
        const payload = await apiClient.request(`audit/${exportView ? 'exports' : 'events'}?${parameters}`);
        return wrapContract(normalizePlatformAuditPage, payload, 'PLATFORM_AUDIT_RESPONSE_INVALID');
      } catch (error) {
        requestFailure('PLATFORM_AUDIT_UNAVAILABLE', error);
      }
    },

    async loadMetering(tenantId, periodStart) {
      const tenant = tenantPath(tenantId);
      const start = canonicalInstant(periodStart, 'PLATFORM_METERING_PERIOD_INVALID');
      if (!start.endsWith('-01T00:00:00.000Z')) throw new PlatformAdminApiError('PLATFORM_METERING_PERIOD_INVALID');
      try {
        const payload = await apiClient.request(`tenants/${tenant}/metering/usage?periodStart=${encodeURIComponent(start)}`);
        return wrapContract(
          (value) => normalizePlatformMeteringUsage(value, tenantId),
          payload,
          'PLATFORM_METERING_RESPONSE_INVALID',
        );
      } catch (error) {
        requestFailure('PLATFORM_METERING_UNAVAILABLE', error);
      }
    },

    async setQuota({ tenantId, dimension, ...request } = {}) {
      const tenant = tenantPath(tenantId);
      const dimensionPath = safeCodePath(dimension, 'PLATFORM_METERING_DIMENSION_INVALID');
      const normalized = assertPlatformQuotaRequest(request, tenantId, dimension);
      try {
        const payload = await apiClient.request(`tenants/${tenant}/quotas/${dimensionPath}`, {
          method: 'POST',
          body: normalized,
          idempotencyKey: newIdempotencyKey(),
        });
        return wrapContract(
          (value) => normalizePlatformQuotaMutation(value, tenantId, dimension),
          payload,
          'PLATFORM_QUOTA_RESPONSE_INVALID',
        );
      } catch (error) {
        requestFailure('PLATFORM_QUOTA_UPDATE_FAILED', error);
      }
    },

    async loadRuntimeDeployments() {
      try {
        const payload = await apiClient.request('runtime/deployments');
        return wrapContract(normalizePlatformRuntimeDeployments, payload, 'PLATFORM_RUNTIME_RESPONSE_INVALID');
      } catch (error) {
        requestFailure('PLATFORM_RUNTIME_UNAVAILABLE', error);
      }
    },

    async loadTenantRuntime(tenantId) {
      const tenant = tenantPath(tenantId);
      try {
        const payload = await apiClient.request(`tenants/${tenant}/runtime`);
        return wrapContract(
          (value) => normalizePlatformTenantRuntime(value, tenantId),
          payload,
          'PLATFORM_RUNTIME_RESPONSE_INVALID',
        );
      } catch (error) {
        requestFailure('PLATFORM_RUNTIME_UNAVAILABLE', error);
      }
    },

    async loadRecoveryTargets({ tenantId, recoveryId, cursor = null, limit = 50 } = {}) {
      const tenant = tenantPath(tenantId);
      const definition = platformRecoveryDefinition(recoveryId);
      if (!definition.targetField) throw new PlatformAdminApiError('PLATFORM_RECOVERY_TARGET_NOT_REQUIRED');
      const query = new URLSearchParams({ limit: String(limit) });
      if (cursor !== null) query.set('cursor', cursor);
      try {
        const payload = await apiClient.request(
          `tenants/${tenant}/recovery/${definition.id}/targets?${query.toString()}`,
        );
        return wrapContract(
          (value) => normalizePlatformRecoveryTargets(value, tenantId, definition),
          payload,
          'PLATFORM_RECOVERY_TARGETS_RESPONSE_INVALID',
        );
      } catch (error) {
        requestFailure('PLATFORM_RECOVERY_TARGETS_UNAVAILABLE', error);
      }
    },

    async previewRecovery({ tenantId, recoveryId, ...request } = {}) {
      const tenant = tenantPath(tenantId);
      const definition = platformRecoveryDefinition(recoveryId);
      const body = assertPlatformRecoveryRequest(request, tenantId, definition);
      try {
        const payload = await apiClient.request(`tenants/${tenant}/recovery/${definition.id}/previews`, {
          method: 'POST',
          body,
        });
        return wrapContract(
          (value) => normalizePlatformRecoveryPreview(value, tenantId, definition),
          payload,
          'PLATFORM_RECOVERY_PREVIEW_RESPONSE_INVALID',
        );
      } catch (error) {
        requestFailure('PLATFORM_RECOVERY_PREVIEW_FAILED', error);
      }
    },

    async executeRecovery({ tenantId, recoveryId, ...request } = {}) {
      const tenant = tenantPath(tenantId);
      const definition = platformRecoveryDefinition(recoveryId);
      const body = assertPlatformRecoveryRequest(request, tenantId, definition, { execution: true });
      try {
        const payload = await apiClient.request(`tenants/${tenant}/recovery/${definition.id}/executions`, {
          method: 'POST',
          body,
          idempotencyKey: newIdempotencyKey(),
        });
        return wrapContract(normalizePlatformRecoveryExecution, payload, 'PLATFORM_RECOVERY_EXECUTION_RESPONSE_INVALID');
      } catch (error) {
        requestFailure('PLATFORM_RECOVERY_EXECUTION_FAILED', error);
      }
    },
  });
}
