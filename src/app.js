import {
  createEmployeeApplication,
  createProductionEmployeeApplication,
} from './employee/index.js';
import {
  createManagerApplication,
  createProductionManagerApplication,
} from './manager/index.js';
import { createApplicationContext } from './platform/application-context.js';
import { createAppShell } from './platform/app-shell.js';
import { createMicrosoft365ConnectionApi } from './platform/microsoft365-connection-api.js';
import { createMicrosoft365OnboardingApi } from './platform/microsoft365-onboarding-api.js';
import { createMicrosoft365OnboardingRuntime } from './platform/microsoft365-onboarding-runtime.js';
import { createTenantUserAdministrationApi } from './platform/tenant-user-administration-api.js';
import {
  createDemoOnboarding,
  createDemoTenantUserAdministration,
  createTenantAdminApplication,
} from './tenant-admin/index.js';

const APP_BUILD = '2026.08.26.66';
const appRoot = document.getElementById('app');

async function bootstrap() {
  const context = await createApplicationContext();
  let shell;

  const setPageHeading = (title, subtitle) => shell.setPageHeading(title, subtitle);
  const authentication = context.authenticationRuntime();
  const productionPersistence = context.productionPersistence();
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
  const microsoft365Connection = !context.isDemoRuntime() && context.isTenantAdmin() && authentication
    ? createMicrosoft365ConnectionApi({ apiClient: authentication.apiClient })
    : null;
  const onboardingRuntime = context.isDemoRuntime()
    ? createDemoOnboarding()
    : (context.isTenantAdmin() && authentication && productionPersistence && microsoft365Connection
      ? createMicrosoft365OnboardingRuntime({
        onboardingApi: createMicrosoft365OnboardingApi({ apiClient: authentication.apiClient }),
        connectionApi: microsoft365Connection,
        persistence: productionPersistence,
      })
      : null);
  const tenantAdmin = tenantUserAdministration
    ? createTenantAdminApplication({
      context,
      appRoot,
      setPageHeading,
      userAdministration: tenantUserAdministration,
      microsoft365Connection,
      onboardingRuntime,
    })
    : null;

  shell = createAppShell({
    context,
    employee,
    manager,
    tenantAdmin,
    authentication,
  });

  function render() {
    shell.render();
    document.documentElement.dataset.appBuild = APP_BUILD;
  }

  window.addEventListener('conference-language-changed', render);
  window.addEventListener('storage', (event) => {
    if (!context.shouldReloadForStorageKey(event.key)) return;
    context.reloadReferenceData();
    render();
  });

  render();
}

void bootstrap();
