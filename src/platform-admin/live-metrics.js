import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { el } from '../core/ui.js';
import { LIVE_METRICS } from './live-metrics-contracts.js';
import { liveMetricFreshUntil } from './live-metrics-freshness.js';
import { DAY_MS } from './product-delivery-contracts.js';

export function formatLiveMetric(row) {
  if (!row || row.value === null) return t('common.unknown');
  const unit = LIVE_METRICS[row.id][1];
  if (unit === 'bytes') {
    const scale = row.value >= 1_000_000_000 ? 3 : row.value >= 1_000_000 ? 2 : row.value >= 1_000 ? 1 : 0;
    return formatNumber(row.value / (1_000 ** scale), { style: 'unit',
      unit: ['byte', 'kilobyte', 'megabyte', 'gigabyte'][scale], unitDisplay: 'short', maximumFractionDigits: 3 });
  }
  if (unit === 'megabytes') return formatNumber(row.value, {
    style: 'unit', unit: 'megabyte', unitDisplay: 'short', maximumFractionDigits: 3,
  });
  return formatNumber(row.value, { maximumFractionDigits: 0 });
}

export function liveMetricState(row, evaluatedAt) {
  if (!row || row.value === null) return 'unknown';
  const evaluated = typeof evaluatedAt === 'number' ? evaluatedAt : Date.parse(evaluatedAt);
  if (evaluated < liveMetricFreshUntil(row)) return 'fresh';
  const basis = LIVE_METRICS[row.id][2];
  if (evaluated - Date.parse(row.observedAt) >= DAY_MS
    || (['project_window', 'provider_window'].includes(basis) && evaluated >= Date.parse(row.periodEnd))) return 'stale';
  if (row.sampleAt !== null && evaluated - Date.parse(row.sampleAt) >= DAY_MS) return 'olderSample';
  return 'fresh';
}

export function renderLiveMetricEvidence(row, evaluatedAt) {
  const state = liveMetricState(row, evaluatedAt);
  return el('details', { className: 'platform-admin-insights-details' }, [
    el('summary', { text: t(state === 'unknown' ? 'platformAdmin.insights.missingWhy' : 'platformAdmin.insights.sourceDetails') }),
    ...(state === 'unknown' ? [el('p', { text: t('platformAdmin.insights.sourceMissing') })] : [
      el('p', { text: t('platformAdmin.liveMetrics.rowObserved', { time: formatDateTime(row.observedAt) }) }),
      ...(row.sampleAt === null ? [] : [el('p', { text: t('platformAdmin.liveMetrics.sampleAt', { time: formatDateTime(row.sampleAt) }) })]),
      ...(row.periodStart !== null || row.periodEnd === null ? [] : [el('p', {
        text: t('platformAdmin.liveMetrics.resetAt', { time: formatDateTime(row.periodEnd) }) })]),
      ...(row.periodStart === null ? [] : [el('p', { text: t('platformAdmin.liveMetrics.window', {
        start: formatDateTime(row.periodStart), end: formatDateTime(row.periodEnd),
      }) })]),
    ]),
  ]);
}

export function renderLiveMetrics(report, group, isStale = false, elapsedMs = 0) {
  if (!report) return el('section', { className: 'card', dataset: { liveMetrics: 'unavailable' } }, [
    el('p', { text: t('platformAdmin.liveMetrics.unavailable') }),
  ]);
  const rows = report.measurements.filter((row) => LIVE_METRICS[row.id][0] === group
    && (row.id !== 'neon_transfer' || report.providerUsage === null));
  const evaluatedAt = Date.parse(report.evaluatedAt) + elapsedMs;
  return el('section', { className: 'card platform-admin-insights-observations', dataset: { liveMetrics: group } }, [
    el('h2', { text: t(`platformAdmin.liveMetrics.${group}`) }),
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.liveMetrics.observed', { time: formatDateTime(report.observedAt) }) }),
    el('p', { attrs: { role: 'status' }, text: t(`platformAdmin.liveMetrics.${isStale || report.freshness === 'stale'
      || evaluatedAt - Date.parse(report.observedAt) >= DAY_MS
      ? 'stale' : report.sourceState}`) }),
    el('dl', { className: 'platform-admin-insights-metric-grid' }, rows.map((row) => {
      const state = liveMetricState(row, evaluatedAt);
      return el('div', { className: 'platform-admin-insights-metric', dataset: { liveMetric: row.id } }, [
        el('dt', { text: t(`platformAdmin.liveMetrics.metric.${row.id}`) }),
        el('dd', {}, [
          el('strong', { text: formatLiveMetric(row) }),
          ...(['stale', 'olderSample'].includes(state) ? [el('p', { className: 'platform-admin-status',
            dataset: { tone: 'warning' }, text: t(`platformAdmin.insights.sourceState.${state}`) })] : []),
          renderLiveMetricEvidence(row, evaluatedAt),
        ]),
      ]);
    })),
    el('details', { className: 'platform-admin-insights-details' }, [
      el('summary', { text: t('platformAdmin.insights.methodology') }),
      el('p', { className: 'platform-admin-data-note', text: t(`platformAdmin.liveMetrics.${group}Note`) }),
    ]),
  ]);
}
