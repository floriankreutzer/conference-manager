import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { el } from '../core/ui.js';
import { LIVE_METRICS } from './live-metrics-contracts.js';

export function renderLiveMetrics(report, group, isStale = false) {
  if (!report) return el('section', { className: 'card', dataset: { liveMetrics: 'unavailable' } }, [
    el('p', { text: t('platformAdmin.liveMetrics.unavailable') }),
  ]);
  const rows = report.measurements.filter((row) => LIVE_METRICS[row.id][0] === group
    && (row.id !== 'neon_transfer' || report.providerUsage === null));
  return el('section', { className: 'card', dataset: { liveMetrics: group } }, [
    el('h2', { text: t(`platformAdmin.liveMetrics.${group}`) }),
    el('p', { text: t('platformAdmin.liveMetrics.observed', { time: formatDateTime(report.observedAt) }) }),
    el('p', { className: 'platform-admin-data-note', text: t(`platformAdmin.liveMetrics.${group}Note`) }),
    el('p', { attrs: { role: 'status' }, text: t(`platformAdmin.liveMetrics.${isStale || report.freshness === 'stale'
      ? 'stale' : report.sourceState}`) }),
    el('dl', { className: 'platform-admin-definition-list' }, rows.map((row) => el('div', {}, [
      el('dt', { text: t(`platformAdmin.liveMetrics.metric.${row.id}`) }),
      el('dd', {}, [
        el('strong', { text: row.value === null ? t('common.unknown')
          : t(`platformAdmin.liveMetrics.unit.${LIVE_METRICS[row.id][1]}`, {
            amount: formatNumber(row.value, { maximumFractionDigits: 3 }),
          }) }),
        ...(row.observedAt === null ? [] : [el('p', { className: 'platform-admin-data-note',
          text: t('platformAdmin.liveMetrics.rowObserved', { time: formatDateTime(row.observedAt) }) })]),
        ...(row.sampleAt === null ? [] : [el('p', { className: 'platform-admin-data-note',
          text: t('platformAdmin.liveMetrics.sampleAt', { time: formatDateTime(row.sampleAt) }) })]),
        ...(row.periodStart !== null || row.periodEnd === null ? [] : [el('p', { className: 'platform-admin-data-note',
          text: t('platformAdmin.liveMetrics.resetAt', { time: formatDateTime(row.periodEnd) }) })]),
        ...(row.periodStart === null ? [] : [el('p', { className: 'platform-admin-data-note',
          text: t('platformAdmin.liveMetrics.window', { start: formatDateTime(row.periodStart),
            end: formatDateTime(row.periodEnd) }) })]),
      ]),
    ]))),
  ]);
}
