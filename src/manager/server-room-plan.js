import { isProductionTimeZone, productionUtcInstant } from '../core/production-time.js';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function siteLocalIsoDate(instant, timeZone) {
  if (!isProductionTimeZone(timeZone)) throw new TypeError('ROOM_PLAN_TIME_ZONE_INVALID');
  const timestamp = instant instanceof Date ? instant.getTime() : Number(instant);
  if (!Number.isFinite(timestamp)) throw new TypeError('ROOM_PLAN_INSTANT_INVALID');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function adjacentRoomPlanDate(date, direction) {
  const match = typeof date === 'string' ? date.match(ISO_DATE_PATTERN) : null;
  if (!match || ![-1, 1].includes(direction)) throw new TypeError('ROOM_PLAN_DATE_INVALID');
  const [year, month, day] = match.slice(1).map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const normalized = new Date(timestamp);
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
  ) throw new TypeError('ROOM_PLAN_DATE_INVALID');
  normalized.setUTCDate(normalized.getUTCDate() + direction);
  const adjacent = normalized.toISOString().slice(0, 10);
  if (!ISO_DATE_PATTERN.test(adjacent) || normalized.getUTCFullYear() < 100) {
    throw new TypeError('ROOM_PLAN_DATE_INVALID');
  }
  return adjacent;
}

function siteLocalDayRange(date, timeZone) {
  const startsAt = productionUtcInstant(date, '00:00', timeZone);
  const endsAt = productionUtcInstant(adjacentRoomPlanDate(date, 1), '00:00', timeZone);
  if (!startsAt || !endsAt) throw new TypeError('ROOM_PLAN_DATE_INVALID');
  return Object.freeze({ startsAt: Date.parse(startsAt), endsAt: Date.parse(endsAt) });
}

export function roomPlanTimeline({ date, timeZone, timeWindow = 'DAY' }) {
  const day = siteLocalDayRange(date, timeZone);
  if (!['DAY', 'WORK'].includes(timeWindow)) throw new TypeError('ROOM_PLAN_WINDOW_INVALID');
  const workingDay = timeWindow === 'WORK';
  const start = workingDay ? Date.parse(productionUtcInstant(date, '08:00', timeZone)) : day.startsAt;
  const end = workingDay ? Date.parse(productionUtcInstant(date, '18:00', timeZone)) : day.endsAt;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new TypeError('ROOM_PLAN_DATE_INVALID');
  }
  const hours = workingDay ? Array.from({ length: 11 }, (_, index) => index + 8) : [0, 6, 12, 18, 24];
  // A clock label is shown only when the Site's wall time resolves unambiguously.
  const ticks = hours.map((hour) => hour === 24 ? end
    : Date.parse(productionUtcInstant(date, `${String(hour).padStart(2, '0')}:00`, timeZone)))
    .filter((value) => Number.isFinite(value) && value >= start && value <= end);
  return Object.freeze({ start, end, ticks: Object.freeze(ticks) });
}

export function roomPlanProjection({ catalog, requests, siteId, date }) {
  const site = catalog?.sites?.find((entry) => entry.id === siteId);
  if (!site || !isProductionTimeZone(site.timeZone)) {
    throw new TypeError('ROOM_PLAN_SITE_INVALID');
  }
  const day = siteLocalDayRange(date, site.timeZone);
  const rooms = catalog.rooms.filter((room) => room.siteId === site.id);
  return Object.freeze(rooms.map((room) => Object.freeze({
    room,
    requests: Object.freeze(requests.filter((request) => (
      request.roomId === room.id
      && !['Rejected', 'Cancelled'].includes(request.status)
      && Date.parse(request.startsAt) < day.endsAt
      && Date.parse(request.endsAt) > day.startsAt
    ))),
  })));
}
