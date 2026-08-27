import { exactObject, safeId } from './tenant-settings-wire.js';

const MAX_ROWS = 1_024;
const OPERATIONS = new Set(['template', 'export', 'validate', 'apply']);

function invalid(code = 'TENANT_BULK_RESPONSE_INVALID') {
  throw new TypeError(code);
}

function document(value, expectedType) {
  exactObject(value, ['schemaVersion', 'type', 'rows'], 'TENANT_BULK_RESPONSE_INVALID');
  if (value.schemaVersion !== 1 || value.type !== expectedType
    || !Array.isArray(value.rows) || value.rows.length > MAX_ROWS) invalid();
  return Object.freeze({
    schemaVersion: 1,
    type: expectedType,
    rows: Object.freeze(value.rows.map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) invalid();
      return Object.freeze(structuredClone(row));
    })),
  });
}

function validation(value) {
  exactObject(
    value,
    ['schemaVersion', 'valid', 'changed', 'sourceRevision', 'errors', 'receipt'],
    'TENANT_BULK_RESPONSE_INVALID',
  );
  if (value.schemaVersion !== 1 || typeof value.valid !== 'boolean'
    || typeof value.changed !== 'boolean' || !Number.isSafeInteger(value.sourceRevision)
    || value.sourceRevision < 1 || !Array.isArray(value.errors) || value.errors.length > 100) invalid();
  const errors = value.errors.map((entry) => {
    exactObject(entry, ['row', 'code'], 'TENANT_BULK_RESPONSE_INVALID');
    if ((entry.row !== null && (!Number.isSafeInteger(entry.row) || entry.row < 0 || entry.row >= MAX_ROWS))
      || typeof entry.code !== 'string' || !/^[A-Z0-9_]{1,96}$/.test(entry.code)) invalid();
    return Object.freeze({ row: entry.row, code: entry.code });
  });
  let receipt = null;
  if (value.receipt !== null) {
    exactObject(value.receipt, ['id', 'expiresAt'], 'TENANT_BULK_RESPONSE_INVALID');
    receipt = Object.freeze({
      id: safeId(value.receipt.id, 'TENANT_BULK_RESPONSE_INVALID'),
      expiresAt: value.receipt.expiresAt,
    });
  }
  return Object.freeze({ ...value, errors: Object.freeze(errors), receipt });
}

export function createTenantBulkSettingsApi({ apiClient, basePath, types, normalizeApplied } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('TENANT_BULK_API_CLIENT_REQUIRED');
  if (typeof basePath !== 'string' || !Array.isArray(types) || types.length < 1
    || typeof normalizeApplied !== 'function') throw new TypeError('TENANT_BULK_API_CONFIGURATION_INVALID');
  const allowedTypes = new Set(types);
  const path = (type, operation) => {
    if (!allowedTypes.has(type) || !OPERATIONS.has(operation)) throw new TypeError('TENANT_BULK_TYPE_INVALID');
    return `${basePath}/bulk/${type}/${operation}`;
  };
  return Object.freeze({
    async loadBulkTemplate(type) {
      return document(await apiClient.request(path(type, 'template')), type);
    },
    async exportBulk(type) {
      const value = await apiClient.request(path(type, 'export'));
      exactObject(value, ['revision', 'document'], 'TENANT_BULK_RESPONSE_INVALID');
      if (!Number.isSafeInteger(value.revision) || value.revision < 1) invalid();
      return Object.freeze({ revision: value.revision, document: document(value.document, type) });
    },
    async validateBulk(type, value) {
      const normalized = document(value, type);
      return validation(await apiClient.request(path(type, 'validate'), {
        method: 'POST', body: { document: normalized },
      }));
    },
    async applyBulk(type, value, receiptId) {
      const normalized = document(value, type);
      if (typeof receiptId !== 'string') invalid('TENANT_BULK_RECEIPT_INVALID');
      return normalizeApplied(await apiClient.request(path(type, 'apply'), {
        method: 'POST', body: { receiptId, document: normalized },
      }));
    },
  });
}
