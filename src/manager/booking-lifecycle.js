import {
  CALENDAR_STATUS,
  REQUEST_STATUS,
  appendHistory,
} from '../core/domain.js';

export function confirmBooking(request, now = new Date().toISOString()) {
  return appendHistory({
    ...request,
    status: REQUEST_STATUS.CONFIRMED,
    calendarStatus: CALENDAR_STATUS.BUSY,
    confirmedAt: now,
    updatedAt: now,
  }, REQUEST_STATUS.CONFIRMED, '', now);
}

export function decideBooking(request, action, reason, now = new Date().toISOString()) {
  if (!['reject', 'change'].includes(action)) throw new TypeError('Unsupported manager booking action.');
  const normalizedReason = String(reason || '').trim();
  if (!normalizedReason) throw new TypeError('A manager decision reason is required.');

  const status = action === 'reject' ? REQUEST_STATUS.REJECTED : REQUEST_STATUS.CHANGE_REQUESTED;
  const next = {
    ...request,
    status,
    calendarStatus: action === 'reject' ? CALENDAR_STATUS.RELEASED : CALENDAR_STATUS.PROVISIONAL,
    updatedAt: now,
    ...(action === 'reject'
      ? { rejectionReason: normalizedReason, rejectedAt: now }
      : { changeReason: normalizedReason, changeRequestedAt: now }),
  };
  return appendHistory(next, status, normalizedReason, now);
}
