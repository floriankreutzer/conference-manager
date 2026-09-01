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
  const operational = createProductionManagerApplication({ appRoot, setPageHeading, persistence });
  const businessSettings = createManagerBusinessSettingsApplication({
    appRoot,
    setPageHeading,
    locations,
    catalogue,
  });

  async function renderManager() {
    await operational.renderManager();
    const openBusinessSettings = button(t('managerSettings.title'), { className: 'primary' });
    openBusinessSettings.addEventListener('click', () => {
      void businessSettings.renderManagerSettings();
    });
    appRoot.prepend(el('section', { className: 'card' }, [
      el('h2', { text: t('managerSettings.title') }),
      el('p', { text: t('managerSettings.description') }),
      el('div', { className: 'button-row' }, [openBusinessSettings]),
    ]));
  }

  return Object.freeze({ renderManager });
}
