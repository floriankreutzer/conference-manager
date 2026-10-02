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
    const previous = target.querySelector('[data-demo-manager-tasks]');
    const expanded = previous?.open === true;
    previous?.remove();
    if (snapshot.status === 'ready' && snapshot.tasks.length === 0) return;
    const ready = snapshot.status === 'ready';
    const section = el(ready ? 'details' : 'section', {
      className: 'card demo-manager-worklist',
      dataset: { demoManagerTasks: 'true' },
      attrs: { 'aria-label': t('demoManager.title') },
    });
    if (ready) {
      section.open = expanded;
      section.appendChild(el('summary', { className: 'demo-manager-task-disclosure' }, [
        el('span', { text: t('demoManager.title') }),
        el('span', { className: 'muted', text: t('demoManager.summary', { count: snapshot.tasks.length }) }),
      ]));
    } else section.appendChild(el('h2', { text: t('demoManager.title') }));
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
      const groups = [
        ['requests', snapshot.tasks.filter((task) => task.id.startsWith('request:'))],
        ['setup', snapshot.tasks.filter((task) => !task.id.startsWith('request:'))],
      ];
      for (const [group, tasks] of groups) {
        if (!tasks.length) continue;
        const groupSection = el('section', {
          className: 'demo-manager-task-group',
          attrs: { 'aria-labelledby': `demo-manager-task-group-${group}` },
        });
        groupSection.appendChild(el('h3', {
          id: `demo-manager-task-group-${group}`,
          text: t(`demoManager.group.${group}`),
        }));
        const list = el('ul', { className: 'demo-manager-task-list' });
        for (const task of tasks) {
          const copy = el('span', {
            className: 'demo-manager-task-copy',
            text: t(task.key, { title: task.title }),
          });
          const open = button(t('demoManager.open'), {
            className: 'secondary demo-manager-task-action',
            attrs: { 'aria-label': t('demoManager.openTask', { task: t(task.key, { title: task.title }) }) },
          });
          open.addEventListener('click', () => {
            operationalRoot.querySelector(`#managerTab-${task.target}`)?.click();
          });
          list.appendChild(el('li', {
            className: 'demo-manager-task-row',
            dataset: { demoManagerTask: task.id },
          }, [copy, open]));
        }
        groupSection.appendChild(list);
        section.appendChild(groupSection);
      }
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
