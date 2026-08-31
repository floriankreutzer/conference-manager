import { createMicrosoft365OnboardingApi } from '../platform/microsoft365-onboarding-api.js';
import { createMicrosoft365OnboardingRuntime } from '../platform/microsoft365-onboarding-runtime.js';

export { createTenantAdminApplication } from './application.js';
export { clearTenantAdminRoute, isTenantAdminRoute } from './route.js';

export function createServerTenantAdminOnboardingRuntime({
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
