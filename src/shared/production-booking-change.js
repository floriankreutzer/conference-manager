import { productionUtcInstant } from '../core/production-time.js';

export const PRODUCTION_BOOKING_CHANGE_MAX_PARTICIPANTS = 500;

const TERMINAL_BOOKING_CHANGE_STATUSES = new Set([
  'applied',
  'rejected',
  'superseded',
]);

export function canProposeProductionBookingChange(requestStatus, bookingChange) {
  return requestStatus === 'Confirmed'
    && bookingChange !== undefined
    && (bookingChange === null || TERMINAL_BOOKING_CHANGE_STATUSES.has(bookingChange?.status));
}

function safeParticipantCount(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    && parsed >= 0
    && parsed <= PRODUCTION_BOOKING_CHANGE_MAX_PARTICIPANTS
    ? parsed
    : null;
}

export function productionRoomTimeZone(room, catalog) {
  const site = catalog?.sites?.find((entry) => entry.id === room?.siteId);
  return site?.timeZone || null;
}

export function productionBookingChangeFitsRoom(room, overrides) {
  const capacity = room?.capacity;
  const internal = overrides?.internalParticipants;
  const external = overrides?.externalParticipants;
  const total = internal + external;
  return Number.isSafeInteger(capacity) && capacity >= 1
    && Number.isSafeInteger(internal) && internal >= 0
    && Number.isSafeInteger(external) && external >= 0
    && total >= 1 && total <= PRODUCTION_BOOKING_CHANGE_MAX_PARTICIPANTS
    && total <= capacity;
}

export function productionBookingChangeOverrides({
  catalog,
  roomId,
  startDate,
  endDate,
  startTime,
  endTime,
  internalParticipants,
  externalParticipants,
  now = Date.now(),
} = {}) {
  const room = catalog?.rooms?.find((entry) => entry.id === roomId);
  const timeZone = productionRoomTimeZone(room, catalog);
  const startsAt = productionUtcInstant(startDate, startTime, timeZone);
  const endsAt = productionUtcInstant(endDate, endTime, timeZone);
  const internal = safeParticipantCount(internalParticipants);
  const external = safeParticipantCount(externalParticipants);
  const total = Number(internal) + Number(external);
  if (
    !room
    || !startsAt
    || !endsAt
    || Date.parse(startsAt) <= now
    || Date.parse(endsAt) <= Date.parse(startsAt)
    || internal === null
    || external === null
    || total < 1
    || total > PRODUCTION_BOOKING_CHANGE_MAX_PARTICIPANTS
  ) return null;
  return Object.freeze({
    roomId: room.id,
    startsAt,
    endsAt,
    internalParticipants: internal,
    externalParticipants: external,
  });
}
