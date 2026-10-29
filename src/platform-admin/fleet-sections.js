import { renderRuntimeObservation } from './runtime-observation.js';
import { pavurelFunctionalIcon } from '../core/pavurel-functional-icon.js';
import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { button, el, field } from '../core/ui.js';
import { readinessBlockerPresentation, readinessNextTaskPresentation } from './readiness-blockers.js';
import { auditEventPresentation } from './audit-event-presentation.js';
import { microsoftMappingSummaryPresentation } from './microsoft-mapping-summary.js';

export const PLATFORM_FLEET_VIEW_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'directory', permission: 'platform:tenant:read', titleKey: 'platformAdmin.fleetView.directory' }),
  Object.freeze({ id: 'readiness', permission: 'platform:readiness:read', titleKey: 'platformAdmin.fleetView.readiness' }),
  Object.freeze({ id: 'integration-health', permission: 'platform:integration-health:read', titleKey: 'platformAdmin.fleetView.integrationHealth' }),
  Object.freeze({ id: 'platform-audit', permission: 'platform:audit:read', titleKey: 'platformAdmin.fleetView.audit' }),
  Object.freeze({ id: 'runtime-status', permission: 'platform:runtime:read', titleKey: 'platformAdmin.fleetView.runtime' }),
]);

function platformHeading(iconName, text, tag = 'h3') {
  return el(tag, { className: 'pavurel-icon-label' }, [
    pavurelFunctionalIcon(iconName),
    el('span', { text }),
  ]);
}

function tone(value) {
  if (['ready', 'healthy', 'verified', 'success', 'current', 'fresh'].includes(value)) return 'positive';
  if (['blocked', 'unavailable', 'invalid', 'failure', 'not_ready', 'mismatch'].includes(value)) return 'critical';
  return 'neutral';
}

function status(value) {
  return el('span', {
    className: 'platform-admin-status',
    text: t(`platformAdmin.state.${value}`),
    dataset: { tone: tone(value), state: value },
  });
}

function dataCode(value) {
  return el('code', { className: 'platform-admin-data-code', text: String(value) });
}

function mappingSummary(mappings) {
  const presentation = microsoftMappingSummaryPresentation(mappings);
  const values = presentation.values
    ? Object.fromEntries(Object.entries(presentation.values).map(([key, value]) => [key, formatNumber(value)]))
    : {};
  return t(presentation.messageKey, values);
}

function heading(item, onSelectTenant) {
  const content = [
    el('div', {}, [platformHeading('customers', item.displayName), el('small', { text: item.tenantId })]),
    status(item.lifecycle.status),
  ];
  if (typeof onSelectTenant === 'function') {
    const open = button(t('platformAdmin.fleet.open'), {
      className: 'secondary',
      attrs: { 'aria-label': t('platformAdmin.fleet.openNamed', { tenant: item.displayName }) },
    });
    open.addEventListener('click', () => onSelectTenant(item.tenantId));
    content.push(open);
  }
  return el('div', { className: 'platform-admin-record-heading' }, content);
}

function loading() {
  return el('section', { className: 'card', attrs: { role: 'status' } }, [
    el('h2', { text: t('platformAdmin.resource.loadingTitle') }),
    el('p', { text: t('platformAdmin.resource.loadingText') }),
  ]);
}

function failed(onRetry) {
  const retry = button(t('platformAdmin.load.retry'), { className: 'primary' });
  retry.addEventListener('click', onRetry);
  return el('section', { className: 'card platform-admin-error', attrs: { role: 'alert' } }, [
    el('h2', { text: t('platformAdmin.resource.errorTitle') }),
    el('p', { text: t('platformAdmin.resource.errorText') }),
    el('div', { className: 'button-row' }, [retry]),
  ]);
}

function nextControl(resource, onLoadMore) {
  const cursor = resource.data?.nextCursor;
  if (!cursor || typeof onLoadMore !== 'function') return null;
  const control = button(t('platformAdmin.pagination.next'), { className: 'secondary' });
  control.addEventListener('click', () => onLoadMore(cursor));
  return el('div', { className: 'button-row platform-admin-pagination' }, [control]);
}

function readiness(resource, onSelectTenant, onLoadMore) {
  const list = el('ul', { className: 'platform-admin-record-list' });
  resource.data.items.forEach((item) => {
    const blockers = el('ul', { className: 'platform-admin-detail-list' });
    const explainedTasks = new Set();
    item.readiness.blockerCodes.forEach((entry) => {
      const presentation = readinessBlockerPresentation(entry);
      const label = t(presentation.messageKey, presentation.checkKey
        ? { check: t(presentation.checkKey) }
        : {});
      const task = readinessNextTaskPresentation(entry);
      const explainTask = !explainedTasks.has(task.messageKey); explainedTasks.add(task.messageKey);
      const followUp = explainTask && task.section && typeof onSelectTenant === 'function' ? button(t('platformAdmin.readiness.next.openEntitlements'), { className: 'secondary' }) : null;
      followUp?.addEventListener('click', () => onSelectTenant(item.tenantId, task.section));
      const check = item.readiness.checks.find(check => check.reasonCode === entry);
      blockers.append(el('li', {}, [
        el('p', { className: 'platform-admin-blocker-label', text: label }),
        ...(explainTask ? [el('p', { text: t(task.messageKey) })] : []),
        ...(check ? [el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.readiness.next.observed', { time: check.observedAt ? formatDateTime(check.observedAt) : t('common.unknown'), state: t(`platformAdmin.state.${check.freshness}`) }) })] : []),
        ...(followUp ? [followUp] : []),
        el('details', { className: 'platform-admin-blocker-details' }, [
          el('summary', { text: t('platformAdmin.readiness.technicalDetails') }),
          dataCode(entry),
        ]),
      ]));
    });
    list.append(el('li', { className: 'card platform-admin-record' }, [
      heading(item, onSelectTenant),
      el('div', { className: 'platform-admin-inline-status' }, [
        el('span', { text: t('platformAdmin.field.readiness') }),
        status(item.readiness.state),
        el('span', { text: t(
          item.entitlements.enabledCount === 1
            ? 'platformAdmin.readiness.enabledEntitlementsOne'
            : 'platformAdmin.readiness.enabledEntitlementsMany',
          { count: formatNumber(item.entitlements.enabledCount) },
        ) }),
      ]),
      el('p', { className: 'platform-admin-data-note', text: t(
        item.readiness.checks.length === 1
          ? 'platformAdmin.readiness.checkCountOne'
          : 'platformAdmin.readiness.checkCountMany',
        { count: formatNumber(item.readiness.checks.length) },
      ) }),
      ...(item.readiness.blockerCodes.length
        ? [platformHeading('warning', t('platformAdmin.readiness.blockers'), 'h4'), blockers]
        : [el('p', { className: 'platform-admin-empty', text: t('platformAdmin.readiness.noBlockers') })]),
    ]));
  });
  return el('section', {}, [
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.fleet.evaluatedAt', { time: formatDateTime(resource.data.snapshotAt) }) }),
    ...(resource.data.items.length ? [list] : [el('p', { className: 'card platform-admin-empty', text: t('platformAdmin.resource.empty') })]),
    nextControl(resource, onLoadMore),
  ].filter(Boolean));
}

function microsoftHealth(resource, onSelectTenant, onLoadMore) {
  const list = el('ul', { className: 'platform-admin-record-list' });
  resource.data.items.forEach((item) => {
    const capabilities = el('ul', { className: 'platform-admin-detail-list' });
    item.capabilities.forEach((entry) => capabilities.append(el('li', {}, [
      dataCode(entry.capability),
      status(entry.status),
      el('span', { text: t('platformAdmin.integration.incidentScope', { scope: entry.incidentScope }) }),
    ])));
    list.append(el('li', { className: 'card platform-admin-record' }, [
      heading(item, onSelectTenant),
      el('div', { className: 'platform-admin-inline-status' }, [
        el('span', { text: t('platformAdmin.integration.connection') }),
        status(item.connectionState),
        el('span', { text: mappingSummary(item.mappings) }),
      ]),
      capabilities,
    ]));
  });
  return el('section', {}, [
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.fleet.evaluatedAt', { time: formatDateTime(resource.data.snapshotAt) }) }),
    ...(resource.data.items.length ? [list] : [el('p', { className: 'card platform-admin-empty', text: t('platformAdmin.resource.empty') })]),
    nextControl(resource, onLoadMore),
  ].filter(Boolean));
}

function audit(resource, onLoadMore,onExportAudit) {
  const list = el('ol', { className: 'platform-admin-audit-list' });
  const query = el('input', { type: 'search', attrs: { maxlength: '160', autocomplete: 'off' } });
  const resultCount = el('p', { className: 'platform-admin-data-note', attrs: { role: 'status' } });
  const records = [];
  resource.data.items.forEach((event) => {
    const presentation = auditEventPresentation(event.action);
    const row = el('li', { className: 'card platform-admin-audit-row' }, [
      el('div', { className: 'platform-admin-record-heading' }, [
        el('p', { className: 'platform-admin-audit-action', text: t(presentation.messageKey) }),
        status(event.outcome),
      ]),
      el('time', { text: formatDateTime(event.occurredAt), attrs: { datetime: event.occurredAt } }),
      ...(event.targetTenantId ? [el('small', { text: t('platformAdmin.audit.tenantTarget', { tenantId: event.targetTenantId }) })] : []),
      el('details', { className: 'platform-admin-audit-event-details' }, [
        el('summary', { text: t('platformAdmin.audit.event.technicalDetails') }),
        el('p', { text: t('platformAdmin.audit.sequence', { sequence: formatNumber(event.sequence) }) }), dataCode(event.action),
      ]),
    ]);
    records.push({ row, text: [t(presentation.messageKey), event.action, event.targetTenantId ?? '', event.outcome, t(`platformAdmin.state.${event.outcome}`), formatDateTime(event.occurredAt)].join(' ').toLowerCase() });
    list.append(row);
  });
  function filterLoaded() {
    const needle = query.value.trim().toLowerCase();
    let shown = 0;
    records.forEach(({ row, text }) => { row.hidden = !text.includes(needle); if (!row.hidden) shown += 1; });
    resultCount.textContent = t('platformAdmin.audit.localCount', { shown: formatNumber(shown), loaded: formatNumber(records.length) });
  }
  query.addEventListener('input', filterLoaded); filterLoaded();
  const beforeSequence = resource.data.items.at(-1)?.sequence ?? null;
  const hasMore=resource.data.schemaVersion===2 ? resource.auditHasMore===true : resource.data.items.length===100;
  const next = beforeSequence && hasMore && typeof onLoadMore === 'function'
    ? nextControl({ data: { nextCursor: beforeSequence } }, onLoadMore)
    : null;
  const verification=[];
  if (resource.data.schemaVersion===2) {
    verification.push(el('p',{ className: 'platform-admin-data-note',text: t('platformAdmin.segmentAudit.verified') }),
      el('p',{ className: 'platform-admin-data-note',text: t('platformAdmin.segmentAudit.legacy',{
        count: formatNumber(resource.data.audit.legacy.eventCount) }) }));
    if (typeof onExportAudit==='function') {
      const control=button(t('platformAdmin.segmentAudit.export'),{ className: 'secondary' }),
        feedback=el('p',{ attrs: { role: 'status' } });
      control.addEventListener('click',async()=>{
        if (control.disabled) return;control.disabled=true;feedback.textContent='';
        try { await onExportAudit();feedback.textContent=t('platformAdmin.segmentAudit.exported'); }
        catch (error) { feedback.textContent=t(
          ['PLATFORM_PASSKEY_OPERATION_CANCELLED','PLATFORM_MICROSOFT_OPERATION_CANCELLED'].includes(error?.code)
            ? 'platformAdmin.passkey.error.cancelled' : 'platformAdmin.passkey.error.failed'); }
        finally { control.disabled=false;if (control.isConnected && document.activeElement===document.body) control.focus(); }
      });
      verification.push(el('p',{ text: t('platformAdmin.segmentAudit.description') }),control,feedback);
    }
  }
  return el('section', {}, [
    ...verification,
    field({ id: 'platformAdminAuditLocalSearch', label: t('platformAdmin.audit.localSearch'), control: query, hint: t('platformAdmin.audit.localScope') }), resultCount,
    ...(resource.data.items.length ? [list] : [el('p', { className: 'card platform-admin-empty', text: t('platformAdmin.audit.empty') })]),
    next,
  ].filter(Boolean));
}


function runtime(resource) {
  if (!resource.data.deployments.length) return el('p', { className: 'card platform-admin-empty', text: t('platformAdmin.resource.empty') });
  return el('section', { className: 'platform-admin-record-list' }, resource.data.deployments.map(renderRuntimeObservation));
}

export function renderPlatformFleetView({ view, resource, onRetry, onSelectTenant, onLoadMore,onExportAudit }) {
  if (!resource || resource.status === 'loading') return loading();
  if (resource.status === 'error') return failed(onRetry);
  if (view === 'readiness') return readiness(resource, onSelectTenant, onLoadMore);
  if (view === 'integration-health') return microsoftHealth(resource, onSelectTenant, onLoadMore);
  if (view === 'platform-audit') return audit(resource, onLoadMore,onExportAudit);
  return runtime(resource);
}
