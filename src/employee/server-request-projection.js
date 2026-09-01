import { isProductionTimeZone, productionUtcInstant } from '../core/production-time.js';

function wallValues(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, value]));
  return Object.freeze({
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  });
}

function addDays(dateValue, days) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return [value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-');
}

function calendarDayNumber(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function repeatRequestProjection(request, now = Date.now(), timeZone = null) {
  if (!request || !Number.isFinite(Date.parse(request.startsAt)) || !Number.isFinite(Date.parse(request.endsAt))) {
    throw new TypeError('PRODUCTION_REPEAT_REQUEST_INVALID');
  }
  if (Date.parse(request.startsAt) > now) return Object.freeze({ ...request });
  const duration = Date.parse(request.endsAt) - Date.parse(request.startsAt);
  if (duration <= 0 || !isProductionTimeZone(timeZone)) {
    throw new TypeError('PRODUCTION_REPEAT_REQUEST_INVALID');
  }
  const sourceStart = wallValues(Date.parse(request.startsAt), timeZone);
  const sourceEnd = wallValues(Date.parse(request.endsAt), timeZone);
  const current = wallValues(now, timeZone);
  let weeks = Math.max(
    1,
    Math.floor((calendarDayNumber(current.date) - calendarDayNumber(sourceStart.date)) / 7),
  );
  let startsAt = null;
  let endsAt = null;
  do {
    const days = weeks * 7;
    startsAt = productionUtcInstant(addDays(sourceStart.date, days), sourceStart.time, timeZone);
    endsAt = productionUtcInstant(addDays(sourceEnd.date, days), sourceEnd.time, timeZone);
    weeks += 1;
  } while (!startsAt || !endsAt || Date.parse(startsAt) <= now || Date.parse(endsAt) <= Date.parse(startsAt));
  return Object.freeze({
    ...request,
    startsAt,
    endsAt,
  });
}
