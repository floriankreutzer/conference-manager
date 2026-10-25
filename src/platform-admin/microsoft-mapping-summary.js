const NO_MAPPINGS = Object.freeze({
  messageKey: 'platformAdmin.integration.mappingSummary.none',
  values: null,
});

export function microsoftMappingSummaryPresentation(mappings) {
  if (mappings.total === 0) return NO_MAPPINGS;

  return Object.freeze({
    messageKey: 'platformAdmin.integration.mappingSummary',
    values: Object.freeze({
      active: mappings.active,
      total: mappings.total,
    }),
  });
}
