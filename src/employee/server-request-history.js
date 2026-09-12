import { locale, t } from '../core/i18n.js';
import { formatProductionDateTime } from '../core/production-time.js';
import { el } from '../core/ui.js';

export function renderServerRequestHistory(entries) {
  if (!entries.length) {
    return el('p', { text: t('production.manager.historyEmpty') });
  }
  const timeline = el('section', {
    className: 'request-timeline',
    attrs: { 'aria-label': t('timeline.title') },
  });
  const list = el('ol');
  entries.forEach((entry) => {
    const capturedAt = formatProductionDateTime(entry.capturedAt, {
      locale: locale(),
      timeZone: 'UTC',
    });
    list.appendChild(el('li', {}, [
      el('strong', { text: t(`timeline.operation.${entry.operation}`) }),
      el('small', {
        text: capturedAt
          ? `${t('production.common.version', { version: entry.version })} · ${capturedAt}`
          : t('production.common.version', { version: entry.version }),
      }),
      el('p', {
        text: `${t('production.common.status')}: ${t(`status.${entry.request.status}`)}`,
      }),
      entry.request.statusReason
        ? el('p', { className: 'muted', text: entry.request.statusReason })
        : null,
    ]));
  });
  timeline.appendChild(list);
  return timeline;
}
