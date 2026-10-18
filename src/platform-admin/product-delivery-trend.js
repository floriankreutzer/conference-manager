import { formatDate, formatNumber, t } from '../core/i18n.js';
import { el } from '../core/ui.js';

// Presentation preferences contain only fixed metric IDs, never report contents.
const selectedMetrics = new WeakMap();

export function formatProductMetricAmount(value, unit = 'count') {
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

function periodLabel(bucket, compact = false) {
  const options = compact ? { timeZone: 'UTC', day: 'numeric', month: 'short' } : { timeZone: 'UTC' };
  return t(compact ? 'platformAdmin.insights.product.week' : 'platformAdmin.productDelivery.window', {
    start: formatDate(bucket.periodStart, options), end: formatDate(bucket.periodEnd, options),
  });
}

function seriesFigure(component, metricId, sourceId) {
  const points = component.buckets.map((bucket) => ({
    bucket, metric: bucket.metrics.find((item) => item.id === metricId),
  }));
  const knownValues = points.filter(({ metric }) => metric.value !== null).map(({ metric }) => metric.value);
  // Scale geometry only. Unknown observations never become zero-valued meters.
  const maximum = knownValues.length ? Math.max(...knownValues) || 1 : 1;
  const metricLabel = t(`platformAdmin.productDelivery.metric.${metricId}`);
  const captionId = `product-trend-${sourceId}-${component.component}-${metricId}`;
  return el('figure', {
    className: 'platform-admin-insights-trend',
    dataset: { productDeliverySeries: metricId },
  }, [
    el('figcaption', { id: captionId, text: t('platformAdmin.insights.product.seriesTitle', { metric: metricLabel }) }),
    el('table', { className: 'platform-admin-insights-trend-table', attrs: { 'aria-labelledby': captionId } }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { attrs: { scope: 'col' }, text: t('platformAdmin.insights.product.weekColumn') }),
        el('th', { attrs: { scope: 'col' }, text: t('platformAdmin.insights.product.valueColumn') }),
      ])]),
      el('tbody', {}, points.map(({ bucket, metric }) => el('tr', {
        dataset: { productDeliveryPeriod: bucket.periodStart, productDeliveryPeriodEnd: bucket.periodEnd },
      }, [
        el('th', { attrs: { scope: 'row', 'aria-label': periodLabel(bucket) }, text: periodLabel(bucket, true) }),
        el('td', { className: 'platform-admin-insights-trend-value' }, [
          el('strong', { text: formatProductMetricAmount(metric.value, metric.unit) }),
          ...(metric.value === null ? [] : [el('meter', {
            className: 'platform-admin-insights-trend-meter',
            attrs: {
              min: '0', max: String(maximum), value: String(metric.value),
              'aria-label': t('platformAdmin.insights.product.seriesMeter', {
                metric: metricLabel, period: periodLabel(bucket),
              }),
              'aria-valuetext': formatProductMetricAmount(metric.value, metric.unit),
            },
          })]),
        ]),
      ]))),
    ]),
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.insights.product.seriesNote') }),
  ]);
}

export function renderProductDeliveryTrend(component, sourceId) {
  const metricIds = component.buckets[0].metrics.map((metric) => metric.id);
  const preferenceKey = `${sourceId}:${component.component}`;
  if (!selectedMetrics.has(document)) selectedMetrics.set(document, new Map());
  const preferences = selectedMetrics.get(document);
  const previous = preferences.get(preferenceKey);
  const selected = metricIds.includes(previous) ? previous : 'deployment_frequency';
  const controlId = `product-trend-metric-${sourceId}-${component.component}`;
  const select = el('select', { id: controlId, dataset: { productDeliveryChartSelect: component.component } },
    metricIds.map((id) => el('option', { value: id, text: t(`platformAdmin.productDelivery.metric.${id}`) })));
  select.value = selected;
  const figures = metricIds.map((id) => seriesFigure(component, id, sourceId));
  function showSeries(metricId) {
    if (!metricIds.includes(metricId)) return;
    preferences.set(preferenceKey, metricId);
    figures.forEach((figure) => { figure.hidden = figure.dataset.productDeliverySeries !== metricId; });
  }
  select.addEventListener('change', () => showSeries(select.value));
  showSeries(selected);
  return el('section', { className: 'platform-admin-insights-chart' }, [
    el('div', { className: 'platform-admin-insights-chart-control' }, [
      el('label', { attrs: { for: controlId }, text: t('platformAdmin.insights.product.chartMetric') }), select,
    ]),
    ...figures,
  ]);
}
