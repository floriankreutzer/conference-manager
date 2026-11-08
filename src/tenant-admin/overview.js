import { t } from '../core/i18n.js';
import { button, el } from '../core/ui.js';

export function createTenantSetupOverview({ sections, navigate, isCurrent }) {
  const root = el('section', { className: 'card tenant-setup-overview', attrs: { 'aria-labelledby': 'tenantSetupTitle' } }, [
    el('h3', { id: 'tenantSetupTitle', text: t('tenantAdmin.overview.setup') }),
    el('p', { className: 'muted', text: t('tenantAdmin.overview.scope') }),
  ]);
  const summaries = el('div', { className: 'tenant-setup-summaries' });
  const tasks = el('ul', { className: 'tenant-setup-tasks' });
  const checked = sections.filter((section) => typeof section.loadOverview === 'function');
  const status = el('p', { attrs: { role: 'status' }, text: t('tenantAdmin.overview.checking') });
  root.append(summaries, el('h4', { text: t('tenantAdmin.overview.nextSteps') }), tasks, status);
  let pending = checked.length;
  const finish = () => {
    pending -= 1;
    if (pending === 0) status.textContent = t(tasks.childElementCount ? 'tenantAdmin.overview.stepsAvailable' : 'tenantAdmin.overview.noSteps');
  };
  if (pending === 0) status.textContent = t('tenantAdmin.overview.noChecks');
  checked.forEach((section) => {
    const summary = el('article', {}, [el('h4', { text: t(section.titleKey) })]);
    const text = el('p', { text: t('tenantAdmin.overview.checking') });
    summary.appendChild(text);
    summaries.appendChild(summary);
    const addTask = (message) => {
      const open = button(t('tenantAdmin.overview.open', { section: t(section.titleKey) }));
      open.addEventListener('click', () => { if (isCurrent()) navigate(section.id); });
      tasks.appendChild(el('li', {}, [el('span', { text: message }), open]));
    };
    Promise.resolve().then(() => isCurrent() ? section.loadOverview() : null).then((result) => {
      if (!isCurrent()) return;
      text.textContent = result.summary;
      result.tasks.forEach(addTask);
      finish();
    }).catch(() => {
      if (!isCurrent()) return;
      text.textContent = t('tenantAdmin.overview.unavailable');
      addTask(t('tenantAdmin.overview.checkSection', { section: t(section.titleKey) }));
      finish();
    });
  });
  return root;
}
