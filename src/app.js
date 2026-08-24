import { createEmployeeApplication } from './employee/index.js';
import { createManagerApplication } from './manager/index.js';
import { createApplicationContext } from './platform/application-context.js';
import { createAppShell } from './platform/app-shell.js';

const APP_BUILD = '2026.08.24.43';
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

  shell = createAppShell({
    context,
    employee,
    manager,
    authentication: context.authenticationRuntime(),
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
