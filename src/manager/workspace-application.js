import { el } from '../core/ui.js';
import { createManagerBusinessSettingsApplication } from './business-settings-application.js';
import { createProductionManagerApplication } from './production-application.js';

export function createManagerWorkspaceApplication({
  appRoot,
  setPageHeading,
  persistence,
  locations,
  catalogue,
} = {}) {
  const businessSettings = createManagerBusinessSettingsApplication({
    appRoot,
    setPageHeading,
    locations,
    catalogue,
  });
  const requestMutations = new Map();

  async function renderManager() {
    const workspaceRoot = el('section', { dataset: { managerWorkspaceRoot: 'true' } });
    const operationalRoot = el('div', { dataset: { managerOperationalRoot: 'true' } });
    workspaceRoot.appendChild(operationalRoot);
    appRoot.replaceChildren(workspaceRoot);
    const operational = createProductionManagerApplication({
      appRoot: operationalRoot,
      setPageHeading,
      persistence,
      requestMutations,
      onOpenBusinessSettings: () => {
        void businessSettings.renderManagerSettings({ focusHeading: true });
      },
    });
    await operational.renderManager();
  }

  return Object.freeze({ renderManager });
}
