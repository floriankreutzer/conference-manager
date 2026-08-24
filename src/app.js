import { createEmployeeApplication } from './employee/index.js';
import { createManagerApplication } from './manager/index.js';
import { createApplicationContext } from './platform/application-context.js';
import { createAppShell } from './platform/app-shell.js';
import { createProductionSessionRuntime } from './platform/production-session.js';
import { createTenantUserAdministrationApi } from './platform/tenant-user-administration-api.js';
import { createTenantAdminApplication } from './tenant-admin/index.js';

const APP_BUILD = '2026.08.24.61';
const appRoot = document.getElementById('app');
let productionRuntime = null;
try {
  productionRuntime = await createProductionSessionRuntime();
} catch {
  productionRuntime = null;
}
const context = createApplicationContext({ productionSession: productionRuntime?.session || null });
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
const tenantAdmin = context.isTenantAdmin() && productionRuntime
  ? createTenantAdminApplication({
    context,
    appRoot,
    setPageHeading,
    userAdministration: createTenantUserAdministrationApi({ apiClient: productionRuntime.apiClient }),
  })
  : null;

shell = createAppShell({ context, employee, manager, tenantAdmin });

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
