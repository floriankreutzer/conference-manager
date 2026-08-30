const SERVER_DRAFT_KEY = 'conference_server_request_draft_v1';
const MAX_SERIALIZED_BYTES = 32_768;
const MAX_COLLECTION = 100;
const IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,159})$/;
const DATE = /^(?:|\d{4}-\d{2}-\d{2})$/;
const TIME = /^(?:|(?:[01]\d|2[0-3]):[0-5]\d)$/;
const DECIMAL = /^(?:|\d{1,3}(?:\.\d{1,2})?)$/;
const INTEGER = /^(?:|\d{1,4})$/;

function exactObject(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function boundedString(value, maximum) {
  return typeof value === 'string' && value.length <= maximum ? value : null;
}

function identifier(value) {
  return typeof value === 'string' && IDENTIFIER.test(value) ? value : null;
}

function identifiers(values) {
  if (!Array.isArray(values) || values.length > MAX_COLLECTION) return null;
  const normalized = values.map(identifier);
  return normalized.every(Boolean) && new Set(normalized).size === normalized.length
    ? normalized : null;
}

function packageSelection(value) {
  if (value === null) return null;
  if (!exactObject(value, ['packageId', 'variantId'])) return undefined;
  const packageId = identifier(value.packageId);
  const variantId = identifier(value.variantId);
  return packageId && variantId ? { packageId, variantId } : undefined;
}

function itemQuantities(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_COLLECTION || entries.some(([id, quantity]) => (
    !identifier(id) || !INTEGER.test(String(quantity))
  ))) return null;
  return Object.fromEntries(entries.map(([id, quantity]) => [id, String(quantity)]));
}

function allocations(value) {
  if (!Array.isArray(value) || value.length > MAX_COLLECTION) return null;
  const normalized = value.map((entry) => {
    if (!exactObject(entry, ['costCenterId', 'percentage'])) return null;
    const costCenterId = identifier(entry.costCenterId);
    const percentage = boundedString(String(entry.percentage), 6);
    return costCenterId && percentage !== null && DECIMAL.test(percentage)
      ? { costCenterId, percentage } : null;
  });
  return normalized.every(Boolean) ? normalized : null;
}

function validatedDraft(value) {
  const keys = [
    'roomId', 'startDate', 'endDate', 'startTime', 'endTime', 'title',
    'internalParticipants', 'externalParticipants', 'serviceIds',
    'cateringParticipants', 'packageSelection', 'itemQuantities', 'allocations',
    'dietaryRequirements', 'specialRequirements',
  ];
  if (!exactObject(value, keys)) return null;
  const roomId = value.roomId === '' ? '' : identifier(value.roomId);
  const serviceIds = identifiers(value.serviceIds);
  const selectedPackage = packageSelection(value.packageSelection);
  const quantities = itemQuantities(value.itemQuantities);
  const allocationRows = allocations(value.allocations);
  const title = boundedString(value.title, 160);
  const dietaryRequirements = boundedString(value.dietaryRequirements, 2_000);
  const specialRequirements = boundedString(value.specialRequirements, 2_000);
  const internalParticipants = boundedString(String(value.internalParticipants), 4);
  const externalParticipants = boundedString(String(value.externalParticipants), 4);
  const cateringParticipants = boundedString(String(value.cateringParticipants), 4);
  if (roomId === null || !DATE.test(value.startDate) || !DATE.test(value.endDate)
    || !TIME.test(value.startTime) || !TIME.test(value.endTime)
    || title === null || dietaryRequirements === null || specialRequirements === null
    || internalParticipants === null || !INTEGER.test(internalParticipants)
    || externalParticipants === null || !INTEGER.test(externalParticipants)
    || cateringParticipants === null || !INTEGER.test(cateringParticipants)
    || !serviceIds || selectedPackage === undefined || !quantities || !allocationRows) return null;
  return Object.freeze({
    roomId,
    startDate: value.startDate,
    endDate: value.endDate,
    startTime: value.startTime,
    endTime: value.endTime,
    title,
    internalParticipants,
    externalParticipants,
    serviceIds: Object.freeze(serviceIds),
    cateringParticipants,
    packageSelection: selectedPackage ? Object.freeze(selectedPackage) : null,
    itemQuantities: Object.freeze(quantities),
    allocations: Object.freeze(allocationRows.map(Object.freeze)),
    dietaryRequirements,
    specialRequirements,
  });
}

export function createServerDraftStore({
  tenantId,
  userId,
  storage,
} = {}) {
  const tenant = identifier(tenantId);
  const user = identifier(userId);
  let selectedStorage = storage;
  if (selectedStorage === undefined) {
    try { selectedStorage = globalThis.sessionStorage; } catch { return null; }
  }
  if (!tenant || !user || !selectedStorage
    || typeof selectedStorage.getItem !== 'function'
    || typeof selectedStorage.setItem !== 'function'
    || typeof selectedStorage.removeItem !== 'function') return null;

  function clear() {
    try { selectedStorage.removeItem(SERVER_DRAFT_KEY); } catch {}
  }

  function load() {
    try {
      const serialized = selectedStorage.getItem(SERVER_DRAFT_KEY);
      if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).length > MAX_SERIALIZED_BYTES) {
        if (serialized !== null) clear();
        return null;
      }
      const envelope = JSON.parse(serialized);
      if (!exactObject(envelope, ['schemaVersion', 'tenantId', 'userId', 'draft'])
        || envelope.schemaVersion !== 1 || envelope.tenantId !== tenant || envelope.userId !== user) {
        clear();
        return null;
      }
      const draft = validatedDraft(envelope.draft);
      if (!draft) clear();
      return draft;
    } catch {
      clear();
      return null;
    }
  }

  function save(value) {
    const draft = validatedDraft(value);
    if (!draft) return false;
    try {
      const serialized = JSON.stringify({ schemaVersion: 1, tenantId: tenant, userId: user, draft });
      if (new TextEncoder().encode(serialized).length > MAX_SERIALIZED_BYTES) return false;
      selectedStorage.setItem(SERVER_DRAFT_KEY, serialized);
      return true;
    } catch {
      return false;
    }
  }

  return Object.freeze({ clear, load, save, has: () => Boolean(load()) });
}

export { SERVER_DRAFT_KEY };
