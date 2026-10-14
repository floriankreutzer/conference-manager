import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { button, el } from '../core/ui.js';


function amount(bytes) {
  return t('platformAdmin.providers.gb', { amount: formatNumber(bytes / 1_000_000_000, { maximumFractionDigits: 3 }) });
}

function percent(value) { return formatNumber(value / 100, { style: 'percent', maximumFractionDigits: 2 }); }

function detail(key, value) {
  return el('div', {}, [el('dt', { text: t(key) }), el('dd', { text: value })]);
}

export function renderProviderUsage({ resource, onRetry }) {
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
  const n = report.neon;
  const meterId = 'platformProviderNeonMeter';
  const thresholds = el('ul', { className: 'platform-admin-provider-thresholds' });
  [50, 70, 85, 95].forEach((threshold) => thresholds.append(el('li', {
    className: 'platform-admin-status',
    dataset: { tone: n.crossedThresholds.includes(threshold) ? 'critical' : 'neutral' },
    text: t(n.crossedThresholds.includes(threshold) ? 'platformAdmin.providers.thresholdReached'
      : 'platformAdmin.providers.thresholdBelow', { threshold: percent(threshold) }),
  })));
  const neon = el('article', { className: 'card platform-admin-record', dataset: { platformProvider: 'neon' } }, [
    el('h3', { text: t('platformAdmin.providers.neon') }),
    el('p', { text: t('platformAdmin.providers.plan', { plan: n.plan }) }),
    el('label', { text: t('platformAdmin.providers.utilization', { percent: percent(n.utilizationPercent) }),
      attrs: { for: meterId } }),
    el('meter', { id: meterId, className: 'platform-admin-provider-meter',
      attrs: { min: '0', max: String(n.referenceBytes), value: String(Math.min(n.usedBytes, n.referenceBytes)),
        'aria-describedby': 'platformProviderModelNote' } }),
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
    el('p', { id: 'platformProviderModelNote', className: 'platform-admin-data-note', text: t('platformAdmin.providers.modelNote') }),
    el('p', { text: t('platformAdmin.providers.forecastNote') }),
    el('p', { text: t(`platformAdmin.providers.anomaly.${n.anomalyState}`) }),
    thresholds,
  ]);
  const unknown = ['render', 'github'].map((id) => el('article', {
    className: 'card platform-admin-record', dataset: { platformProvider: id },
  }, [el('h3', { text: t(`platformAdmin.providers.${id}`) }),
    el('strong', { text: t('common.unknown') }),
    el('p', { text: t(`platformAdmin.providers.${id}Unknown`) })]));
  return el('section', { dataset: { platformProviderReport: 'true' } }, [
    el('section', { className: 'card' }, [
      el('h2', { text: t('platformAdmin.providers.title') }),
      el('p', { text: t('platformAdmin.providers.privateNotice') }),
      el('p', { text: t('platformAdmin.providers.snapshot', { time: formatDateTime(report.observedAt) }) }),
      el('p', { className: 'platform-admin-status', attrs: { role: 'status' },
        dataset: { tone: report.freshness === 'stale' ? 'critical' : 'neutral' },
        text: t(`platformAdmin.providers.freshness.${report.freshness}`) }),
      refresh,
    ]),
    el('div', { className: 'platform-admin-provider-grid' }, [neon, ...unknown]),
    el('section', { className: 'card' }, [el('h2', { text: t('platformAdmin.providers.alerts') }),
      el('p', { text: t('platformAdmin.providers.deliveryNotConfigured') })]),
  ]);
}
