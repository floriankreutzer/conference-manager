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
  return Number(requestLike.internalParticipants || 0) + Number(requestLike.externalParticipants || 0);
}

export function isRoomConflict(requests, candidate, excludeRequestId = null) {
  return requests.some((request) => (
    request.id !== excludeRequestId
    && request.roomId === candidate.roomId
    && request.date === candidate.date
    && ![REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED].includes(request.status)
    && intervalsOverlap(candidate.start, candidate.end, request.start, request.end)
  ));
}

export function validateSchedule(form, today = localTodayIso()) {
  if (!String(form.title || '').trim()) return { step: 1, field: 'title', key: 'validation.title' };
  if (!String(form.location || '').trim()) return { step: 1, field: 'location', key: 'validation.location' };
  if (!ISO_DATE_PATTERN.test(String(form.date || ''))) return { step: 1, field: 'date', key: 'validation.date' };
  if (form.date < today) return { step: 1, field: 'date', key: 'validation.dateFuture' };
  if (!ISO_TIME_PATTERN.test(String(form.start || ''))) return { step: 1, field: 'start', key: 'validation.start' };
  if (!ISO_TIME_PATTERN.test(String(form.end || '')) || form.end <= form.start) {
    return { step: 1, field: 'end', key: 'validation.end' };
  }
  const internal = Number(form.internalParticipants || 0);
  const external = Number(form.externalParticipants || 0);
  if (!Number.isFinite(internal) || !Number.isFinite(external) || internal < 0 || external < 0) {
    return { step: 1, field: internal < 0 ? 'internalParticipants' : 'externalParticipants', key: 'validation.negative' };
  }
  if (internal + external < 1) return { step: 1, field: 'internalParticipants', key: 'validation.participants' };
  return null;
}

export function validateAllocations(allocations) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return { step: 5, field: 'allocations', key: 'validation.alloc' };
  }
  const missingCostCenter = allocations.findIndex((entry) => !String(entry.costCenter || '').trim());
  if (missingCostCenter >= 0) {
    return { step: 5, field: `allocation-cost-center-${missingCostCenter}`, key: 'validation.centers' };
  }
  const invalidPercent = allocations.findIndex((entry) => {
    const percent = Number(entry.percent);
    return !Number.isFinite(percent) || percent < 0 || percent > 100;
  });
  if (invalidPercent >= 0) {
    return { step: 5, field: `allocation-percent-${invalidPercent}`, key: 'validation.percentRange' };
  }
  const sum = allocations.reduce((total, entry) => total + Number(entry.percent || 0), 0);
  if (Math.abs(sum - 100) > 0.01) return { step: 5, field: 'allocations', key: 'validation.alloc' };
  return null;
}

export function validateRoom({ roomId, form, rooms, requests, excludeRequestId = null }) {
  if (!roomId) return { step: 2, field: 'rooms', key: 'validation.room' };
  const room = rooms.find((entry) => entry.id === roomId);
  const participants = Number(form.internalParticipants || 0) + Number(form.externalParticipants || 0);
  if (!room || room.active === false || room.location !== form.location || Number(room.capacity || 0) < participants) {
    return { step: 2, field: 'rooms', key: 'validation.roomChanged' };
  }
  const candidate = { roomId, date: form.date, start: form.start, end: form.end };
  if (isRoomConflict(requests, candidate, excludeRequestId)) {
    return { step: 2, field: 'rooms', key: 'validation.roomBusy' };
  }
  return null;
}

export function validateRequest(input) {
  return validateSchedule(input.form, input.today)
    || validateRoom(input)
    || validateAllocations(input.allocations);
}

export function calculateCosts({ room, services, selectedServiceIds, cateringPackage, cateringParticipants, items, quantities }) {
  const roomCost = Number(room?.rate || 0);
  const serviceCost = services
    .filter((service) => selectedServiceIds.includes(service.id))
    .reduce((sum, service) => sum + Number(service.price || 0), 0);
  const packageCost = cateringPackage
    ? Number(cateringPackage.pricePerPerson || 0) * Number(cateringParticipants || 0)
    : 0;
  const itemCost = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(quantities[item.id] || 0), 0);
  return {
    roomCost,
    serviceCost,
    cateringCost: packageCost + itemCost,
    total: roomCost + serviceCost + packageCost + itemCost,
  };
}

export function appendHistory(request, status, note = '', at = new Date().toISOString()) {
  const next = structuredClone(request);
  const event = { status, calendarStatus: next.calendarStatus || '', at, note };
  next.statusHistory = Array.isArray(next.statusHistory) ? next.statusHistory : [];
  if (!next.statusHistory.some((entry) => entry.status === status && entry.at === at && entry.note === note)) {
    next.statusHistory.push(event);
  }
  return next;
}

export function requestTimeline(request) {
  const events = [...(request.statusHistory || [])];
  if (request.createdAt && !events.some((entry) => entry.status === REQUEST_STATUS.SUBMITTED && entry.at === request.createdAt)) {
    events.push({ status: REQUEST_STATUS.SUBMITTED, at: request.createdAt, note: '' });
  }
  return events.sort((left, right) => String(left.at || '').localeCompare(String(right.at || '')));
}

export function isPastRequest(request, today = localTodayIso()) {
  return Boolean(request.date && request.date < today);
}

export function cloneForRepeat(request, today = localTodayIso()) {
  const past = isPastRequest(request, today);
  return {
    title: request.title || '',
    location: request.location || '',
    date: past ? '' : request.date || '',
    start: past ? '' : request.start || '',
    end: past ? '' : request.end || '',
    internalParticipants: request.internalParticipants ?? '',
    externalParticipants: request.externalParticipants ?? '',
    specialRequirements: request.specialRequirements || '',
    dietaryRequirements: request.dietaryRequirements || '',
    cateringParticipants: request.cateringParticipants || '',
    roomId: past ? null : request.roomId || null,
    serviceIds: [...(request.serviceIds || [])],
    packageSelection: request.packageSelection ? structuredClone(request.packageSelection) : null,
    quantities: structuredClone(request.quantities || {}),
    allocations: structuredClone(request.allocations?.length ? request.allocations : [{ costCenter: '', percent: 100 }]),
    copiedFromPast: past,
  };
}
