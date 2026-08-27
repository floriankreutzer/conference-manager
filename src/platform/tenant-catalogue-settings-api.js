import {
  adapterError,
  booleanValue,
  boundedInteger,
  boundedText,
  exactObject,
  historyPage,
  immutable,
  safeId,
  safeIdList,
  schemaRevision,
} from './tenant-settings-wire.js';
import { createTenantBulkSettingsApi } from './tenant-bulk-settings-api.js';

const CURRENT_PATH = 'v1/tenant/settings/catalogue';
const HISTORY_PATH = `${CURRENT_PATH}/history`;
const CURRENCIES = new Set(['CHF', 'EUR', 'GBP', 'USD']);
const UNSAFE_CATALOGUE_TEXT = /[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

export class TenantCatalogueSettingsApiError extends Error {
  constructor(code, { cause, serverCode = null, currentRevision = null } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'TenantCatalogueSettingsApiError';
    this.code = code;
    this.serverCode = serverCode;
    this.currentRevision = currentRevision;
  }
}

function invalid(code = 'TENANT_CATALOGUE_RESPONSE_INVALID') {
  throw new TenantCatalogueSettingsApiError(code);
}

function price(value) {
  exactObject(value, ['amountMinor', 'currency'], 'TENANT_CATALOGUE_RESPONSE_INVALID');
  if (!CURRENCIES.has(value.currency)) invalid();
  return Object.freeze({
    amountMinor: boundedInteger(value.amountMinor, 'TENANT_CATALOGUE_RESPONSE_INVALID', { maximum: 1_000_000_000 }),
    currency: value.currency,
  });
}

function nullableDescription(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || UNSAFE_CATALOGUE_TEXT.test(value)) invalid();
  return boundedText(value.trim().normalize('NFC'), { code: 'TENANT_CATALOGUE_RESPONSE_INVALID', maximum: 1_000 });
}

function catalogueName(value) {
  if (typeof value !== 'string' || UNSAFE_CATALOGUE_TEXT.test(value)) invalid();
  return boundedText(value.trim().normalize('NFC'), { code: 'TENANT_CATALOGUE_RESPONSE_INVALID', maximum: 160 });
}

function commonEntry(value) {
  exactObject(value, [
    'id', 'name', 'description', 'price', 'active', 'order', 'siteIds', 'roomIds',
  ], 'TENANT_CATALOGUE_RESPONSE_INVALID');
  return Object.freeze({
    id: safeId(value.id, 'TENANT_CATALOGUE_RESPONSE_INVALID'),
    name: catalogueName(value.name),
    description: nullableDescription(value.description),
    price: price(value.price),
    active: booleanValue(value.active, 'TENANT_CATALOGUE_RESPONSE_INVALID'),
    order: boundedInteger(value.order, 'TENANT_CATALOGUE_RESPONSE_INVALID', { maximum: 100_000 }),
    siteIds: safeIdList(value.siteIds, 'TENANT_CATALOGUE_RESPONSE_INVALID', 200),
    roomIds: safeIdList(value.roomIds, 'TENANT_CATALOGUE_RESPONSE_INVALID', 200),
  });
}

function variant(value) {
  exactObject(value, ['id', 'name', 'description', 'price', 'active', 'order'], 'TENANT_CATALOGUE_RESPONSE_INVALID');
  return Object.freeze({
    id: safeId(value.id, 'TENANT_CATALOGUE_RESPONSE_INVALID'),
    name: catalogueName(value.name),
    description: nullableDescription(value.description),
    price: price(value.price),
    active: booleanValue(value.active, 'TENANT_CATALOGUE_RESPONSE_INVALID'),
    order: boundedInteger(value.order, 'TENANT_CATALOGUE_RESPONSE_INVALID', { maximum: 100_000 }),
  });
}

function packageEntry(value) {
  exactObject(value, [
    'id', 'name', 'description', 'price', 'active', 'order', 'siteIds', 'roomIds',
    'itemIds', 'variants',
  ], 'TENANT_CATALOGUE_RESPONSE_INVALID');
  const normalized = commonEntry(Object.fromEntries(
    Object.entries(value).filter(([key]) => !['itemIds', 'variants'].includes(key)),
  ));
  if (!Array.isArray(value.variants) || value.variants.length > 20) invalid();
  const variants = value.variants.map(variant);
  if (new Set(variants.map((entry) => entry.id)).size !== variants.length) invalid();
  return Object.freeze({
    ...normalized,
    itemIds: safeIdList(value.itemIds, 'TENANT_CATALOGUE_RESPONSE_INVALID', 300),
    variants: Object.freeze(variants),
  });
}

function unique(entries) {
  return new Set(entries.map((entry) => entry.id)).size === entries.length;
}

function catalogue(value) {
  exactObject(value, ['services', 'equipment', 'cateringPackages', 'cateringItems'], 'TENANT_CATALOGUE_RESPONSE_INVALID');
  if (!Array.isArray(value.services) || value.services.length > 200
    || !Array.isArray(value.equipment) || value.equipment.length > 200
    || !Array.isArray(value.cateringPackages) || value.cateringPackages.length > 100
    || !Array.isArray(value.cateringItems) || value.cateringItems.length > 300) invalid();
  const services = value.services.map(commonEntry);
  const equipment = value.equipment.map(commonEntry);
  const cateringItems = value.cateringItems.map(commonEntry);
  const cateringPackages = value.cateringPackages.map(packageEntry);
  if (![services, equipment, cateringItems, cateringPackages].every(unique)) invalid();
  const itemById = new Map(cateringItems.map((entry) => [entry.id, entry]));
  if (cateringPackages.some((entry) => entry.itemIds.some((id) => !itemById.has(id)))) invalid();
  if (cateringPackages.some((entry) => entry.active && entry.itemIds.some((id) => !itemById.get(id).active))) invalid();
  return immutable({ services, equipment, cateringPackages, cateringItems });
}

function current(value) {
  const revision = schemaRevision(value, 'catalogue', 'TENANT_CATALOGUE_RESPONSE_INVALID');
  return Object.freeze({ schemaVersion: 1, revision, catalogue: catalogue(value.catalogue) });
}

function historyQuery({ limit = 25, beforeRevision = null } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100
    || (beforeRevision !== null && (!Number.isSafeInteger(beforeRevision) || beforeRevision < 1))) {
    invalid('TENANT_CATALOGUE_HISTORY_QUERY_INVALID');
  }
  const query = new URLSearchParams({ limit: String(limit) });
  if (beforeRevision !== null) query.set('beforeRevision', String(beforeRevision));
  return query.toString();
}

export function createTenantCatalogueSettingsApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('TENANT_CATALOGUE_API_CLIENT_REQUIRED');
  const bulk = createTenantBulkSettingsApi({
    apiClient,
    basePath: CURRENT_PATH,
    types: ['services', 'catering-items', 'catering-packages'],
    normalizeApplied: current,
  });
  return Object.freeze({
    ...bulk,
    async loadCatalogue() {
      try { return current(await apiClient.request(CURRENT_PATH)); }
      catch (error) { throw adapterError(TenantCatalogueSettingsApiError, error, 'TENANT_CATALOGUE_UNAVAILABLE'); }
    },
    async saveCatalogue({ expectedRevision, catalogue: value } = {}) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) invalid('TENANT_CATALOGUE_REVISION_INVALID');
      try {
        const normalized = catalogue(value);
        return current(await apiClient.request(CURRENT_PATH, {
          method: 'PUT',
          body: { schemaVersion: 1, expectedRevision, catalogue: normalized },
        }));
      } catch (error) {
        throw adapterError(TenantCatalogueSettingsApiError, error, 'TENANT_CATALOGUE_UPDATE_FAILED');
      }
    },
    async listCatalogueHistory(options) {
      try {
        return historyPage(
          await apiClient.request(`${HISTORY_PATH}?${historyQuery(options)}`),
          'catalogue',
          catalogue,
          'TENANT_CATALOGUE_HISTORY_RESPONSE_INVALID',
        );
      } catch (error) {
        throw adapterError(TenantCatalogueSettingsApiError, error, 'TENANT_CATALOGUE_HISTORY_UNAVAILABLE');
      }
    },
  });
}
