function validTimeZone(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return value;
  } catch {
    return null;
  }
}

export function requestSiteTimeZone(catalog, request) {
  const room = catalog?.rooms?.find((entry) => entry.id === request?.roomId);
  const site = catalog?.sites?.find((entry) => entry.id === room?.siteId);
  return validTimeZone(site?.timeZone);
}

function localDateKey(value, timeZone) {
  if (!timeZone || !Number.isFinite(value)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function requestOccursToday({ catalog, request, now = Date.now() } = {}) {
  const timeZone = requestSiteTimeZone(catalog, request);
  const startsAt = Date.parse(request?.startsAt);
  const requestDate = localDateKey(startsAt, timeZone);
  const currentDate = localDateKey(now, timeZone);
  return requestDate !== null && currentDate !== null && requestDate === currentDate;
}

export function formatRequestDateTime({ catalog, request, locale } = {}) {
  const timeZone = requestSiteTimeZone(catalog, request);
  const instant = new Date(request?.startsAt);
  if (!timeZone || Number.isNaN(instant.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
}
