import { createAuditSection } from './sections/audit/index.js';
import { createBookingPoliciesSection } from './sections/booking-policies/index.js';
import { createCapabilitiesSection } from './sections/capabilities/index.js';
import { createCatalogSection } from './sections/catalog/index.js';
import { createCostAllocationSection } from './sections/cost-allocation/index.js';
import { createLocationsSection } from './sections/locations/index.js';
import { createMicrosoft365Section } from './sections/microsoft365/index.js';
import { createOrganizationSection } from './sections/organization/index.js';
import { createUsersSection } from './sections/users/index.js';

export function createTenantAdminSectionRegistry({
  context,
  adapters = {},
} = {}) {
  if (!context || typeof context.hasTenantAdminPermission !== 'function') {
    throw new TypeError('TENANT_ADMIN_CONTEXT_REQUIRED');
  }
  const sectionFactories = [
    [createOrganizationSection, adapters.organization],
    [createLocationsSection, adapters.locations],
    [createCatalogSection, adapters.catalog],
    [createBookingPoliciesSection, adapters.bookingPolicies],
    [createCostAllocationSection, adapters.costAllocation],
    [createUsersSection, adapters.users],
    [createMicrosoft365Section, adapters.microsoft365],
    [createCapabilitiesSection, adapters.capabilities],
    [createAuditSection, adapters.audit],
  ];

  return Object.freeze(sectionFactories.map(([factory, adapter]) => {
    const section = factory({ context, adapter: adapter || null });
    return Object.freeze({
      ...section,
      available: section.available && context.hasTenantAdminPermission(section.permission),
    });
  }));
}
