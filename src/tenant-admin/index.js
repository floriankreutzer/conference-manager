import { createMicrosoft365OnboardingApi } from '../platform/microsoft365-onboarding-api.js';
import { createMicrosoft365OnboardingRuntime } from '../platform/microsoft365-onboarding-runtime.js';
import { createTenantAdminApplication } from './application.js';
import {
  clearTenantAdminRoute,
  isTenantAdminRoute,
  tenantAdminHashForSection,
  tenantAdminSectionFromHash,
} from './route.js';

export {
  clearTenantAdminRoute,
  createTenantAdminApplication,
  isTenantAdminRoute,
  tenantAdminHashForSection,
  tenantAdminSectionFromHash,
};

export function createTenantAdminOnboardingRuntime({
  apiClient,
  connectionApi,
  persistence,
} = {}) {
  if (!apiClient || !connectionApi || !persistence) return null;
  return createMicrosoft365OnboardingRuntime({
    onboardingApi: createMicrosoft365OnboardingApi({ apiClient }),
    connectionApi,
    persistence,
  });
}
