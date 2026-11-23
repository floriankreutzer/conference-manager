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
  const draft = {
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
  const totalParticipants = draft.internalParticipants + draft.externalParticipants;
  // The wizard retains a headcount even when no catering is selected. Keep that
  // unused count within a reduced booking; never adjust an actual catering order.
  if (
    Number.isSafeInteger(draft.internalParticipants) && draft.internalParticipants >= 0
    && Number.isSafeInteger(draft.externalParticipants) && draft.externalParticipants >= 0
    && totalParticipants > 0
    && !Object.hasOwn(overrides, 'catering')
    && draft.catering.packageSelection === null
    && draft.catering.itemQuantities.length === 0
    && Number.isSafeInteger(draft.catering.participantCount)
    && draft.catering.participantCount <= request?.internalParticipants + request?.externalParticipants
    && draft.catering.participantCount > totalParticipants
  ) {
    draft.catering = { ...draft.catering, participantCount: totalParticipants };
  }
  return draft;
}
