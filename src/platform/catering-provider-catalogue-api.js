import { adapterError, boundedInteger, immutable, internalUuid, safeId, utcInstant } from './tenant-settings-wire.js';

const ROOT = 'v1/tenant/catering/provider-catalogues';
const INVALID = 'CATERING_PROVIDER_CATALOGUE_RESPONSE_INVALID';
const MAXIMUM = Number.MAX_SAFE_INTEGER - 1;
export class CateringProviderCatalogueApiError extends Error {
  constructor(code, { cause, serverCode = null } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'CateringProviderCatalogueApiError'; this.code = code; this.serverCode = serverCode;
  }
}
function invalid() { throw new CateringProviderCatalogueApiError(INVALID); }
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    return !keys.includes(name) || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value');
  })) invalid();
}
function array(value, limit) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > limit
    || Reflect.ownKeys(value).length !== value.length + 1) invalid();
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
  }
  return value;
}
function counter(value, minimum = 1, maximum = MAXIMUM) {
  return boundedInteger(value, INVALID, { minimum, maximum });
}
function uuid(value) { return internalUuid(value,INVALID).toLowerCase(); }
function text(value,maximum,nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value.isWellFormed() || /[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value)) invalid();
  const normalized = value.trim().normalize('NFC'); if (!normalized.length || normalized.length > maximum) invalid(); return normalized;
}
function money(value,aggregate = false) {
  if (value === null) return null;
  record(value,['amountMinor','currency']);
  if (!['CHF','EUR','GBP','USD'].includes(value.currency)) invalid();
  return { amountMinor: counter(value.amountMinor,0,aggregate ? MAXIMUM : 1000000000),currency: value.currency };
}
function terms(value) {
  record(value,['minimumLeadTimeMinutes','minimumOrderValue','changeCutoffMinutes','cancelCutoffMinutes']);
  const minutes = (number) => number === null ? null : counter(number,0,525600);
  return { minimumLeadTimeMinutes: minutes(value.minimumLeadTimeMinutes),minimumOrderValue: money(value.minimumOrderValue,true),
    changeCutoffMinutes: minutes(value.changeCutoffMinutes),cancelCutoffMinutes: minutes(value.cancelCutoffMinutes) };
}
function product(value,group = false) {
  record(value,['id','name','description','providerPrice',...(group ? ['itemIds','variants'] : [])]);
  const base = { id: safeId(value.id,INVALID),name: text(value.name,160),description: text(value.description,1000,true),
    providerPrice: money(value.providerPrice) };
  if (!group) return base;
  const itemIds = array(value.itemIds,300).map((entry) => safeId(entry,INVALID));
  if (new Set(itemIds).size !== itemIds.length) invalid();
  const variants = array(value.variants,20).map((entry) => product(entry)); unique(variants);
  return { ...base,itemIds: itemIds.sort(),variants: variants.sort(compare) };
}
function unique(entries) { if (new Set(entries.map((entry) => entry.id)).size !== entries.length) invalid(); }
function compare(a,b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
export function normalizeProviderCatalogueSource(value) {
  record(value,['schemaVersion','sourceVersion','items','packages','terms']); if (value.schemaVersion !== 1) invalid();
  const items = array(value.items,300).map((entry) => product(entry));
  const packages = array(value.packages,100).map((entry) => product(entry,true)); unique(items); unique(packages);
  const ids = new Set(items.map((entry) => entry.id));
  if (packages.some((entry) => entry.itemIds.some((id) => !ids.has(id)))) invalid();
  return immutable({ schemaVersion: 1,sourceVersion: text(value.sourceVersion,160,true),items: items.sort(compare),
    packages: packages.sort(compare),terms: terms(value.terms) });
}
function metadata(value) {
  record(value,['sourceVersion','itemCount','packageCount','terms']);
  return { sourceVersion: text(value.sourceVersion,160,true),itemCount: counter(value.itemCount,0,300),
    packageCount: counter(value.packageCount,0,100),terms: terms(value.terms) };
}
function scope(value,integrationId) {
  if (uuid(value.integrationId) !== integrationId || value.providerId !== 'manual_catering' || value.schemaVersion !== 1) invalid();
}
function history(value,integrationId,before) {
  record(value,['schemaVersion','integrationId','providerId','configurationRevision','currentRevision','canReceive',
    'revisions','nextBeforeRevision']); scope(value,integrationId);
  const currentRevision = counter(value.currentRevision,0); const configurationRevision = counter(value.configurationRevision);
  if (typeof value.canReceive !== 'boolean') invalid();
  let upper = Math.min(before ?? currentRevision+1,currentRevision+1); const length = Math.min(20,upper-1);
  const revisions = array(value.revisions,20).map((entry) => {
    record(entry,['revision','configurationRevision','recordedAt','reference','summary']);
    const revision = counter(entry.revision); if (revision !== upper-1) invalid(); upper = revision;
    if (counter(entry.configurationRevision) > configurationRevision) invalid();
    return { revision,configurationRevision: entry.configurationRevision,recordedAt: utcInstant(entry.recordedAt,INVALID),
      reference: text(entry.reference,160),summary: metadata(entry.summary) };
  });
  const next = value.nextBeforeRevision === null ? null : counter(value.nextBeforeRevision);
  if (revisions.length !== length || next !== (revisions.length && revisions.at(-1).revision > 1 ? revisions.at(-1).revision : null)) invalid();
  return immutable({ schemaVersion: 1,integrationId,providerId: value.providerId,configurationRevision,currentRevision,
    canReceive: value.canReceive,revisions,nextBeforeRevision: next });
}
function details(value,integrationId,revision,section,after) {
  record(value,['schemaVersion','integrationId','providerId','revision','configurationRevision','recordedAt','reference',
    'sourceVersion','terms','itemCount','packageCount','section','entries','nextAfterEntryId']); scope(value,integrationId);
  if (value.revision !== revision || value.section !== section) invalid();
  const itemCount = counter(value.itemCount,0,300); const packageCount = counter(value.packageCount,0,100);
  const total = section === 'items' ? itemCount : packageCount; let previous = after;
  const entries = array(value.entries,5).map((entry) => {
    const normalized = product(entry,section === 'packages');
    if (previous !== null && normalized.id <= previous) invalid(); previous = normalized.id;
    if (section === 'packages' && normalized.itemIds.length > itemCount) invalid();
    return normalized;
  });
  const next = value.nextAfterEntryId === null ? null : safeId(value.nextAfterEntryId,INVALID);
  if (entries.length > total || (next !== null && (entries.length === 0 || next !== previous))
    || (after === null && ((entries.length < total) !== (next !== null)))) invalid();
  return immutable({ schemaVersion: 1,integrationId,providerId: value.providerId,revision,
    configurationRevision: counter(value.configurationRevision),recordedAt: utcInstant(value.recordedAt,INVALID),
    reference: text(value.reference,160),sourceVersion: text(value.sourceVersion,160,true),terms: terms(value.terms),
    itemCount,packageCount,section,entries,nextAfterEntryId: next });
}
function receiptCommand(command) {
  record(command,['schemaVersion','commandId','expectedRevision','expectedConfigurationRevision',
    'reference','attestReceivedFromSupplier','source']);
  if (command.schemaVersion !== 1 || command.attestReceivedFromSupplier !== true) invalid();
  return immutable({ schemaVersion: 1,commandId: uuid(command.commandId),expectedRevision: counter(command.expectedRevision,0,MAXIMUM-1),
    expectedConfigurationRevision: counter(command.expectedConfigurationRevision),reference: text(command.reference,160),
    attestReceivedFromSupplier: true,source: normalizeProviderCatalogueSource(command.source) });
}
export function createCateringProviderCatalogueApi({ apiClient } = {}) {
  if (typeof apiClient?.request !== 'function') throw new TypeError('CATERING_API_CLIENT_REQUIRED');
  async function invoke(work) {
    try { return await work(); } catch (error) { throw adapterError(CateringProviderCatalogueApiError,error,'CATERING_CATALOGUE_UNAVAILABLE'); }
  }
  return Object.freeze({
    validateSourceReceipt: receiptCommand,
    listSourceConnections({ afterIntegrationId = null,signal } = {}) {
      return invoke(async () => {
        const after = afterIntegrationId === null ? null : uuid(afterIntegrationId); let previous = after;
        const query = after === null ? '' : `?afterIntegrationId=${after}`;
        const value = await apiClient.request(`${ROOT}${query}`,{ signal });
        record(value,['schemaVersion','connections','nextAfterIntegrationId']); if (value.schemaVersion !== 1) invalid();
        const connections = array(value.connections,20).map((entry) => {
          record(entry,['integrationId','providerId','configurationRevision','currentRevision','canReceive']);
          const integrationId = uuid(entry.integrationId); scope({ ...entry,schemaVersion: 1 },integrationId);
          if ((previous !== null && integrationId <= previous) || typeof entry.canReceive !== 'boolean') invalid(); previous = integrationId;
          return { integrationId,providerId: entry.providerId,configurationRevision: counter(entry.configurationRevision),
            currentRevision: counter(entry.currentRevision,0),canReceive: entry.canReceive };
        });
        const next = value.nextAfterIntegrationId === null ? null : uuid(value.nextAfterIntegrationId);
        if (next !== null && (connections.length !== 20 || next !== previous)) invalid();
        return immutable({ schemaVersion: 1,connections,nextAfterIntegrationId: next });
      });
    },
    loadSourceHistory({ integrationId,beforeRevision = null,signal } = {}) {
      return invoke(async () => {
        const integration = uuid(integrationId); const before = beforeRevision === null ? null : counter(beforeRevision);
        const query = before === null ? '' : `?beforeRevision=${before}`;
        return history(await apiClient.request(`${ROOT}/${integration}${query}`,{ signal }),integration,before);
      });
    },
    loadSourceDetails({ integrationId,revision,section = 'items',afterEntryId = null,signal } = {}) {
      return invoke(async () => {
        const integration = uuid(integrationId); const sourceRevision = counter(revision);
        if (!['items','packages'].includes(section)) invalid();
        const after = afterEntryId === null ? null : safeId(afterEntryId,INVALID);
        const query = new URLSearchParams({ section }); if (after !== null) query.set('afterEntryId',after);
        return details(await apiClient.request(`${ROOT}/${integration}/revisions/${sourceRevision}?${query}`,{ signal }),
          integration,sourceRevision,section,after);
      });
    },
    receiveSource({ integrationId,command } = {}) {
      return invoke(async () => {
        const integration = uuid(integrationId); const body = receiptCommand(command);
        const saved = await apiClient.request(`${ROOT}/${integration}`,{ method: 'POST',body });
        record(saved,['schemaVersion','commandId','replayed','revision','configurationRevision','recordedAt']);
        if (saved.schemaVersion !== 1 || uuid(saved.commandId) !== body.commandId || typeof saved.replayed !== 'boolean'
          || saved.revision !== body.expectedRevision+1 || saved.configurationRevision !== body.expectedConfigurationRevision) invalid();
        return immutable({ ...saved,commandId: body.commandId,recordedAt: utcInstant(saved.recordedAt,INVALID) });
      });
    },
  });
}
