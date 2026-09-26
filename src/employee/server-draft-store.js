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

function identifiers(values, maximum = MAX_COLLECTION) {
  if (!Array.isArray(values) || values.length > maximum) return null;
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

function validatedDraft(value, schemaVersion = 1) {
  const keys = [
    'roomId', 'startDate', 'endDate', 'startTime', 'endTime', 'title',
    'internalParticipants', 'externalParticipants', 'serviceIds',
    'cateringParticipants', 'packageSelection', 'itemQuantities', 'allocations',
    'dietaryRequirements', 'specialRequirements',
    ...(schemaVersion >= 2 ? ['equipmentIds'] : []),
    ...(schemaVersion === 3 ? ['activeStep'] : []),
  ];
  if (!exactObject(value, keys)) return null;
  const roomId = value.roomId === '' ? '' : identifier(value.roomId);
  const serviceIds = identifiers(value.serviceIds);
  const equipmentIds = schemaVersion >= 2 ? identifiers(value.equipmentIds, 200) : [];
  const activeStep = schemaVersion === 3 ? value.activeStep : 1;
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
    || !Number.isSafeInteger(activeStep) || activeStep < 1 || activeStep > 6
    || !serviceIds || !equipmentIds || selectedPackage === undefined || !quantities || !allocationRows) return null;
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
    ...(schemaVersion >= 2 ? { equipmentIds: Object.freeze(equipmentIds) } : {}),
    ...(schemaVersion === 3 ? { activeStep } : {}),
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
  sessionExpiresAt,
  storage,
  clock = () => Date.now(),
} = {}) {
  const tenant = identifier(tenantId);
  const user = identifier(userId);
  const sessionExpiry = typeof sessionExpiresAt === 'string'
    && sessionExpiresAt.length <= 64 && sessionExpiresAt.endsWith('Z')
    ? Date.parse(sessionExpiresAt) : Number.NaN;
  const currentTime = () => {
    try {
      const now = clock();
      return Number.isFinite(now) ? now : null;
    } catch {
      return null;
    }
  };
  const sessionActive = (now = currentTime()) => now !== null && sessionExpiry > now;
  let selectedStorage = storage;
  if (selectedStorage === undefined) {
    try { selectedStorage = globalThis.sessionStorage; } catch { return null; }
  }
  if (!tenant || !user || typeof clock !== 'function' || !Number.isFinite(sessionExpiry)
    || !sessionActive() || !selectedStorage
    || typeof selectedStorage.getItem !== 'function'
    || typeof selectedStorage.setItem !== 'function'
    || typeof selectedStorage.removeItem !== 'function') return null;

  let draftCreatedAt = null;

  function clear() {
    draftCreatedAt = null;
    try { selectedStorage.removeItem(SERVER_DRAFT_KEY); } catch {}
  }

  function load() {
    try {
      if (!sessionActive()) {
        clear();
        return null;
      }
      const serialized = selectedStorage.getItem(SERVER_DRAFT_KEY);
      if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).length > MAX_SERIALIZED_BYTES) {
        if (serialized !== null) clear();
        return null;
      }
      const envelope = JSON.parse(serialized);
      const now = currentTime();
      const createdAt = typeof envelope?.createdAt === 'string'
        && envelope.createdAt.length <= 64 && envelope.createdAt.endsWith('Z')
        ? Date.parse(envelope.createdAt) : Number.NaN;
      if (!exactObject(envelope, [
        'schemaVersion', 'tenantId', 'userId', 'createdAt', 'expiresAt', 'draft',
      ]) || envelope.schemaVersion !== 4 || envelope.tenantId !== tenant
        || envelope.userId !== user || envelope.expiresAt !== sessionExpiresAt
        || now === null || !Number.isFinite(createdAt) || createdAt > now
        || createdAt >= sessionExpiry) {
        clear();
        return null;
      }
      const draft = validatedDraft(envelope.draft, 3);
      if (!draft) clear();
      else draftCreatedAt = envelope.createdAt;
      return draft;
    } catch {
      clear();
      return null;
    }
  }

  function save(value) {
    const draft = validatedDraft(value, 3);
    const now = currentTime();
    if (!draft || !sessionActive(now)) return false;
    try {
      const createdAt = draftCreatedAt || new Date(now).toISOString();
      const serialized = JSON.stringify({
        schemaVersion: 4,
        tenantId: tenant,
        userId: user,
        createdAt,
        expiresAt: sessionExpiresAt,
        draft,
      });
      if (new TextEncoder().encode(serialized).length > MAX_SERIALIZED_BYTES) return false;
      selectedStorage.setItem(SERVER_DRAFT_KEY, serialized);
      draftCreatedAt = createdAt;
      return true;
    } catch {
      return false;
    }
  }

  return Object.freeze({ clear, load, save, has: () => Boolean(load()) });
}

export { SERVER_DRAFT_KEY };
