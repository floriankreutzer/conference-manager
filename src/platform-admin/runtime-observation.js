import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { pavurelFunctionalIcon } from '../core/pavurel-functional-icon.js';
import { el } from '../core/ui.js';

// Both contexts consume the same normalized observation. An old observation is
// not a new outage, and the deployment environment says nothing about data profile.

export function renderRuntimeObservation(runtime, { headingLevel = 'h3' } = {}) {
  const row=(key,value)=>el('div',{},[el('dt',{ text: t(key) }),el('dd',{},[value])]);
  const badge=(value)=>el('span',{ className: 'platform-admin-status',text: t(`platformAdmin.state.${value}`),
    dataset: { state: value,tone: ['ready','fresh'].includes(value) ? 'positive' : ['not_ready','mismatch'].includes(value) ? 'critical' : 'neutral' } });
  const technical=el('details',{ className: 'platform-admin-runtime-details' },[
    el('summary',{ text: t('platformAdmin.runtime.technicalDetails') }),
    el('dl',{ className: 'platform-admin-definition-list' },[
      row('platformAdmin.runtime.frontendVersion',runtime.components.frontend.version || t('common.unknown')),
      row('platformAdmin.runtime.apiVersion',runtime.components.api.version || t('common.unknown')),
      row('platformAdmin.runtime.schemaVersion',runtime.databaseSchema.currentVersion===null ? t('common.unknown') : formatNumber(runtime.databaseSchema.currentVersion)),
    ]),
    ...(runtime.reasonCodes.length ? [el('h4',{ text: t('platformAdmin.runtime.reasons') }),
      el('ul',{ className: 'platform-admin-detail-list' },runtime.reasonCodes.map(reason=>el('li',{},[el('code',{ text: reason })])))] : []),
  ]);
  return el('article',{ className: 'card platform-admin-record',dataset: { runtimeObservation: runtime.freshness.state } },[
    el('div',{ className: 'platform-admin-record-heading' },[
      el(headingLevel,{ className: 'pavurel-icon-label' }, [pavurelFunctionalIcon('system'), el('span', {
        text: t('platformAdmin.runtime.observationTitle',{ reference: runtime.deployment.reference || t('common.unknown') }) })]),badge(runtime.overallState),
    ]),
    el('p',{ text: t('platformAdmin.runtime.service') }),
    el('p',{ text: t('platformAdmin.runtime.relevance') }),
    el('dl',{ className: 'platform-admin-definition-list' },[
      row('platformAdmin.runtime.environment',t(`platformAdmin.runtime.environment.${runtime.environment}`)),
      row('platformAdmin.runtime.freshness',badge(runtime.freshness.state)),
      row('platformAdmin.runtime.observedAt',runtime.freshness.observedAt
        ? el('time',{ text: formatDateTime(runtime.freshness.observedAt),attrs: { datetime: runtime.freshness.observedAt } }) : t('common.unknown')),
      row('platformAdmin.runtime.maxAge',t('platformAdmin.runtime.ageSeconds',{ count: formatNumber(runtime.freshness.maxAgeSeconds) })),
    ]),
    el('p',{ className: 'platform-admin-data-note',text: t(`platformAdmin.runtime.observation.${runtime.freshness.state}`) }),
    technical,el('p',{ className: 'platform-admin-data-note',text: t('platformAdmin.runtime.dataNote') }),
  ]);
}
