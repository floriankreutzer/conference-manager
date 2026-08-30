import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { button, el, field } from '../core/ui.js';
import {
  platformActionNeedsStepUp,
  shouldPresentPlatformAction,
  shouldPresentPlatformPermission,
} from './contracts.js';
import { PLATFORM_RECOVERY_DEFINITIONS } from './resource-contracts.js';

export const PLATFORM_ADMIN_SECTION_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'overview', titleKey: 'platformAdmin.section.overview.title', descriptionKey: 'platformAdmin.section.overview.description' }),
  Object.freeze({ id: 'lifecycle', titleKey: 'platformAdmin.section.lifecycle.title', descriptionKey: 'platformAdmin.section.lifecycle.description' }),
  Object.freeze({ id: 'entitlements', titleKey: 'platformAdmin.section.entitlements.title', descriptionKey: 'platformAdmin.section.entitlements.description' }),
  Object.freeze({ id: 'diagnostics', titleKey: 'platformAdmin.section.diagnostics.title', descriptionKey: 'platformAdmin.section.diagnostics.description' }),
  Object.freeze({ id: 'recovery', titleKey: 'platformAdmin.section.recovery.title', descriptionKey: 'platformAdmin.section.recovery.description' }),
  Object.freeze({ id: 'metering', titleKey: 'platformAdmin.section.metering.title', descriptionKey: 'platformAdmin.section.metering.description' }),
  Object.freeze({ id: 'runtime-status', titleKey: 'platformAdmin.section.runtime.title', descriptionKey: 'platformAdmin.section.runtime.description' }),
]);

const LIFECYCLE_ACTIONS = Object.freeze([
  'invitation_revoke', 'invitation_reissue', 'mark_ready', 'activate', 'suspend', 'reactivate', 'archive',
]);

function tone(value) {
  if (['ready', 'active', 'healthy', 'clear', 'enabled', 'current', 'succeeded', 'success', 'complete', 'fresh', 'configured'].includes(value)) return 'positive';
  if (['blocked', 'unavailable', 'incident', 'exceeded', 'migration_required', 'failed', 'failure', 'revoked', 'not_ready', 'mismatch'].includes(value)) return 'critical';
  return 'neutral';
}

function state(value, namespace = 'state') {
  return el('span', {
    className: 'platform-admin-status',
    text: t(`platformAdmin.${namespace}.${value}`),
    dataset: { tone: tone(value), state: value },
  });
}

function dataCode(value) {
  return el('code', { className: 'platform-admin-data-code', text: String(value) });
}

function definitionList(rows) {
  const list = el('dl', { className: 'platform-admin-definition-list' });
  rows.forEach(({ label, value }) => list.append(el('div', {}, [
    el('dt', { text: label }),
    el('dd', {}, [value instanceof Node ? value : String(value)]),
  ])));
  return list;
}

function actionPanel(tenant, operator, actions, onAction, onStepUp) {
  const available = actions.filter((action) => tenant.allowedActions.includes(action));
  const executable = available.filter((action) => shouldPresentPlatformAction(operator, tenant, action));
  const needsStepUp = available.some((action) => platformActionNeedsStepUp(operator, tenant, action));
  const panel = el('section', {
    className: 'card platform-admin-action-panel',
    attrs: { 'aria-labelledby': 'platformAdminActionsTitle' },
  }, [
    el('h3', { id: 'platformAdminActionsTitle', text: t('platformAdmin.actions.title') }),
    el('p', { text: t('platformAdmin.actions.serverAuthority') }),
  ]);
  if (!available.length) {
    panel.append(el('p', { className: 'platform-admin-empty', text: t('platformAdmin.actions.none') }));
    return panel;
  }
  if (!executable.length) {
    if (needsStepUp && typeof onStepUp === 'function') {
      const stepUp = button(t('platformAdmin.actions.stepUp'), { className: 'secondary' });
      stepUp.addEventListener('click', onStepUp);
      panel.append(
        el('p', { className: 'platform-admin-empty', text: t('platformAdmin.actions.stepUpRequired') }),
        el('div', { className: 'button-row' }, [stepUp]),
      );
    } else {
      panel.append(el('p', { className: 'platform-admin-empty', text: t('platformAdmin.actions.notAuthorized') }));
    }
    return panel;
  }
  const controls = el('div', { className: 'button-row' });
  executable.forEach((action) => {
    const control = button(t(`platformAdmin.action.${action}`), {
      className: ['archive', 'suspend', 'invitation_revoke'].includes(action) ? 'danger' : 'secondary',
      dataset: { platformAction: action },
    });
    control.addEventListener('click', () => onAction(action));
    controls.appendChild(control);
  });
  panel.appendChild(controls);
  return panel;
}

function overview(tenant) {
  return el('div', { className: 'platform-admin-metric-grid' }, [
    el('article', { className: 'card platform-admin-metric' }, [el('h3', { text: t('platformAdmin.field.lifecycle') }), state(tenant.lifecycleState)]),
    el('article', { className: 'card platform-admin-metric' }, [el('h3', { text: t('platformAdmin.field.onboarding') }), state(tenant.onboardingState, 'onboarding')]),
    el('article', { className: 'card platform-admin-metric' }, [el('h3', { text: t('platformAdmin.field.identity') }), state(tenant.identityState, 'identity')]),
    el('article', { className: 'card platform-admin-metric' }, [el('h3', { text: t('platformAdmin.field.version') }), el('strong', { text: formatNumber(tenant.version) })]),
  ]);
}

function lifecycle(tenant, operator, onAction, onStepUp) {
  return el('div', {}, [
    el('section', { className: 'card' }, [definitionList([
      { label: t('platformAdmin.field.lifecycle'), value: state(tenant.lifecycleState) },
      { label: t('platformAdmin.field.onboarding'), value: state(tenant.onboardingState, 'onboarding') },
      { label: t('platformAdmin.field.identity'), value: state(tenant.identityState, 'identity') },
      { label: t('platformAdmin.field.invitation'), value: state(tenant.invitationState, 'invitation') },
      { label: t('platformAdmin.field.version'), value: formatNumber(tenant.version) },
    ])]),
    actionPanel(tenant, operator, LIFECYCLE_ACTIONS, onAction, onStepUp),
  ]);
}

function denied() {
  return el('section', { className: 'card' }, [el('p', { className: 'platform-admin-empty', text: t('platformAdmin.permission.readDenied') })]);
}

function resourcePanel(resource, onRetry) {
  if (!resource || resource.status === 'loading') {
    return el('section', { className: 'card', attrs: { role: 'status' } }, [
      el('h3', { text: t('platformAdmin.resource.loadingTitle') }),
      el('p', { text: t('platformAdmin.resource.loadingText') }),
    ]);
  }
  if (resource.status === 'error') {
    const retry = button(t('platformAdmin.load.retry'), { className: 'primary' });
    retry.addEventListener('click', onRetry);
    return el('section', { className: 'card platform-admin-error', attrs: { role: 'alert' } }, [
      el('h3', { text: t('platformAdmin.resource.errorTitle') }),
      el('p', { text: t('platformAdmin.resource.errorText') }),
      el('div', { className: 'button-row' }, [retry]),
    ]);
  }
  return null;
}

function previewPanel(preview, onApply) {
  if (!preview) return null;
  const panel = el('section', { className: 'card platform-admin-preview', attrs: { 'aria-labelledby': 'platformAdminEntitlementPreviewTitle' } }, [
    el('h3', { id: 'platformAdminEntitlementPreviewTitle', text: t('platformAdmin.entitlements.previewTitle') }),
    el('p', { text: preview.plan.changed ? t('platformAdmin.entitlements.previewChanged') : t('platformAdmin.entitlements.previewUnchanged') }),
  ]);
  if (preview.plan.changes.length) {
    const changes = el('ul', { className: 'platform-admin-detail-list' });
    preview.plan.changes.forEach((change) => changes.append(el('li', {}, [
      dataCode(change.capabilityId), state(change.previousEnabled ? 'enabled' : 'disabled'),
      el('span', { text: t('platformAdmin.entitlements.changeArrow') }), state(change.enabled ? 'enabled' : 'disabled'),
    ])));
    const apply = button(t('platformAdmin.entitlements.apply'), {
      className: 'primary', dataset: { platformAdminApplyEntitlements: preview.source },
    });
    apply.addEventListener('click', () => onApply(preview));
    panel.append(changes, el('div', { className: 'button-row' }, [apply]));
  }
  return panel;
}

function entitlements({ operator, resource, onRetry, onEntitlementPreview, onPackagePreview, onEntitlementApply, onPackageApply, onStepUp }) {
  if (!operator.permissions.includes('platform:entitlement:read')) return denied();
  const pending = resourcePanel(resource, onRetry);
  if (pending) return pending;
  const { workspace, preview } = resource.data;
  const tenantState = workspace.entitlements.entitlements;
  const stateByCapability = new Map(tenantState.entries.map((entry) => [entry.capabilityId, entry]));
  const form = el('form', { className: 'card platform-admin-entitlement-form' }, [
    el('h3', { text: t('platformAdmin.entitlements.directTitle') }),
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.entitlements.revision', { revision: formatNumber(tenantState.revision) }) }),
  ]);
  const checkboxes = new Map();
  workspace.capabilities.items.forEach(({ capabilityId, dependencies }) => {
    const current = stateByCapability.get(capabilityId);
    const control = el('input', { type: 'checkbox' });
    control.checked = current.enabled;
    checkboxes.set(capabilityId, control);
    form.append(el('label', { className: 'platform-admin-entitlement-option' }, [
      control, el('span', {}, [dataCode(capabilityId)]),
      ...(dependencies.length ? [el('small', { text: t('platformAdmin.entitlements.dependencies', { dependencies: dependencies.join(', ') }) })] : []),
    ]));
  });
  const mayManage = operator.permissions.includes('platform:entitlement:manage');
  if (mayManage && shouldPresentPlatformPermission(operator, 'platform:entitlement:manage')) {
    const previewControl = button(t('platformAdmin.entitlements.preview'), { type: 'submit', className: 'secondary' });
    form.append(el('div', { className: 'button-row' }, [previewControl]));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const proposals = [...checkboxes].filter(([capabilityId, control]) => control.checked !== stateByCapability.get(capabilityId).enabled)
        .map(([capabilityId, control]) => ({ capabilityId, enabled: control.checked }));
      onEntitlementPreview(proposals);
    });
  } else if (mayManage && typeof onStepUp === 'function') {
    const stepUp = button(t('platformAdmin.actions.stepUp'), { className: 'secondary' });
    stepUp.addEventListener('click', onStepUp);
    form.append(el('p', { className: 'platform-admin-empty', text: t('platformAdmin.actions.stepUpRequired') }), el('div', { className: 'button-row' }, [stepUp]));
  } else {
    checkboxes.forEach((control) => { control.disabled = true; });
  }

  const packages = el('section', { className: 'platform-admin-record-list', attrs: { 'aria-labelledby': 'platformAdminPackagesTitle' } }, [
    el('h3', { id: 'platformAdminPackagesTitle', text: t('platformAdmin.entitlements.packagesTitle') }),
  ]);
  workspace.packages.items.forEach((packageValue) => {
    const previewPackage = button(t('platformAdmin.entitlements.previewPackage'), { className: 'secondary' });
    previewPackage.addEventListener('click', () => onPackagePreview(packageValue.packageId));
    packages.append(el('article', { className: 'card platform-admin-record' }, [
      el('div', { className: 'platform-admin-record-heading' }, [
        el('div', {}, [el('h4', { text: packageValue.name }), dataCode(packageValue.packageId)]), state(packageValue.status),
      ]),
      el('p', { text: packageValue.description }),
      el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.entitlements.packageRevision', { revision: formatNumber(packageValue.revision) }) }),
      el('div', { className: 'button-row' }, [previewPackage]),
    ]));
  });
  const previewElement = previewPanel(preview, preview?.source === 'package' ? onPackageApply : onEntitlementApply);
  return el('div', {}, [form, packages, previewElement].filter(Boolean));
}

function diagnostics({ operator, resource, onRetry, onCorrelationLookup, onStepUp }) {
  if (!operator.permissions.includes('platform:diagnostics:read')) return denied();
  const pending = resourcePanel(resource, onRetry);
  if (pending) return pending;
  const { summary } = resource.data.summary;
  const result = resource.data.correlation;
  const content = el('div', {}, [
    el('section', { className: 'card' }, [
      definitionList([
        { label: t('platformAdmin.field.lifecycle'), value: state(summary.tenant.lifecycleStatus) },
        { label: t('platformAdmin.field.readiness'), value: state(summary.readiness.state) },
        { label: t('platformAdmin.field.integration'), value: state(summary.microsoft.healthState) },
        { label: t('platformAdmin.diagnostics.enabledEntitlements'), value: formatNumber(summary.entitlements.enabledCount) },
        { label: t('platformAdmin.diagnostics.mappingSummary'), value: `${formatNumber(summary.mappings.active)} / ${formatNumber(summary.mappings.total)}` },
        { label: t('platformAdmin.diagnostics.deploymentRelease'), value: summary.deployment.release || t('platformAdmin.value.unknown') },
      ]),
      el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.diagnostics.dataNote') }),
    ]),
  ]);
  const mayLookup = operator.permissions.includes('platform:diagnostics:sensitive');
  if (mayLookup && shouldPresentPlatformPermission(operator, 'platform:diagnostics:sensitive')) {
    const correlationId = el('input', { type: 'text', attrs: { required: 'required', pattern: '[0-9a-fA-F-]{36}', maxlength: '36', autocomplete: 'off' } });
    const to = new Date();
    const from = new Date(to.getTime() - (24 * 60 * 60 * 1_000));
    const fromControl = el('input', { type: 'datetime-local', value: from.toISOString().slice(0, 16), attrs: { required: 'required' } });
    const toControl = el('input', { type: 'datetime-local', value: to.toISOString().slice(0, 16), attrs: { required: 'required' } });
    const submit = button(t('platformAdmin.diagnostics.lookup'), { type: 'submit', className: 'secondary' });
    const form = el('form', { className: 'card platform-admin-filter-form' }, [
      el('h3', { text: t('platformAdmin.diagnostics.lookupTitle') }),
      field({ id: 'platformAdminCorrelationId', label: t('platformAdmin.diagnostics.correlationId'), control: correlationId, required: true }),
      field({ id: 'platformAdminCorrelationFrom', label: t('platformAdmin.diagnostics.from'), control: fromControl, required: true }),
      field({ id: 'platformAdminCorrelationTo', label: t('platformAdmin.diagnostics.to'), control: toControl, required: true }),
      el('div', { className: 'button-row' }, [submit]),
    ]);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      onCorrelationLookup({ correlationId: correlationId.value.toLowerCase(), from: new Date(fromControl.value).toISOString(), to: new Date(toControl.value).toISOString() });
    });
    content.append(form);
  } else if (mayLookup && typeof onStepUp === 'function') {
    const stepUp = button(t('platformAdmin.actions.stepUp'), { className: 'secondary' });
    stepUp.addEventListener('click', onStepUp);
    content.append(el('section', { className: 'card' }, [el('p', { text: t('platformAdmin.actions.stepUpRequired') }), el('div', { className: 'button-row' }, [stepUp])]));
  }
  if (result) {
    const list = el('ol', { className: 'platform-admin-audit-list' });
    result.items.forEach((entry) => list.append(el('li', { className: 'card' }, [
      el('div', { className: 'platform-admin-record-heading' }, [dataCode(entry.action), state(entry.outcome)]),
      el('p', { text: formatDateTime(entry.occurredAt) }), el('small', {}, [dataCode(entry.category)]),
    ])));
    content.append(el('section', { attrs: { 'aria-labelledby': 'platformAdminCorrelationResultsTitle' } }, [
      el('h3', { id: 'platformAdminCorrelationResultsTitle', text: t('platformAdmin.diagnostics.results') }),
      ...(result.items.length ? [list] : [el('p', { className: 'card platform-admin-empty', text: t('platformAdmin.diagnostics.noResults') })]),
    ]));
  }
  return content;
}

function recovery({
  operator,
  resource,
  onRecoveryPreview,
  onRecoveryExecute,
  onRecoveryTargetsMore,
  onStepUp,
}) {
  const previews = resource?.data?.previews || {};
  const targets = resource?.data?.targets || {};
  const cards = el('div', { className: 'platform-admin-record-list' });
  PLATFORM_RECOVERY_DEFINITIONS.forEach((definition) => {
    const permission = definition.id.includes('session-revocation') ? 'platform:session:revoke' : 'platform:recovery:execute';
    if (!operator.permissions.includes(permission)) return;
    const preview = previews[definition.id];
    const targetPage = targets[definition.id];
    const target = definition.targetField ? el('select', { attrs: { required: 'required' } }) : null;
    if (target) {
      target.append(el('option', { value: '', text: t('platformAdmin.recovery.target.select') }));
      (targetPage?.items || []).forEach((item) => {
        const targetId = item[definition.targetField];
        target.append(el('option', {
          value: targetId,
          text: `${targetId} · ${item.eligible ? t('platformAdmin.state.ready') : t('platformAdmin.state.blocked')}`,
          attrs: item.eligible ? {} : { disabled: 'disabled' },
        }));
      });
    }
    const controls = el('div', { className: 'button-row' });
    if (shouldPresentPlatformPermission(operator, permission)) {
      const previewControl = button(t('platformAdmin.recovery.preview'), { className: 'secondary', dataset: { platformAdminRecoveryPreview: definition.id } });
      previewControl.addEventListener('click', () => {
        if (target && !target.reportValidity()) return;
        onRecoveryPreview(definition.id, target ? { [definition.targetField]: target.value.toLowerCase() } : {});
      });
      controls.append(previewControl);
      if (preview) {
        const execute = button(t('platformAdmin.recovery.execute'), { className: 'danger', dataset: { platformAdminRecoveryExecute: definition.id } });
        execute.addEventListener('click', () => onRecoveryExecute(definition.id, preview));
        controls.append(execute);
      }
    }
    const card = el('article', { className: 'card platform-admin-warning' }, [
      el('h3', { text: t(`platformAdmin.recovery.action.${definition.id}`) }),
      el('p', { text: t(`platformAdmin.recovery.effect.${definition.id}`) }),
      ...(target ? [field({ id: `platformAdminRecoveryTarget-${definition.id}`, label: t(`platformAdmin.recovery.target.${definition.targetField}`), control: target, required: true })] : []),
      controls,
    ]);
    if (targetPage?.nextCursor && typeof onRecoveryTargetsMore === 'function') {
      const more = button(t('platformAdmin.pagination.next'), { className: 'secondary' });
      more.addEventListener('click', () => onRecoveryTargetsMore(definition.id, targetPage.nextCursor));
      card.append(el('div', { className: 'button-row platform-admin-pagination' }, [more]));
    }
    if (preview) {
      const impacts = el('ul', { className: 'platform-admin-detail-list' });
      preview.impactCodes.forEach((entry) => impacts.append(el('li', {}, [dataCode(entry)])));
      card.append(el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.recovery.previewExpires', { time: formatDateTime(preview.expiresAt) }) }), impacts);
    }
    cards.append(card);
  });
  if (!cards.childElementCount) return denied();
  const needsStepUp = PLATFORM_RECOVERY_DEFINITIONS.some((definition) => {
    const permission = definition.id.includes('session-revocation') ? 'platform:session:revoke' : 'platform:recovery:execute';
    return operator.permissions.includes(permission) && !shouldPresentPlatformPermission(operator, permission);
  });
  if (needsStepUp && typeof onStepUp === 'function') {
    const stepUp = button(t('platformAdmin.actions.stepUp'), { className: 'secondary' });
    stepUp.addEventListener('click', onStepUp);
    cards.prepend(el('section', { className: 'card' }, [el('p', { text: t('platformAdmin.actions.stepUpRequired') }), el('div', { className: 'button-row' }, [stepUp])]));
  }
  return cards;
}

function metering({ operator, resource, onRetry, onQuotaSet, onStepUp }) {
  if (!operator.permissions.includes('platform:metering:read')) return denied();
  const pending = resourcePanel(resource, onRetry);
  if (pending) return pending;
  const usage = resource.data;
  const byQuota = new Map(usage.quotas.map((entry) => [entry.dimension, entry]));
  const list = el('div', { className: 'platform-admin-record-list' });
  usage.dimensions.forEach((dimension) => {
    const quota = byQuota.get(dimension.dimension);
    const controls = [];
    if (operator.permissions.includes('platform:quota:manage') && shouldPresentPlatformPermission(operator, 'platform:quota:manage') && quota.state !== 'unknown') {
      const edit = button(t('platformAdmin.metering.editQuota'), { className: 'secondary', dataset: { platformAdminQuota: dimension.dimension } });
      edit.addEventListener('click', () => onQuotaSet(quota));
      controls.push(edit);
    }
    list.append(el('article', { className: 'card platform-admin-record' }, [
      el('div', { className: 'platform-admin-record-heading' }, [dataCode(dimension.dimension), state(usage.dataState)]),
      el('strong', { text: dimension.value === null ? t('platformAdmin.value.unknown') : formatNumber(dimension.value) }),
      definitionList([
        { label: t('platformAdmin.metering.quotaState'), value: state(quota.state) },
        { label: t('platformAdmin.metering.softLimit'), value: quota.softLimit === null ? t('platformAdmin.value.none') : formatNumber(quota.softLimit) },
        { label: t('platformAdmin.metering.hardLimit'), value: quota.hardLimit === null ? t('platformAdmin.value.none') : formatNumber(quota.hardLimit) },
      ]),
      el('div', { className: 'button-row' }, controls),
    ]));
  });
  if (operator.permissions.includes('platform:quota:manage') && !shouldPresentPlatformPermission(operator, 'platform:quota:manage') && typeof onStepUp === 'function') {
    const stepUp = button(t('platformAdmin.actions.stepUp'), { className: 'secondary' });
    stepUp.addEventListener('click', onStepUp);
    list.prepend(el('section', { className: 'card' }, [el('p', { text: t('platformAdmin.actions.stepUpRequired') }), el('div', { className: 'button-row' }, [stepUp])]));
  }
  return el('div', {}, [el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.metering.period', { start: formatDateTime(usage.period.start), end: formatDateTime(usage.period.end) }) }), list]);
}

function runtimeStatus({ operator, resource, onRetry }) {
  if (!operator.permissions.includes('platform:runtime:read')) return denied();
  const pending = resourcePanel(resource, onRetry);
  if (pending) return pending;
  if (resource.data.correlationState === 'unknown') return el('p', { className: 'card platform-admin-empty', text: t('platformAdmin.runtime.unmapped') });
  const runtime = resource.data.runtime;
  const reasons = el('ul', { className: 'platform-admin-detail-list' });
  runtime.reasonCodes.forEach((entry) => reasons.append(el('li', {}, [dataCode(entry)])));
  return el('section', { className: 'card' }, [
    definitionList([
      { label: t('platformAdmin.field.runtime'), value: state(runtime.overallState) },
      { label: t('platformAdmin.runtime.environment'), value: runtime.environment },
      { label: t('platformAdmin.runtime.deployment'), value: runtime.deployment.reference || t('platformAdmin.value.unknown') },
      { label: t('platformAdmin.runtime.frontendVersion'), value: runtime.components.frontend.version || t('platformAdmin.value.unknown') },
      { label: t('platformAdmin.runtime.apiVersion'), value: runtime.components.api.version || t('platformAdmin.value.unknown') },
      { label: t('platformAdmin.runtime.schemaVersion'), value: runtime.databaseSchema.currentVersion === null ? t('platformAdmin.value.unknown') : formatNumber(runtime.databaseSchema.currentVersion) },
      { label: t('platformAdmin.runtime.freshness'), value: state(runtime.freshness.state) },
    ]),
    ...(runtime.reasonCodes.length ? [el('h3', { text: t('platformAdmin.runtime.reasons') }), reasons] : []),
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.runtime.dataNote') }),
  ]);
}

export function renderPlatformAdminTenantSection(options) {
  const { sectionId, tenant, operator, onAction, onStepUp } = options;
  if (sectionId === 'lifecycle') return lifecycle(tenant, operator, onAction, onStepUp);
  if (sectionId === 'entitlements') return entitlements(options);
  if (sectionId === 'diagnostics') return diagnostics(options);
  if (sectionId === 'recovery') return recovery(options);
  if (sectionId === 'metering') return metering(options);
  if (sectionId === 'runtime-status') return runtimeStatus(options);
  return overview(tenant);
}
