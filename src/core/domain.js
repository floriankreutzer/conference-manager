export const REQUEST_STATUS = Object.freeze({
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In Review',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  CHANGE_REQUESTED: 'Change Requested',
  CANCELLED: 'Cancelled',
});

export const CALENDAR_STATUS = Object.freeze({
  PROVISIONAL: 'Tentative',
  BUSY: 'Busy',
  RELEASED: 'Released',
});

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const PARTICIPANT_LIMIT = 500;
export const MAX_COST_COMPONENT = 1_000_000;

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function safeCost(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= MAX_COST_COMPONENT ? numeric : 0;
}

function safeQuantity(value) {
  const numeric = Number(value || 0);
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= PARTICIPANT_LIMIT ? numeric : 0;
}

export function localTodayIso(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export function totalParticipants(requestLike) {
  const value = objectOrEmpty(requestLike);
  return Number(value.internalParticipants || 0) + Number(value.externalParticipants || 0);
}

export function isRoomConflict(requests, candidate, excludeRequestId = null) {
  const safeCandidate = objectOrEmpty(candidate);
  return arrayOrEmpty(requests).some((request) => {
    if (!request || typeof request !== 'object' || Array.isArray(request)) return false;
    return request.id !== excludeRequestId
      && request.roomId === safeCandidate.roomId
      && request.date === safeCandidate.date
      && ![REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED].includes(request.status)
      && intervalsOverlap(safeCandidate.start, safeCandidate.end, request.start, request.end);
  });
}

export function validateSchedule(form, today = localTodayIso()) {
  const safeForm = objectOrEmpty(form);
  if (!String(safeForm.title || '').trim()) return { step: 1, field: 'title', key: 'validation.title' };
  if (!String(safeForm.location || '').trim()) return { step: 1, field: 'location', key: 'validation.location' };
  if (!ISO_DATE_PATTERN.test(String(safeForm.date || ''))) return { step: 1, field: 'date', key: 'validation.date' };
  if (safeForm.date < today) return { step: 1, field: 'date', key: 'validation.dateFuture' };
  if (!ISO_TIME_PATTERN.test(String(safeForm.start || ''))) return { step: 1, field: 'start', key: 'validation.start' };
  if (!ISO_TIME_PATTERN.test(String(safeForm.end || '')) || safeForm.end <= safeForm.start) {
    return { step: 1, field: 'end', key: 'validation.end' };
  }
  const internal = Number(safeForm.internalParticipants || 0);
  const external = Number(safeForm.externalParticipants || 0);
  if (!Number.isFinite(internal) || !Number.isFinite(external) || internal < 0 || external < 0) {
    return { step: 1, field: internal < 0 ? 'internalParticipants' : 'externalParticipants', key: 'validation.negative' };
  }
  const invalidInternal = !Number.isInteger(internal) || internal > PARTICIPANT_LIMIT;
  const invalidExternal = !Number.isInteger(external) || external > PARTICIPANT_LIMIT;
  if (invalidInternal || invalidExternal) {
    return {
      step: 1,
      field: invalidInternal ? 'internalParticipants' : 'externalParticipants',
      key: 'validation.participantRange',
    };
  }
  if (internal + external < 1) return { step: 1, field: 'internalParticipants', key: 'validation.participants' };
  return null;
}

export function validateAllocations(allocations) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return { step: 5, field: 'allocations', key: 'validation.alloc' };
  }
  const missingCostCenter = allocations.findIndex((entry) => !String(entry?.costCenter || '').trim());
  if (missingCostCenter >= 0) {
    return { step: 5, field: `allocation-cost-center-${missingCostCenter}`, key: 'validation.centers' };
  }
  const invalidPercent = allocations.findIndex((entry) => {
    const percent = Number(entry?.percent);
    return !Number.isFinite(percent) || percent < 0 || percent > 100;
  });
  if (invalidPercent >= 0) {
    return { step: 5, field: `allocation-percent-${invalidPercent}`, key: 'validation.percentRange' };
  }
  const sum = allocations.reduce((total, entry) => total + Number(entry?.percent || 0), 0);
  if (Math.abs(sum - 100) > 0.01) return { step: 5, field: 'allocations', key: 'validation.alloc' };
  return null;
}

export function validateRoom(input) {
  const safeInput = objectOrEmpty(input);
  const { roomId, form, rooms, requests, excludeRequestId = null } = safeInput;
  if (!roomId) return { step: 2, field: 'rooms', key: 'validation.room' };
  const safeForm = objectOrEmpty(form);
  const room = arrayOrEmpty(rooms).find((entry) => entry?.id === roomId);
  const participants = totalParticipants(safeForm);
  if (!room || room.active === false || room.location !== safeForm.location || Number(room.capacity || 0) < participants) {
    return { step: 2, field: 'rooms', key: 'validation.roomChanged' };
  }
  const candidate = { roomId, date: safeForm.date, start: safeForm.start, end: safeForm.end };
  if (isRoomConflict(requests, candidate, excludeRequestId)) {
    return { step: 2, field: 'rooms', key: 'validation.roomBusy' };
  }
  return null;
}

export function validateRequest(input) {
  const safeInput = objectOrEmpty(input);
  return validateSchedule(safeInput.form, safeInput.today)
    || validateRoom(safeInput)
    || validateAllocations(safeInput.allocations);
}

export function calculateCosts(input = {}) {
  const safeInput = objectOrEmpty(input);
  const {
    room,
    services,
    selectedServiceIds,
    cateringPackage,
    cateringParticipants,
    items,
    quantities,
  } = safeInput;
  const roomCost = safeCost(room?.rate);
  const selectedIds = arrayOrEmpty(selectedServiceIds);
  const safeQuantities = objectOrEmpty(quantities);
  const serviceCost = arrayOrEmpty(services)
    .filter((service) => service && selectedIds.includes(service.id))
    .reduce((sum, service) => sum + safeCost(service.price), 0);
  const packageCost = cateringPackage
    ? safeCost(cateringPackage.pricePerPerson) * safeQuantity(cateringParticipants)
    : 0;
  const itemCost = arrayOrEmpty(items)
    .filter((item) => item && typeof item === 'object')
    .reduce((sum, item) => sum + safeCost(item.price) * safeQuantity(safeQuantities[item.id]), 0);
  return {
    roomCost,
    serviceCost,
    cateringCost: packageCost + itemCost,
    total: roomCost + serviceCost + packageCost + itemCost,
  };
}

export function appendHistory(request, status, note = '', at = new Date().toISOString()) {
  const source = objectOrEmpty(request);
  const next = structuredClone(source);
  const event = { status, calendarStatus: next.calendarStatus || '', at, note };
  next.statusHistory = Array.isArray(next.statusHistory) ? next.statusHistory : [];
  if (!next.statusHistory.some((entry) => entry?.status === status && entry?.at === at && entry?.note === note)) {
    next.statusHistory.push(event);
  }
  return next;
}

export function requestTimeline(request) {
  const safeRequest = objectOrEmpty(request);
  const events = arrayOrEmpty(safeRequest.statusHistory)
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => structuredClone(entry));
  if (safeRequest.createdAt && !events.some((entry) => entry.status === REQUEST_STATUS.SUBMITTED && entry.at === safeRequest.createdAt)) {
    events.push({ status: REQUEST_STATUS.SUBMITTED, at: safeRequest.createdAt, note: '' });
  }
  return events.sort((left, right) => String(left.at || '').localeCompare(String(right.at || '')));
}

export function isPastRequest(request, today = localTodayIso()) {
  const safeRequest = objectOrEmpty(request);
  return Boolean(safeRequest.date && safeRequest.date < today);
}

export function cloneForRepeat(request, today = localTodayIso()) {
  const safeRequest = objectOrEmpty(request);
  const past = isPastRequest(safeRequest, today);
  return {
    title: safeRequest.title || '',
    location: safeRequest.location || '',
    date: past ? '' : safeRequest.date || '',
    start: past ? '' : safeRequest.start || '',
    end: past ? '' : safeRequest.end || '',
    internalParticipants: safeRequest.internalParticipants ?? '',
    externalParticipants: safeRequest.externalParticipants ?? '',
    specialRequirements: safeRequest.specialRequirements || '',
    dietaryRequirements: safeRequest.dietaryRequirements || '',
    cateringParticipants: safeRequest.cateringParticipants || '',
    roomId: past ? null : safeRequest.roomId || null,
    serviceIds: [...arrayOrEmpty(safeRequest.serviceIds)],
    packageSelection: safeRequest.packageSelection ? structuredClone(safeRequest.packageSelection) : null,
    quantities: structuredClone(objectOrEmpty(safeRequest.quantities)),
    allocations: structuredClone(Array.isArray(safeRequest.allocations) && safeRequest.allocations.length
      ? safeRequest.allocations
      : [{ costCenter: '', percent: 100 }]),
    copiedFromPast: past,
  };
}
