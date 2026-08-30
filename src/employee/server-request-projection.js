export function repeatRequestProjection(request, now = Date.now()) {
  if (!request || !Number.isFinite(Date.parse(request.startsAt)) || !Number.isFinite(Date.parse(request.endsAt))) {
    throw new TypeError('PRODUCTION_REPEAT_REQUEST_INVALID');
  }
  if (Date.parse(request.startsAt) > now) return Object.freeze({ ...request });
  const week = 7 * 24 * 60 * 60 * 1_000;
  const duration = Date.parse(request.endsAt) - Date.parse(request.startsAt);
  if (duration <= 0) throw new TypeError('PRODUCTION_REPEAT_REQUEST_INVALID');
  let startsAt = Date.parse(request.startsAt);
  while (startsAt <= now) startsAt += week;
  return Object.freeze({
    ...request,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(startsAt + duration).toISOString(),
  });
}
