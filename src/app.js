import { RUNTIME_MODE, runtimeModeFromDocument } from './core/security-policy.js';
import { createEmployeeApplication } from './employee/index.js';
import { createManagerApplication } from './manager/index.js';
import { createApplicationContext } from './platform/application-context.js';
import { createAppShell } from './platform/app-shell.js';
import { bootstrapProductionAuthentication } from './platform/production-session.js';

const APP_BUILD = '2026.08.24.41';
const appRoot = document.getElementById('app');
const runtimeMode = runtimeModeFromDocument(document);
const productionAuthentication = runtimeMode === RUNTIME_MODE.PRODUCTION
  ? await bootstrapProductionAuthentication()
  : null;
const context = createApplicationContext({
  productionSession: productionAuthentication?.session || null,
  productionAuthenticationStatus: productionAuthentication?.status,
});
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

shell = createAppShell({
  context,
  employee,
  manager,
  authentication: productionAuthentication?.runtime || null,
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
