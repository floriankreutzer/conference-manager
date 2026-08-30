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

function nextIsoDate(date) {
  const match = typeof date === 'string' ? date.match(ISO_DATE_PATTERN) : null;
  if (!match) throw new TypeError('ROOM_PLAN_DATE_INVALID');
  const [year, month, day] = match.slice(1).map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const normalized = new Date(timestamp);
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
  ) throw new TypeError('ROOM_PLAN_DATE_INVALID');
  return new Date(timestamp + 86_400_000).toISOString().slice(0, 10);
}

function siteLocalDayRange(date, timeZone) {
  const startsAt = productionUtcInstant(date, '00:00', timeZone);
  const endsAt = productionUtcInstant(nextIsoDate(date), '00:00', timeZone);
  if (!startsAt || !endsAt) throw new TypeError('ROOM_PLAN_DATE_INVALID');
  return Object.freeze({ startsAt: Date.parse(startsAt), endsAt: Date.parse(endsAt) });
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
