import { formatDate, formatDateTime, formatNumber, t } from '../core/i18n.js';
import { button, el } from '../core/ui.js';

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

function metrics(items) {
  return el('dl', { className: 'platform-admin-definition-list' }, items.map((metric) =>
    el('div', { dataset: { productMetric: metric.id } }, [
      el('dt', { text: t(`platformAdmin.productDelivery.metric.${metric.id}`) }),
      el('dd', {}, [el('strong', { text: amount(metric.value, metric.unit) }),
        ...(metric.value === null ? [el('p', { className: 'platform-admin-data-note',
          text: t(`platformAdmin.productDelivery.reason.${metric.reason}`) })] : [])]),
    ])));
}

function deliveryComponent(component) {
  return el('article', { className: 'card platform-admin-record',
    dataset: { productDeliveryComponent: component.component } }, [
    el('h3', { text: t(`platformAdmin.productDelivery.component.${component.component}`) }),
    ...[...component.buckets].reverse().map((bucket, index) => el('details', {
      attrs: index === 0 ? { open: '' } : {},
    }, [el('summary', { text: t('platformAdmin.productDelivery.window', {
      start: formatDate(bucket.periodStart, { timeZone: 'UTC' }), end: formatDate(bucket.periodEnd, { timeZone: 'UTC' }),
    }) }), metrics(bucket.metrics), el('dl', { className: 'platform-admin-definition-list' }, [
      definition(t('platformAdmin.productDelivery.unresolvedRecoveries'), amount(bucket.unresolvedRecoveries)),
    ])])),
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
  return el('section', { dataset: { productDeliveryReport: 'true' } }, [
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
        definition(t('platformAdmin.productDelivery.source'), t(`platformAdmin.productDelivery.mode.${report.collectionMode}`)),
        definition(t('platformAdmin.productDelivery.fingerprint'), report.provenance.sourceDigest === null
          ? t('common.unknown') : report.provenance.sourceDigest),
        definition(t('platformAdmin.productDelivery.sourceRecords'), report.collectionMode === 'not_collected'
          ? t('common.unknown') : formatNumber(report.provenance.eventCount)),
      ]),
      el('p', { className: 'platform-admin-status', attrs: { role: 'status' },
        dataset: { tone: report.freshness === 'stale' ? 'critical' : 'neutral' },
        text: t(`platformAdmin.productDelivery.freshness.${report.freshness}`) }), refresh,
    ]),
    el('section', { className: 'card', dataset: { productOutcomes: 'true' } }, [
      el('h2', { text: t('platformAdmin.productDelivery.outcomes') }),
      el('p', { text: t('platformAdmin.productDelivery.outcomesNote') }), metrics(report.product),
    ]),
    el('section', { className: 'card', dataset: { productFeedback: 'true' } }, [
      el('h2', { text: t('platformAdmin.productDelivery.feedback') }),
      el('p', { text: t(`platformAdmin.productDelivery.feedbackSource.${report.feedback.source}`) }),
      el('dl', { className: 'platform-admin-definition-list' }, [
        ...['total', 'open', 'highSeverity'].map((key) => definition(
          t(`platformAdmin.productDelivery.feedback.${key}`), amount(report.feedback[key]))),
        ...report.feedback.categories.map((group) => definition(
          t(`platformAdmin.productDelivery.category.${group.id}`), amount(group.count))),
        ...report.feedback.workflows.map((group) => definition(
          t(`platformAdmin.productDelivery.workflow.${group.id}`), amount(group.count))),
        ...report.feedback.sentiments.map((group) => definition(
          t(`platformAdmin.productDelivery.sentiment.${group.id}`), amount(group.count))),
      ]),
    ]),
    el('section', {}, [el('h2', { text: t('platformAdmin.productDelivery.delivery') }),
      el('p', { text: t('platformAdmin.productDelivery.deliveryNote') }),
      el('div', { className: 'platform-admin-provider-grid' }, report.delivery.map(deliveryComponent))]),
  ]);
}
