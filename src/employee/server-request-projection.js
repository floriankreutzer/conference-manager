import { isProductionTimeZone, productionUtcInstant } from '../core/production-time.js';

const WEEK_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;

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
  let weeks = Math.max(1, Math.floor((now - Date.parse(request.startsAt)) / WEEK_MILLISECONDS) + 1);
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

export function composeServerRequestDraft({
  request = null,
  catalog,
  overrides = Object.freeze({}),
  defaultTitle,
} = {}) {
  const details = request?.details;
  const allocations = request?.allocations?.entries?.map((entry) => ({
    costCenterId: entry.costCenterId,
    percentageBasisPoints: entry.percentageBasisPoints,
  })) || (catalog?.costAllocation?.allocationRequired && catalog?.costCenters?.length
    ? [{ costCenterId: catalog.costCenters[0].id, percentageBasisPoints: 10_000 }]
    : []);
  return {
    title: details?.title || defaultTitle,
    roomId: request?.roomId || '',
    startsAt: request?.startsAt || '',
    endsAt: request?.endsAt || '',
    internalParticipants: request?.internalParticipants ?? 1,
    externalParticipants: request?.externalParticipants ?? 0,
    serviceIds: [...(details?.serviceIds || [])],
    catering: details?.catering
      ? {
        ...details.catering,
        itemQuantities: details.catering.itemQuantities.map((entry) => ({ ...entry })),
      }
      : { participantCount: 0, packageSelection: null, itemQuantities: [] },
    dietaryRequirements: details?.dietaryRequirements || null,
    specialRequirements: details?.specialRequirements || null,
    allocations,
    configurationRevisions: catalog?.configurationRevisions,
    ...overrides,
  };
}
