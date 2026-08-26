const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const IANA_TIME_ZONE = /^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*$/;
const TIME_ZONE_MAX_LENGTH = 64;
const OFFSET_SAMPLE_HOURS = Object.freeze([-36, -24, -12, 0, 12, 24, 36]);

export function isProductionTimeZone(timeZone) {
  if (
    typeof timeZone !== 'string'
    || timeZone.length < 1
    || timeZone.length > TIME_ZONE_MAX_LENGTH
    || !IANA_TIME_ZONE.test(timeZone)
  ) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function wallTimeParts(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp);
  return Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
}

function sameWallTime(parts, expected) {
  return parts.year === expected.year
    && parts.month === expected.month
    && parts.day === expected.day
    && parts.hour === expected.hour
    && parts.minute === expected.minute
    && parts.second === '00';
}

export function productionUtcInstant(dateValue, timeValue, timeZone) {
  const dateMatch = typeof dateValue === 'string' ? dateValue.match(DATE_PATTERN) : null;
  const timeMatch = typeof timeValue === 'string' ? timeValue.match(TIME_PATTERN) : null;
  if (!dateMatch || !timeMatch || !isProductionTimeZone(timeZone)) return null;

  const expected = {
    year: dateMatch[1],
    month: dateMatch[2],
    day: dateMatch[3],
    hour: timeMatch[1],
    minute: timeMatch[2],
  };
  const values = Object.values(expected).map(Number);
  const [year, month, day, hour, minute] = values;
  const wallTimestamp = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const normalized = new Date(wallTimestamp);
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
    || normalized.getUTCHours() !== hour
    || normalized.getUTCMinutes() !== minute
  ) return null;

  const offsets = new Set(OFFSET_SAMPLE_HOURS.map((sampleHours) => {
    const sample = wallTimestamp + (sampleHours * 60 * 60 * 1000);
    const parts = wallTimeParts(sample, timeZone);
    return Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    ) - sample;
  }));
  const matches = [...offsets]
    .map((offset) => wallTimestamp - offset)
    .filter((candidate) => sameWallTime(wallTimeParts(candidate, timeZone), expected));

  return matches.length === 1 ? new Date(matches[0]).toISOString() : null;
}

export function formatProductionDateTime(value, { locale = 'de-DE', timeZone } = {}) {
  if (!isProductionTimeZone(timeZone)) return '';
  const timestamp = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(timestamp);
  } catch {
    return '';
  }
}
