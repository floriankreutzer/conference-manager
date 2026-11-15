export const REQUEST_MAX_DURATION_HOURS = 24;

export function isSupportedRequestDuration(startsAt, endsAt) {
  const duration = Date.parse(endsAt) - Date.parse(startsAt);
  return Number.isFinite(duration) && duration > 0
    && duration <= REQUEST_MAX_DURATION_HOURS * 60 * 60 * 1000;
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
    ...(request?.schemaVersion === 3 ? { equipmentIds: [...details.equipmentIds] } : {}),
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
