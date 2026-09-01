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
