import { el, button } from '../core/ui.js';
import { t } from '../core/i18n.js';
import { deriveDemoManagerTasks } from './demo-worklist.js';
import { createManagerBusinessSettingsApplication } from './business-settings-application.js';
import { createProductionManagerApplication } from './production-application.js';

export function createManagerWorkspaceApplication({
  appRoot,
  setPageHeading,
  persistence,
  locations,
  catalogue,
  demoWorklistEnabled = false,
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
    onOpenBusinessSettings: (panel, invalidateAuthorityProjection, { focusHeading = false } = {}) => {
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
      void businessSettings.renderManagerSettings({ focusHeading });
    },
  });

  async function renderManager() {
    const workspaceRoot = el('section', { dataset: { managerWorkspaceRoot: 'true' } });
    workspaceRoot.appendChild(operationalRoot);
    appRoot.replaceChildren(workspaceRoot);
    await operational.renderManager();
    if (!demoWorklistEnabled) return;
    try {
      const [requests, locationSnapshot, catalogueSnapshot] = await Promise.all([
        persistence.listRequests(),
        locations.loadLocations({ schemaVersion: 3 }),
        catalogue.loadCatalogue(),
      ]);
      if (!workspaceRoot.isConnected) return;
      const tasks = deriveDemoManagerTasks({
        requests,
        locations: locationSnapshot.locations.configuration,
        catalogue: catalogueSnapshot.catalogue,
      });
      if (tasks.length === 0) return;
      const list = el('ul', { className: 'demo-manager-task-list' });
      for (const task of tasks) {
        const open = button(t(task.key, { title: task.title }), { className: 'secondary' });
        open.addEventListener('click', () => {
          operationalRoot.querySelector(`#managerTab-${task.target}`)?.click();
        });
        list.appendChild(el('li', { dataset: { demoManagerTask: task.id } }, [open]));
      }
      workspaceRoot.prepend(el('section', {
        className: 'card',
        dataset: { demoManagerTasks: 'true' },
        attrs: { 'aria-label': t('demoManager.title') },
      }, [
        el('h2', { text: t('demoManager.title') }),
        el('p', { className: 'muted', text: t('demoManager.description') }),
        list,
      ]));
    } catch (error) {
      if (onAuthorityFailure) onAuthorityFailure(error);
    }
  }

  return Object.freeze({ renderManager });
}
