import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { button, el } from '../core/ui.js';
import { pavurelFunctionalIcon } from '../core/pavurel-functional-icon.js';
import { readinessBlockerPresentation } from './readiness-blockers.js';
import { auditEventPresentation } from './audit-event-presentation.js';

const ONBOARDING_STEPS = Object.freeze(['not_started', 'invited', 'claim_pending', 'claimed', 'complete']);

function heading(icon, key) {
  return el('h3', { className: 'pavurel-icon-label' }, [pavurelFunctionalIcon(icon), el('span', { text: t(key) })]);
}

function badge(value, namespace = 'state') {
  return el('span', { className: 'platform-admin-status', text: t(`platformAdmin.${namespace}.${value}`),
    dataset: { state: value, tone: ['active', 'ready', 'healthy', 'connected', 'complete', 'success'].includes(value)
      ? 'positive' : ['blocked', 'unavailable', 'failure', 'denied'].includes(value) ? 'critical' : 'neutral' } });
}

function row(key, value) {
  return el('div', {}, [el('dt', { text: t(key) }), el('dd', {}, [value instanceof Node ? value : String(value)])]);
}

function control(key, callback, primary = false) {
  if (typeof callback !== 'function') return null;
  const result = button(t(key), { className: primary ? 'primary' : 'secondary' });
  result.addEventListener('click', callback);
  return result;
}

export function renderCustomerDirectorySummary(tenant, summary) {
  return el('div', { className: 'platform-admin-customer-card-summary' }, [
    el('dl', { className: 'platform-admin-customer-statuses' }, [
      row('platformAdmin.field.identity', badge(tenant.identityState, 'identity')),
      row('platformAdmin.field.readiness', badge(summary.readiness?.state || 'unknown')),
      row('platformAdmin.field.integration', badge(summary.connectionState)),
    ]),
    el('div', { className: 'platform-admin-customer-next' }, [
      el('strong', { className: 'pavurel-icon-label' }, [pavurelFunctionalIcon('calendar'), el('span', { text: t('platformAdmin.workbench.nextResponsibility') })]),
      el('span', { text: t(summary.task.titleKey) }),
      el('small', { text: t(summary.task.ownerKey) }),
    ]),
  ]);
}

export function renderOnboardingProgress(tenant) {
  return el('section', { className: 'card platform-admin-onboarding-progress', dataset: { platformAdminOnboardingProgress: 'true' } }, [
    heading('settings', 'platformAdmin.workbench.onboarding'),
    el('ol', { className: 'platform-admin-onboarding-steps' }, ONBOARDING_STEPS.map(step => el('li', {
      ...(step === tenant.onboardingState ? { attrs: { 'aria-current': 'step' } } : {}),
      dataset: { state: step === tenant.onboardingState ? 'current' : 'other' },
    }, [el('span', { className: 'platform-admin-step-marker', attrs: { 'aria-hidden': 'true' } }),
      el('span', { text: t(`platformAdmin.onboarding.${step}`) })]))),
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.workbench.progressScope') }),
  ]);
}

export function renderCustomerOverview({ tenant, summary, onOpenSection, onOpenReadiness, onOpenIntegrations, onOpenAudit, operator }) {
  const customer = el('section', { className: 'card platform-admin-customer-facts' }, [
    heading('customers', 'platformAdmin.workbench.customer'),
    el('dl', { className: 'platform-admin-definition-list' }, [
      row('platformAdmin.workbench.name', tenant.displayName),
      row('platformAdmin.field.lifecycle', badge(tenant.lifecycleState)),
      row('platformAdmin.field.identity', badge(tenant.identityState, 'identity')),
      row('platformAdmin.field.invitation', badge(tenant.invitationState, 'invitation')),
    ]),
  ]);
  const task = summary.task;
  const destination = task.section === 'readiness' ? onOpenReadiness
    : task.section === 'entitlements' && !operator.permissions.includes('platform:entitlement:read') ? onOpenReadiness
      : () => onOpenSection(task.section);
  const taskControl = control('platformAdmin.workbench.openTask', destination, true);
  const reason = task.blocker ? readinessBlockerPresentation(task.blocker) : null;
  const next = el('section', { className: 'card platform-admin-next-task', dataset: { platformAdminNextTask: 'true' } }, [
    heading('calendar', 'platformAdmin.workbench.nextTask'),
    el('h4', { text: t(task.titleKey) }), el('p', { text: t(task.ownerKey) }),
    ...(reason ? [el('p', { text: t(reason.messageKey, reason.checkKey ? { check: t(reason.checkKey) } : {}) })] : []),
    el('p', { text: t(task.descriptionKey) }), ...(taskControl ? [taskControl] : []),
  ]);
  const progress = renderOnboardingProgress(tenant);
  progress.append(control('platformAdmin.overview.openSetup', () => onOpenSection('lifecycle')));
  const readinessControls = [control('platformAdmin.workbench.openReadiness', onOpenReadiness),
    control('platformAdmin.workbench.openIntegrations', onOpenIntegrations)].filter(Boolean);
  const readiness = el('section', { className: 'card platform-admin-customer-readiness' }, [
    heading('info', 'platformAdmin.workbench.readiness'),
    el('dl', { className: 'platform-admin-definition-list' }, [
      row('platformAdmin.field.readiness', badge(summary.readiness?.state || 'unknown')),
      row('platformAdmin.field.integration', badge(summary.connectionState)),
    ]),
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.workbench.readinessObserved', {
      time: summary.readinessAt ? formatDateTime(summary.readinessAt) : t('common.unknown'),
    }) }),
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.workbench.integrationObserved', {
      time: summary.integrationAt ? formatDateTime(summary.integrationAt) : t('common.unknown'),
    }) }),
    ...(!summary.readiness ? [el('p', { text: t(summary.readinessAllowed
      ? 'platformAdmin.workbench.noReadiness' : 'platformAdmin.permission.readDenied') })] : []),
    ...(readinessControls.length ? [el('div', { className: 'button-row' }, readinessControls)] : []),
  ]);
  const usageControls = [
    operator.permissions.includes('platform:entitlement:read') ? control('platformAdmin.workbench.openFunctions', () => onOpenSection('entitlements')) : null,
    operator.permissions.includes('platform:metering:read') ? control('platformAdmin.workbench.openUsage', () => onOpenSection('metering')) : null,
  ].filter(Boolean);
  const usage = el('section', { className: 'card platform-admin-customer-usage' }, [
    heading('usage', 'platformAdmin.workbench.functionsUsage'), el('p', { text: t('platformAdmin.workbench.usageScope') }),
    ...(usageControls.length ? [el('div', { className: 'button-row' }, usageControls)] : [el('p', { text: t('platformAdmin.permission.readDenied') })]),
  ]);
  const auditItems = summary.audit?.data?.items || [];
  const events = auditItems.filter(event => event.targetTenantId === tenant.id).slice(0, 3);
  const activity = el('section', { className: 'card platform-admin-customer-activity' }, [
    heading('audit', 'platformAdmin.workbench.activities'),
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.workbench.auditScope', { count: formatNumber(auditItems.length) }) }),
  ]);
  if (events.length) activity.append(el('ol', { className: 'platform-admin-customer-events' }, events.map(event => el('li', {}, [
    el('strong', { text: t(auditEventPresentation(event.action).messageKey) }),
    el('time', { text: formatDateTime(event.occurredAt), attrs: { datetime: event.occurredAt } }), badge(event.outcome),
  ]))));
  else activity.append(el('p', { text: t(!summary.auditAllowed ? 'platformAdmin.permission.readDenied'
    : summary.audit?.status === 'ready' ? 'platformAdmin.workbench.noActivities' : 'platformAdmin.workbench.activitiesUnavailable') }));
  const auditControl = control('platformAdmin.workbench.openAudit', onOpenAudit);
  if (auditControl) activity.append(auditControl);
  const technical = el('details', { className: 'platform-admin-workbench-technical' }, [
    el('summary', { text: t('platformAdmin.workbench.technical') }),
    el('dl', { className: 'platform-admin-definition-list' }, [
      row('platformAdmin.workbench.customerId', tenant.reference || tenant.id),
      row('platformAdmin.field.version', formatNumber(tenant.version)),
      row('platformAdmin.field.checkedAt', formatDateTime(tenant.updatedAt)),
    ]),
    el('p', { text: t('platformAdmin.overview.stateMeaning') }),
  ]);
  return el('div', { className: 'platform-admin-customer-workbench' }, [customer, next, progress, readiness, usage, activity, technical]);
}
