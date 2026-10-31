import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { pavurelFunctionalIcon } from '../core/pavurel-functional-icon.js';
import { button, el } from '../core/ui.js';
import { renderInsightTabs } from './insight-tabs.js';
import { formatLiveMetric, liveMetricState, renderLiveMetrics } from './live-metrics.js';
import { LIVE_METRICS } from './live-metrics-contracts.js';
import { DAY_MS } from './observed-resource-clock.js';
import { renderInsightRetrievalNotice, renderInsightSourceStatus } from './insight-source.js';

const PROVIDERS = Object.freeze(['neon', 'render', 'resend', 'github']);

function amount(bytes) {
  return t('platformAdmin.providers.gb', { amount: formatNumber(bytes / 1_000_000_000, { maximumFractionDigits: 3 }) });
}

function percent(value) { return formatNumber(value / 100, { style: 'percent', maximumFractionDigits: 2 }); }

function detail(key, value) {
  return el('div', {}, [el('dt', { text: t(key) }), el('dd', { text: value })]);
}

function rowsFor(report, provider) {
  return report.liveMetrics?.measurements.filter((row) => row.id.startsWith(`${provider}_`)) || [];
}

function reading(report, id) {
  return report.liveMetrics?.measurements.find((row) => row.id === id) || null;
}

function metricLine(report, id, key) {
  return detail(key || `platformAdmin.liveMetrics.metric.${id}`, formatLiveMetric(reading(report, id)));
}

function providerState(report, id, elapsedMs) {
  const rows = rowsFor(report, id);
  if (id === 'neon' && report.neon) {
    const evaluated = Date.parse(report.evaluatedAt) + elapsedMs;
    return report.freshness === 'stale' || evaluated > Date.parse(report.observedAt) + DAY_MS
      || evaluated >= Date.parse(report.periodEnd) ? 'stale' : 'fresh';
  }
  if (!rows.some((row) => row.value !== null)) return 'unknown';
  if (rows.some((row) => ['stale', 'olderSample'].includes(liveMetricState(row,
    Date.parse(report.liveMetrics.evaluatedAt) + elapsedMs)))) return 'stale';
  return rows.some((row) => row.value === null) ? 'partial' : 'fresh';
}

function quotaMeter(report, period) {
  const sent = reading(report, `resend_${period}_sent`);
  const limit = reading(report, `resend_${period}_limit`);
  if (sent?.value == null || limit?.value == null || limit.value <= 0 || sent.periodStart === null || limit.periodStart === null
    || sent.observedAt !== limit.observedAt || sent.periodStart !== limit.periodStart || sent.periodEnd !== limit.periodEnd) return null;
  const id = `provider-resend-${period}-meter`;
  return el('div', { className: 'platform-admin-insights-quota' }, [
    el('label', { attrs: { for: id }, text: t(`platformAdmin.insights.providers.quota.${period}`, {
      used: formatNumber(sent.value), limit: formatNumber(limit.value),
    }) }),
    el('meter', { id, className: 'platform-admin-provider-meter',
      attrs: { min: '0', max: String(limit.value), value: String(Math.min(sent.value, limit.value)),
        'aria-valuetext': t('platformAdmin.insights.providers.quotaValue', {
          used: formatNumber(sent.value), limit: formatNumber(limit.value),
        }) } }),
    ...(sent.value > limit.value ? [el('p', { className: 'platform-admin-status', dataset: { tone: 'warning' },
      text: t('platformAdmin.insights.providers.quotaExceeded') })] : []),
  ]);
}

function neonDetails(report) {
  const n = report.neon;
  if (!n) return el('p', { text: t('platformAdmin.insights.providers.neonUnavailable') });
  const thresholds = el('ul', { className: 'platform-admin-provider-thresholds' });
  [50, 70, 85, 95].forEach((threshold) => thresholds.append(el('li', {
    className: 'platform-admin-status',
    dataset: { tone: n.crossedThresholds.includes(threshold) ? 'critical' : 'neutral' },
    text: t(n.crossedThresholds.includes(threshold) ? 'platformAdmin.providers.thresholdReached'
      : 'platformAdmin.providers.thresholdBelow', { threshold: percent(threshold) }),
  })));
  return el('div', {}, [
    el('p', { text: t('platformAdmin.providers.plan', { plan: n.plan }) }),
    el('dl', { className: 'platform-admin-definition-list' }, [
      detail('platformAdmin.providers.observed', amount(n.usedBytes)),
      detail('platformAdmin.providers.reference', amount(n.referenceBytes)),
      detail('platformAdmin.providers.forecast', t('platformAdmin.providers.forecastAmount', {
        amount: amount(n.projectedBytes), percent: percent(n.projectedUtilizationPercent),
      })),
      detail('platformAdmin.providers.window', t('platformAdmin.providers.windowRange', {
        start: formatDateTime(report.periodStart), end: formatDateTime(report.periodEnd),
      })),
      detail('platformAdmin.providers.referenceDate', formatDateTime(n.referenceObservedAt)),
      detail('platformAdmin.providers.cost', t('common.unknown')),
    ]),
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.providers.modelNote') }),
    el('p', { text: t('platformAdmin.providers.forecastNote') }),
    el('p', { text: t(`platformAdmin.providers.anomaly.${n.anomalyState}`) }),
    thresholds,
  ]);
}

function providerCard(report, id, elapsedMs) {
  const state = providerState(report, id, elapsedMs);
  const n = id === 'neon' ? report.neon : null;
  const mainId = { neon: 'neon_transfer', render: 'render_customer_bandwidth',
    resend: 'resend_monthly_sent', github: 'github_ci_total' }[id];
  const main = reading(report, mainId);
  const lines = id === 'render' ? [
    metricLine(report, 'render_operations_bandwidth', 'platformAdmin.insights.providers.operationsBandwidth'),
    metricLine(report, 'render_customer_memory', 'platformAdmin.insights.providers.customerMemory'),
    metricLine(report, 'render_operations_memory', 'platformAdmin.insights.providers.operationsMemory'),
  ] : id === 'resend' ? [
    metricLine(report, 'resend_daily_sent', 'platformAdmin.insights.providers.sentToday'),
    metricLine(report, 'resend_monthly_limit', 'platformAdmin.insights.providers.monthlyLimit'),
  ] : id === 'github' ? [
    metricLine(report, 'github_ci_failed', 'platformAdmin.insights.providers.failedRuns'),
  ] : [];
  const observedAt = n ? report.observedAt : main?.observedAt;
  const notesKey = id === 'neon' ? 'platformAdmin.providers.modelNote'
    : id === 'render' ? 'platformAdmin.providers.renderUnknown'
      : id === 'github' ? 'platformAdmin.providers.githubUnknown' : 'platformAdmin.insights.providers.resendNote';
  return el('article', { className: 'card platform-admin-insights-provider-card',
    dataset: { platformProvider: id } }, [
    el('header', {}, [
      el('h3', { className: 'pavurel-icon-label' }, [pavurelFunctionalIcon('usage'), el('span', { text: t(`platformAdmin.insights.providers.name.${id}`) })]),
      el('p', { className: 'platform-admin-insights-eyebrow', text: t(`platformAdmin.insights.providers.role.${id}`) }),
      el('span', { className: 'platform-admin-status', dataset: { tone: state === 'fresh' ? 'positive' : 'warning' },
        text: t(`platformAdmin.insights.sourceState.${state}`) }),
    ]),
    el('div', { className: 'platform-admin-card-body' }, [
      el('p', { className: 'platform-admin-insights-primary-value', text: n ? amount(n.usedBytes) : formatLiveMetric(main) }),
      el('p', { className: 'platform-admin-insights-value-label', text: t(`platformAdmin.insights.providers.primary.${id}`) }),
      ...(n ? [
        el('label', { attrs: { for: 'platformProviderNeonMeter' },
          text: t('platformAdmin.providers.utilization', { percent: percent(n.utilizationPercent) }) }),
        el('meter', { id: 'platformProviderNeonMeter', className: 'platform-admin-provider-meter',
          attrs: { min: '0', max: String(n.referenceBytes), value: String(Math.min(n.usedBytes, n.referenceBytes)),
            'aria-describedby': 'platformProviderModelNote' } }),
        el('p', { id: 'platformProviderModelNote', className: 'platform-admin-data-note',
          text: t('platformAdmin.insights.providers.referenceShort', { amount: amount(n.referenceBytes) }) }),
      ] : []),
      ...(lines.length ? [el('dl', { className: 'platform-admin-insights-card-values' }, lines)] : []),
      ...(id === 'resend' ? [quotaMeter(report, 'daily'), quotaMeter(report, 'monthly')] : []),
    ]),
    el('footer', { className: 'platform-admin-card-footer' }, [
      ...(observedAt ? [el('p', { className: 'platform-admin-insights-timestamp',
        text: t('platformAdmin.insights.observedAt', { time: formatDateTime(observedAt) }) })] : []),
      ...(main?.sampleAt ? [el('p', { className: 'platform-admin-insights-timestamp',
        text: t('platformAdmin.liveMetrics.sampleAt', { time: formatDateTime(main.sampleAt) }) })] : []),
      el('details', { className: 'platform-admin-insights-details' }, [
        el('summary', { text: t('platformAdmin.insights.providers.cardDetails') }),
        el('p', { text: t(notesKey) }),
        ...(id === 'neon' ? [el('p', { text: t('platformAdmin.insights.providers.neonDetailsHint') })] : [
          el('dl', { className: 'platform-admin-insights-card-values' }, rowsFor(report, id).map((row) => detail(
            `platformAdmin.liveMetrics.metric.${row.id}`, formatLiveMetric(row)))),
        ]),
        ...(state === 'unknown' || state === 'partial' ? [el('p', { text: t('platformAdmin.insights.sourceMissing') })] : []),
      ]),
    ]),
  ]);
}

function sourcePanel(report) {
  const source = report.liveMetrics || report;
  return el('section', { className: 'card' }, [
    el('h2', { text: t('platformAdmin.insights.providers.sourcesTitle') }),
    renderInsightSourceStatus(source, report.liveMetrics ? 'daily' : 'legacy'),
    el('p', { text: t(report.liveMetrics ? 'platformAdmin.liveMetrics.mode' : 'platformAdmin.providers.snapshot',
      { time: formatDateTime(source.observedAt) }) }),
    el('p', { text: t('platformAdmin.insights.providers.refreshPolicy') }),
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.liveMetrics.providersNote') }),
    el('details', { className: 'platform-admin-insights-details' }, [
      el('summary', { text: t('platformAdmin.insights.sourceDetails') }),
      el('dl', { className: 'platform-admin-definition-list' }, [
        detail('platformAdmin.insights.collectedLabel', formatDateTime(source.observedAt)),
        detail('platformAdmin.insights.evaluatedLabel', formatDateTime(source.evaluatedAt)),
      ]),
      el('p', { text: t('platformAdmin.providers.privateNotice') }),
      ...(report.liveMetrics ? [el('p', { text: t(`platformAdmin.liveMetrics.${source.sourceState}`) })] : []),
    ]),
    el('details', { className: 'platform-admin-insights-details' }, [
      el('summary', { text: t('platformAdmin.providers.alerts') }),
      el('p', { text: t('platformAdmin.providers.deliveryNotConfigured') }),
    ]),
  ]);
}

export function renderProviderUsage({ resource, onRetry, isStale = false, elapsedMs = 0, activeTab = 'overview', onTabChange }) {
  const refresh = button(t('platformAdmin.providers.refresh'), { className: 'secondary',
    dataset: { platformProviderRefresh: 'true' } });
  refresh.addEventListener('click', onRetry);
  if (!resource || resource.status === 'loading') return el('section', { className: 'card', attrs: { role: 'status' } }, [
    el('h2', { text: t('platformAdmin.resource.loadingTitle') }),
  ]);
  if (resource.status === 'error') return el('section', { className: 'card platform-admin-error', attrs: { role: 'alert' } }, [
    el('h2', { text: t('platformAdmin.providers.unavailable') }),
    el('p', { text: t('platformAdmin.providers.unavailableText') }), refresh,
  ]);
  const report = resource.data;
  const source = report.liveMetrics || report;
  const freshness = isStale || source.freshness === 'stale'
    || PROVIDERS.some((id) => providerState(report, id, elapsedMs) === 'stale') ? 'stale' : 'fresh';
  const rows = report.liveMetrics?.measurements.filter((row) => LIVE_METRICS[row.id][0] === 'providers') || [];
  const missing = rows.filter((row) => row.value === null && !(row.id === 'neon_transfer' && report.neon)).length;
  const overview = [
    el('div', { className: 'platform-admin-provider-grid' }, PROVIDERS.map((id) => providerCard(report, id, elapsedMs))),
    el('div', { className: 'card platform-admin-insights-quality', dataset: { insightsDataGaps: 'providers' } }, [
      el('strong', { text: t(report.liveMetrics ? 'platformAdmin.insights.providers.coverage' : 'platformAdmin.insights.providers.legacyCoverage', {
        known: formatNumber(rows.length - missing), total: formatNumber(rows.length),
      }) }),
      el('p', { text: t('platformAdmin.insights.providers.costsUnknown') }),
      el('details', { className: 'platform-admin-insights-details' }, [
        el('summary', { text: t('platformAdmin.insights.missingWhy') }),
        el('p', { text: t('platformAdmin.insights.sourceMissing') }),
        el('p', { text: t('platformAdmin.insights.providers.noHistory') }),
      ]),
    ]),
  ];
  const usage = [
    el('section', { className: 'card', dataset: { providerNeonDetails: 'true' } }, [
      el('h2', { text: t('platformAdmin.providers.neon') }),
      ...(report.neon ? [el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.insights.observedAt', {
        time: formatDateTime(report.observedAt),
      }) })] : []),
      neonDetails(report),
    ]),
    renderLiveMetrics(report.liveMetrics, 'providers', false, elapsedMs),
  ];
  return el('section', { className: 'platform-admin-insights-report', dataset: { platformProviderReport: 'true' } }, [
    el('header', { className: 'card platform-admin-insights-header' }, [
      el('div', {}, [
        el('h2', { text: t('platformAdmin.insights.providers.overviewTitle') }),
        el('p', { text: t('platformAdmin.insights.observedAt', { time: formatDateTime(source.observedAt) }) }),
        ...(resource.loadedAt ? [el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.insights.loadedAt', {
          time: formatDateTime(resource.loadedAt),
        }) })] : []),
        el('p', { className: 'platform-admin-status', attrs: { role: 'status' },
          dataset: { tone: freshness === 'stale' ? 'warning' : 'neutral', platformProviderFreshness: freshness },
          text: t(freshness === 'stale' ? 'platformAdmin.insights.providers.partlyStale' : 'platformAdmin.providers.freshness.fresh') }),
      ]),
      refresh,
    ]),
    renderInsightRetrievalNotice(report.retrieval),
    renderInsightTabs({ id: 'provider-insights', label: t('platformAdmin.insights.providers.navigation'), activeTab, onTabChange,
      tabs: [
        { id: 'overview', label: t('platformAdmin.insights.tabs.overview'), content: overview },
        { id: 'usage', label: t('platformAdmin.insights.providers.usageTab'), content: usage },
        { id: 'sources', label: t('platformAdmin.insights.providers.sourcesTab'), content: sourcePanel(report) },
      ] }),
  ]);
}
