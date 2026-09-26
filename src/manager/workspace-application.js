import { el } from '../core/ui.js';
import { createManagerBusinessSettingsApplication } from './business-settings-application.js';
import { createProductionManagerApplication } from './production-application.js';

export function createManagerWorkspaceApplication({
  appRoot,
  setPageHeading,
  persistence,
  locations,
  catalogue,
  onAuthorityFailure = null,
} = {}) {
  if (onAuthorityFailure !== null && typeof onAuthorityFailure !== 'function') {
    throw new TypeError('MANAGER_WORKSPACE_AUTHORITY_HANDLER_REQUIRED');
  }
  const requestMutations = new Map();
  const operationalRoot = el('div', { dataset: { managerOperationalRoot: 'true' } });
  const operational = createProductionManagerApplication({
    appRoot: operationalRoot,
    setPageHeading,
    persistence,
    requestMutations,
    onAuthorityFailure,
    onOpenBusinessSettings: (panel, invalidateAuthorityProjection) => {
      const heading = el('header');
      const content = el('div');
      panel.replaceChildren(heading, content);
      const businessSettings = createManagerBusinessSettingsApplication({
        appRoot: content,
        setPageHeading: (title, description) => {
          heading.replaceChildren(el('h3', { text: title }), el('p', { className: 'muted', text: description }));
        },
        locations,
        catalogue,
        onAuthorityFailure: invalidateAuthorityProjection,
      });
      void businessSettings.renderManagerSettings();
    },
  });

  async function renderManager() {
    const workspaceRoot = el('section', { dataset: { managerWorkspaceRoot: 'true' } });
    workspaceRoot.appendChild(operationalRoot);
    appRoot.replaceChildren(workspaceRoot);
    await operational.renderManager();
  }

  return Object.freeze({ renderManager });
}
