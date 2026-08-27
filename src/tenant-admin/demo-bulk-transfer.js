const clone = structuredClone;
const TYPE_COLLECTION = Object.freeze({
  sites: 'sites',
  rooms: 'rooms',
  services: 'services',
  'catering-items': 'cateringItems',
  'catering-packages': 'cateringPackages',
  'cost-centers': 'costCenters',
});

function document(type, rows) {
  if (!Object.hasOwn(TYPE_COLLECTION, type) || !Array.isArray(rows) || rows.length > 1_024) {
    throw new TypeError('TENANT_BULK_DOCUMENT_INVALID');
  }
  return { schemaVersion: 1, type, rows: clone(rows) };
}

function merge(current, type, rows) {
  const collection = TYPE_COLLECTION[type];
  const replacements = new Map(rows.map((row) => [row.id, row]));
  const existing = current[collection];
  const ids = new Set(existing.map((row) => row.id));
  return {
    ...clone(current),
    [collection]: [
      ...existing.map((row) => replacements.get(row.id) ?? row),
      ...rows.filter((row) => !ids.has(row.id)),
    ],
  };
}

export function createDemoBulkTransfer({ types, current, save } = {}) {
  const allowed = new Set(types);
  let sequence = 0;
  let receipts = new Map();
  const requireType = (type) => {
    if (!allowed.has(type)) throw new TypeError('TENANT_BULK_TYPE_INVALID');
    return type;
  };
  return Object.freeze({
    async loadBulkTemplate(type) { return document(requireType(type), []); },
    async exportBulk(type) {
      requireType(type);
      const snapshot = await current();
      return { revision: snapshot.revision, document: document(type, snapshot.configuration[TYPE_COLLECTION[type]]) };
    },
    async validateBulk(type, value) {
      requireType(type);
      const snapshot = await current();
      const proposed = merge(snapshot.configuration, type, document(type, value.rows).rows);
      const changed = JSON.stringify(proposed) !== JSON.stringify(snapshot.configuration);
      const receipt = changed ? {
        id: `00000000-0000-4000-8000-${String(sequence += 1).padStart(12, '0')}`,
        expiresAt: '2026-08-27T12:30:00.000Z',
      } : null;
      if (receipt) receipts.set(receipt.id, { type, value: clone(value), revision: snapshot.revision, response: null });
      return { schemaVersion: 1, valid: true, changed, sourceRevision: snapshot.revision, errors: [], receipt };
    },
    async applyBulk(type, value, receiptId) {
      requireType(type);
      const receipt = receipts.get(receiptId);
      if (!receipt || receipt.type !== type || JSON.stringify(receipt.value) !== JSON.stringify(value)) {
        throw new TypeError('TENANT_BULK_RECEIPT_INVALID');
      }
      if (receipt.response) return clone(receipt.response);
      const snapshot = await current();
      if (snapshot.revision !== receipt.revision) throw Object.assign(new Error('TENANT_SETTINGS_REVISION_CONFLICT'), {
        code: 'HTTP_409', currentRevision: snapshot.revision,
      });
      receipt.response = await save({
        expectedRevision: snapshot.revision,
        configuration: merge(snapshot.configuration, type, value.rows),
      });
      return clone(receipt.response);
    },
    reset() { sequence = 0; receipts = new Map(); },
  });
}
