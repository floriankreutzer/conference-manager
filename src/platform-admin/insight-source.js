import { formatDateTime, t } from '../core/i18n.js';
import { el } from '../core/ui.js';

const SOURCE_KINDS = Object.freeze(['daily', 'product_daily', 'runtime', 'manual', 'feedback', 'legacy']);

export function storedInsightSourceKind(model) {
  return !model.liveMetrics && !model.dailySource && model.storedReport ? 'legacy' : 'product_daily';
}

// Source age and source completeness are independent. In particular, an old
// operator confirmation must never label a newer daily/runtime report stale.
export function renderInsightSourceStatus(source, kind, { showLabel = true } = {}) {
  if (!SOURCE_KINDS.includes(kind)) throw new TypeError('PLATFORM_INSIGHT_SOURCE_KIND_INVALID');
  const freshness = source?.freshness || 'unknown';
  return el('div', { className: 'platform-admin-insights-source-meta', dataset: { insightSource: kind } }, [
    ...(showLabel ? [el('span', { className: 'platform-admin-insights-source-label',
      text: t(kind === 'runtime' && source?.environment === 'production'
        ? 'platformAdmin.insights.product.protectedProvenance' : `platformAdmin.insights.source.${kind}`) })] : []),
    el('span', { className: 'platform-admin-status', attrs: { role: 'status' },
      dataset: { tone: freshness === 'stale' ? 'warning' : 'neutral', productSourceFreshness: freshness },
      text: t(`platformAdmin.insights.sourceFreshness.${kind}.${freshness}`) }),
    el(source?.observedAt ? 'time' : 'span', { className: 'platform-admin-data-note',
      attrs: source?.observedAt ? { datetime: source.observedAt } : {}, text: t('platformAdmin.operatorSources.observed', {
      time: source?.observedAt ? formatDateTime(source.observedAt) : t('common.unknown'),
    }) }),
    ...(source?.sourceState === 'last_good' ? [el('p', { attrs: { role: 'status' },
      text: t('platformAdmin.insights.sourceLastGood') })] : []),
  ]);
}

export function renderInsightRetrievalNotice(retrieval) {
  if (retrieval?.dailyState === 'last_good') return el('p', { className: 'platform-admin-insights-quality',
    attrs: { role: 'status' }, text: t('platformAdmin.insights.sourceLastGood') });
  if (!retrieval?.dailyReason) return null;
  return el('div', { className: 'platform-admin-insights-quality',
    dataset: { insightFallback: 'daily' }, attrs: { role: 'status' } }, [
    el('strong', { text: t('platformAdmin.insights.dailyUnavailable') }),
    el('p', { text: t(retrieval.source === 'legacy_fallback'
      ? 'platformAdmin.insights.legacyFallback' : 'platformAdmin.insights.independentSourcesRemain') }),
    renderInsightReadReason(retrieval.dailyReason),
  ]);
}

export function renderInsightReadReason(reason) {
  if (!reason) return null;
  return el('details', { className: 'platform-admin-insights-details' }, [
    el('summary', { text: t('platformAdmin.insights.sourceReadDetails') }),
    el('p', { text: t(`platformAdmin.insights.retrievalReason.${reason}`) }),
  ]);
}
