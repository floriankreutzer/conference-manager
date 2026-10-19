// Stable technical wire values shared by transport validation and injected Admin presentation.
// These values grant no provider, Tenant, ordering or approval authority.
export const CATERING_CAPABILITIES = Object.freeze([
  'catering.catalogue', 'catering.availability', 'catering.order', 'catering.update', 'catering.cancel', 'catering.status',
]);
export const CATERING_INITIAL_MODES = Object.freeze(['manager_review', 'after_conference_approval']);
export const CATERING_MODES = Object.freeze(['api', 'manual', 'unsupported']);
