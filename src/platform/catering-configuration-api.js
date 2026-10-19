import { CATERING_CAPABILITIES, CATERING_INITIAL_MODES, CATERING_MODES } from '../shared/catering-configuration.js';
import { adapterError, boundedInteger, exactObject, immutable, internalUuid } from './tenant-settings-wire.js';

const ROOT = 'v1/integrations/catering';
const INVALID = 'CATERING_CONFIGURATION_RESPONSE_INVALID';
const MODES = new Set(CATERING_MODES);
const INITIAL_MODES = new Set(CATERING_INITIAL_MODES);

export class CateringConfigurationApiError extends Error {
  constructor(code, { cause, serverCode = null, currentRevision = null } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'CateringConfigurationApiError';
    this.code = code;
    this.serverCode = serverCode;
    this.currentRevision = currentRevision;
  }
}

function invalid() { throw new CateringConfigurationApiError(INVALID); }
function providerId(value) {
  // Explicit UI/provider compatibility: no unknown supplier is silently rendered as a known adapter.
  if (value !== 'manual_catering') invalid();
  return value;
}
function modes(value) {
  exactObject(value, CATERING_CAPABILITIES, INVALID);
  for (const mode of Object.values(value)) if (!MODES.has(mode)) invalid();
  return immutable(Object.fromEntries(CATERING_CAPABILITIES.map((key) => [key, value[key]])));
}
function configuration(value) {
  exactObject(value, ['initialOrderMode', 'capabilities'], INVALID);
  if (!INITIAL_MODES.has(value.initialOrderMode)) invalid();
  return immutable({ initialOrderMode: value.initialOrderMode, capabilities: modes(value.capabilities) });
}
function current(value) {
  exactObject(value, ['schemaVersion', 'integrationId', 'providerId', 'revision', 'configuration'], INVALID);
  if (value.schemaVersion !== 1) invalid();
  return immutable({ schemaVersion: 1, integrationId: internalUuid(value.integrationId, INVALID).toLowerCase(),
    providerId: providerId(value.providerId),
    revision: boundedInteger(value.revision, INVALID, { minimum: 1, maximum: Number.MAX_SAFE_INTEGER - 1 }),
    configuration: configuration(value.configuration) });
}
function page(value, afterIntegrationId) {
  exactObject(value, ['schemaVersion', 'providers', 'connections', 'nextAfterIntegrationId'], INVALID);
  if (value.schemaVersion !== 1 || !Array.isArray(value.providers) || value.providers.length > 32
    || !Array.isArray(value.connections) || value.connections.length > 20) invalid();
  const providers = value.providers.map((entry) => {
    exactObject(entry, ['providerId', 'capabilities'], INVALID);
    return immutable({ providerId: providerId(entry.providerId), capabilities: modes(entry.capabilities) });
  });
  if (new Set(providers.map((entry) => entry.providerId)).size !== providers.length) invalid();
  const connections = value.connections.map(current);
  let previous = afterIntegrationId;
  for (const entry of connections) {
    const source = providers.find((candidate) => candidate.providerId === entry.providerId);
    if (!source || (previous !== null && entry.integrationId <= previous)) invalid();
    for (const capability of CATERING_CAPABILITIES) {
      const mode = entry.configuration.capabilities[capability];
      if (mode !== 'unsupported' && mode !== source.capabilities[capability]) invalid();
    }
    previous = entry.integrationId;
  }
  const next = value.nextAfterIntegrationId === null ? null : internalUuid(value.nextAfterIntegrationId, INVALID).toLowerCase();
  if (next !== null && (connections.length !== 20 || next !== connections.at(-1).integrationId)) invalid();
  return immutable({ schemaVersion: 1, providers, connections, nextAfterIntegrationId: next });
}

export function createCateringConfigurationApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('CATERING_API_CLIENT_REQUIRED');
  const invoke = async (operation) => {
    try { return await operation(); }
    catch (error) { throw adapterError(CateringConfigurationApiError, error, 'CATERING_CONFIGURATION_UNAVAILABLE'); }
  };
  return Object.freeze({
    listConnections({ afterIntegrationId = null, signal } = {}) {
      return invoke(async () => {
        const after = afterIntegrationId === null ? null : internalUuid(afterIntegrationId, INVALID).toLowerCase();
        const query = after === null ? '' : `?afterIntegrationId=${encodeURIComponent(after)}`;
        return page(await apiClient.request(ROOT + query, { signal }), after);
      });
    },
    createConnection({ commandId, providerId: selectedProvider, configuration: proposed } = {}) {
      return invoke(async () => {
        const normalized = configuration(proposed);
        const selected = providerId(selectedProvider);
        const result = current(await apiClient.request(ROOT, { method: 'POST', body: {
          schemaVersion: 1, commandId: internalUuid(commandId, INVALID).toLowerCase(),
          providerId: selected, configuration: normalized,
        } }));
        if (result.providerId !== selected || result.revision !== 1
          || JSON.stringify(result.configuration) !== JSON.stringify(normalized)) invalid();
        return result;
      });
    },
    saveConfiguration({ integrationId, expectedRevision, configuration: proposed } = {}) {
      return invoke(async () => {
        const selected = internalUuid(integrationId, INVALID).toLowerCase();
        const revision = boundedInteger(expectedRevision, INVALID, { minimum: 1, maximum: Number.MAX_SAFE_INTEGER - 2 });
        const normalized = configuration(proposed);
        const result = current(await apiClient.request(`${ROOT}/${selected}/configuration`, { method: 'PUT', body: {
          schemaVersion: 1, expectedRevision: revision, configuration: normalized,
        } }));
        if (result.integrationId !== selected || result.revision !== revision + 1
          || JSON.stringify(result.configuration) !== JSON.stringify(normalized)) invalid();
        return result;
      });
    },
  });
}
