import {
  createEmployeeApplication,
  createProductionEmployeeApplication,
} from './employee/index.js';
import {
  createManagerApplication,
  createProductionManagerApplication,
} from './manager/index.js';
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
  createDemoTenantPresentationApi,
  createPresentationRefreshingOrganizationSettings,
  createTenantLocationSettingsApi,
  createTenantOrganizationSettingsApi,
  createTenantPresentationApi,
  createTenantPresentationRuntime,
} from './platform/tenant-settings-api.js';
import { createTenantUserAdministrationApi } from './platform/tenant-user-administration-api.js';
import {
  clearTenantAdminRoute,
  createDemoBookingPolicySettings,
  createDemoCatalogueSettings,
  createDemoCostAllocationSettings,
  createDemoLocationSettings,
  createDemoOrganizationSettings,
  createDemoTenantAudit,
  createDemoTenantCapabilities,
  createDemoTenantUserAdministration,
  createTenantAdminApplication,
  createTenantAdminOnboardingRuntime,
  isTenantAdminRoute,
} from './tenant-admin/index.js';

const APP_BUILD = '2026.08.27.76';
const appRoot = document.getElementById('app');

async function bootstrap() {
  renderAppBootstrapLoading();
  const context = await createApplicationContext();
  let shell;

  const setPageHeading = (title, subtitle) => shell.setPageHeading(title, subtitle);
  const authentication = context.authenticationRuntime();
  const productionPersistence = context.productionPersistence();
  const tenantSettingsAdapters = context.isDemoRuntime()
    ? Object.freeze({
      organization: createDemoOrganizationSettings(),
      locations: createDemoLocationSettings(),
      catalog: createDemoCatalogueSettings(),
      bookingPolicies: createDemoBookingPolicySettings(),
      costAllocation: createDemoCostAllocationSettings(),
    })
    : (context.isTenantAdmin() && authentication
      ? Object.freeze({
        organization: createTenantOrganizationSettingsApi({ apiClient: authentication.apiClient }),
        locations: createTenantLocationSettingsApi({ apiClient: authentication.apiClient }),
        catalog: createTenantCatalogueSettingsApi({ apiClient: authentication.apiClient }),
        bookingPolicies: createTenantBookingPolicySettingsApi({ apiClient: authentication.apiClient }),
        costAllocation: createTenantCostAllocationSettingsApi({ apiClient: authentication.apiClient }),
      })
      : Object.freeze({}));
  const tenantPresentationAdapter = context.isDemoRuntime()
    ? createDemoTenantPresentationApi({ organizationSettings: tenantSettingsAdapters.organization })
    : (context.isAuthenticated() && authentication
      ? createTenantPresentationApi({ apiClient: authentication.apiClient })
      : null);
  const tenantPresentation = createTenantPresentationRuntime({ adapter: tenantPresentationAdapter });
  await tenantPresentation.refresh();
  const effectiveTenantSettingsAdapters = Object.hasOwn(tenantSettingsAdapters, 'organization')
    ? Object.freeze({
      ...tenantSettingsAdapters,
      organization: createPresentationRefreshingOrganizationSettings({
        organizationSettings: tenantSettingsAdapters.organization,
        presentationRuntime: tenantPresentation,
      }),
    })
    : tenantSettingsAdapters;
  const employee = context.isDemoRuntime()
    ? createEmployeeApplication({
      context,
      appRoot,
      setPageHeading,
      onNavigate: (view) => shell.setView(view),
      onHelp: () => shell.openHelp(),
    })
    : (productionPersistence
      ? createProductionEmployeeApplication({
        appRoot,
        setPageHeading,
        persistence: productionPersistence,
      })
      : null);
  const manager = context.isDemoRuntime()
    ? createManagerApplication({
      context,
      appRoot,
      setPageHeading,
      onNavigationRefresh: () => shell.renderNavigation(),
    })
    : (productionPersistence
      ? createProductionManagerApplication({
        appRoot,
        setPageHeading,
        persistence: productionPersistence,
      })
      : null);
  const tenantUserAdministration = context.isDemoRuntime()
    ? createDemoTenantUserAdministration({
      currentUserId: context.userId(),
      currentDisplayName: context.fullName(),
    })
    : (context.isTenantAdmin() && authentication
      ? createTenantUserAdministrationApi({ apiClient: authentication.apiClient })
      : null);
  const tenantAudit = context.isDemoRuntime()
    ? createDemoTenantAudit()
    : (context.isTenantAdmin() && authentication
      ? createTenantAuditApi({ apiClient: authentication.apiClient })
      : null);
  const tenantCapabilities = context.isDemoRuntime()
    ? createDemoTenantCapabilities()
    : (context.isTenantAdmin() && authentication
      ? createTenantCapabilitiesApi({ apiClient: authentication.apiClient })
      : null);
  const microsoft365Connection = !context.isDemoRuntime() && context.isTenantAdmin() && authentication
    ? createMicrosoft365ConnectionApi({ apiClient: authentication.apiClient })
    : null;
  const onboardingRuntime = createTenantAdminOnboardingRuntime({
    demo: context.isDemoRuntime(),
    apiClient: context.isTenantAdmin() ? authentication?.apiClient : null,
    connectionApi: microsoft365Connection,
    persistence: context.isTenantAdmin() ? productionPersistence : null,
  });
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
  window.addEventListener('storage', (event) => {
    if (!context.shouldReloadForStorageKey(event.key)) return;
    context.reloadReferenceData();
    render();
  });

  if (tenantAdmin && context.isTenantAdmin() && isTenantAdminRoute()) {
    shell.setView('tenantAdmin');
    document.documentElement.dataset.appBuild = APP_BUILD;
  } else {
    if (isTenantAdminRoute()) clearTenantAdminRoute();
    render();
  }
}

void bootstrap();
