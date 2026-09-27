import { createAuditSection } from './sections/audit/index.js';
import { createBookingPoliciesSection } from './sections/booking-policies/index.js';
import { createCapabilitiesSection } from './sections/capabilities/index.js';
import { createCostAllocationSection } from './sections/cost-allocation/index.js';
import { createLocationsSection } from './sections/locations/index.js';
import { createMicrosoft365Section } from './sections/microsoft365/index.js';
import { createOrganizationSection } from './sections/organization/index.js';
import { createUsersSection } from './sections/users/index.js';
import { authorityFailureCode } from '../shared/authority-failure.js';

function authorityAwareAdapter(adapter, onAuthorityFailure, seen = new WeakMap()) {
  if (!adapter || typeof adapter !== 'object') return adapter;
  if (seen.has(adapter)) return seen.get(adapter);
  const wrapped = {};
  seen.set(adapter, wrapped);
  Object.entries(adapter).forEach(([key, value]) => {
    if (typeof value === 'function') {
      wrapped[key] = (...args) => {
        let result;
        try {
          result = value.apply(adapter, args);
        } catch (error) {
          if (authorityFailureCode(error)) onAuthorityFailure(error);
          throw error;
        }
        if (!result || typeof result.then !== 'function') return result;
        return result.catch((error) => {
          if (authorityFailureCode(error)) onAuthorityFailure(error);
          throw error;
        });
      };
      return;
    }
    wrapped[key] = authorityAwareAdapter(value, onAuthorityFailure, seen);
  });
  return Object.freeze(wrapped);
}

export function createTenantAdminSectionRegistry({
  context,
  adapters = {},
  onAuthorityFailure,
} = {}) {
  if (!context || typeof context.hasTenantAdminPermission !== 'function') {
    throw new TypeError('TENANT_ADMIN_CONTEXT_REQUIRED');
  }
  if (typeof onAuthorityFailure !== 'function') {
    throw new TypeError('TENANT_ADMIN_AUTHORITY_HANDLER_REQUIRED');
  }
  const sectionFactories = [
    [createOrganizationSection, adapters.organization],
    [createLocationsSection, adapters.locations],
    [createBookingPoliciesSection, adapters.bookingPolicies],
    [createCostAllocationSection, adapters.costAllocation],
    [createUsersSection, adapters.users],
    [createMicrosoft365Section, adapters.microsoft365],
    [createCapabilitiesSection, adapters.capabilities],
    [createAuditSection, adapters.audit],
  ];

  return Object.freeze(sectionFactories.map(([factory, adapter]) => {
    const section = factory({
      context,
      adapter: authorityAwareAdapter(adapter || null, onAuthorityFailure),
    });
    return Object.freeze({
      ...section,
      available: section.available && context.hasTenantAdminPermission(section.permission),
    });
  }));
}
