import { formatDateTime, formatNumber, t } from '../../../core/i18n.js';
import { button, clear, el } from '../../../core/ui.js';

const KEY = 'tenantAdmin.catering.health';
// This read owns only its feedback. It cannot unlock configuration writes or
// alter a business approval, delivery, retry or reconciliation decision.
export function createCateringOperationalHealthPanel({ adapter, snapshot, isCurrent, reloadConfiguration }) {
  const root = el('section', { dataset: { cateringHealth: snapshot.integrationId } }, [
    el('h5', { text: t(`${KEY}.title`) }), el('p', { className: 'field-hint', text: t(`${KEY}.description`) }),
  ]);
  const refresh = button(t(`${KEY}.refresh`));
  const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
  const content = el('div');
  root.append(el('div', { className: 'button-row' }, [refresh]), status, content);
  let generation = 0; let pending = false; let writing = false;
  const current = (selected) => isCurrent() && root.isConnected && generation === selected;
  refresh.addEventListener('click', async () => {
    if (pending || writing || !isCurrent()) return;
    const selected = ++generation;
    pending = true; refresh.disabled = true; root.setAttribute('aria-busy', 'true');
    clear(content); status.textContent = t(`${KEY}.loading`);
    try {
      const value = await adapter.loadOperationalHealth({ integrationId: snapshot.integrationId, expectedRevision: snapshot.revision });
      if (!current(selected)) return;
      content.append(el('p', { text: t(`${KEY}.state.${value.state}`) }),
        el('p', { className: 'muted', text: t(`${KEY}.observed`, { time: formatDateTime(value.observedAt) }) }),
        el('p', { text: t(`${KEY}.coverage.${value.coverage.complete ? 'complete' : 'incomplete'}`,
          { limit: formatNumber(value.coverage.limit) }) }));
      const facts = el('dl');
      for (const [phase, count] of Object.entries(value.counts)) {
        if (count > 0) facts.append(el('dt', { text: t(`${KEY}.count.${phase}`) }), el('dd', { text: formatNumber(count) }));
      }
      if (value.expiredLeaseCount > 0) facts.append(el('dt', { text: t(`${KEY}.expired`) }),
        el('dd', { text: formatNumber(value.expiredLeaseCount) }));
      if (value.oldestOpenAt !== null) facts.append(el('dt', { text: t(`${KEY}.oldest`) }),
        el('dd', { text: formatDateTime(value.oldestOpenAt) }));
      content.appendChild(facts); status.textContent = t(`${KEY}.loaded`);
    } catch (error) {
      if (!current(selected)) return;
      status.textContent = '';
      content.appendChild(el('p', { text: t(`${KEY}.${error?.code === 'CATERING_HEALTH_CONFIGURATION_CHANGED' ? 'changed' : 'failed'}`),
        attrs: { role: 'alert' } }));
      if (error?.code === 'CATERING_HEALTH_CONFIGURATION_CHANGED') {
        const reload = button(t('tenantAdmin.section.conflictReload'));
        reload.addEventListener('click', reloadConfiguration); content.appendChild(reload);
      }
    } finally {
      if (current(selected)) {
        pending = false; refresh.disabled = writing; root.setAttribute('aria-busy', 'false');
        if (!document.activeElement || document.activeElement === document.body || document.activeElement === refresh) refresh.focus();
      }
    }
  });
  return Object.freeze({ root, setWriting(value) {
    writing = value; generation++; pending = false; refresh.disabled = value;
    root.setAttribute('aria-busy', 'false'); clear(content); status.textContent = '';
  } });
}
