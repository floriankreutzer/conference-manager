import {
  calculateCosts,
  cloneForRepeat,
  isRoomConflict,
  totalParticipants,
} from '../core/domain.js';

export function emptyRequestForm() {
  return {
    title: '',
    location: '',
    date: '',
    start: '',
    end: '',
    internalParticipants: '',
    externalParticipants: '',
    specialRequirements: '',
    dietaryRequirements: '',
    cateringParticipants: '',
  };
}

export function activeRooms(catalog) {
  return catalog.rooms.filter((room) => room.active !== false);
}

export function resetEmployeeRequestState(state, catalog) {
  state.step = 1;
  state.form = emptyRequestForm();
  state.roomId = null;
  state.serviceIds = [];
  state.cateringMode = 'NONE';
  state.packageSelection = null;
  state.quantities = Object.fromEntries(catalog.cateringItems.map((item) => [item.id, 0]));
  state.allocations = [{ costCenter: '', percent: 100 }];
  state.editingRequestId = null;
}

export function selectedCateringPackage(state, catalog) {
  if (!state.packageSelection) return null;
  const pack = catalog.cateringPackages.find((entry) => entry.id === state.packageSelection.packageId);
  const variant = pack?.variants.find((entry) => entry.tier === state.packageSelection.tier);
  return pack && variant ? { pack, variant } : null;
}

export function cateringParticipantCount(state) {
  if (state.cateringMode === 'NONE') return 0;
  const manual = Number(state.form.cateringParticipants || 0);
  return manual > 0 ? manual : totalParticipants(state.form);
}

export function calculateRequestCostSummary(state, catalog) {
  const pack = selectedCateringPackage(state, catalog);
  const room = catalog.rooms.find((entry) => entry.id === state.roomId) || null;
  return calculateCosts({
    room,
    services: catalog.services,
    selectedServiceIds: state.serviceIds,
    cateringPackage: pack ? { pricePerPerson: pack.variant.pricePerPerson } : null,
    cateringParticipants: cateringParticipantCount(state),
    items: catalog.cateringItems,
    quantities: state.quantities,
  });
}

export function availableRoomModel({ state, catalog, requests }) {
  const location = state.form.location;
  const participantCount = totalParticipants(state.form);
  const candidateBase = activeRooms(catalog).filter((room) => room.location === location);
  if (!location) return { type: 'empty', rooms: [] };
  if (!candidateBase.length) return { type: 'location', rooms: [] };

  const largestCapacity = Math.max(...candidateBase.map((room) => Number(room.capacity || 0)), 0);
  const capacityCandidates = candidateBase.filter((room) => Number(room.capacity || 0) >= participantCount);
  if (!capacityCandidates.length) return { type: 'capacity', rooms: [], largestCapacity };

  const candidate = (room) => ({
    roomId: room.id,
    date: state.form.date,
    start: state.form.start,
    end: state.form.end,
  });
  const freeRooms = capacityCandidates.filter((room) => !isRoomConflict(requests, candidate(room), state.editingRequestId));
  if (!freeRooms.length && state.form.date && state.form.start && state.form.end) {
    return { type: 'busy', rooms: [] };
  }

  const sorted = [...capacityCandidates].sort((left, right) => {
    const leftBusy = isRoomConflict(requests, candidate(left), state.editingRequestId);
    const rightBusy = isRoomConflict(requests, candidate(right), state.editingRequestId);
    if (leftBusy !== rightBusy) return Number(leftBusy) - Number(rightBusy);
    return (Number(left.capacity) - participantCount) - (Number(right.capacity) - participantCount);
  });
  return { type: 'available', rooms: sorted };
}

export function createDraftPayload(state, savedAt = new Date().toISOString()) {
  return {
    savedAt,
    form: structuredClone(state.form),
    step: state.step,
    roomId: state.roomId,
    serviceIds: [...state.serviceIds],
    cateringMode: state.cateringMode,
    packageSelection: state.packageSelection ? structuredClone(state.packageSelection) : null,
    quantities: structuredClone(state.quantities),
    allocations: structuredClone(state.allocations),
  };
}

export function hasMeaningfulDraft(draft) {
  return Boolean(
    draft.form.title
      || draft.form.location
      || draft.form.date
      || draft.form.start
      || draft.form.end
      || draft.form.internalParticipants
      || draft.form.externalParticipants
      || draft.form.specialRequirements
      || draft.roomId
      || draft.serviceIds.length
      || draft.packageSelection,
  );
}

export function restoreDraftState(state, draft, catalog) {
  state.form = { ...emptyRequestForm(), ...(draft.form || {}) };
  state.step = Math.min(6, Math.max(1, Number(draft.step || 1)));
  state.roomId = draft.roomId || null;
  state.serviceIds = [...(draft.serviceIds || [])];
  state.cateringMode = draft.cateringMode || 'NONE';
  state.packageSelection = draft.packageSelection ? structuredClone(draft.packageSelection) : null;
  state.quantities = {
    ...Object.fromEntries(catalog.cateringItems.map((item) => [item.id, 0])),
    ...(draft.quantities || {}),
  };
  state.allocations = structuredClone(
    draft.allocations?.length ? draft.allocations : [{ costCenter: '', percent: 100 }],
  );
}

export function applyRepeatToState(state, request, catalog, today) {
  const copied = cloneForRepeat(request, today);
  resetEmployeeRequestState(state, catalog);
  Object.assign(state.form, copied);
  state.roomId = copied.roomId;
  state.serviceIds = copied.serviceIds;
  state.packageSelection = copied.packageSelection;
  state.quantities = copied.quantities;
  state.allocations = copied.allocations;
  const hasItems = Object.values(copied.quantities).some((value) => Number(value) > 0);
  state.cateringMode = copied.packageSelection && hasItems
    ? 'BOTH'
    : copied.packageSelection
      ? 'PACKAGE'
      : hasItems
        ? 'ITEMS'
        : 'NONE';
  state.view = 'employee';
  state.step = 1;
  return copied;
}

export function applyChangeRequestToState(state, request, catalog) {
  resetEmployeeRequestState(state, catalog);
  state.editingRequestId = request.id;
  Object.assign(state.form, {
    title: request.title || '',
    location: request.location || '',
    date: request.date || '',
    start: request.start || '',
    end: request.end || '',
    internalParticipants: request.internalParticipants ?? '',
    externalParticipants: request.externalParticipants ?? '',
    specialRequirements: request.specialRequirements || '',
    dietaryRequirements: request.dietaryRequirements || '',
    cateringParticipants: request.cateringParticipants || '',
  });
  state.roomId = request.roomId || null;
  state.serviceIds = [...(request.serviceIds || [])];
  state.packageSelection = request.packageSelection
    ? { packageId: request.packageSelection.packageId, tier: request.packageSelection.tier }
    : null;
  state.quantities = structuredClone(request.quantities || {});
  state.allocations = structuredClone(
    request.allocations?.length ? request.allocations : [{ costCenter: '', percent: 100 }],
  );
  const hasItems = Object.values(state.quantities).some((value) => Number(value) > 0);
  state.cateringMode = state.packageSelection && hasItems
    ? 'BOTH'
    : state.packageSelection
      ? 'PACKAGE'
      : hasItems
        ? 'ITEMS'
        : 'NONE';
  state.view = 'employee';
  state.step = 1;
}

export function createRequestData({ state, catalog, localized, costs, pack }) {
  const selectedPack = pack === undefined ? selectedCateringPackage(state, catalog) : pack;
  const costSummary = costs === undefined ? calculateRequestCostSummary(state, catalog) : costs;
  return {
    title: String(state.form.title).trim(),
    location: state.form.location,
    date: state.form.date,
    start: state.form.start,
    end: state.form.end,
    participants: totalParticipants(state.form),
    internalParticipants: Number(state.form.internalParticipants || 0),
    externalParticipants: Number(state.form.externalParticipants || 0),
    specialRequirements: String(state.form.specialRequirements || '').trim(),
    dietaryRequirements: String(state.form.dietaryRequirements || '').trim(),
    cateringParticipants: cateringParticipantCount(state),
    roomId: state.roomId,
    serviceIds: [...state.serviceIds],
    packageSelection: selectedPack
      ? {
        packageId: selectedPack.pack.id,
        packageName: localized(selectedPack.pack.name),
        tier: selectedPack.variant.tier,
        pricePerPerson: Number(selectedPack.variant.pricePerPerson),
      }
      : null,
    quantities: structuredClone(state.quantities),
    allocations: structuredClone(state.allocations),
    estimatedCost: costSummary.total,
  };
}
