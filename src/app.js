import { createServerDraftStore, createServerEmployeeApplication } from './employee/index.js';
import { createServerManagerApplication } from './manager/index.js';
import { createApplicationContext } from './platform/application-context.js';
import { createAppShell, renderAppBootstrapLoading } from './platform/app-shell.js';
import { createMicrosoft365ConnectionApi } from './platform/microsoft365-connection-api.js';
import {
  createTenantAuditApi,
  createTenantCapabilitiesApi,
} from './platform/tenant-admin-operations-api.js';
import {
  createTenantBookingPolicySettingsApi,
  createTenantCatalogueSettingsApi,
  createTenantCostAllocationSettingsApi,
  createPresentationRefreshingOrganizationSettings,
  createTenantLocationSettingsApi,
  createTenantOrganizationSettingsApi,
  createTenantPresentationApi,
  createTenantPresentationRuntime,
} from './platform/server-tenant-settings-api.js';
import { createTenantUserAdministrationApi } from './platform/tenant-user-administration-api.js';
import {
  clearTenantAdminRoute,
  createServerTenantAdminOnboardingRuntime,
  createTenantAdminApplication,
  isTenantAdminRoute,
} from './tenant-admin/server.js';

const APP_BUILD = '2026.08.30.77';
const OPTIONAL_PROJECTION_TIMEOUT_MS = 5_000;
const appRoot = document.getElementById('app');

function normalizedOptionalProjectionTimeout(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 30_000
    ? value
    : OPTIONAL_PROJECTION_TIMEOUT_MS;
}

async function refreshBoundedTenantPresentation(tenantPresentation, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await tenantPresentation.refresh({ signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function bootstrapCustomerApplication({
  runtimeMode,
  authenticationBootstrap,
  optionalProjectionTimeoutMs = OPTIONAL_PROJECTION_TIMEOUT_MS,
} = {}) {
  const optionalTimeout = normalizedOptionalProjectionTimeout(optionalProjectionTimeoutMs);
  renderAppBootstrapLoading();
  const context = await createApplicationContext({
    runtimeMode,
    authenticationBootstrap,
    optionalProjectionTimeoutMs: optionalTimeout,
  });
  let shell;

  const setPageHeading = (title, subtitle) => shell.setPageHeading(title, subtitle);
  const authentication = context.authenticationRuntime();
  const serverPersistence = context.serverPersistence();
  const tenantSettingsAdapters = context.isTenantAdmin() && authentication
    ? Object.freeze({
      organization: createTenantOrganizationSettingsApi({ apiClient: authentication.apiClient }),
      locations: createTenantLocationSettingsApi({ apiClient: authentication.apiClient }),
      catalog: createTenantCatalogueSettingsApi({ apiClient: authentication.apiClient }),
      bookingPolicies: createTenantBookingPolicySettingsApi({ apiClient: authentication.apiClient }),
      costAllocation: createTenantCostAllocationSettingsApi({ apiClient: authentication.apiClient }),
    })
    : Object.freeze({});
  const tenantPresentationAdapter = context.isAuthenticated() && authentication
    ? createTenantPresentationApi({ apiClient: authentication.apiClient })
    : null;
  const tenantPresentation = createTenantPresentationRuntime({ adapter: tenantPresentationAdapter });
  await refreshBoundedTenantPresentation(tenantPresentation, optionalTimeout);
  const effectiveTenantSettingsAdapters = Object.hasOwn(tenantSettingsAdapters, 'organization')
    ? Object.freeze({
      ...tenantSettingsAdapters,
      organization: createPresentationRefreshingOrganizationSettings({
        organizationSettings: tenantSettingsAdapters.organization,
        presentationRuntime: tenantPresentation,
      }),
    })
    : tenantSettingsAdapters;
  const employee = serverPersistence
    ? createServerEmployeeApplication({
      appRoot,
      setPageHeading,
      persistence: serverPersistence,
      onNavigate: (view) => shell.setView(view),
      siteInfo: context.getSiteInfo(),
      draftStore: createServerDraftStore({ tenantId: context.tenantId(), userId: context.userId() }),
    })
    : null;
  const manager = serverPersistence && context.isManager()
    ? createServerManagerApplication({ appRoot, setPageHeading, persistence: serverPersistence })
    : null;
  const tenantUserAdministration = context.isTenantAdmin() && authentication
    ? createTenantUserAdministrationApi({ apiClient: authentication.apiClient })
    : null;
  const tenantAudit = context.isTenantAdmin() && authentication
    ? createTenantAuditApi({ apiClient: authentication.apiClient })
    : null;
  const tenantCapabilities = context.isTenantAdmin() && authentication
    ? createTenantCapabilitiesApi({ apiClient: authentication.apiClient })
    : null;
  const microsoft365Connection = context.isTenantAdmin() && authentication
    ? createMicrosoft365ConnectionApi({ apiClient: authentication.apiClient })
    : null;
  const onboardingRuntime = context.isTenantAdmin()
    ? createServerTenantAdminOnboardingRuntime({
      apiClient: authentication?.apiClient,
      connectionApi: microsoft365Connection,
      persistence: serverPersistence,
    })
    : null;
  const tenantAdmin = tenantUserAdministration
    ? createTenantAdminApplication({
      context,
      appRoot,
      setPageHeading,
      sectionAdapters: Object.freeze({
        ...effectiveTenantSettingsAdapters,
        users: tenantUserAdministration,
        microsoft365: Object.freeze({
          connection: microsoft365Connection,
          onboardingRuntime,
        }),
        capabilities: tenantCapabilities,
        audit: tenantAudit,
      }),
    })
    : null;

  shell = createAppShell({
    context,
    employee,
    manager,
    tenantAdmin,
    authentication,
    tenantPresentation,
    onViewChange: (nextView) => {
      if (nextView !== 'tenantAdmin') clearTenantAdminRoute();
    },
  });

  function render() {
    shell.render();
    document.documentElement.dataset.appBuild = APP_BUILD;
  }

  let presentationRenderFrame = 0;
  tenantPresentation.subscribe(() => {
    if (presentationRenderFrame) cancelAnimationFrame(presentationRenderFrame);
    presentationRenderFrame = requestAnimationFrame(() => {
      presentationRenderFrame = 0;
      render();
    });
  });

  window.addEventListener('conference-language-changed', render);

  if (tenantAdmin && context.isTenantAdmin() && isTenantAdminRoute()) {
    shell.setView('tenantAdmin');
    document.documentElement.dataset.appBuild = APP_BUILD;
  } else {
    if (isTenantAdminRoute()) clearTenantAdminRoute();
    render();
  }

  return Object.freeze({ context, shell, tenantPresentation });
}
