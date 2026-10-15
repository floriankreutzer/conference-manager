import { formatDate, formatDateTime, formatNumber, t } from '../core/i18n.js';
import { button, el } from '../core/ui.js';
import { renderLiveMetrics } from './live-metrics.js';

function amount(value, unit = 'count') {
  if (value === null) return t('common.unknown');
  if (unit === 'ratio') return formatNumber(value, { style: 'percent', maximumFractionDigits: 1 });
  if (unit === 'milliseconds' && value < 60_000) return t('platformAdmin.productDelivery.seconds', {
    amount: formatNumber(value / 1000, { maximumFractionDigits: 4 }),
  });
  if (unit === 'milliseconds') return t('platformAdmin.productDelivery.minutes', {
    amount: formatNumber(value / 60_000, { maximumFractionDigits: 1 }),
  });
  return formatNumber(value);
}

function definition(label, value) {
  return el('div', {}, [el('dt', { text: label }), el('dd', { text: value })]);
}

function metrics(items, provenance = 'operator') {
  return el('dl', { className: 'platform-admin-definition-list' }, items.map((metric) =>
    el('div', { dataset: { productMetric: metric.id } }, [
      el('dt', { text: t(`platformAdmin.productDelivery.metric.${metric.id}`) }),
      el('dd', {}, [el('strong', { text: amount(metric.value, metric.unit) }),
        el('p', { className: 'platform-admin-data-note',
          dataset: { metricProvenance: metric.value === null ? 'unknown' : provenance },
          text: t(`platformAdmin.operatorSources.${metric.value === null ? 'unknown' : provenance}`) }),
        ...(metric.value === null ? [el('p', { className: 'platform-admin-data-note',
          text: t(`platformAdmin.productDelivery.reason.${metric.reason}`) })] : [])]),
    ])));
}

function deliveryComponent(component, provenance = 'operator', heading = 'h3') {
  return el('article', { className: 'card platform-admin-record platform-admin-delivery-component',
    dataset: { productDeliveryComponent: component.component } }, [
    el(heading, { text: t(`platformAdmin.productDelivery.component.${component.component}`) }),
    ...[...component.buckets].reverse().map((bucket, index) => el('details', {
      attrs: index === 0 ? { open: '' } : {},
    }, [el('summary', { text: t('platformAdmin.productDelivery.window', {
      start: formatDate(bucket.periodStart, { timeZone: 'UTC' }), end: formatDate(bucket.periodEnd, { timeZone: 'UTC' }),
    }) }), metrics(bucket.metrics, provenance), el('dl', { className: 'platform-admin-definition-list' }, [
      definition(t('platformAdmin.productDelivery.unresolvedRecoveries'), amount(bucket.unresolvedRecoveries)),
    ])])),
  ]);
}

function feedbackMetrics(feedback) {
  return el('dl', { className: 'platform-admin-definition-list' }, [
    ...['total', 'open', 'highSeverity'].map((key) => definition(
      t(`platformAdmin.productDelivery.feedback.${key}`), amount(feedback[key]))),
    ...feedback.categories.map((group) => definition(t(`platformAdmin.productDelivery.category.${group.id}`), amount(group.count))),
    ...feedback.workflows.map((group) => definition(t(`platformAdmin.productDelivery.workflow.${group.id}`), amount(group.count))),
    ...feedback.sentiments.map((group) => definition(t(`platformAdmin.productDelivery.sentiment.${group.id}`), amount(group.count))),
  ]);
}

function operatorSources(report) {
  if (!report) return el('section', { className: 'card', dataset: { operatorSources: 'unknown' } }, [
    el('h2', { text: t('platformAdmin.operatorSources.title') }),
    el('p', { text: t('platformAdmin.operatorSources.unavailable') }),
  ]);
  return el('section', { dataset: { operatorSources: 'true' } }, [
    el('h2', { text: t('platformAdmin.operatorSources.title') }),
    el('p', { text: t('platformAdmin.operatorSources.notice') }),
    ...report.sources.map((row) => {
      const mode = row.freshness === 'stale' ? 'stale' : 'operator';
      return el('section', { className: 'card', dataset: { operatorSource: row.kind } }, [
        el('h3', { text: t(`platformAdmin.operatorSources.${row.kind}`) }),
        el('p', { attrs: { role: 'status' },
          text: t(`platformAdmin.operatorSources.${row.snapshot === null ? 'unknown' : mode}`) }),
        ...(row.snapshot === null ? [] : [
          el('p', { className: 'platform-admin-data-note',
            text: t('platformAdmin.operatorSources.observed', { time: formatDateTime(row.observedAt) }) }),
          ...(row.sourceState === 'last_good' ? [el('p', { attrs: { role: 'status' },
            text: t('platformAdmin.operatorSources.last_good') })] : []),
          ...(row.kind === 'manual' ? [metrics(row.snapshot.product, mode),
            ...row.snapshot.delivery.map((component) => deliveryComponent(component, mode, 'h4'))] : [
            el('p', { text: t(`platformAdmin.operatorSources.${row.snapshot.feedback.total === null ? 'unknown' : mode}`) }),
            feedbackMetrics(row.snapshot.feedback),
          ]),
        ]),
      ]);
    }),
  ]);
}

export function renderProductDelivery({ resource, onRetry }) {
  const refresh = button(t('platformAdmin.productDelivery.refresh'), { className: 'secondary',
    dataset: { productDeliveryRefresh: 'true' } });
  refresh.addEventListener('click', onRetry);
  if (!resource || resource.status === 'loading') return el('section', {
    className: 'card', attrs: { role: 'status' },
  }, [el('h2', { text: t('platformAdmin.resource.loadingTitle') })]);
  if (resource.status === 'error') return el('section', {
    className: 'card platform-admin-error', attrs: { role: 'alert' },
  }, [el('h2', { text: t('platformAdmin.productDelivery.unavailable') }),
    el('p', { text: t('platformAdmin.productDelivery.unavailableText') }), refresh]);
  const report = resource.data;
  const provenance = report.freshness === 'stale' ? 'stale' : report.liveMetrics ? 'automatic' : 'operator';
  return el('section', { className: 'platform-admin-product-delivery', dataset: { productDeliveryReport: 'true' } }, [
    el('section', { className: 'card' }, [
      el('h2', { text: t('platformAdmin.productDelivery.title') }),
      el('p', { text: t('platformAdmin.productDelivery.privateNotice') }),
      el('dl', { className: 'platform-admin-definition-list' }, [
        definition(t('platformAdmin.productDelivery.context'), t(`platformAdmin.productDelivery.environment.${report.environment}`)),
        definition(t('platformAdmin.productDelivery.observed'), report.observedAt === null
          ? t('common.unknown') : formatDateTime(report.observedAt)),
        definition(t('platformAdmin.productDelivery.period'), t('platformAdmin.productDelivery.window', {
          start: formatDate(report.periodStart, { timeZone: 'UTC' }), end: formatDate(report.periodEnd, { timeZone: 'UTC' }),
        })),
        definition(t('platformAdmin.productDelivery.source'), t(report.liveMetrics ? 'platformAdmin.liveMetrics.mode'
          : `platformAdmin.productDelivery.mode.${report.collectionMode}`)),
        definition(t('platformAdmin.productDelivery.fingerprint'), report.provenance.sourceDigest === null
          ? t('common.unknown') : report.provenance.sourceDigest),
        definition(t('platformAdmin.productDelivery.sourceRecords'), report.collectionMode === 'not_collected'
          ? t('common.unknown') : formatNumber(report.provenance.eventCount)),
      ]),
      el('p', { className: 'platform-admin-status', attrs: { role: 'status' },
        dataset: { tone: report.freshness === 'stale' ? 'critical' : 'neutral' },
        text: t(`platformAdmin.productDelivery.freshness.${report.freshness}`) }), refresh,
    ]),
    renderLiveMetrics(report.liveMetrics, 'product'),
    el('section', { className: 'card', dataset: { productOutcomes: 'true' } }, [
      el('h2', { text: t('platformAdmin.productDelivery.outcomes') }),
      el('p', { text: t('platformAdmin.productDelivery.outcomesNote') }), metrics(report.product, provenance),
    ]),
    el('section', { className: 'card', dataset: { productFeedback: 'true' } }, [
      el('h2', { text: t('platformAdmin.productDelivery.feedback') }),
      el('p', { text: t(`platformAdmin.productDelivery.feedbackSource.${report.feedback.source}`) }),
      feedbackMetrics(report.feedback),
    ]),
    el('section', {}, [el('h2', { text: t('platformAdmin.productDelivery.delivery') }),
      el('p', { text: t('platformAdmin.productDelivery.deliveryNote') }),
      el('div', { className: 'platform-admin-provider-grid' }, report.delivery.map((component) =>
        deliveryComponent(component, provenance)))]),
    operatorSources(report.operatorSources),
  ]);
}
