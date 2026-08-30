const MAX_PARTICIPANTS = 500;
const MAX_ITEM_QUANTITY = 1_000;
const TOTAL_BASIS_POINTS = 10_000;

function invalid() {
  throw new TypeError('PRODUCTION_REQUEST_EDITOR_INVALID');
}

function appliesToRoom(entry, room) {
  if (!room || entry?.active === false) return false;
  const siteIds = Array.isArray(entry.siteIds) ? entry.siteIds : [];
  const roomIds = Array.isArray(entry.roomIds) ? entry.roomIds : [];
  return (!siteIds.length || siteIds.includes(room.siteId))
    && (!roomIds.length || roomIds.includes(room.id));
}

function allowedIdentifiers(catalog, rule) {
  const values = catalog?.bookingPolicy?.rules?.[rule];
  return new Set(Array.isArray(values) ? values : []);
}

export function roomEditorOptions(catalog) {
  const allowedSites = allowedIdentifiers(catalog, 'allowedSiteIds');
  const allowedRooms = allowedIdentifiers(catalog, 'allowedRoomIds');
  return Object.freeze((catalog?.rooms || []).filter((room) => (
    room.active !== false
      && (!allowedSites.size || allowedSites.has(room.siteId))
      && (!allowedRooms.size || allowedRooms.has(room.id))
  )));
}

export function cateringEditorOptions(catalog, roomId) {
  const room = catalog?.rooms?.find((entry) => entry.id === roomId);
  return Object.freeze({
    packages: Object.freeze((catalog?.cateringPackages || []).filter((entry) => appliesToRoom(entry, room))),
    items: Object.freeze((catalog?.cateringItems || []).filter((entry) => appliesToRoom(entry, room))),
  });
}

export function serviceEditorOptions(catalog, roomId) {
  const room = catalog?.rooms?.find((entry) => entry.id === roomId);
  const allowedServices = allowedIdentifiers(catalog, 'allowedServiceIds');
  return Object.freeze((catalog?.services || []).filter((entry) => (
    appliesToRoom(entry, room) && (!allowedServices.size || allowedServices.has(entry.id))
  )));
}

export function normalizeCateringEditorDraft({
  participantCount,
  packageSelection,
  itemQuantities,
  totalParticipants,
  catalog,
  roomId,
}) {
  const participants = Number(participantCount);
  if (!Number.isSafeInteger(participants) || participants < 0 || participants > MAX_PARTICIPANTS
    || participants > totalParticipants) invalid();
  const options = cateringEditorOptions(catalog, roomId);
  let normalizedPackage = null;
  if (packageSelection) {
    const selectedPackage = options.packages.find((entry) => entry.id === packageSelection.packageId);
    const selectedVariant = selectedPackage?.variants?.find((entry) => (
      entry.id === packageSelection.variantId && entry.active !== false
    ));
    if (!selectedPackage || !selectedVariant || participants < 1) invalid();
    normalizedPackage = {
      packageId: selectedPackage.id,
      variantId: selectedVariant.id,
    };
  }
  const allowedItemIds = new Set(options.items.map((entry) => entry.id));
  const normalizedItems = Object.entries(itemQuantities || {})
    .map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity) }))
    .filter(({ quantity }) => quantity !== 0)
    .sort((left, right) => left.itemId.localeCompare(right.itemId));
  if (normalizedItems.length > 100 || normalizedItems.some(({ itemId, quantity }) => (
    !allowedItemIds.has(itemId) || !Number.isSafeInteger(quantity)
      || quantity < 1 || quantity > MAX_ITEM_QUANTITY
  ))) invalid();
  return Object.freeze({
    participantCount: participants,
    packageSelection: normalizedPackage,
    itemQuantities: Object.freeze(normalizedItems.map(Object.freeze)),
  });
}

function percentageBasisPoints(value) {
  const match = /^(?:100(?:\.0{1,2})?|(?:\d|[1-9]\d)(?:\.\d{1,2})?)$/.exec(String(value).trim());
  if (!match) invalid();
  const [whole, fraction = ''] = match[0].split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function normalizeAllocationEditorDraft({ allocations, catalog }) {
  if (!Array.isArray(allocations) || allocations.length > 100) invalid();
  const allowed = new Set((catalog?.costCenters || [])
    .filter((entry) => entry.active !== false)
    .map((entry) => entry.id));
  const normalized = allocations.map((entry) => ({
    costCenterId: entry.costCenterId,
    percentageBasisPoints: percentageBasisPoints(entry.percentage),
  })).sort((left, right) => left.costCenterId.localeCompare(right.costCenterId));
  if (normalized.some((entry) => !allowed.has(entry.costCenterId) || entry.percentageBasisPoints < 1)
    || new Set(normalized.map((entry) => entry.costCenterId)).size !== normalized.length
    || (normalized.length && normalized.reduce((sum, entry) => sum + entry.percentageBasisPoints, 0) !== TOTAL_BASIS_POINTS)
    || (catalog?.costAllocation?.allocationRequired && !normalized.length)) invalid();
  return Object.freeze(normalized.map(Object.freeze));
}
