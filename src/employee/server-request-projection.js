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
