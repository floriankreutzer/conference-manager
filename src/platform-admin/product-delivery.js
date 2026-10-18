import { formatDate, formatDateTime, formatNumber, t } from '../core/i18n.js';
import { button, el } from '../core/ui.js';
import { renderInsightTabs } from './insight-tabs.js';
import { renderLiveMetrics } from './live-metrics.js';
import { formatProductMetricAmount as amount, renderProductDeliveryTrend } from './product-delivery-trend.js';
import { renderInsightReadReason, renderInsightRetrievalNotice, renderInsightSourceStatus,
  storedInsightSourceKind } from './insight-source.js';

function definition(label, value) {
  return el('div', {}, [el('dt', { text: label }), el('dd', { text: value })]);
}

function sourceLabel(provenance) {
  if (provenance === 'runtime') return t('platformAdmin.insights.product.runtimeProvenance');
  return t(provenance === 'stored' ? 'platformAdmin.insights.product.stored'
    : `platformAdmin.operatorSources.${provenance}`);
}

function windowLabel(snapshot) {
  if (snapshot.schemaVersion === 2) {
    const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' };
    return t('platformAdmin.productDelivery.window', {
      start: formatDate(snapshot.periodStart, options), end: formatDate(snapshot.periodEnd, options),
    });
  }
  return t('platformAdmin.productDelivery.window', {
    start: formatDate(snapshot.periodStart, { timeZone: 'UTC' }),
    end: formatDate(snapshot.periodEnd, { timeZone: 'UTC' }),
  });
}

function coverageEvidence(coverage) {
  if (!coverage) return null;
  return el('details', { className: 'platform-admin-insights-details' }, [
    el('summary', { text: t('platformAdmin.insights.product.coverageDetails') }),
    el('p', { text: t(`platformAdmin.insights.product.coverageReason.${coverage.reason}`) }),
    el('p', { text: coverage.sourcePeriodStart === null
      ? t('platformAdmin.insights.product.coverageUnknownWindow')
      : t('platformAdmin.insights.product.coverageWindow', {
        start: formatDateTime(coverage.sourcePeriodStart), end: formatDateTime(coverage.sourcePeriodEnd),
      }) }),
  ]);
}

function metrics(items, provenance = 'stored', coverage = []) {
  return el('dl', { className: 'platform-admin-definition-list platform-admin-insights-metric-grid' },
    items.map((metric) => {
      const scope = coverage.find((row) => row.id === metric.id);
      return el('div', { dataset: { productMetric: metric.id, ...(scope ? { metricCoverage: scope.state } : {}) } }, [
        el('dt', { text: t(`platformAdmin.productDelivery.metric.${metric.id}`) }),
        el('dd', {}, [
          el('strong', { text: amount(metric.value, metric.unit) }),
          el('small', { className: 'platform-admin-data-note',
            dataset: { metricProvenance: metric.value === null ? 'unknown' : provenance },
            text: metric.value === null ? t('platformAdmin.insights.product.valueUnavailable') : sourceLabel(provenance) }),
          ...(scope ? [el('small', { className: 'platform-admin-data-note',
            text: t(`platformAdmin.insights.product.coverage.${scope.state}`) }), coverageEvidence(scope)] : []),
        ]),
      ]);
    }));
}

function metricReasons(items) {
  return el('dl', { className: 'platform-admin-definition-list' }, items
    .filter((metric) => metric.value === null)
    .map((metric) => definition(t(`platformAdmin.productDelivery.metric.${metric.id}`),
      t(`platformAdmin.productDelivery.reason.${metric.reason}`))));
}

function sourceDetails(snapshot, items = [], noteKey = null) {
  const missing = items.filter((metric) => metric.value === null).length;
  return el('details', { className: 'platform-admin-insights-details' }, [
    el('summary', { text: t('platformAdmin.insights.product.sourceDetails') }),
    ...[noteKey].flat().filter(Boolean).map((key) => el('p', { text: t(key) })),
    ...(missing ? [metricReasons(items)] : []),
    el('dl', { className: 'platform-admin-definition-list' }, [
      definition(t('platformAdmin.productDelivery.period'), windowLabel(snapshot)),
      definition(t('platformAdmin.productDelivery.fingerprint'), snapshot.provenance.sourceDigest || t('common.unknown')),
      definition(t('platformAdmin.productDelivery.sourceRecords'), snapshot.provenance.mode === 'not_collected'
        ? t('common.unknown') : formatNumber(snapshot.provenance.eventCount)),
      ...(snapshot.provenance.sourceEpoch ? [definition(t('platformAdmin.insights.product.epoch'), snapshot.provenance.sourceEpoch)] : []),
    ]),
  ]);
}

function deliveryComponent(component, provenance = 'stored', heading = 'h3') {
  return el('article', {
    className: 'card platform-admin-record platform-admin-delivery-component platform-admin-insights-delivery-component',
    dataset: { productDeliveryComponent: component.component },
  }, [
    el(heading, { text: t(`platformAdmin.productDelivery.component.${component.component}`) }),
    renderProductDeliveryTrend(component, provenance),
    ...[...component.buckets].reverse().map((bucket, index) => el('details', {
      className: 'platform-admin-insights-week',
      dataset: { productDeliveryWindow: bucket.periodStart },
      attrs: index === 0 ? { open: '' } : {},
    }, [
      el('summary', { text: windowLabel(bucket) }),
      metrics(bucket.metrics, provenance),
      el('dl', { className: 'platform-admin-definition-list' }, [
        definition(t('platformAdmin.productDelivery.unresolvedRecoveries'), amount(bucket.unresolvedRecoveries)),
      ]),
      ...(bucket.metrics.some((metric) => metric.value === null) ? [el('details', {
        className: 'platform-admin-insights-details',
      }, [el('summary', { text: t('platformAdmin.insights.product.missingDetails') }), metricReasons(bucket.metrics)])] : []),
    ])),
  ]);
}

function feedbackMetrics(feedback) {
  return el('dl', { className: 'platform-admin-definition-list platform-admin-insights-metric-grid' },
    ['total', 'open', 'highSeverity'].map((key) => el('div', { dataset: { productFeedbackMetric: key } }, [
      el('dt', { text: t(`platformAdmin.productDelivery.feedback.${key}`) }),
      el('dd', {}, [el('strong', { text: amount(feedback[key]) })]),
    ])));
}

function feedbackBreakdown(feedback, heading = 'h3') {
  return el('details', { className: 'platform-admin-insights-details' }, [
    el('summary', { text: t('platformAdmin.insights.product.feedbackBreakdown') }),
    ...[['categories', 'category'], ['workflows', 'workflow'], ['sentiments', 'sentiment']].map(([group, label]) =>
      el('section', {}, [
        el(heading, { text: t(`platformAdmin.insights.product.feedbackGroup.${group}`) }),
        el('dl', { className: 'platform-admin-definition-list' }, feedback[group].map((item) =>
          definition(t(`platformAdmin.productDelivery.${label}.${item.id}`), amount(item.count)))),
      ])),
  ]);
}

function operatorSource(report, kind) {
  return report.operatorSources?.sources.find((source) => source.kind === kind) || null;
}

function runtimeCoverageSummary(report) {
  return t('platformAdmin.insights.product.coverageSummary', {
    complete: formatNumber(report.productCoverage.filter((row) => row.state === 'complete').length),
    partial: formatNumber(report.productCoverage.filter((row) => row.state === 'partial').length),
    missing: formatNumber(report.productCoverage.filter((row) => row.state === 'not_collected').length),
  });
}

function sourceCoverage(model) {
  const report = model.storedReport;
  const runtime = model.runtimeProduct;
  const manual = operatorSource(model, 'manual');
  const feedback = operatorSource(model, 'feedback');
  const storedFeedback = !feedback?.snapshot && report?.feedback.source === 'protected_operator_registry';
  const deliveryMetrics = report?.delivery.flatMap((component) => component.buckets.flatMap((bucket) => bucket.metrics)) || [];
  const sourceRows = [
    { kind: 'runtime', source: runtime, detail: runtime ? runtimeCoverageSummary(runtime)
      : t('platformAdmin.insights.product.runtimeUnavailable'), reason: model.retrieval.runtimeReason },
    { kind: storedInsightSourceKind(model), source: report,
      detail: report ? t(runtime ? 'platformAdmin.insights.product.deliveryCoverage' : 'platformAdmin.insights.product.coverage', {
        known: formatNumber((runtime ? deliveryMetrics : report.product).filter((metric) => metric.value !== null).length),
        total: formatNumber((runtime ? deliveryMetrics : report.product).length),
      }) : t('platformAdmin.insights.product.deliveryUnavailable') },
    { kind: 'manual', source: manual,
      detail: t(manual?.snapshot ? 'platformAdmin.insights.product.sourceSeparate' : 'platformAdmin.operatorSources.unavailable'),
      reason: model.retrieval.operationsReason },
    { kind: 'feedback', source: storedFeedback ? report : feedback,
      detail: t(feedback?.snapshot ? 'platformAdmin.insights.product.feedbackConfigured'
        : storedFeedback ? 'platformAdmin.insights.product.feedbackFromStored' : 'platformAdmin.insights.product.feedbackUnavailable'),
      reason: model.retrieval.operationsReason },
  ];
  return el('section', { className: 'card', dataset: { productSourceCoverage: 'true' } }, [
    el('h2', { text: t('platformAdmin.insights.product.sourceOverview') }),
    el('dl', { className: 'platform-admin-definition-list' }, sourceRows.map(({ kind, source, detail, reason }) =>
      el('div', {}, [
        el('dt', { text: t(`platformAdmin.insights.source.${kind}`) }),
        el('dd', {}, [
          el('p', { text: detail }),
          renderInsightSourceStatus(source, kind, { showLabel: false }),
          renderInsightReadReason(reason),
        ]),
      ]))),
  ]);
}

function renderOverview(report) {
  return [
    renderLiveMetrics(report.liveMetrics, 'product'),
    sourceCoverage(report),
  ];
}

function renderUsage(model) {
  const report = model.runtimeProduct || model.storedReport;
  const manual = operatorSource(model, 'manual');
  const provenance = model.runtimeProduct ? 'runtime' : 'stored';
  return [
    el('section', { className: 'card', dataset: { productOutcomes: 'true' } }, [
      el('h2', { text: t('platformAdmin.productDelivery.outcomes') }),
      ...(!model.runtimeProduct ? [el('p', { attrs: { role: 'status' },
        text: t('platformAdmin.insights.product.runtimeUnavailable') }),
      renderInsightReadReason(model.retrieval.runtimeReason)] : []),
      renderInsightSourceStatus(report, model.runtimeProduct ? 'runtime' : storedInsightSourceKind(model)),
      ...(report.productCoverage ? [el('p', { className: 'platform-admin-data-note',
        text: t('platformAdmin.insights.product.partialNote') })] : []),
      metrics(report.product, provenance, report.productCoverage),
      sourceDetails(report, report.product, model.runtimeProduct
        ? 'platformAdmin.insights.product.runtimeNote' : 'platformAdmin.productDelivery.outcomesNote'),
    ]),
    el('details', { className: 'card platform-admin-insights-details', dataset: { operatorProductSource: 'manual' } }, [
      el('summary', { text: t('platformAdmin.insights.product.manualOutcomes') }),
      el('p', { text: t('platformAdmin.insights.product.sourceSeparate') }),
      renderInsightSourceStatus(manual, 'manual'),
      ...(manual?.snapshot ? [metrics(manual.snapshot.product, 'operator'),
        sourceDetails(manual.snapshot, manual.snapshot.product, 'platformAdmin.productDelivery.outcomesNote')]
        : [el('p', { text: t('platformAdmin.operatorSources.unavailable') })]),
    ]),
  ];
}

function renderDelivery(model) {
  const report = model.storedReport;
  const manual = operatorSource(model, 'manual');
  return [
    el('section', { dataset: { productDeliverySource: 'stored' } }, [
      el('h2', { text: t('platformAdmin.productDelivery.delivery') }),
      renderInsightSourceStatus(report, storedInsightSourceKind(model)),
      ...(report ? [
        el('p', { className: 'platform-admin-data-note', text: windowLabel(report) }),
        el('div', { className: 'platform-admin-provider-grid' }, report.delivery.map((component) => deliveryComponent(component))),
        sourceDetails(report, [], model.liveMetrics ? [
          'platformAdmin.productDelivery.deliveryNote',
          'platformAdmin.insights.product.deliverySource.application',
          'platformAdmin.insights.product.deliverySource.api',
          'platformAdmin.insights.product.deliverySource.website',
          'platformAdmin.insights.product.deliverySource.outcomeLimit',
        ] : 'platformAdmin.productDelivery.deliveryNote'),
      ] : [el('p', { text: t('platformAdmin.insights.product.deliveryUnavailable') })]),
    ]),
    el('details', { className: 'card platform-admin-insights-details',
      dataset: { operatorSource: 'manual', productDeliverySource: 'manual' } }, [
      el('summary', { text: t('platformAdmin.insights.product.manualDelivery') }),
      el('p', { text: t('platformAdmin.insights.product.sourceSeparate') }),
      renderInsightSourceStatus(manual, 'manual'),
      ...(manual?.snapshot ? [
        el('p', { className: 'platform-admin-data-note', text: windowLabel(manual.snapshot) }),
        el('div', { className: 'platform-admin-provider-grid' }, manual.snapshot.delivery.map((component) =>
          deliveryComponent(component, 'operator'))),
        sourceDetails(manual.snapshot, [], 'platformAdmin.productDelivery.deliveryNote'),
      ] : [el('p', { text: t('platformAdmin.operatorSources.unavailable') })]),
    ]),
  ];
}

function feedbackSourceContent(source, snapshot, heading = 'h3') {
  return [
    renderInsightSourceStatus(source, 'feedback'),
    el('p', { className: 'platform-admin-data-note', text: windowLabel(snapshot) }),
    el('p', { text: t('platformAdmin.productDelivery.feedbackSource.protected_operator_registry') }),
    ...(snapshot.feedback.total === null ? [el('p', { attrs: { role: 'status' },
      text: t('platformAdmin.insights.product.feedbackIncomplete') })] : []),
    feedbackMetrics(snapshot.feedback),
    feedbackBreakdown(snapshot.feedback, heading),
    sourceDetails(snapshot),
  ];
}

function renderFeedback(model) {
  const report = model.storedReport;
  const feedback = operatorSource(model, 'feedback');
  const storedConfigured = report?.feedback.source === 'protected_operator_registry';
  return el('section', { className: 'card', dataset: { productFeedback: 'true' } }, [
    el('h2', { text: t('platformAdmin.productDelivery.feedback') }),
    ...(feedback?.snapshot ? [
      el('section', { dataset: { operatorSource: 'feedback' } }, [
        el('h3', { text: t('platformAdmin.operatorSources.feedback') }),
        ...feedbackSourceContent(feedback, feedback.snapshot, 'h4'),
      ]),
      ...(storedConfigured ? [el('details', { className: 'platform-admin-insights-details' }, [
        el('summary', { text: t('platformAdmin.insights.product.storedFeedback') }),
        el('p', { text: t('platformAdmin.insights.product.sourceSeparate') }),
        ...feedbackSourceContent(report, report),
      ])] : []),
    ] : storedConfigured ? feedbackSourceContent(report, report) : [
      el('p', { attrs: { role: 'status' }, text: t('platformAdmin.insights.product.feedbackUnavailable') }),
      ...(report ? [feedbackMetrics(report.feedback), feedbackBreakdown(report.feedback)] : []),
    ]),
  ]);
}

function renderHeader(resource, refresh) {
  const report = resource.data;
  const primary = report.runtimeProduct || report.storedReport;
  return el('section', { className: 'card platform-admin-insights-header' }, [
    el('div', { className: 'platform-admin-insights-heading' }, [
      el('div', {}, [
        el('h2', { text: t('platformAdmin.productDelivery.title') }),
        el('p', { className: 'platform-admin-data-note',
          text: t(`platformAdmin.productDelivery.environment.${primary.environment}`) }),
      ]), refresh,
    ]),
    el('dl', { className: 'platform-admin-insights-clock-grid' }, [
      definition(t('platformAdmin.insights.product.dailyObserved'), report.liveMetrics?.observedAt
        ? formatDateTime(report.liveMetrics.observedAt) : t('common.unknown')),
      definition(t('platformAdmin.insights.product.runtimeObserved'), report.runtimeProduct?.observedAt
        ? formatDateTime(report.runtimeProduct.observedAt) : t('common.unknown')),
      definition(t('platformAdmin.insights.product.storedObserved'), report.storedReport?.observedAt
        ? formatDateTime(report.storedReport.observedAt) : t('common.unknown')),
      definition(t('platformAdmin.insights.product.loaded'), resource.loadedAt
        ? formatDateTime(resource.loadedAt) : t('common.unknown')),
    ]),
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.insights.product.refreshNote') }),
    el('details', { className: 'platform-admin-insights-details' }, [
      el('summary', { text: t('platformAdmin.insights.product.contextDetails') }),
      el('p', { text: t('platformAdmin.productDelivery.privateNotice') }),
      el('p', { text: t('platformAdmin.liveMetrics.productNote') }),
    ]),
  ]);
}

export function renderProductDelivery({ resource, onRetry, activeTab = 'overview', onTabChange = () => {} }) {
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
  return el('section', { className: 'platform-admin-product-delivery',
    dataset: { productDeliveryReport: 'true', operatorSources: report.operatorSources ? 'true' : 'unknown' } }, [
    renderHeader(resource, refresh),
    renderInsightRetrievalNotice(report.retrieval),
    renderInsightTabs({
      id: 'product-insights', label: t('platformAdmin.insights.product.navigation'), activeTab, onTabChange,
      tabs: [
        { id: 'overview', label: t('platformAdmin.insights.product.tab.overview'), content: renderOverview(report) },
        { id: 'usage', label: t('platformAdmin.insights.product.tab.usage'), content: renderUsage(report) },
        { id: 'delivery', label: t('platformAdmin.insights.product.tab.delivery'), content: renderDelivery(report) },
        { id: 'feedback', label: t('platformAdmin.insights.product.tab.feedback'), content: renderFeedback(report) },
      ],
    }),
  ]);
}
