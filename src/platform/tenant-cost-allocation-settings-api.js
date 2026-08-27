import {
  adapterError,
  booleanValue,
  boundedText,
  exactObject,
  immutable,
  internalUuid,
  positiveRevision,
  safeId,
  utcInstant,
} from './tenant-settings-wire.js';
import { createTenantBulkSettingsApi } from './tenant-bulk-settings-api.js';

const CURRENT_PATH = 'v1/tenant/settings/cost-allocation';
const HISTORY_PATH = `${CURRENT_PATH}/history`;
const COST_CENTER_CODE = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;

export class TenantCostAllocationSettingsApiError extends Error {
  constructor(code, { cause, serverCode = null, currentRevision = null } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'TenantCostAllocationSettingsApiError';
    this.code = code;
    this.serverCode = serverCode;
    this.currentRevision = currentRevision;
  }
}

function invalid(code = 'TENANT_COST_ALLOCATION_RESPONSE_INVALID') {
  throw new TenantCostAllocationSettingsApiError(code);
}

function costCenter(value) {
  exactObject(value, ['id', 'code', 'name', 'group', 'active'], 'TENANT_COST_ALLOCATION_RESPONSE_INVALID');
  if (typeof value.code !== 'string' || !COST_CENTER_CODE.test(value.code)) invalid();
  return Object.freeze({
    id: safeId(value.id, 'TENANT_COST_ALLOCATION_RESPONSE_INVALID'),
    code: value.code,
    name: boundedText(value.name, { code: 'TENANT_COST_ALLOCATION_RESPONSE_INVALID', maximum: 160 }),
    group: value.group === null ? null : boundedText(value.group, { code: 'TENANT_COST_ALLOCATION_RESPONSE_INVALID', maximum: 160 }),
    active: booleanValue(value.active, 'TENANT_COST_ALLOCATION_RESPONSE_INVALID'),
  });
}

function configuration(value) {
  exactObject(value, ['allocationRequired', 'costCenters'], 'TENANT_COST_ALLOCATION_RESPONSE_INVALID');
  if (!Array.isArray(value.costCenters) || value.costCenters.length > 1_000) invalid();
  const centers = value.costCenters.map(costCenter);
  if (new Set(centers.map((entry) => entry.id)).size !== centers.length
    || new Set(centers.map((entry) => entry.code)).size !== centers.length) invalid();
  return immutable({
    allocationRequired: booleanValue(value.allocationRequired, 'TENANT_COST_ALLOCATION_RESPONSE_INVALID'),
    costCenters: centers,
  });
}

function envelope(value) {
  exactObject(value, ['schemaVersion', 'revision', 'configuration'], 'TENANT_COST_ALLOCATION_RESPONSE_INVALID');
  if (value.schemaVersion !== 1) invalid();
  return Object.freeze({
    schemaVersion: 1,
    revision: positiveRevision(value.revision, 'TENANT_COST_ALLOCATION_RESPONSE_INVALID'),
    configuration: configuration(value.configuration),
  });
}

function wrapped(value) {
  exactObject(value, ['costAllocation'], 'TENANT_COST_ALLOCATION_RESPONSE_INVALID');
  return envelope(value.costAllocation);
}

function history(value) {
  exactObject(value, ['history'], 'TENANT_COST_ALLOCATION_HISTORY_RESPONSE_INVALID');
  if (!Array.isArray(value.history) || value.history.length > 100) invalid('TENANT_COST_ALLOCATION_HISTORY_RESPONSE_INVALID');
  const entries = value.history.map((entry) => {
    exactObject(entry, ['revision', 'changedAt', 'actorUserId'], 'TENANT_COST_ALLOCATION_HISTORY_RESPONSE_INVALID');
    return immutable({
      revision: positiveRevision(entry.revision, 'TENANT_COST_ALLOCATION_HISTORY_RESPONSE_INVALID'),
      changedAt: utcInstant(entry.changedAt, 'TENANT_COST_ALLOCATION_HISTORY_RESPONSE_INVALID'),
      actorUserId: internalUuid(entry.actorUserId, 'TENANT_COST_ALLOCATION_HISTORY_RESPONSE_INVALID'),
    });
  });
  if (new Set(entries.map((entry) => entry.revision)).size !== entries.length) invalid('TENANT_COST_ALLOCATION_HISTORY_RESPONSE_INVALID');
  return Object.freeze(entries);
}

export function createTenantCostAllocationSettingsApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('TENANT_COST_ALLOCATION_API_CLIENT_REQUIRED');
  const bulk = createTenantBulkSettingsApi({
    apiClient,
    basePath: CURRENT_PATH,
    types: ['cost-centers'],
    normalizeApplied: wrapped,
  });
  return Object.freeze({
    ...bulk,
    async loadCostAllocation() {
      try { return wrapped(await apiClient.request(CURRENT_PATH)); }
      catch (error) { throw adapterError(TenantCostAllocationSettingsApiError, error, 'TENANT_COST_ALLOCATION_UNAVAILABLE'); }
    },
    async saveCostAllocation({ expectedRevision, configuration: value } = {}) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) invalid('TENANT_COST_ALLOCATION_REVISION_INVALID');
      try {
        const normalized = configuration(value);
        return wrapped(await apiClient.request(CURRENT_PATH, {
          method: 'PUT', body: { schemaVersion: 1, expectedRevision, configuration: normalized },
        }));
      } catch (error) {
        throw adapterError(TenantCostAllocationSettingsApiError, error, 'TENANT_COST_ALLOCATION_UPDATE_FAILED');
      }
    },
    async listCostAllocationHistory({ limit = 50 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) invalid('TENANT_COST_ALLOCATION_HISTORY_QUERY_INVALID');
      try { return history(await apiClient.request(`${HISTORY_PATH}?limit=${limit}`)); }
      catch (error) { throw adapterError(TenantCostAllocationSettingsApiError, error, 'TENANT_COST_ALLOCATION_HISTORY_UNAVAILABLE'); }
    },
    async loadCostAllocationRevision(revision) {
      if (!Number.isSafeInteger(revision) || revision < 1) invalid('TENANT_COST_ALLOCATION_REVISION_INVALID');
      try {
        const payload = await apiClient.request(`${HISTORY_PATH}/${revision}`);
        exactObject(payload, ['revision'], 'TENANT_COST_ALLOCATION_HISTORY_RESPONSE_INVALID');
        const snapshot = payload.revision;
        exactObject(snapshot, ['revision', 'configuration', 'changedAt', 'actorUserId'], 'TENANT_COST_ALLOCATION_HISTORY_RESPONSE_INVALID');
        return immutable({
          revision: positiveRevision(snapshot.revision, 'TENANT_COST_ALLOCATION_HISTORY_RESPONSE_INVALID'),
          configuration: configuration(snapshot.configuration),
          changedAt: utcInstant(snapshot.changedAt, 'TENANT_COST_ALLOCATION_HISTORY_RESPONSE_INVALID'),
          actorUserId: internalUuid(snapshot.actorUserId, 'TENANT_COST_ALLOCATION_HISTORY_RESPONSE_INVALID'),
        });
      } catch (error) {
        throw adapterError(TenantCostAllocationSettingsApiError, error, 'TENANT_COST_ALLOCATION_HISTORY_UNAVAILABLE');
      }
    },
  });
}

export function assertPercentageAllocation(entries, activeCostCenterIds, { allocationRequired = false } = {}) {
  if (!Array.isArray(entries) || entries.length > 100 || !(activeCostCenterIds instanceof Set)) {
    throw new TypeError('TENANT_COST_ALLOCATION_PERCENTAGES_INVALID');
  }
  const seen = new Set();
  let totalBasisPoints = 0;
  const normalized = entries.map((entry) => {
    try { exactObject(entry, ['costCenterId', 'percentageBasisPoints'], 'TENANT_COST_ALLOCATION_PERCENTAGES_INVALID'); }
    catch { throw new TypeError('TENANT_COST_ALLOCATION_PERCENTAGES_INVALID'); }
    let costCenterId;
    try { costCenterId = safeId(entry.costCenterId, 'TENANT_COST_ALLOCATION_PERCENTAGES_INVALID'); }
    catch { throw new TypeError('TENANT_COST_ALLOCATION_PERCENTAGES_INVALID'); }
    if (seen.has(costCenterId) || !activeCostCenterIds.has(costCenterId)
      || !Number.isSafeInteger(entry.percentageBasisPoints)
      || entry.percentageBasisPoints < 1 || entry.percentageBasisPoints > 10_000) {
      throw new TypeError('TENANT_COST_ALLOCATION_PERCENTAGES_INVALID');
    }
    seen.add(costCenterId);
    totalBasisPoints += entry.percentageBasisPoints;
    return Object.freeze({ costCenterId, percentageBasisPoints: entry.percentageBasisPoints });
  });
  if (normalized.length === 0 && allocationRequired) {
    throw new TypeError('TENANT_COST_ALLOCATION_REQUIRED');
  }
  if (normalized.length > 0 && totalBasisPoints !== 10_000) {
    throw new TypeError('TENANT_COST_ALLOCATION_PERCENTAGES_MUST_TOTAL_100');
  }
  return Object.freeze({
    model: 'percentage_basis_points',
    totalBasisPoints,
    entries: Object.freeze(normalized),
  });
}
