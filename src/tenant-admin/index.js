import { createMicrosoft365OnboardingApi } from '../platform/microsoft365-onboarding-api.js';
import { createMicrosoft365OnboardingRuntime } from '../platform/microsoft365-onboarding-runtime.js';
import { createTenantAdminApplication } from './application.js';
import { createDemoOnboarding } from './demo-onboarding.js';
import { createDemoTenantAudit } from './demo-tenant-audit.js';
import { createDemoTenantCapabilities } from './demo-tenant-capabilities.js';
import { createDemoTenantUserAdministration } from './demo-user-administration.js';
import { createDemoBookingPolicySettings } from './sections/booking-policies/index.js';
import { createDemoCatalogueSettings } from './sections/catalog/index.js';
import { createDemoCostAllocationSettings } from './sections/cost-allocation/index.js';
import { createDemoLocationSettings } from './sections/locations/index.js';
import { createDemoOrganizationSettings } from './sections/organization/index.js';
import {
  clearTenantAdminRoute,
  isTenantAdminRoute,
  tenantAdminHashForSection,
  tenantAdminSectionFromHash,
} from './route.js';

export {
  clearTenantAdminRoute,
  createDemoBookingPolicySettings,
  createDemoCatalogueSettings,
  createDemoCostAllocationSettings,
  createDemoLocationSettings,
  createDemoOnboarding,
  createDemoOrganizationSettings,
  createDemoTenantAudit,
  createDemoTenantCapabilities,
  createDemoTenantUserAdministration,
  createTenantAdminApplication,
  isTenantAdminRoute,
  tenantAdminHashForSection,
  tenantAdminSectionFromHash,
};

export function createTenantAdminOnboardingRuntime({
  demo,
  apiClient,
  connectionApi,
  persistence,
} = {}) {
  if (demo) return createDemoOnboarding();
  if (!apiClient || !connectionApi || !persistence) return null;
  return createMicrosoft365OnboardingRuntime({
    onboardingApi: createMicrosoft365OnboardingApi({ apiClient }),
    connectionApi,
    persistence,
  });
}
