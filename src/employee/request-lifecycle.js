import {
  CALENDAR_STATUS,
  REQUEST_STATUS,
  appendHistory,
  localTodayIso,
  validateRequest,
} from '../core/domain.js';
import {
  activeRooms,
  createRequestData,
} from './request-session.js';

export function validateRequestSubmission({ state, catalog, requests, today = localTodayIso() }) {
  return validateRequest({
    roomId: state.roomId,
    form: state.form,
    rooms: activeRooms(catalog),
    requests,
    allocations: state.allocations,
    excludeRequestId: state.editingRequestId,
    today,
  });
}

export function createSubmittedRequest({
  state,
  catalog,
  localized,
  now = new Date().toISOString(),
  id = `CR-${new Date(now).getFullYear()}-${String(Date.now()).slice(-6)}`,
}) {
  const request = {
    id,
    ...createRequestData({ state, catalog, localized }),
    status: REQUEST_STATUS.SUBMITTED,
    calendarStatus: CALENDAR_STATUS.PROVISIONAL,
    createdAt: now,
    updatedAt: now,
    statusHistory: [],
  };
  return appendHistory(request, REQUEST_STATUS.SUBMITTED, '', now);
}

export function createResubmittedRequest({
  existing,
  state,
  catalog,
  localized,
  now = new Date().toISOString(),
}) {
  const updated = {
    ...existing,
    ...createRequestData({ state, catalog, localized }),
    status: REQUEST_STATUS.SUBMITTED,
    calendarStatus: CALENDAR_STATUS.PROVISIONAL,
    resubmittedAt: now,
    updatedAt: now,
  };
  return appendHistory(updated, REQUEST_STATUS.SUBMITTED, '', now);
}

export function createCancelledRequest(request, now = new Date().toISOString()) {
  return appendHistory({
    ...request,
    status: REQUEST_STATUS.CANCELLED,
    calendarStatus: CALENDAR_STATUS.RELEASED,
    cancelledAt: now,
    updatedAt: now,
  }, REQUEST_STATUS.CANCELLED, '', now);
}

export function requestMatchesFilter(request, filter, today = localTodayIso()) {
  if (filter === 'ALL') return true;
  if (filter === 'PAST') return request.date < today;
  return request.date >= today
    && ![REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED].includes(request.status);
}
