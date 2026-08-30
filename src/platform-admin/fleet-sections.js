import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { button, el } from '../core/ui.js';

export const PLATFORM_FLEET_VIEW_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'directory', permission: 'platform:tenant:read', titleKey: 'platformAdmin.fleetView.directory' }),
  Object.freeze({ id: 'readiness', permission: 'platform:readiness:read', titleKey: 'platformAdmin.fleetView.readiness' }),
  Object.freeze({ id: 'integration-health', permission: 'platform:integration-health:read', titleKey: 'platformAdmin.fleetView.integrationHealth' }),
  Object.freeze({ id: 'platform-audit', permission: 'platform:audit:read', titleKey: 'platformAdmin.fleetView.audit' }),
  Object.freeze({ id: 'runtime-status', permission: 'platform:runtime:read', titleKey: 'platformAdmin.fleetView.runtime' }),
]);

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

function heading(item, onSelectTenant) {
  const content = [
    el('div', {}, [el('h3', { text: item.displayName }), el('small', { text: item.tenantId })]),
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
    item.readiness.blockerCodes.forEach((entry) => blockers.append(el('li', {}, [dataCode(entry)])));
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
      ...(item.readiness.blockerCodes.length ? [blockers] : [el('p', { className: 'platform-admin-empty', text: t('platformAdmin.readiness.noBlockers') })]),
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
        el('span', { text: t('platformAdmin.integration.mappingSummary', {
          active: formatNumber(item.mappings.active),
          total: formatNumber(item.mappings.total),
        }) }),
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

function audit(resource, onLoadMore) {
  const list = el('ol', { className: 'platform-admin-audit-list' });
  resource.data.items.forEach((event) => list.append(el('li', { className: 'card' }, [
    el('div', { className: 'platform-admin-record-heading' }, [
      dataCode(event.action),
      status(event.outcome),
    ]),
    el('p', { text: formatDateTime(event.occurredAt) }),
    el('small', { text: t('platformAdmin.audit.sequence', { sequence: formatNumber(event.sequence) }) }),
    ...(event.targetTenantId ? [el('small', { text: t('platformAdmin.audit.tenantTarget', { tenantId: event.targetTenantId }) })] : []),
  ])));
  const beforeSequence = resource.data.items.at(-1)?.sequence ?? null;
  const next = beforeSequence && resource.data.items.length === 100 && typeof onLoadMore === 'function'
    ? nextControl({ data: { nextCursor: beforeSequence } }, onLoadMore)
    : null;
  return el('section', {}, [
    ...(resource.data.items.length ? [list] : [el('p', { className: 'card platform-admin-empty', text: t('platformAdmin.audit.empty') })]),
    next,
  ].filter(Boolean));
}

function runtimeCard(item) {
  const reference = item.deployment.reference || t('common.unknown');
  return el('article', { className: 'card platform-admin-record' }, [
    el('div', { className: 'platform-admin-record-heading' }, [
      el('div', {}, [el('h3', { text: reference }), el('small', { text: item.environment })]),
      status(item.overallState),
    ]),
    el('dl', { className: 'platform-admin-definition-list' }, [
      el('div', {}, [el('dt', { text: t('platformAdmin.runtime.frontendVersion') }), el('dd', { text: item.components.frontend.version || t('common.unknown') })]),
      el('div', {}, [el('dt', { text: t('platformAdmin.runtime.apiVersion') }), el('dd', { text: item.components.api.version || t('common.unknown') })]),
      el('div', {}, [el('dt', { text: t('platformAdmin.runtime.schemaVersion') }), el('dd', { text: item.databaseSchema.currentVersion === null ? t('common.unknown') : formatNumber(item.databaseSchema.currentVersion) })]),
      el('div', {}, [el('dt', { text: t('platformAdmin.runtime.freshness') }), el('dd', {}, [status(item.freshness.state)])]),
    ]),
    ...(item.reasonCodes.length ? [el('p', { className: 'platform-admin-data-note' }, item.reasonCodes.map(dataCode))] : []),
  ]);
}

function runtime(resource) {
  if (!resource.data.deployments.length) return el('p', { className: 'card platform-admin-empty', text: t('platformAdmin.resource.empty') });
  return el('section', { className: 'platform-admin-record-list' }, resource.data.deployments.map(runtimeCard));
}

export function renderPlatformFleetView({ view, resource, onRetry, onSelectTenant, onLoadMore }) {
  if (!resource || resource.status === 'loading') return loading();
  if (resource.status === 'error') return failed(onRetry);
  if (view === 'readiness') return readiness(resource, onSelectTenant, onLoadMore);
  if (view === 'integration-health') return microsoftHealth(resource, onSelectTenant, onLoadMore);
  if (view === 'platform-audit') return audit(resource, onLoadMore);
  return runtime(resource);
}
