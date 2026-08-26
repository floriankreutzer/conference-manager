import { createMicrosoft365OnboardingApi } from '../platform/microsoft365-onboarding-api.js';
import { createMicrosoft365OnboardingRuntime } from '../platform/microsoft365-onboarding-runtime.js';
import { createTenantAdminApplication } from './application.js';
import { createDemoOnboarding } from './demo-onboarding.js';
import { createDemoTenantUserAdministration } from './demo-user-administration.js';
import {
  isTenantAdminRoute,
  tenantAdminHashForSection,
  tenantAdminSectionFromHash,
} from './settings-shell.js';

export {
  createDemoOnboarding,
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
