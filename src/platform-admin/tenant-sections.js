import { renderRuntimeObservation } from './runtime-observation.js';
import { microsoftSignInControl } from '../core/microsoft-sign-in-control.js';
import { pavurelFunctionalIcon } from '../core/pavurel-functional-icon.js';
import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { button, el, field } from '../core/ui.js';
import { formatProductionDateTimeInput, productionUtcInstant } from '../core/production-time.js';
import {
  platformActionNeedsStepUp,
  shouldPresentPlatformAction,
  shouldPresentPlatformPermission,
} from './contracts.js';
import { PLATFORM_RECOVERY_DEFINITIONS } from './resource-contracts.js';
import { renderCustomerOverview, renderOnboardingProgress } from './customer-workbench.js';

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

function platformHeading(iconName, text, attrs = {}) {
  return el('h3', { ...attrs, className: 'pavurel-icon-label' }, [
    pavurelFunctionalIcon(iconName),
    el('span', { text }),
  ]);
}

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

function actionPanel(tenant, operator, actions, onAction, onStepUp, operationProofAvailable) {
  const available = actions.filter((action) => tenant.allowedActions.includes(action));
  const executable = available.filter((action) => shouldPresentPlatformAction(operator, tenant, action, Date.now(), operationProofAvailable));
  const needsStepUp = available.some((action) => platformActionNeedsStepUp(operator, tenant, action, Date.now(), operationProofAvailable));
  const panel = el('section', {
    className: 'card platform-admin-action-panel',
    attrs: { 'aria-labelledby': 'platformAdminActionsTitle' },
  }, [
    el('h3', { id: 'platformAdminActionsTitle', text: t('platformAdmin.actions.title') }),
    el('p', { text: t('platformAdmin.actions.serverAuthority') }),
  ]);
  if (!available.length) {
    panel.append(el('p', { className: 'platform-admin-empty', text: t('platformAdmin.actions.none') }),
      el('p', { text: t('platformAdmin.actions.noneExplanation') }));
    return panel;
  }
  if (!executable.length) {
    if (needsStepUp && typeof onStepUp === 'function') {
      const stepUp = microsoftSignInControl({ label: t('platformAdmin.session.signIn') });
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

function lifecycle(tenant, operator, onAction, onStepUp, operationProofAvailable) {
  return el('div', { className: 'platform-admin-lifecycle-workspace' }, [
    renderOnboardingProgress(tenant),
    el('section', { className: 'card' }, [platformHeading('customers', t('platformAdmin.workbench.currentState')), definitionList([
      { label: t('platformAdmin.field.lifecycle'), value: state(tenant.lifecycleState) },
      { label: t('platformAdmin.field.onboarding'), value: state(tenant.onboardingState, 'onboarding') },
      { label: t('platformAdmin.field.identity'), value: state(tenant.identityState, 'identity') },
      { label: t('platformAdmin.field.invitation'), value: state(tenant.invitationState, 'invitation') },
      { label: t('platformAdmin.field.version'), value: formatNumber(tenant.version) },
    ]), el('p', { text: t('platformAdmin.overview.nextResponsibility') })]),
    actionPanel(tenant, operator, LIFECYCLE_ACTIONS, onAction, onStepUp, operationProofAvailable),
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
    el('h3', { id: 'platformAdminEntitlementPreviewTitle', text: t('platformAdmin.entitlements.previewTitle'), attrs: { tabindex: '-1' } }),
    el('p', { text: preview.plan.changed ? t('platformAdmin.entitlements.previewChanged') : t('platformAdmin.entitlements.previewUnchanged') }),
  ]);
  if (preview.plan.changes.length) {
    const changes = el('ul', { className: 'platform-admin-detail-list' });
    preview.plan.changes.forEach((change) => changes.append(el('li', {}, [
      el('strong', { text: capabilityName(change.capabilityId) }), state(change.previousEnabled ? 'enabled' : 'disabled'),
      el('span', { text: t('platformAdmin.entitlements.changeArrow') }), state(change.enabled ? 'enabled' : 'disabled'),
      el('details', {}, [el('summary', { text: t('platformAdmin.entitlements.technicalDetails') }), dataCode(change.capabilityId)]),
    ])));
    const apply = button(t('platformAdmin.entitlements.apply'), {
      className: 'primary', dataset: { platformAdminApplyEntitlements: preview.source },
    });
    apply.addEventListener('click', () => onApply(preview));
    panel.append(changes, el('div', { className: 'button-row' }, [apply]));
  }
  return panel;
}

function capabilityName(capabilityId) {
  return t(['microsoft.directory', 'microsoft.calendar', 'microsoft.calendar.write'].includes(capabilityId)
    ? `platformAdmin.entitlements.name.${capabilityId}` : 'platformAdmin.entitlements.name.unknown');
}

function entitlements({ operator, resource, onRetry, onEntitlementPreview, onPackagePreview, onEntitlementApply, onPackageApply, onStepUp, operationProofAvailable }) {
  if (!operator.permissions.includes('platform:entitlement:read')) return denied();
  const pending = resourcePanel(resource, onRetry);
  if (pending) return pending;
  const { workspace, preview, draft = [] } = resource.data;
  const tenantState = workspace.entitlements.entitlements;
  const stateByCapability = new Map(tenantState.entries.map((entry) => [entry.capabilityId, entry]));
  const draftByCapability = new Map(draft.map(entry => [entry.capabilityId, entry.enabled]));
  const form = el('form', { className: 'card platform-admin-entitlement-form' }, [
    platformHeading('settings', t('platformAdmin.entitlements.directTitle')),
    el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.entitlements.revision', { revision: formatNumber(tenantState.revision) }) }),
  ]);
  const checkboxes = new Map();
  const initialSelection = new Map();
  let busy = false;
  workspace.capabilities.items.forEach(({ capabilityId, dependencies }, index) => {
    const control = el('input', { id: `platformAdminEntitlement${index}`, type: 'checkbox' });
    control.checked = draftByCapability.get(capabilityId) ?? stateByCapability.get(capabilityId).enabled;
    checkboxes.set(capabilityId, control);
    initialSelection.set(capabilityId, control.checked);
    const details = el('details', { className: 'platform-admin-blocker-details' }, [
      el('summary', { text: t('platformAdmin.entitlements.technicalDetails') }), dataCode(capabilityId),
      ...dependencies.map(dependency => dataCode(dependency)),
    ]);
    form.append(el('div', { className: 'platform-admin-entitlement-option' }, [
      el('label', { attrs: { for: control.id } }, [control, el('strong', { text: capabilityName(capabilityId) })]),
      el('p', { className: 'platform-admin-data-note', text: dependencies.length
        ? t('platformAdmin.entitlements.dependencies', { dependencies: dependencies.map(capabilityName).join(', ') })
        : t('platformAdmin.entitlements.noDependencies') }), details,
    ]));
  });
  const feedback = el('p', { attrs: { role: 'status' } });
  const previewControl = button(t('platformAdmin.entitlements.preview'), { type: 'submit', className: 'secondary' });
  const packageControls = [];
  const mayPreview = shouldPresentPlatformPermission(operator, 'platform:entitlement:manage', Date.now(), operationProofAvailable);
  const previewElement = previewPanel(preview, preview?.source === 'package' ? onPackageApply : onEntitlementApply);
  const proposals = () => [...checkboxes].filter(([id, control]) => control.checked !== stateByCapability.get(id).enabled)
    .map(([capabilityId, control]) => ({ capabilityId, enabled: control.checked }));

  function updateControls() {
    checkboxes.forEach(control => { control.disabled = !mayPreview || busy; });
    previewControl.disabled = busy || !proposals().length;
    packageControls.forEach(control => { control.disabled = busy; });
    form.setAttribute('aria-busy', String(busy));
  }
  async function requestPreview(load, source) {
    if (busy || !mayPreview) return;
    busy = true; updateControls();
    if (previewElement) previewElement.hidden = true;
    feedback.setAttribute('role', 'status');
    feedback.textContent = t('platformAdmin.entitlements.previewLoading');
    try { await load(); }
    catch (error) {
      if (!form.isConnected) return;
      const cancelled = ['PLATFORM_MICROSOFT_OPERATION_CANCELLED', 'PLATFORM_PASSKEY_OPERATION_CANCELLED'].includes(error?.code);
      feedback.setAttribute('role', cancelled ? 'status' : 'alert');
      feedback.textContent = t(cancelled ? 'platformAdmin.passkey.error.cancelled' : 'platformAdmin.entitlements.previewFailed');
    } finally {
      busy = false;
      if (form.isConnected) {
        updateControls();
        if (document.activeElement === document.body) source.focus();
      }
    }
  }
  checkboxes.forEach(control => control.addEventListener('change', () => {
    feedback.setAttribute('role', 'status');
    feedback.textContent = t(proposals().length ? 'platformAdmin.entitlements.changesSelected' : 'platformAdmin.entitlements.noChanges');
    if (previewElement) previewElement.hidden = [...checkboxes].some(([id, input]) => input.checked !== initialSelection.get(id));
    updateControls();
  }));
  if (mayPreview) {
    feedback.textContent = t(proposals().length ? 'platformAdmin.entitlements.changesSelected' : 'platformAdmin.entitlements.noChanges');
    form.append(el('div', { className: 'button-row' }, [previewControl]));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const changes = proposals();
      if (changes.length) void requestPreview(() => onEntitlementPreview(changes), previewControl);
    });
  } else if (operator.permissions.includes('platform:entitlement:manage') && typeof onStepUp === 'function') {
    const stepUp = microsoftSignInControl({ label: t('platformAdmin.session.signIn') });
    stepUp.addEventListener('click', onStepUp);
    form.append(el('p', { className: 'platform-admin-empty', text: t('platformAdmin.actions.stepUpRequired') }), el('div', { className: 'button-row' }, [stepUp]));
  }
  form.append(feedback);
  const packages = el('section', { className: 'platform-admin-record-list', attrs: { 'aria-labelledby': 'platformAdminPackagesTitle' } }, [
    platformHeading('settings', t('platformAdmin.entitlements.packagesTitle'), { id: 'platformAdminPackagesTitle' }),
  ]);
  if (!workspace.packages.items.length) packages.append(el('p', { className: 'card platform-admin-empty', text: t('platformAdmin.entitlements.noPackages') }));
  workspace.packages.items.forEach(packageValue => {
    const card = el('article', { className: 'card platform-admin-record' }, [
      el('div', { className: 'platform-admin-record-heading' }, [
        el('h4', { text: packageValue.name }), state(packageValue.status),
      ]),
      el('p', { text: packageValue.description }),
      el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.entitlements.packageRevision', { revision: formatNumber(packageValue.revision) }) }),
      el('details', {}, [el('summary', { text: t('platformAdmin.entitlements.technicalDetails') }), dataCode(packageValue.packageId)]),
    ]);
    if (mayPreview && packageValue.status === 'active') {
      const control = button(t('platformAdmin.entitlements.previewPackage'), { className: 'secondary' });
      control.addEventListener('click', () => { void requestPreview(() => onPackagePreview(packageValue.packageId), control); });
      packageControls.push(control);
      card.append(el('div', { className: 'button-row' }, [control]));
    }
    packages.append(card);
  });
  updateControls();
  return el('div', { className: 'platform-admin-entitlements-workspace' }, [form, packages, previewElement].filter(Boolean));
}

function diagnostics({ operator, resource, onRetry, onCorrelationLookup, onStepUp, operationProofAvailable }) {
  if (!operator.permissions.includes('platform:diagnostics:read')) return denied();
  const pending = resourcePanel(resource, onRetry);
  if (pending) return pending;
  const { summary } = resource.data.summary;
  const result = resource.data.correlation;
  let resultsPanel = null;
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
  if (mayLookup && shouldPresentPlatformPermission(operator, 'platform:diagnostics:sensitive', Date.now(), operationProofAvailable)) {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const identifierPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
    const correlationId = el('input', { type: 'text', value: result?.lookupCorrelationId || '', attrs: {
      required: 'required', pattern: identifierPattern, maxlength: '36', autocomplete: 'off',
      'aria-describedby': 'platformAdminCorrelationHelp',
    } });
    const to = result ? new Date(result.to) : new Date();
    const from = result ? new Date(result.from) : new Date(to.getTime() - (24 * 60 * 60 * 1_000));
    const fromControl = el('input', { type: 'datetime-local', value: formatProductionDateTimeInput(from.toISOString(), timeZone),
      attrs: { required: 'required', 'aria-describedby': 'platformAdminCorrelationTimeZone' } });
    const toControl = el('input', { type: 'datetime-local', value: formatProductionDateTimeInput(to.toISOString(), timeZone),
      attrs: { required: 'required', 'aria-describedby': 'platformAdminCorrelationTimeZone' } });
    const submit = button(t('platformAdmin.diagnostics.lookup'), { type: 'submit', className: 'secondary' });
    const feedback = el('p', { attrs: { role: 'status' } });
    let busy = false;
    const form = el('form', { className: 'card platform-admin-filter-form' }, [
      el('div', { className: 'platform-admin-filter-introduction' }, [
        platformHeading('diagnostics', t('platformAdmin.diagnostics.lookupTitle')),
        el('p', { id: 'platformAdminCorrelationHelp', className: 'platform-admin-data-note', text: t('platformAdmin.diagnostics.correlationHelp') }),
        el('p', { id: 'platformAdminCorrelationTimeZone', className: 'platform-admin-data-note', text: t('platformAdmin.diagnostics.timeZone', { timeZone }) }),
      ]),
      field({ id: 'platformAdminCorrelationId', label: t('platformAdmin.diagnostics.correlationId'), control: correlationId, required: true }),
      field({ id: 'platformAdminCorrelationFrom', label: t('platformAdmin.diagnostics.from'), control: fromControl, required: true }),
      field({ id: 'platformAdminCorrelationTo', label: t('platformAdmin.diagnostics.to'), control: toControl, required: true }),
      el('div', { className: 'button-row' }, [submit]), feedback,
    ]);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      correlationId.setCustomValidity(new RegExp(`^(?:${identifierPattern})$`).test(correlationId.value)
        ? '' : t('platformAdmin.diagnostics.invalidIdentifier'));
      for (const control of [fromControl, toControl]) control.setCustomValidity('');
      if (!form.reportValidity()) return;
      const instants = [fromControl, toControl].map((control) => {
        const [date, time] = control.value.split('T');
        return productionUtcInstant(date, time, timeZone);
      });
      const invalid = instants.findIndex((instant) => instant === null);
      if (invalid !== -1) {
        const control = [fromControl, toControl][invalid];
        control.setCustomValidity(t('platformAdmin.diagnostics.invalidLocalTime'));
        control.reportValidity();
        return;
      }
      if (Date.parse(instants[0]) >= Date.parse(instants[1])) {
        toControl.setCustomValidity(t('platformAdmin.diagnostics.invalidRange'));
        toControl.reportValidity(); return;
      }
      busy = true;
      form.setAttribute('aria-busy', 'true');
      for (const control of [correlationId, fromControl, toControl, submit]) control.disabled = true;
      if (resultsPanel) resultsPanel.hidden = true;
      feedback.setAttribute('role', 'status');
      feedback.textContent = t('platformAdmin.diagnostics.searching');
      try {
        await onCorrelationLookup({ correlationId: correlationId.value.toLowerCase(), from: instants[0], to: instants[1] });
      } catch (error) {
        if (!form.isConnected) return;
        const cancelled = ['PLATFORM_MICROSOFT_OPERATION_CANCELLED', 'PLATFORM_PASSKEY_OPERATION_CANCELLED'].includes(error?.code);
        feedback.setAttribute('role', cancelled ? 'status' : 'alert');
        feedback.textContent = t(cancelled ? 'platformAdmin.passkey.error.cancelled' : 'platformAdmin.diagnostics.lookupFailed');
      } finally {
        busy = false;
        if (form.isConnected) {
          form.setAttribute('aria-busy', 'false');
          for (const control of [correlationId, fromControl, toControl, submit]) control.disabled = false;
          if (document.activeElement === document.body) submit.focus();
        }
      }
    });
    for (const control of [correlationId, fromControl, toControl]) control.addEventListener('input', () => {
      for (const input of [correlationId, fromControl, toControl]) input.setCustomValidity('');
      feedback.textContent = '';
      if (resultsPanel) resultsPanel.hidden = true;
    });
    correlationId.addEventListener('invalid', () => {
      correlationId.setCustomValidity(t('platformAdmin.diagnostics.invalidIdentifier'));
    });
    content.append(form);
  } else if (mayLookup && typeof onStepUp === 'function') {
    const stepUp = microsoftSignInControl({ label: t('platformAdmin.session.signIn') });
    stepUp.addEventListener('click', onStepUp);
    content.append(el('section', { className: 'card' }, [el('p', { text: t('platformAdmin.actions.stepUpRequired') }), el('div', { className: 'button-row' }, [stepUp])]));
  }
  if (result) {
    const list = el('ol', { className: 'platform-admin-audit-list' });
    result.items.forEach((entry) => list.append(el('li', { className: 'card' }, [
      el('div', { className: 'platform-admin-record-heading' }, [dataCode(entry.action), state(entry.outcome)]),
      el('p', { text: formatDateTime(entry.occurredAt) }), el('small', {}, [dataCode(entry.category)]),
    ])));
    resultsPanel = el('section', { attrs: { 'aria-labelledby': 'platformAdminCorrelationResultsTitle' } }, [
      platformHeading('search', t('platformAdmin.diagnostics.results'), { id: 'platformAdminCorrelationResultsTitle', attrs: { tabindex: '-1' } }),
      ...(result.items.length ? [list] : [el('p', { className: 'card platform-admin-empty', text: t('platformAdmin.diagnostics.noResults') })]),
    ]);
    content.append(resultsPanel);
  }
  return content;
}

function recovery({
  operator,
  resource,
  onRetry,
  onRecoveryPreview,
  onRecoveryExecute,
  onRecoveryTargetsLoad,
  onRecoveryTargetsMore,
  onStepUp,
  operationProofAvailable,
}) {
  const pending = resourcePanel(resource, onRetry);
  if (pending) return pending;
  const previews = resource?.data?.previews || {};
  const targets = resource?.data?.targets || {};
  const cards = el('div', { className: 'platform-admin-record-list' });
  let activeCard = null;
  const controlUpdaters = [];
  const refreshControls = () => controlUpdaters.forEach(update => update());
  PLATFORM_RECOVERY_DEFINITIONS.forEach((definition) => {
    const permission = definition.id.includes('session-revocation') ? 'platform:session:revoke' : 'platform:recovery:execute';
    if (!operator.permissions.includes(permission)) return;
    const preview = previews[definition.id];
    let targetPage = targets[definition.id];
    const eligibleTargets = new Set();
    const target = definition.targetField ? el('select', { attrs: { required: 'required' } }) : null;
    function fillTargetOptions() {
      if (!target) return;
      const selected = target.value || preview?.targetId;
      eligibleTargets.clear();
      target.replaceChildren();
      target.append(el('option', { value: '', text: t('platformAdmin.recovery.target.select') }));
      (targetPage?.items || []).forEach((item) => {
        const targetId = item[definition.targetField];
        if (item.eligible) eligibleTargets.add(targetId);
        target.append(el('option', {
          value: targetId,
          text: `${targetId} · ${item.eligible ? t('platformAdmin.state.ready') : t('platformAdmin.state.blocked')}`,
          attrs: item.eligible ? {} : { disabled: 'disabled' },
        }));
      });
      if (eligibleTargets.has(selected)) target.value = selected;
    }
    fillTargetOptions();
    const controls = el('div', { className: 'button-row' });
    const feedback = el('p', { attrs: { role: 'status' } });
    let busy = false;
    let previewControl = null;
    let executeControl = null;
    let loadControl = null;
    let moreControl = null;
    const targetNote = target ? el('p', { className: 'platform-admin-data-note' }) : null;
    function updateTargetPresentation() {
      if (targetNote) {
        targetNote.hidden = eligibleTargets.size > 0;
        targetNote.textContent = t(targetPage ? 'platformAdmin.recovery.noEligibleTarget'
          : typeof onRecoveryTargetsLoad === 'function' ? 'platformAdmin.recovery.targetsNotLoaded'
            : 'platformAdmin.recovery.targetsUnavailable');
      }
      if (loadControl) loadControl.textContent = t(targetPage
        ? 'platformAdmin.recovery.reloadTargets' : 'platformAdmin.recovery.loadTargets');
      if (moreControl) moreControl.hidden = !targetPage?.nextCursor;
    }
    function applyTargetPage(page) {
      if (!card.isConnected || !page) return;
      targetPage = page;
      fillTargetOptions();
      updateTargetPresentation();
    }
    function updateControls() {
      const blocked = activeCard !== null;
      for (const control of card.querySelectorAll('button, select')) control.disabled = blocked;
      if (previewControl && target) previewControl.disabled = blocked || !eligibleTargets.has(target.value);
      if (executeControl && target) executeControl.disabled = blocked || target.value !== preview.targetId;
      card.setAttribute('aria-busy', String(busy));
    }
    async function run(work, source, successKey = null) {
      if (activeCard) return;
      busy = true; activeCard = card; refreshControls();
      feedback.setAttribute('role', 'status');
      feedback.textContent = t('platformAdmin.recovery.loading');
      try {
        await work();
        if (card.isConnected) feedback.textContent = successKey ? t(successKey) : '';
      }
      catch (error) {
        if (!card.isConnected) return;
        const cancelled = ['PLATFORM_MICROSOFT_OPERATION_CANCELLED', 'PLATFORM_PASSKEY_OPERATION_CANCELLED'].includes(error?.code);
        feedback.setAttribute('role', cancelled ? 'status' : 'alert');
        feedback.textContent = t(cancelled ? 'platformAdmin.passkey.error.cancelled' : 'platformAdmin.recovery.failed');
      } finally {
        busy = false; activeCard = null;
        if (card.isConnected) {
          refreshControls();
          if (document.activeElement === document.body) (source.hidden ? loadControl || target || source : source).focus();
        }
      }
    }
    if (shouldPresentPlatformPermission(operator, permission, Date.now(), operationProofAvailable)) {
      if (target && typeof onRecoveryTargetsLoad === 'function') {
        loadControl = button('', { className: 'secondary', dataset: { platformAdminRecoveryTargetsLoad: definition.id } });
        loadControl.addEventListener('click', () => {
          void run(async () => applyTargetPage(await onRecoveryTargetsLoad(definition.id)), loadControl,
            'platformAdmin.recovery.targetsLoaded');
        });
        controls.append(loadControl);
      }
      previewControl = button(t('platformAdmin.recovery.preview'), { className: 'secondary', dataset: { platformAdminRecoveryPreview: definition.id } });
      previewControl.addEventListener('click', () => {
        if (target && !target.reportValidity()) return;
        void run(() => onRecoveryPreview(definition.id, target ? { [definition.targetField]: target.value.toLowerCase() } : {}), previewControl);
      });
      controls.append(previewControl);
      if (preview) {
        executeControl = button(t('platformAdmin.recovery.execute'), { className: 'danger', dataset: { platformAdminRecoveryExecute: definition.id } });
        executeControl.addEventListener('click', () => {
          if (!target || target.value === preview.targetId) onRecoveryExecute(definition.id, preview);
        });
        controls.append(executeControl);
      }
    }
    const card = el('article', { className: 'card platform-admin-warning' }, [
      platformHeading('recovery', t(`platformAdmin.recovery.action.${definition.id}`)),
      el('p', { text: t(`platformAdmin.recovery.effect.${definition.id}`) }),
      ...(target ? [field({ id: `platformAdminRecoveryTarget-${definition.id}`, label: t(`platformAdmin.recovery.target.${definition.targetField}`), control: target, required: true })] : []),
      ...(targetNote ? [targetNote] : []),
      el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.recovery.previewEffect') }),
      controls, feedback,
    ]);
    target?.addEventListener('change', updateControls);
    if (target && !targetPage && typeof onRecoveryTargetsLoad !== 'function' && typeof onRetry === 'function') {
      const retry = button(t('platformAdmin.load.retry'), { className: 'secondary' });
      retry.addEventListener('click', onRetry);
      card.append(retry);
    }
    if (target && typeof onRecoveryTargetsMore === 'function') {
      moreControl = button(t('platformAdmin.pagination.next'), {
        className: 'secondary', dataset: { platformAdminRecoveryTargetsMore: definition.id },
      });
      moreControl.addEventListener('click', () => {
        if (!targetPage?.nextCursor) return;
        void run(async () => applyTargetPage(await onRecoveryTargetsMore(definition.id, targetPage.nextCursor)), moreControl,
          'platformAdmin.recovery.targetsLoaded');
      });
      card.append(el('div', { className: 'button-row platform-admin-pagination' }, [moreControl]));
    }
    if (preview) {
      const impacts = el('ul', { className: 'platform-admin-detail-list' });
      preview.impactCodes.forEach((entry) => impacts.append(el('li', {}, [dataCode(entry)])));
      card.append(el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.recovery.previewExpires', { time: formatDateTime(preview.expiresAt) }) }), impacts);
    }
    controlUpdaters.push(updateControls);
    updateTargetPresentation();
    updateControls();
    cards.append(card);
  });
  if (!cards.childElementCount) return denied();
  const needsStepUp = PLATFORM_RECOVERY_DEFINITIONS.some((definition) => {
    const permission = definition.id.includes('session-revocation') ? 'platform:session:revoke' : 'platform:recovery:execute';
    return operator.permissions.includes(permission) && !shouldPresentPlatformPermission(operator, permission, Date.now(), operationProofAvailable);
  });
  if (needsStepUp && typeof onStepUp === 'function') {
    const stepUp = microsoftSignInControl({ label: t('platformAdmin.session.signIn') });
    stepUp.addEventListener('click', onStepUp);
    cards.prepend(el('section', { className: 'card' }, [el('p', { text: t('platformAdmin.actions.stepUpRequired') }), el('div', { className: 'button-row' }, [stepUp])]));
  }
  return cards;
}

function metering({ operator, resource, onRetry, onQuotaSet, onStepUp, operationProofAvailable }) {
  if (!operator.permissions.includes('platform:metering:read')) return denied();
  const pending = resourcePanel(resource, onRetry);
  if (pending) return pending;
  const usage = resource.data;
  const byQuota = new Map(usage.quotas.map((entry) => [entry.dimension, entry]));
  const list = el('div', { className: 'platform-admin-record-list' });
  usage.dimensions.forEach((dimension) => {
    const quota = byQuota.get(dimension.dimension);
    const controls = [];
    if (operator.permissions.includes('platform:quota:manage') && shouldPresentPlatformPermission(operator, 'platform:quota:manage', Date.now(), operationProofAvailable) && quota.state !== 'unknown') {
      const edit = button(t('platformAdmin.metering.editQuota'), { className: 'secondary', dataset: { platformAdminQuota: dimension.dimension } });
      edit.addEventListener('click', () => onQuotaSet(quota));
      controls.push(edit);
    }
    list.append(el('article', { className: 'card platform-admin-record' }, [
      el('div', { className: 'platform-admin-record-heading' }, [platformHeading('usage', t(`platformAdmin.metering.name.${dimension.dimension}`)), state(usage.dataState)]),
      el('p', { text: t(`platformAdmin.metering.meaning.${dimension.dimension}`) }),
      el('strong', { text: dimension.value === null ? t('platformAdmin.value.unknown') : formatNumber(dimension.value) }),
      definitionList([
        { label: t('platformAdmin.metering.quotaState'), value: state(quota.state) },
        { label: t('platformAdmin.metering.softLimit'), value: quota.state === 'unknown' ? t('platformAdmin.value.unknown') : quota.softLimit === null ? t('platformAdmin.value.none') : formatNumber(quota.softLimit) },
        { label: t('platformAdmin.metering.hardLimit'), value: quota.state === 'unknown' ? t('platformAdmin.value.unknown') : quota.hardLimit === null ? t('platformAdmin.value.none') : formatNumber(quota.hardLimit) },
      ]),
      el('details', {}, [el('summary', { text: t('platformAdmin.metering.technicalDetails') }), dataCode(dimension.dimension)]),
      el('div', { className: 'button-row' }, controls),
    ]));
  });
  if (operator.permissions.includes('platform:quota:manage') && !shouldPresentPlatformPermission(operator, 'platform:quota:manage', Date.now(), operationProofAvailable) && typeof onStepUp === 'function') {
    const stepUp = microsoftSignInControl({ label: t('platformAdmin.session.signIn') });
    stepUp.addEventListener('click', onStepUp);
    list.prepend(el('section', { className: 'card' }, [el('p', { text: t('platformAdmin.actions.stepUpRequired') }), el('div', { className: 'button-row' }, [stepUp])]));
  }
  const observedTime = value => value ? el('time', { text: formatDateTime(value), attrs: { datetime: value } }) : t('common.unknown');
  return el('div', { className: 'platform-admin-metering-workspace' }, [el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.metering.period', { start: formatDateTime(usage.period.start), end: formatDateTime(usage.period.end) }) }),
    el('section', { className: 'card', dataset: { meteringObservation: 'true' } }, [
      platformHeading('usage', t('platformAdmin.metering.observation')),
      definitionList([
        { label: t('platformAdmin.metering.dataState'), value: state(usage.dataState) },
        { label: t('platformAdmin.metering.measuredAt'), value: observedTime(usage.measuredAt) },
        { label: t('platformAdmin.metering.reconciledAt'), value: observedTime(usage.reconciledAt) },
      ]),
      ...(usage.dataState !== 'complete' ? [el('p', { className: 'platform-admin-data-note', text: t(`platformAdmin.metering.observation.${usage.dataState}`) })] : []),
    ]),
    el('details', { className: 'platform-admin-data-note', dataset: { meteringHelp: 'true' } }, [
      el('summary', { text: t('platformAdmin.metering.explanation') }),
      el('p', { text: t('platformAdmin.metering.counting') }), el('p', { text: t('platformAdmin.metering.limitEffect') }),
    ]), list]);
}

function runtimeStatus({ operator, resource, onRetry }) {
  if (!operator.permissions.includes('platform:runtime:read')) return denied();
  const pending = resourcePanel(resource, onRetry);
  if (pending) return pending;
  if (resource.data.correlationState === 'unknown') return el('p', { className: 'card platform-admin-empty', text: t('platformAdmin.runtime.unmapped') });
  return renderRuntimeObservation(resource.data.runtime);
}

export function renderPlatformAdminTenantSection(options) {
  const { sectionId, tenant, operator, onAction, onStepUp, operationProofAvailable } = options;
  if (sectionId === 'lifecycle') return lifecycle(tenant, operator, onAction, onStepUp, operationProofAvailable);
  if (sectionId === 'entitlements') return entitlements(options);
  if (sectionId === 'diagnostics') return diagnostics(options);
  if (sectionId === 'recovery') return recovery(options);
  if (sectionId === 'metering') return metering(options);
  if (sectionId === 'runtime-status') return runtimeStatus(options);
  return renderCustomerOverview(options);
}
