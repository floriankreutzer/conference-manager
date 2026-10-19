import { adapterError, boundedInteger, exactObject, immutable, internalUuid, safeId } from './tenant-settings-wire.js';

const ROOT = 'v1/tenant/catering';
const INVALID = 'CATERING_ASSIGNMENT_RESPONSE_INVALID';
const MAXIMUM_REVISION = Number.MAX_SAFE_INTEGER - 1;

export class CateringCatalogueAssignmentApiError extends Error {
  constructor(code, { cause, serverCode = null, currentRevision = null } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'CateringCatalogueAssignmentApiError';
    this.code = code;
    this.serverCode = serverCode;
    this.currentRevision = currentRevision;
  }
}

function invalid() { throw new CateringCatalogueAssignmentApiError(INVALID); }
function revision(value, minimum = 0, maximum = MAXIMUM_REVISION) {
  return boundedInteger(value, INVALID, { minimum, maximum });
}
function uuid(value) { return internalUuid(value, INVALID).toLowerCase(); }
function assignments(value) {
  if (!Array.isArray(value) || value.length > 400) invalid();
  const seen = new Set();
  const result = Array.from(value, (entry) => {
    exactObject(entry, ['kind', 'entryId', 'integrationId'], INVALID);
    if (entry.kind !== 'item' && entry.kind !== 'package') invalid();
    const entryId = safeId(entry.entryId, INVALID);
    const key = `${entry.kind}:${entryId}`;
    if (seen.has(key)) invalid();
    seen.add(key);
    return { kind: entry.kind, entryId, integrationId: uuid(entry.integrationId) };
  });
  return immutable(result.sort((a, b) => a.kind.localeCompare(b.kind, 'en') || a.entryId.localeCompare(b.entryId, 'en')));
}
function current(value) {
  exactObject(value, ['schemaVersion', 'revision', 'currentCatalogueRevision', 'assignedCatalogueRevision', 'assignments', 'stale'], INVALID);
  if (value.schemaVersion !== 1 || typeof value.stale !== 'boolean') invalid();
  const normalized = { schemaVersion: 1, revision: revision(value.revision),
    currentCatalogueRevision: revision(value.currentCatalogueRevision, 1),
    assignedCatalogueRevision: value.assignedCatalogueRevision === null ? null : revision(value.assignedCatalogueRevision, 1),
    assignments: assignments(value.assignments), stale: value.stale };
  if (normalized.revision === 0 && (normalized.assignedCatalogueRevision !== null || normalized.assignments.length !== 0)) invalid();
  if (normalized.revision > 0 && normalized.assignedCatalogueRevision === null) invalid();
  if (normalized.assignedCatalogueRevision !== null && normalized.assignedCatalogueRevision > normalized.currentCatalogueRevision) invalid();
  if (normalized.assignedCatalogueRevision !== normalized.currentCatalogueRevision && !normalized.stale) invalid();
  return immutable(normalized);
}
function page(value, after) {
  exactObject(value, ['schemaVersion', 'connections', 'nextAfterIntegrationId'], INVALID);
  if (value.schemaVersion !== 1 || !Array.isArray(value.connections) || value.connections.length > 20) invalid();
  let previous = after;
  const connections = Array.from(value.connections, (entry) => {
    exactObject(entry, ['integrationId', 'providerId'], INVALID);
    if (entry.providerId !== 'manual_catering') invalid();
    const integrationId = uuid(entry.integrationId);
    if (previous !== null && integrationId <= previous) invalid();
    previous = integrationId;
    return { integrationId, providerId: entry.providerId };
  });
  const next = value.nextAfterIntegrationId === null ? null : uuid(value.nextAfterIntegrationId);
  if (next !== null && (connections.length !== 20 || next !== previous)) invalid();
  return immutable({ schemaVersion: 1, connections, nextAfterIntegrationId: next });
}

export function createCateringCatalogueAssignmentApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('CATERING_API_CLIENT_REQUIRED');
  const invoke = async (operation) => {
    try { return await operation(); }
    catch (error) { throw adapterError(CateringCatalogueAssignmentApiError, error, 'CATERING_ASSIGNMENT_UNAVAILABLE'); }
  };
  return Object.freeze({
    loadAssignments({ signal } = {}) {
      return invoke(async () => current(await apiClient.request(`${ROOT}/catalogue-assignments`, { signal })));
    },
    listConnections({ afterIntegrationId = null, signal } = {}) {
      return invoke(async () => {
        const after = afterIntegrationId === null ? null : uuid(afterIntegrationId);
        const query = after === null ? '' : `?afterIntegrationId=${encodeURIComponent(after)}`;
        return page(await apiClient.request(`${ROOT}/catalogue-connections${query}`, { signal }), after);
      });
    },
    saveAssignments({ expectedRevision, catalogueRevision, assignments: proposed } = {}) {
      return invoke(async () => {
        const expected = revision(expectedRevision, 0, MAXIMUM_REVISION - 1);
        const source = revision(catalogueRevision, 1);
        const normalized = assignments(proposed);
        const result = current(await apiClient.request(`${ROOT}/catalogue-assignments`, { method: 'PUT', body: {
          schemaVersion: 1, expectedRevision: expected, catalogueRevision: source, assignments: normalized,
        } }));
        if (result.revision !== expected + 1 || result.currentCatalogueRevision !== source
          || result.assignedCatalogueRevision !== source || result.stale
          || JSON.stringify(result.assignments) !== JSON.stringify(normalized)) invalid();
        return result;
      });
    },
  });
}
