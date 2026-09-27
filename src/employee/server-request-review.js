import {
  cateringEditorOptions,
  equipmentEditorOptions,
  serviceEditorOptions,
} from './server-request-editor.js';

const MAX_SAFE_MINOR = BigInt(Number.MAX_SAFE_INTEGER);
const ASSET_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function immutable(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, immutable(entry)]),
    ));
  }
  return value;
}

function selected(entries, identifiers) {
  const selectedIds = new Set(identifiers || []);
  return entries.filter((entry) => selectedIds.has(entry.id));
}

function safeCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function safeLineTotal(amountMinor, multiplier = 1) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0
    || !Number.isSafeInteger(multiplier) || multiplier < 0) return null;
  const total = BigInt(amountMinor) * BigInt(multiplier);
  return total <= MAX_SAFE_MINOR ? Number(total) : null;
}

function pricePreview({ room, services, equipment, catering }) {
  const lines = [
    { kind: 'room', amountMinor: room?.price?.amountMinor, currency: room?.price?.currency },
    ...services.map((entry) => ({
      kind: 'service', amountMinor: entry.price?.amountMinor, currency: entry.price?.currency,
    })),
    ...equipment.map((entry) => ({
      kind: 'equipment', amountMinor: entry.price?.amountMinor, currency: entry.price?.currency,
    })),
  ];
  if (catering.packageSelection) {
    lines.push({
      kind: 'cateringPackage',
      amountMinor: safeLineTotal(
        catering.packageSelection.variant.price?.amountMinor,
        catering.participantCount,
      ),
      currency: catering.packageSelection.variant.price?.currency,
    });
  }
  catering.items.filter((entry) => !entry.includedByPackage).forEach((entry) => {
    lines.push({
      kind: 'cateringItem',
      amountMinor: safeLineTotal(entry.item.price?.amountMinor, entry.quantity),
      currency: entry.item.price?.currency,
    });
  });
  if (lines.some((entry) => entry.amountMinor === null
    || !Number.isSafeInteger(entry.amountMinor) || typeof entry.currency !== 'string')) return null;
  const currencies = new Set(lines.map((entry) => entry.currency));
  if (currencies.size !== 1) return null;
  const breakdown = {
    roomMinor: 0,
    servicesMinor: 0,
    equipmentMinor: 0,
    cateringPackageMinor: 0,
    cateringItemsMinor: 0,
  };
  const target = {
    room: 'roomMinor',
    service: 'servicesMinor',
    equipment: 'equipmentMinor',
    cateringPackage: 'cateringPackageMinor',
    cateringItem: 'cateringItemsMinor',
  };
  for (const line of lines) {
    const next = BigInt(breakdown[target[line.kind]]) + BigInt(line.amountMinor);
    if (next > MAX_SAFE_MINOR) return null;
    breakdown[target[line.kind]] = Number(next);
  }
  const total = Object.values(breakdown).reduce((sum, amount) => BigInt(sum) + BigInt(amount), 0n);
  if (total > MAX_SAFE_MINOR) return null;
  return immutable({
    currency: [...currencies][0],
    breakdown,
    totalMinor: Number(total),
  });
}

export function roomAssetPreviewState(room) {
  const mediaReferences = Array.isArray(room?.mediaAssetIds) ? room.mediaAssetIds : [];
  const safeMedia = mediaReferences.length <= 20
    && mediaReferences.every((entry) => typeof entry === 'string' && ASSET_REFERENCE.test(entry))
    && new Set(mediaReferences).size === mediaReferences.length;
  return Object.freeze({
    hasFloorplan: typeof room?.floorplanAssetId === 'string'
      && ASSET_REFERENCE.test(room.floorplanAssetId),
    mediaCount: safeMedia ? mediaReferences.length : 0,
  });
}

export function buildServerRequestReview({
  catalog,
  roomId,
  internalParticipants,
  externalParticipants,
  serviceIds,
  equipmentIds,
  cateringParticipantCount,
  packageSelection,
  itemQuantities,
  allocations,
  dietaryRequirements,
  specialRequirements,
} = {}) {
  const room = catalog?.rooms?.find((entry) => entry.id === roomId) || null;
  const services = selected(serviceEditorOptions(catalog, roomId), serviceIds);
  const equipment = selected(equipmentEditorOptions(catalog, roomId), equipmentIds);
  const cateringOptions = cateringEditorOptions(catalog, roomId);
  const selectedPackage = packageSelection
    ? cateringOptions.packages.find((entry) => entry.id === packageSelection.packageId)
    : null;
  const selectedVariant = selectedPackage?.variants?.find(
    (entry) => entry.id === packageSelection.variantId,
  ) || null;
  const includedItemIds = new Set(selectedPackage?.itemIds || []);
  const cateringItems = cateringOptions.items.flatMap((item) => {
    const quantity = safeCount(itemQuantities?.[item.id]);
    return quantity > 0 ? [{ item, quantity, includedByPackage: includedItemIds.has(item.id) }] : [];
  });
  const participantCount = safeCount(cateringParticipantCount);
  const catering = {
    participantCount,
    packageSelection: selectedPackage && selectedVariant ? {
      package: selectedPackage,
      variant: selectedVariant,
      includedItems: cateringOptions.items.filter((entry) => includedItemIds.has(entry.id)),
    } : null,
    items: cateringItems,
  };
  const allocationRows = (allocations || []).flatMap((entry) => {
    const costCenter = catalog?.costCenters?.find((candidate) => candidate.id === entry.costCenterId);
    const percentage = Number(entry.percentage);
    return costCenter && Number.isFinite(percentage) ? [{ costCenter, percentage }] : [];
  });
  const internal = safeCount(internalParticipants);
  const external = safeCount(externalParticipants);
  return immutable({
    participants: { internal, external, total: internal + external },
    room,
    roomAssets: roomAssetPreviewState(room),
    services,
    equipment,
    catering,
    allocations: allocationRows,
    dietaryRequirements: String(dietaryRequirements || '').trim() || null,
    specialRequirements: String(specialRequirements || '').trim() || null,
    price: pricePreview({ room, services, equipment, catering }),
  });
}
