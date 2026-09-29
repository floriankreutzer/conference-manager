import { el, button } from '../core/ui.js';
import { t } from '../core/i18n.js';
import { createDemoManagerWorklistController } from './demo-worklist-controller.js';
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
  let workspaceRoot = null;
  const requestMutations = new Map();
  const operationalRoot = el('div', { dataset: { managerOperationalRoot: 'true' } });
  const worklist = demoWorklistEnabled ? createDemoManagerWorklistController({
    persistence,
    locations,
    catalogue,
    currentTarget: () => (
      workspaceRoot?.isConnected && workspaceRoot.parentNode === appRoot
        && document.documentElement.dataset.sessionLocked !== 'true'
        ? workspaceRoot : null
    ),
    present: presentWorklist,
    onAuthorityFailure: (error) => onAuthorityFailure?.(error),
  }) : null;
  const operational = createProductionManagerApplication({
    appRoot: operationalRoot,
    setPageHeading,
    persistence: worklist?.persistence || persistence,
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
        locations: worklist?.locations || locations,
        catalogue: worklist?.catalogue || catalogue,
        onAuthorityFailure: invalidateAuthorityProjection,
      });
      void businessSettings.renderManagerSettings({ focusHeading });
    },
  });

  function presentWorklist(target, snapshot) {
    target.querySelector('[data-demo-manager-tasks]')?.remove();
    if (snapshot.status === 'ready' && snapshot.tasks.length === 0) return;
    const section = el('section', {
      className: 'card',
      dataset: { demoManagerTasks: 'true' },
      attrs: { 'aria-label': t('demoManager.title') },
    }, [el('h2', { text: t('demoManager.title') })]);
    if (snapshot.status !== 'ready') {
      section.appendChild(el('p', {
        text: t(snapshot.status === 'error' ? 'demoManager.error' : 'demoManager.loading'),
        attrs: { role: 'status', 'aria-live': 'polite' },
      }));
      if (snapshot.status === 'error') {
        const retry = button(t('managerSettings.retry'), { className: 'secondary' });
        retry.addEventListener('click', () => { void worklist.refresh(); });
        section.appendChild(retry);
      }
    } else {
      const list = el('ul', { className: 'demo-manager-task-list' });
      for (const task of snapshot.tasks) {
        const open = button(t(task.key, { title: task.title }), { className: 'secondary' });
        open.addEventListener('click', () => {
          operationalRoot.querySelector(`#managerTab-${task.target}`)?.click();
        });
        list.appendChild(el('li', { dataset: { demoManagerTask: task.id } }, [open]));
      }
      section.append(el('p', { className: 'muted', text: t('demoManager.description') }), list);
    }
    target.prepend(section);
  }

  async function renderManager() {
    workspaceRoot = el('section', { dataset: { managerWorkspaceRoot: 'true' } });
    workspaceRoot.appendChild(operationalRoot);
    appRoot.replaceChildren(workspaceRoot);
    await operational.renderManager();
    await worklist?.refresh();
  }

  return Object.freeze({ renderManager });
}
