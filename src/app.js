import { createEmployeeApplication } from './employee/index.js';
import { createManagerApplication } from './manager/index.js';
import { createApplicationContext } from './platform/application-context.js';
import { createAppShell } from './platform/app-shell.js';
import { createTenantUserAdministrationApi } from './platform/tenant-user-administration-api.js';
import {
  createDemoTenantUserAdministration,
  createTenantAdminApplication,
} from './tenant-admin/index.js';

const APP_BUILD = '2026.08.24.63';
const appRoot = document.getElementById('app');

async function bootstrap() {
  const context = await createApplicationContext();
  let shell;

  const setPageHeading = (title, subtitle) => shell.setPageHeading(title, subtitle);
  const employee = createEmployeeApplication({
    context,
    appRoot,
    setPageHeading,
    onNavigate: (view) => shell.setView(view),
    onHelp: () => shell.openHelp(),
  });
  const manager = createManagerApplication({
    context,
    appRoot,
    setPageHeading,
    onNavigationRefresh: () => shell.renderNavigation(),
  });
  const authentication = context.authenticationRuntime();
  const tenantUserAdministration = context.isDemoRuntime()
    ? createDemoTenantUserAdministration({
      currentUserId: context.userId(),
      currentDisplayName: context.fullName(),
    })
    : (context.isTenantAdmin() && authentication
      ? createTenantUserAdministrationApi({ apiClient: authentication.apiClient })
      : null);
  const tenantAdmin = tenantUserAdministration
    ? createTenantAdminApplication({
      context,
      appRoot,
      setPageHeading,
      userAdministration: tenantUserAdministration,
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
