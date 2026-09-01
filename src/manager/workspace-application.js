import { t } from '../core/i18n.js';
import { button, el } from '../core/ui.js';
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
    });
    await operational.renderManager();
    if (
      workspaceRoot.parentNode !== appRoot
      || document.documentElement.dataset.sessionLocked === 'true'
    ) return;
    const openBusinessSettings = button(t('managerSettings.title'), { className: 'primary' });
    openBusinessSettings.addEventListener('click', () => {
      void businessSettings.renderManagerSettings({ focusHeading: true });
    });
    workspaceRoot.prepend(el('section', { className: 'card' }, [
      el('h2', { text: t('managerSettings.title') }),
      el('p', { text: t('managerSettings.description') }),
      el('div', { className: 'button-row' }, [openBusinessSettings]),
    ]));
  }

  return Object.freeze({ renderManager });
}
