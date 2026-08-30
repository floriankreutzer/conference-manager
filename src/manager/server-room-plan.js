import { isProductionTimeZone } from '../core/production-time.js';

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

export function roomPlanProjection({ catalog, requests, siteId, date }) {
  const site = catalog?.sites?.find((entry) => entry.id === siteId);
  if (!site || !isProductionTimeZone(site.timeZone)) {
    throw new TypeError('ROOM_PLAN_SITE_INVALID');
  }
  const rooms = catalog.rooms.filter((room) => room.siteId === site.id);
  return Object.freeze(rooms.map((room) => Object.freeze({
    room,
    requests: Object.freeze(requests.filter((request) => (
      request.roomId === room.id
      && !['Rejected', 'Cancelled'].includes(request.status)
      && siteLocalIsoDate(Date.parse(request.startsAt), site.timeZone) === date
    ))),
  })));
}
