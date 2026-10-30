import { pavurelFunctionalIcon } from '../core/pavurel-functional-icon.js';
import { microsoftSignInControl } from '../core/microsoft-sign-in-control.js';
import {
  formatDateTime,
  language,
  setLanguage,
  t,
} from '../core/i18n.js';
import {
  announce,
  button,
  clear,
  el,
  field,
  openDialog,
  showToast,
} from '../core/ui.js';
import {
  PLATFORM_ADMIN_SECTIONS,
  normalizePlatformDirectoryQuery,
  shouldPresentPlatformPermission,
} from './contracts.js';
import {
  platformAdminFleetHash,
  platformAdminRouteFromHash,
  platformAdminTenantHash,
} from './route.js';
import {
  PLATFORM_ADMIN_SECTION_DEFINITIONS,
  renderPlatformAdminTenantSection,
} from './tenant-sections.js';
import {
  PLATFORM_FLEET_VIEW_DEFINITIONS,
  renderPlatformFleetView,
} from './fleet-sections.js';
import { platformRecoveryDefinition } from './resource-contracts.js';
import { renderProviderUsage } from './provider-usage.js';
import { renderProductDelivery } from './product-delivery.js';
import { createProductDeliveryCache } from './product-delivery-cache.js';
import { createProviderUsageFreshness } from './provider-usage-freshness.js';
import { downloadPlatformAuditExport } from './audit-export.js';
import { assertPlatformAuditContinuation } from './audit-page-continuation.js';
import { customerWorkbenchSummary } from './customer-workbench-model.js';
import { renderCustomerDirectorySummary } from './customer-workbench.js';

const LIFECYCLE_FILTERS = Object.freeze(['all', 'pending', 'onboarding', 'ready', 'active', 'suspended', 'archived']);
const HEALTH_FILTERS = Object.freeze(['all', 'healthy', 'degraded', 'unavailable', 'not_configured']);
const PROJECTION_REVALIDATION_MS = 5 * 60 * 1000;

function requiredNode(documentRef, id) {
  const node = documentRef.getElementById(id);
  if (!(node instanceof HTMLElement)) throw new TypeError(`PLATFORM_ADMIN_DOM_${id.toUpperCase()}_REQUIRED`);
  return node;
}

function selectedOption(value, keyPrefix, documentRef) {
  const option = documentRef.createElement('option');
  option.value = value;
  option.textContent = t(`${keyPrefix}.${value}`);
  return option;
}

function stateTone(value) {
  if (['ready', 'active', 'healthy'].includes(value)) return 'positive';
  if (['blocked', 'unavailable', 'archived'].includes(value)) return 'critical';
  return 'neutral';
}

function stateBadge(value) {
  return el('span', {
    className: 'platform-admin-status',
    text: t(`platformAdmin.state.${value}`),
    dataset: { tone: stateTone(value), state: value },
  });
}

function sessionGate(sessionState, signInPath) {
  const unavailable = sessionState === 'unavailable';
  const section = el('section', {
    className: 'card platform-admin-session-gate',
    attrs: { role: unavailable ? 'alert' : 'status' },
  }, [
    el('h2', { text: t(unavailable ? 'platformAdmin.session.unavailableTitle' : 'platformAdmin.session.signInTitle') }),
    el('p', { text: t(unavailable ? 'platformAdmin.session.unavailableText' : 'platformAdmin.session.signInText') }),
  ]);
  if (!unavailable && signInPath) {
    section.append(microsoftSignInControl({ href: signInPath, label: t('platformAdmin.session.signIn') }));
  }
  return section;
}

export function createPlatformAdminApplication({
  dataSource,
  operator = null,
  runtime = 'production',
  sessionState = 'authenticated',
  signInPath = null,
  renderSessionGate = null,
  renderSecurityControls = null,
  operationProofAvailable = false,
  customerInvitationPresentation = null,
  onSignOut = null,
  onStepUp = null,
  demoControls = null,
  providerUsage = null,
  productDelivery = null,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
} = {}) {
  if (typeof operationProofAvailable !== 'boolean' || (operationProofAvailable && runtime !== 'production')) {
    throw new TypeError('PLATFORM_ADMIN_OPERATION_PROOF_INVALID');
  }
  if (renderSecurityControls !== null && (runtime !== 'production' || typeof renderSecurityControls !== 'function')) {
    throw new TypeError('PLATFORM_ADMIN_SECURITY_CONTROLS_INVALID');
  }
  if (customerInvitationPresentation !== null && (runtime !== 'production'
    || ['beginRender','renderCreateControl','renderTenantPanel','clear']
      .some(method => typeof customerInvitationPresentation[method] !== 'function'))) {
    throw new TypeError('PLATFORM_ADMIN_CUSTOMER_INVITATION_PRESENTATION_INVALID');
  }
  if (renderSessionGate !== null && (runtime !== 'production' || typeof renderSessionGate !== 'function')) {
    throw new TypeError('PLATFORM_ADMIN_SESSION_GATE_INVALID');
  }
  if (!['production', 'demo'].includes(runtime)) throw new TypeError('PLATFORM_ADMIN_RUNTIME_INVALID');
  if (providerUsage !== null && typeof providerUsage.load !== 'function') {
    throw new TypeError('PLATFORM_ADMIN_PROVIDER_USAGE_INVALID');
  }
  if (productDelivery !== null && typeof productDelivery.load !== 'function') {
    throw new TypeError('PLATFORM_ADMIN_PRODUCT_DELIVERY_INVALID');
  }
  if (!['authenticated', 'unauthenticated', 'unavailable'].includes(sessionState)) {
    throw new TypeError('PLATFORM_ADMIN_SESSION_STATE_INVALID');
  }
  const requiredDataMethods = [
    'loadFleet', 'createTenant', 'runTenantAction', 'loadReadiness', 'loadMicrosoftHealth',
    'loadEntitlementWorkspace', 'previewEntitlements', 'previewPackage', 'applyEntitlements',
    'applyPackage', 'loadDiagnostics', 'lookupCorrelation', 'loadAudit', 'loadMetering',
    'setQuota', 'loadRuntimeDeployments', 'loadTenantRuntime', 'loadRecoveryTargets', 'previewRecovery',
    'executeRecovery',
  ];
  if (sessionState === 'authenticated' && (
    !dataSource || requiredDataMethods.some((method) => typeof dataSource[method] !== 'function')
  )) {
    throw new TypeError('PLATFORM_ADMIN_DATA_SOURCE_REQUIRED');
  }
  if (!documentRef || !windowRef) throw new TypeError('PLATFORM_ADMIN_BROWSER_REQUIRED');

  const nodes = Object.freeze({
    app: requiredNode(documentRef, 'app'),
    brandTitle: requiredNode(documentRef, 'brandTitle'),
    brandSubtitle: requiredNode(documentRef, 'brandSubtitle'),
    navigation: requiredNode(documentRef, 'primaryNavigation'),
    sidebarFooter: requiredNode(documentRef, 'sidebarFooter'),
    skipLink: requiredNode(documentRef, 'skipLink'),
    title: requiredNode(documentRef, 'viewTitle'),
    subtitle: requiredNode(documentRef, 'viewSubtitle'),
    runtimeNotice: requiredNode(documentRef, 'runtimeNotice'),
  });

  let currentOperator = operator;
  let fleet = null;
  let filters = normalizePlatformDirectoryQuery();
  let loading = sessionState === 'authenticated';
  let directoryLoadingMore = false;
  let loadError = false;
  let actionError = false;
  let fleetRequestGeneration = 0;
  let navigationGeneration = 0;
  let stopped = false;
  const dialogs = new Set();
  function openApplicationDialog(options) {
    const dialog = openDialog(options);
    dialogs.add(dialog);
    dialog.addEventListener('close', () => dialogs.delete(dialog), { once: true });
    return dialog;
  }
  const fleetResources = new Map();
  const fleetDestinations = new Map();
  const tenantResources = new Map();
  const projectionReadClocks = new Map();
  const projectionRefreshTimers = new Map();
  const providerFreshness = providerUsage ? createProviderUsageFreshness({
    setTimer: (callback, delay) => windowRef.setTimeout(callback, delay),
    clearTimer: (timer) => windowRef.clearTimeout(timer),
    monotonicNow: () => windowRef.performance.now(),
    onExpire(resource) {
      if (fleetResources.get('providers') !== resource || !providerViewIsVisible()) return;
      renderWithFocusHandoff();
      revalidateExpiredProjection('providers');
    },
  }) : null;
  const productCache = productDelivery ? createProductDeliveryCache({
    setTimer: (callback, delay) => windowRef.setTimeout(callback, delay),
    clearTimer: (timer) => windowRef.clearTimeout(timer),
    monotonicNow: () => windowRef.performance.now(),
    onExpire(resource) {
      if (fleetResources.get('product-delivery') !== resource) return;
      const selected = currentRoute().view === 'fleet' && currentFleetView() === 'product-delivery';
      const restoreTab = focusedInsightTab();
      fleetResources.delete('product-delivery');
      if (selected) {
        if (productViewIsVisible()) renderWithFocusHandoff();
        else render();
      }
      if (productViewIsVisible()) revalidateExpiredProjection('product-delivery', restoreTab);
    },
  }) : null;

  function productViewIsVisible() {
    return !stopped && productDelivery && sessionState === 'authenticated' && fleet
      && currentRoute().view === 'fleet' && currentFleetView() === 'product-delivery'
      && documentRef.visibilityState !== 'hidden';
  }

  function providerViewIsVisible() {
    return !stopped && providerUsage && sessionState === 'authenticated' && fleet
      && currentRoute().view === 'fleet' && currentFleetView() === 'providers'
      && documentRef.visibilityState !== 'hidden';
  }

  function projectionClock(view) {
    return view === 'providers' ? providerFreshness : view === 'product-delivery' ? productCache : null;
  }

  function projectionViewIsVisible(view) {
    return view === 'providers' ? providerViewIsVisible() : productViewIsVisible();
  }

  function projectionRevalidationDelay(view) {
    const completed = projectionReadClocks.get(view);
    if (!completed) return 0;
    const now = projectionClock(view).capture();
    const elapsed = Math.max(0, now.wall - completed.wall, now.monotonic - completed.monotonic);
    return Math.max(0, Math.ceil(PROJECTION_REVALIDATION_MS - elapsed));
  }

  function clearProjectionRefreshTimer(view) {
    const timer = projectionRefreshTimers.get(view);
    if (timer !== undefined) windowRef.clearTimeout(timer);
    projectionRefreshTimers.delete(view);
  }

  function revalidateExpiredProjection(view, restoreTab = null) {
    if (!projectionViewIsVisible(view) || fleetResources.get(view)?.status === 'loading') return;
    const delay = projectionRevalidationDelay(view);
    if (delay === 0) {
      void loadFleetResource(view, { restoreTab });
      return;
    }
    if (projectionRefreshTimers.has(view)) return;
    // One deferred expiry read, never periodic polling or a stale-response loop.
    const timer = windowRef.setTimeout(() => {
      if (projectionRefreshTimers.get(view) !== timer) return;
      projectionRefreshTimers.delete(view);
      if (projectionViewIsVisible(view)) void loadFleetResource(view, { restoreTab });
    }, delay);
    projectionRefreshTimers.set(view, timer);
  }

  function clearProjectionState() {
    fleetDestinations.clear();
    productCache?.forget();
    providerFreshness?.forget();
    for (const view of projectionRefreshTimers.keys()) clearProjectionRefreshTimer(view);
    projectionReadClocks.clear();
  }

  function revalidateProjectionClocks() {
    if (stopped) return;
    providerFreshness?.check();
    const provider = fleetResources.get('providers');
    if (providerViewIsVisible() && provider?.status === 'ready'
      && !providerFreshness.isReusable(provider)) renderWithFocusHandoff();
    productCache?.check();
    for (const view of ['providers', 'product-delivery']) {
      if (projectionViewIsVisible(view)) void loadFleetResource(view);
    }
  }


  function currentFleetView() {
    return currentRoute().fleetView || 'directory';
  }

  function selectInsightTab(view, tab) {
    if (stopped || currentRoute().view !== 'fleet' || currentFleetView() !== view) return;
    const hash = platformAdminFleetHash(view, tab);
    if (windowRef.location.hash !== hash) windowRef.history.pushState(null, '', hash);
    fleetDestinations.set(view, hash);
  }

  function currentRoute() {
    return platformAdminRouteFromHash(windowRef.location.hash);
  }

  function setHeading(title, subtitle) {
    const route = currentRoute();
    const iconName = route.view === 'tenant'
      ? ({ overview: 'dashboard', lifecycle: 'settings', entitlements: 'settings', diagnostics: 'diagnostics', recovery: 'recovery', metering: 'usage', 'runtime-status': 'system' })[route.section]
      : ({ directory: 'customers', readiness: 'info', 'integration-health': 'integrations', 'platform-audit': 'audit', 'runtime-status': 'system', providers: 'usage', 'product-delivery': 'delivery' })[currentFleetView()];
    if (iconName) {
      nodes.title.classList.add('pavurel-icon-label');
      nodes.title.replaceChildren(pavurelFunctionalIcon(iconName), el('span', { text: title }));
    } else {
      nodes.title.classList.remove('pavurel-icon-label');
      nodes.title.textContent = title;
    }
    nodes.subtitle.textContent = subtitle;
  }

  function focusHeading() {
    const focused = documentRef.activeElement;
    windowRef.requestAnimationFrame(() => {
      if (!stopped && (documentRef.activeElement === focused || documentRef.activeElement === documentRef.body)) {
        nodes.title.focus();
      }
    });
  }

  function focusedInsightTab() {
    const focused = documentRef.activeElement;
    const group = focused?.closest?.('[data-insights-tabs]');
    if (!nodes.app.contains(focused) || !focused?.dataset?.insightsTab || !group) return null;
    return { group: group.dataset.insightsTabs, tab: focused.dataset.insightsTab };
  }

  function renderWithFocusHandoff({ restoreTab = null } = {}) {
    const focused = documentRef.activeElement;
    const navigationKey = focused && nodes.navigation.contains(focused)
      ? ['platformAdminFleetView', 'platformAdminNavigate'].find((key) => focused.dataset?.[key]) : null;
    const navigationValue = navigationKey ? focused.dataset[navigationKey] : null;
    const tab = focusedInsightTab() || ((focused === nodes.title || focused === documentRef.body) ? restoreTab : null);
    render();
    if (navigationKey) {
      const replacement = [...nodes.navigation.querySelectorAll('button')]
        .find((control) => control.dataset[navigationKey] === navigationValue);
      if (replacement) { replacement.focus(); return; }
    }
    if (tab) {
      const replacement = [...nodes.app.querySelectorAll('[data-insights-tab]')].find((control) =>
        control.dataset.insightsTab === tab.tab
        && control.closest('[data-insights-tabs]')?.dataset.insightsTabs === tab.group);
      if (replacement) { replacement.focus(); return; }
    }
    if (focused && focused !== documentRef.body && focused.isConnected === false) focusHeading();
  }

  function clearRouteAnnouncements() {
    announce('');announce('',{ assertive: true });
  }

  function navigate(hash, { replace = false } = {}) {
    navigationGeneration += 1;
    clearRouteAnnouncements();
    if (windowRef.location.hash !== hash) {
      windowRef.history[replace ? 'replaceState' : 'pushState'](null, '', hash);
    }
    render();
    void ensureVisibleResource();
    focusHeading();
  }

  function renderRuntimeNotice() {
    clear(nodes.runtimeNotice);
    nodes.runtimeNotice.dataset.platformAdminRuntime = runtime;
    nodes.runtimeNotice.className = `platform-admin-runtime-notice ${runtime}`;
    nodes.runtimeNotice.setAttribute('role', runtime === 'demo' ? 'status' : 'note');
    nodes.runtimeNotice.append(
      el('strong', { text: t(`platformAdmin.runtimeNotice.${runtime}.title`) }),
      el('span', { text: t(`platformAdmin.runtimeNotice.${runtime}.text`) }),
    );
  }

  function renderFooter() {
    clear(nodes.sidebarFooter);
    if (currentOperator) {
      nodes.sidebarFooter.append(el('section', { className: 'platform-admin-operator' }, [
        el('strong', { text: t('platformAdmin.operator.identity') }),
        el('span', { text: new Intl.ListFormat(language(), { style: 'short', type: 'conjunction' })
          .format(currentOperator.roles.map(role => t(`platformAdmin.role.${role}`))) }),
        el('small', {
          text: t('platformAdmin.operator.assurance', {
            assurance: t(`platformAdmin.assurance.${currentOperator.assurance.level}`),
          }),
        }),
      ]));
    }

    const localeSelect = el('select', {
      className: 'platform-admin-sidebar-select',
      attrs: { 'aria-label': t('platformAdmin.language.label') },
    });
    ['de', 'en'].forEach((value) => localeSelect.append(selectedOption(value, 'platformAdmin.language', documentRef)));
    localeSelect.value = language();
    localeSelect.addEventListener('change', () => setLanguage(localeSelect.value));
    const preferences = el('section', { className: 'platform-admin-sidebar-group', attrs: { 'aria-labelledby': 'platformAdminPreferencesTitle' } }, [
      el('h2', { id: 'platformAdminPreferencesTitle', className: 'platform-admin-nav-heading', text: t('platformAdmin.workbench.preferences') }),
    ]);
    nodes.sidebarFooter.append(preferences);
    preferences.append(el('label', { className: 'platform-admin-sidebar-field' }, [
      el('span', { text: t('platformAdmin.language.label') }),
      localeSelect,
    ]));

    if (runtime === 'demo' && demoControls) {
      const roleSelect = el('select', {
        className: 'platform-admin-sidebar-select',
        attrs: { 'aria-label': t('platformAdmin.demo.roleLabel') },
      });
      demoControls.roleIds.forEach((roleId) => roleSelect.append(selectedOption(roleId, 'platformAdmin.demo.role', documentRef)));
      roleSelect.value = demoControls.currentRoleId();
      const reset = button(t('platformAdmin.demo.reset'), {
        className: 'platform-admin-reset',
        dataset: { platformAdminDemoReset: 'true' },
      });

      function disableDemoControls(disabled) {
        roleSelect.disabled = disabled;
        reset.disabled = disabled;
        nodes.sidebarFooter.setAttribute('aria-busy', String(disabled));
      }

      roleSelect.addEventListener('change', async () => {
        disableDemoControls(true);
        try {
          const nextOperator = await demoControls.setRole(roleSelect.value);
          if (!nextOperator) throw new TypeError('PLATFORM_ADMIN_DEMO_OPERATOR_REQUIRED');
          currentOperator = nextOperator;
          actionError = false;
          windowRef.history.replaceState(null, '', platformAdminFleetHash());
          clearProjectionState();
          fleetResources.clear();
          tenantResources.clear();
          await loadFleet();
          announce(t('platformAdmin.demo.roleChanged'));
        } catch {
          roleSelect.value = demoControls.currentRoleId();
          announce(t('platformAdmin.demo.roleChangeFailed'), { assertive: true });
          showToast(t('platformAdmin.demo.roleChangeFailed'));
        } finally {
          disableDemoControls(false);
        }
      });

      reset.addEventListener('click', () => {
        const cancel = button(t('common.cancel'), { className: 'secondary' });
        const confirm = button(t('platformAdmin.demo.resetConfirm'), { className: 'primary' });
        const dialog = openApplicationDialog({
          title: t('platformAdmin.demo.resetConfirmTitle'),
          description: t('platformAdmin.demo.resetConfirmText'),
          actions: [cancel, confirm],
          labelledById: 'platformAdminDemoResetDialogTitle',
        });
        cancel.addEventListener('click', () => dialog.close());
        confirm.addEventListener('click', async () => {
          cancel.disabled = true;
          confirm.disabled = true;
          confirm.textContent = t('platformAdmin.demo.resetRunning');
          disableDemoControls(true);
          try {
            const nextOperator = await demoControls.reset();
            if (!nextOperator) throw new TypeError('PLATFORM_ADMIN_DEMO_OPERATOR_REQUIRED');
            currentOperator = nextOperator;
            filters = normalizePlatformDirectoryQuery();
            windowRef.history.replaceState(null, '', platformAdminFleetHash());
            clearProjectionState();
            fleetResources.clear();
            tenantResources.clear();
            dialog.close();
            navigate(platformAdminFleetHash(), { replace: true });
            await loadFleet();
            announce(t('platformAdmin.demo.resetComplete'));
            showToast(t('platformAdmin.demo.resetComplete'));
          } catch {
            confirm.textContent = t('platformAdmin.demo.resetConfirm');
            cancel.disabled = false;
            confirm.disabled = false;
            announce(t('platformAdmin.demo.resetFailed'), { assertive: true });
            showToast(t('platformAdmin.demo.resetFailed'));
          } finally {
            disableDemoControls(false);
          }
        });
      });
      nodes.sidebarFooter.append(el('label', { className: 'platform-admin-sidebar-field' }, [
        el('span', { text: t('platformAdmin.demo.roleLabel') }),
        roleSelect,
      ]), reset);
    }

    const security = runtime === 'production' && currentOperator ? el('section', {
      className: 'platform-admin-sidebar-group', attrs: { 'aria-labelledby': 'platformAdminSecurityTitle' },
    }, [el('h2', { id: 'platformAdminSecurityTitle', className: 'platform-admin-nav-heading', text: t('platformAdmin.workbench.security') })]) : null;
    if (security) nodes.sidebarFooter.append(security);
    if (security && renderSecurityControls) security.append(renderSecurityControls());

    if (runtime === 'production' && typeof onSignOut === 'function' && currentOperator) {
      const signOut = button(t('platformAdmin.session.signOut'), { className: 'platform-admin-reset' });
      signOut.addEventListener('click', async () => {
        signOut.disabled = true;
        try {
          await onSignOut();
          windowRef.location.reload();
        } catch {
          signOut.disabled = false;
          announce(t('platformAdmin.session.signOutFailed'), { assertive: true });
        }
      });
      security.appendChild(signOut);
    }
  }

  function openTenantFromFleet(tenantId, section = 'overview') {
    const tenant = fleet?.tenants.find(({ id }) => id === tenantId);
    const destination = platformAdminTenantHash(tenantId, section);
    if (tenant && destination !== platformAdminFleetHash()) navigate(destination);
    else { announce(t('platformAdmin.navigation.tenantUnavailable'), { assertive: true }); showToast(t('platformAdmin.navigation.tenantUnavailable')); }
  }

  async function openWorkspaceTenant(tenantId) {
    const destination = platformAdminTenantHash(tenantId, 'lifecycle');
    if (stopped || runtime !== 'production' || sessionState !== 'authenticated' || !currentOperator
      || destination === platformAdminFleetHash()) return false;
    // An explicit workspace target needs a fresh directory projection, independent
    // of filters/cursors that preceded generation creation or replacement.
    filters = normalizePlatformDirectoryQuery();
    navigate(platformAdminFleetHash());
    const generation = navigationGeneration;
    await loadFleet();
    if (stopped || generation !== navigationGeneration || loadError) return false;
    if (!fleet?.tenants.some(tenant => tenant.id === tenantId)) {
      announce(t('platformAdmin.navigation.tenantUnavailable'), { assertive: true });
      showToast(t('platformAdmin.navigation.tenantUnavailable'));
      return false;
    }
    navigate(destination);
    return true;
  }

  async function loadFleetResource(view, { cursor = null, append = false, force = false, restoreTab = null, background = false } = {}) {
    if (stopped || view === 'directory') return;
    const existing = fleetResources.get(view);
    const observedClock = projectionClock(view);
    if (observedClock) {
      if (existing?.status === 'loading' || (!force && projectionRevalidationDelay(view) > 0)) return;
      clearProjectionRefreshTimer(view);
    } else if (!force && !cursor && (existing?.status === 'loading' || existing?.status === 'ready')) return;
    const priorTabFocus = focusedInsightTab() || restoreTab;
    if (view === 'product-delivery') productCache.forget();
    if (view === 'providers') providerFreshness.forget();
    const pending = { status: 'loading', data: append ? existing?.data : null };
    fleetResources.set(view, pending);
    if (!background) renderWithFocusHandoff();
    try {
      const requestClock = observedClock?.capture();
      let data;
      if (view === 'product-delivery') data = await productDelivery.load();
      else if (view === 'providers') data = await providerUsage.load();
      else if (view === 'readiness') data = await dataSource.loadReadiness({ limit: 50, cursor });
      else if (view === 'integration-health') data = await dataSource.loadMicrosoftHealth({ limit: 50, cursor });
      else if (view === 'platform-audit') data = await dataSource.loadAudit({ limit: 100, beforeSequence: cursor });
      else data = await dataSource.loadRuntimeDeployments();
      const auditHasMore=view==='platform-audit' && data.schemaVersion===2
        ? data.items.length===100 && data.items.at(-1).sequence>data.audit.legacy.eventCount+1 : null;
      if (append && existing?.data && Array.isArray(data.items)) {
        if (view === 'platform-audit') assertPlatformAuditContinuation(existing.data, data);
        data = Object.freeze({ ...data, items: Object.freeze([...existing.data.items, ...data.items]) });
      }
      if (fleetResources.get(view) !== pending) return;
      const completed = observedClock?.capture();
      if (completed) projectionReadClocks.set(view, completed);
      const ready = { status: 'ready', data,
        ...(auditHasMore===null ? {} : { auditHasMore }),
        ...(completed ? { loadedAt: new Date(completed.wall).toISOString(), requestClock } : {}) };
      if (view === 'product-delivery' && !productCache.retain(ready, requestClock)) {
        throw new TypeError('PLATFORM_PRODUCT_CACHE_EXPIRED');
      }
      if (view === 'providers') providerFreshness.retain(ready, requestClock);
      fleetResources.set(view, ready);
    } catch {
      if (fleetResources.get(view) !== pending) return;
      if (observedClock) projectionReadClocks.set(view, observedClock.capture());
      fleetResources.set(view, { status: 'error', data: null });
    }
    if (currentRoute().view === 'fleet' && currentFleetView() === view) {
      renderWithFocusHandoff({ restoreTab: priorTabFocus });
    }
  }

  async function loadCustomerSummaries() {
    const views = ['readiness', 'integration-health', 'platform-audit'];
    const allowed = availableFleetViews().map(view => view.id);
    await Promise.allSettled(views.filter(view => allowed.includes(view) && !fleetResources.has(view))
      .map(view => loadFleetResource(view, { background: true })));
  }

  async function tenantResourceData(tenant, sectionId) {
    if (['overview', 'lifecycle'].includes(sectionId)) return null;
    if (sectionId === 'entitlements') {
      return { workspace: await dataSource.loadEntitlementWorkspace(tenant.id), preview: null };
    }
    if (sectionId === 'diagnostics') {
      return { summary: await dataSource.loadDiagnostics(tenant.id), correlation: null };
    }
    if (sectionId === 'recovery') {
      return { previews: {}, targets: Object.freeze({}) };
    }
    if (sectionId === 'metering') {
      const now = new Date();
      const periodStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
      return dataSource.loadMetering(tenant.id, periodStart);
    }
    return dataSource.loadTenantRuntime(tenant.id);
  }

  function ensureTenantResource(tenant, sectionId) {
    const key = `${tenant.id}:${sectionId}`;
    if (tenantResources.has(key)) return;
    void reloadTenantResource(tenant, sectionId, { background: true });
  }

  async function reloadTenantResource(tenant, sectionId, { background = false } = {}) {
    if (stopped) return;
    const key = `${tenant.id}:${sectionId}`;
    const pending = { status: 'loading', data: tenantResources.get(key)?.data ?? null };
    tenantResources.set(key, pending);
    const routeAtStart = currentRoute();
    if (!background && routeAtStart.view === 'tenant' && routeAtStart.tenantId === tenant.id && routeAtStart.section === sectionId) {
      renderWithFocusHandoff();
    }
    try {
      const data = await tenantResourceData(tenant, sectionId);
      if (stopped || tenantResources.get(key) !== pending) return;
      tenantResources.set(key, { status: 'ready', data });
    } catch {
      if (stopped || tenantResources.get(key) !== pending) return;
      tenantResources.set(key, { status: 'error', data: null });
    }
    const route = currentRoute();
    if (route.view === 'tenant' && route.tenantId === tenant.id && route.section === sectionId) {
      renderWithFocusHandoff();
    }
  }

  async function ensureVisibleResource() {
    if (stopped || !fleet || sessionState !== 'authenticated') return;
    const route = currentRoute();
    if (route.view === 'fleet') {
      if (projectionClock(currentFleetView())) {
        revalidateProjectionClocks();
        return;
      }
      await loadFleetResource(currentFleetView());
      return;
    }
    const tenant = fleet.tenants.find(({ id }) => id === route.tenantId);
    if (tenant) ensureTenantResource(tenant, route.section || 'overview');
  }

  async function loadEntitlementPreview(tenant, load, draft = undefined) {
    const key = `${tenant.id}:entitlements`;
    const resource = tenantResources.get(key);
    const generation = navigationGeneration;
    const preview = await load(resource.data.workspace);
    const route = currentRoute();
    if (stopped || generation !== navigationGeneration || tenantResources.get(key) !== resource
      || route.view !== 'tenant' || route.tenantId !== tenant.id || route.section !== 'entitlements') return;
    tenantResources.set(key, { status: 'ready', data: { ...resource.data, preview,
      ...(draft === undefined ? {} : { draft }) } });
    render();
    nodes.app.querySelector('#platformAdminEntitlementPreviewTitle')?.focus();
  }

  function previewEntitlements(tenant, proposals) {
    if (!proposals.length) return;
    return loadEntitlementPreview(tenant, workspace => dataSource.previewEntitlements({
      tenantId: tenant.id, proposals, knownCapabilities: workspace.capabilities.items.map(({ capabilityId }) => capabilityId),
    }), proposals);
  }

  function previewPackage(tenant, packageId) {
    return loadEntitlementPreview(tenant, () => dataSource.previewPackage({ tenantId: tenant.id, packageId }));
  }

  function applyEntitlementPreview(tenant, preview) {
    confirmOperationalMutation(tenant, {
      titleKey: 'platformAdmin.entitlements.apply',
      effectKey: 'platformAdmin.action.effect.entitlement_apply',
      onConfirm: async (reason) => {
        const resource = tenantResources.get(`${tenant.id}:entitlements`);
        await dataSource.applyEntitlements({
          tenantId: tenant.id,
          proposals: preview.plan.changes.map(({ capabilityId, enabled }) => ({ capabilityId, enabled })),
          knownCapabilities: resource.data.workspace.capabilities.items.map(({ capabilityId }) => capabilityId),
          expectedEntitlementRevision: preview.plan.sourceRevision,
          reason,
          confirmation: { action: 'tenant.entitlement.apply', tenantId: tenant.id },
        });
        await reloadTenantResource(tenant, 'entitlements');
      },
    });
  }

  function applyPackagePreview(tenant, preview) {
    confirmOperationalMutation(tenant, {
      titleKey: 'platformAdmin.entitlements.apply',
      effectKey: 'platformAdmin.action.effect.entitlement_apply',
      onConfirm: async (reason) => {
        await dataSource.applyPackage({
          tenantId: tenant.id,
          packageId: preview.package.packageId,
          expectedPackageRevision: preview.package.revision,
          expectedEntitlementRevision: preview.plan.sourceRevision,
          reason,
          confirmation: { action: 'tenant.entitlement.apply', tenantId: tenant.id },
        });
        await reloadTenantResource(tenant, 'entitlements');
      },
    });
  }

  async function lookupCorrelation(tenant, query) {
    const key = `${tenant.id}:diagnostics`;
    const resource = tenantResources.get(key);
    const generation = navigationGeneration;
    const correlation = await dataSource.lookupCorrelation({ tenantId: tenant.id, ...query });
    const route = currentRoute();
    if (stopped || generation !== navigationGeneration || tenantResources.get(key) !== resource
      || route.view !== 'tenant' || route.tenantId !== tenant.id || route.section !== 'diagnostics') return;
    tenantResources.set(key, { status: 'ready', data: { ...resource.data, correlation } });
    render();
    nodes.app.querySelector('#platformAdminCorrelationResultsTitle')?.focus();
  }

  async function previewRecovery(tenant, recoveryId, target) {
    const key = `${tenant.id}:recovery`;
    const resource = tenantResources.get(key);
    const generation = navigationGeneration;
    const preview = await dataSource.previewRecovery({ tenantId: tenant.id, recoveryId, ...target });
    const route = currentRoute();
    if (stopped || generation !== navigationGeneration || tenantResources.get(key) !== resource
      || route.view !== 'tenant' || route.tenantId !== tenant.id || route.section !== 'recovery') return;
    tenantResources.set(key, {
      status: 'ready',
      data: { ...resource.data, previews: { ...resource.data.previews, [recoveryId]: preview } },
    });
    render();
    nodes.app.querySelector(`[data-platform-admin-recovery-execute="${recoveryId}"]`)?.focus();
  }

  async function loadRecoveryTargets(tenant, recoveryId, cursor = null) {
    const key = `${tenant.id}:recovery`;
    const resource = tenantResources.get(key);
    if (resource?.status !== 'ready') return;
    const generation = navigationGeneration;
    const current = resource.data.targets[recoveryId];
    if (cursor !== null && current?.nextCursor !== cursor) return;
    const page = await dataSource.loadRecoveryTargets({
      tenantId: tenant.id,
      recoveryId,
      cursor,
    });
    const route = currentRoute();
    if (stopped || generation !== navigationGeneration || tenantResources.get(key) !== resource
      || route.view !== 'tenant' || route.tenantId !== tenant.id || route.section !== 'recovery') return;
    const targets = cursor === null ? page
      : { ...page, items: Object.freeze([...current.items, ...page.items]) };
    tenantResources.set(key, {
      status: 'ready',
      data: {
        ...resource.data,
        targets: {
          ...resource.data.targets,
          [recoveryId]: targets,
        },
      },
    });
    return targets;
  }

  function executeRecovery(tenant, recoveryId, preview) {
    const definition = platformRecoveryDefinition(recoveryId);
    confirmOperationalMutation(tenant, {
      titleKey: `platformAdmin.recovery.action.${recoveryId}`,
      effectKey: `platformAdmin.recovery.effect.${recoveryId}`,
      onConfirm: async (reason) => {
        await dataSource.executeRecovery({
          tenantId: tenant.id,
          recoveryId,
          recoveryContextId: preview.recoveryContextId,
          reason,
          confirmation: { action: definition.action, tenantId: tenant.id },
          ...(definition.targetField ? { [definition.targetField]: preview.targetId } : {}),
        });
        await reloadTenantResource(tenant, 'recovery');
      },
    });
  }

  function availableFleetViews() {
    return [...PLATFORM_FLEET_VIEW_DEFINITIONS,
      ...(providerUsage && currentOperator ? [{ id: 'providers', titleKey: 'platformAdmin.providers.title', permission: null }] : []),
      ...(productDelivery && currentOperator ? [{ id: 'product-delivery', titleKey: 'platformAdmin.productDelivery.title', permission: null }] : [])]
      .filter(({ permission }) => permission === null || currentOperator?.permissions.includes(permission));
  }

  function renderNavigation(route, tenant) {
    clear(nodes.navigation);
    nodes.navigation.setAttribute('aria-label', t('platformAdmin.navigation.label'));
    const list = el('ul', { className: 'nav-list' });
    const globalGroup = el('section', { className: 'platform-admin-nav-group', attrs: { 'aria-labelledby': 'platformAdminGlobalNavigation' } }, [
      el('h2', { id: 'platformAdminGlobalNavigation', text: t('platformAdmin.navigation.global'), className: 'platform-admin-nav-heading' }), list,
    ]);
    availableFleetViews()
      .forEach((definition) => {
        const active = route.view === 'fleet' && currentFleetView() === definition.id;
        const label = t(definition.id === 'runtime-status' ? 'platformAdmin.navigation.globalRuntime' : definition.titleKey);
        const control = button('', {
          className: `nav-item${active ? ' active' : ''}`,
          attrs: active ? { 'aria-current': 'page' } : {},
          dataset: { platformAdminFleetView: definition.id },
        });
        control.append(el('span', { text: label }));
        const iconName = { directory: 'customers', readiness: 'info', 'integration-health': 'integrations', 'platform-audit': 'audit', 'runtime-status': 'system', providers: 'usage', 'product-delivery': 'delivery' }[definition.id];
        if (iconName) { control.classList.add('pavurel-icon-label'); control.prepend(pavurelFunctionalIcon(iconName, { variant: 'inverse' })); }
        control.addEventListener('click', () => {
          navigate(fleetDestinations.get(definition.id) || platformAdminFleetHash(definition.id));
        });
        list.append(el('li', {}, [control]));
      });
    nodes.navigation.appendChild(globalGroup);
    if (tenant) {
      const tenantList = el('ul', { className: 'nav-list' });
      const tenantGroup = el('section', { className: 'platform-admin-nav-group', attrs: { 'aria-labelledby': 'platformAdminCustomerNavigation' } }, [
        el('h2', { id: 'platformAdminCustomerNavigation', className: 'platform-admin-nav-heading', text: t('platformAdmin.navigation.customer', { tenant: tenant.displayName }) }), tenantList,
      ]);
      PLATFORM_ADMIN_SECTION_DEFINITIONS.forEach((definition) => {
        const active = route.section === definition.id;
        const label = t(definition.id === 'runtime-status' ? 'platformAdmin.navigation.customerRuntime' : definition.titleKey);
        const control = button('', {
          className: `nav-item${active ? ' active' : ''}`,
          attrs: active ? { 'aria-current': 'page' } : {},
          dataset: { platformAdminNavigate: definition.id },
        });
        control.append(el('span', { text: label }));
        const iconName = { overview: 'dashboard', lifecycle: 'settings', entitlements: 'settings', diagnostics: 'diagnostics', recovery: 'recovery', metering: 'usage', 'runtime-status': 'system' }[definition.id];
        if (iconName) { control.classList.add('pavurel-icon-label'); control.prepend(pavurelFunctionalIcon(iconName, { variant: 'inverse' })); }
        control.addEventListener('click', () => navigate(platformAdminTenantHash(tenant.id, definition.id)));
        tenantList.append(el('li', {}, [control]));
      });
      nodes.navigation.appendChild(tenantGroup);
    }
  }

  function renderFleetSummary() {
    const grid = el('div', { className: 'platform-admin-metric-grid' });
    const metrics = [
      ['platformAdmin.fleet.total', fleet.tenants.length],
      ['platformAdmin.state.active', fleet.tenants.filter(({ lifecycleState }) => lifecycleState === 'active').length],
      ['platformAdmin.state.pending', fleet.tenants.filter(({ lifecycleState }) => lifecycleState === 'pending').length],
      ['platformAdmin.state.suspended', fleet.tenants.filter(({ lifecycleState }) => lifecycleState === 'suspended').length],
    ];
    metrics.forEach(([key, value]) => grid.append(el('article', { className: 'card platform-admin-metric' }, [
      el('strong', { text: String(value) }),
      el('span', { text: t(key) }),
    ])));
    return grid;
  }

  function renderFleetFilters() {
    const query = el('input', {
      type: 'search',
      value: filters.query,
      attrs: { maxlength: '80', autocomplete: 'off' },
    });
    const lifecycle = el('select');
    LIFECYCLE_FILTERS.forEach((value) => lifecycle.append(selectedOption(value, 'platformAdmin.filter.lifecycle', documentRef)));
    lifecycle.value = filters.lifecycle;
    const health = dataSource.supportsHealthFilter === true ? el('select') : null;
    if (health) {
      HEALTH_FILTERS.forEach((value) => health.append(selectedOption(value, 'platformAdmin.filter.health', documentRef)));
      health.value = filters.health;
    }
    const apply = button(t('platformAdmin.filter.apply'), { type: 'submit', className: 'primary' });
    const reset = button(t('platformAdmin.filter.reset'), { className: 'secondary' });
    const controls = [
      field({ id: 'platformAdminQuery', label: t('platformAdmin.filter.query'), control: query }),
      field({ id: 'platformAdminLifecycle', label: t('platformAdmin.filter.lifecycleLabel'), control: lifecycle }),
    ];
    if (health) {
      controls.push(field({ id: 'platformAdminHealth', label: t('platformAdmin.filter.healthLabel'), control: health }));
    }
    controls.push(el('div', { className: 'button-row' }, [apply, reset]));
    const form = el('form', { className: 'card platform-admin-filter-form', attrs: { role: 'search' } }, controls);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      filters = normalizePlatformDirectoryQuery({
        query: query.value,
        lifecycle: lifecycle.value,
        health: health?.value || 'all',
      });
      await loadFleet();
    });
    reset.addEventListener('click', async () => {
      filters = normalizePlatformDirectoryQuery();
      await loadFleet();
    });
    return form;
  }

  function renderFleetDirectory() {
    setHeading(t('platformAdmin.fleet.title'), t('platformAdmin.fleet.subtitle'));
    const section = el('section', {
      className: 'platform-admin-page',
      dataset: { platformAdminPage: 'directory' },
      attrs: { 'aria-labelledby': 'platformAdminFleetTitle' },
    }, [
      el('h2', {
        id: 'platformAdminFleetTitle',
        className: 'sr-only',
        text: t('platformAdmin.fleet.directoryTitle'),
      }),
      renderFleetSummary(),
      renderFleetFilters(),
      renderCreateTenantControl(),
      el('p', {
        className: 'platform-admin-data-note',
        text: t('platformAdmin.fleet.evaluatedAt', { time: formatDateTime(fleet.evaluatedAt) }),
      }),
    ]);
    if (actionError) {
      section.append(el('div', { className: 'platform-admin-error', attrs: { role: 'alert' } }, [
        el('strong', { text: t('platformAdmin.action.failedTitle') }),
        el('p', { text: t('platformAdmin.action.failed') }),
      ]));
    }
    if (!fleet.tenants.length) {
      section.append(el('p', { className: 'card platform-admin-empty', text: t('platformAdmin.fleet.empty') }));
      return section;
    }
    const list = el('ul', { className: 'platform-admin-fleet-list' });
    fleet.tenants.forEach((tenant) => {
      const open = button(t('platformAdmin.fleet.open'), {
        className: 'secondary',
        dataset: { platformAdminTenant: tenant.id },
        attrs: { 'aria-label': t('platformAdmin.fleet.openNamed', { tenant: tenant.displayName }) },
      });
      open.addEventListener('click', () => navigate(platformAdminTenantHash(tenant.id)));
      list.append(el('li', { className: 'card platform-admin-fleet-card' }, [
        el('div', { className: 'platform-admin-record-heading' }, [
          el('div', {}, [
            el('h3', { className: 'pavurel-icon-label' }, [pavurelFunctionalIcon('customers'), el('span', { text: tenant.displayName })]),
            el('small', { text: tenant.reference || tenant.id }),
          ]),
          stateBadge(tenant.lifecycleState),
        ]),
        renderCustomerDirectorySummary(tenant, customerWorkbenchSummary(tenant, fleetResources, currentOperator)),
        el('div', { className: 'button-row' }, [open]),
      ]));
    });
    section.appendChild(list);
    if (fleet.nextCursor) {
      const next = button(t('platformAdmin.pagination.next'), {
        className: 'secondary',
        dataset: { platformAdminDirectoryNext: 'true' },
      });
      next.disabled = directoryLoadingMore;
      next.addEventListener('click', () => loadFleet({ cursor: fleet.nextCursor, append: true }));
      section.append(el('div', { className: 'button-row platform-admin-pagination' }, [next]));
    }
    return section;
  }

  function renderSelectedFleetView() {
    if (currentFleetView() === 'product-delivery' && productDelivery) {
      setHeading(t('platformAdmin.productDelivery.title'), t('platformAdmin.productDelivery.subtitle'));
      return el('div', {
        className: 'platform-admin-page',
        dataset: { platformAdminPage: 'product-delivery' },
      }, [renderProductDelivery({ resource: fleetResources.get(currentFleetView()),
        activeTab: currentRoute().tab, onTabChange: (value) => selectInsightTab('product-delivery', value),
        onRetry: () => loadFleetResource('product-delivery', { force: true }) })]);
    }
    if (currentFleetView() === 'providers' && providerUsage) {
      setHeading(t('platformAdmin.providers.title'), t('platformAdmin.providers.subtitle'));
      const resource = fleetResources.get(currentFleetView());
      const now = providerFreshness.capture();
      const elapsedMs = resource?.requestClock ? Math.max(0,
        now.wall - resource.requestClock.wall, now.monotonic - resource.requestClock.monotonic) : 0;
      return el('div', {
        className: 'platform-admin-page',
        dataset: { platformAdminPage: 'providers' },
      }, [renderProviderUsage({ resource, elapsedMs,
        activeTab: currentRoute().tab, onTabChange: (value) => selectInsightTab('providers', value),
        isStale: !providerFreshness.isReusable(fleetResources.get(currentFleetView())),
        onRetry: () => loadFleetResource('providers', { force: true }) })]);
    }
    const definition = PLATFORM_FLEET_VIEW_DEFINITIONS.find(({ id }) => id === currentFleetView());
    setHeading(t(definition.titleKey), t(`platformAdmin.fleetView.${currentFleetView()}.description`));
    return el('div', {
      className: 'platform-admin-page',
      dataset: { platformAdminPage: currentFleetView() },
    }, [renderPlatformFleetView({
      view: currentFleetView(),
      resource: fleetResources.get(currentFleetView()),
      onRetry: () => loadFleetResource(currentFleetView(), { force: true }),
      onSelectTenant: openTenantFromFleet,
      onLoadMore: (cursor) => loadFleetResource(currentFleetView(), { cursor, append: true }),
      onExportAudit: operationProofAvailable && currentOperator?.permissions.includes('platform:audit:export')
        ? ()=>downloadPlatformAuditExport(dataSource) : null,
    })]);
  }

  function renderCreateTenantControl() {
    if (customerInvitationPresentation) return customerInvitationPresentation.renderCreateControl({
      operator: currentOperator,operationProofAvailable,onStepUp,
      isCurrent: () => !stopped && currentRoute().view === 'fleet',
      onCreated: async () => { await loadFleet();announce(t('platformInvitations.status.complete')); },
    });
    const permission = 'platform:invitation:manage';
    if (!currentOperator.permissions.includes(permission)) return null;
    const panel = el('section', {
      className: 'card platform-admin-create-panel',
      attrs: { 'aria-labelledby': 'platformAdminCreateTenantTitle' },
    }, [
      el('h2', { id: 'platformAdminCreateTenantTitle', text: t('platformAdmin.create.title') }),
      el('p', { text: t('platformAdmin.create.description') }),
      ...(operationProofAvailable ? [el('p', { text: t('platformAdmin.passkey.operationNote') })] : []),
    ]);
    const controls = el('div', { className: 'button-row' });
    if (shouldPresentPlatformPermission(currentOperator, permission, Date.now(), operationProofAvailable)) {
      const create = button(t('platformAdmin.create.start'), {
        className: 'primary',
        dataset: { platformAdminCreateTenant: 'true' },
      });
      create.addEventListener('click', createPendingTenant);
      controls.appendChild(create);
    } else if (typeof onStepUp === 'function') {
      const stepUp = microsoftSignInControl({ label: t('platformAdmin.session.signIn') });
      stepUp.addEventListener('click', onStepUp);
      panel.append(el('p', { className: 'platform-admin-empty', text: t('platformAdmin.actions.stepUpRequired') }));
      controls.appendChild(stepUp);
    }
    panel.appendChild(controls);
    return panel;
  }

  function createPendingTenant() {
    const displayName = el('input', {
      type: 'text',
      attrs: { maxlength: '160', autocomplete: 'off', required: 'required' },
    });
    const reason = el('textarea', {
      attrs: { maxlength: '500', rows: '4', required: 'required' },
    });
    const confirmation = el('input', {
      type: 'text',
      attrs: { maxlength: '160', autocomplete: 'off', required: 'required' },
    });
    const message = el('p', { className: 'platform-admin-dialog-message', attrs: { role: 'alert' } });
    const cancel = button(t('common.cancel'), { className: 'secondary' });
    const create = button(t('platformAdmin.create.confirm'), {
      className: 'primary',
      dataset: { platformAdminConfirmCreate: 'true' },
    });
    const dialog = openApplicationDialog({
      title: t('platformAdmin.create.confirmTitle'),
      description: t('platformAdmin.create.confirmDescription'),
      content: el('div', {}, [
        field({
          id: 'platformAdminCreateDisplayName',
          label: t('platformAdmin.create.displayName'),
          control: displayName,
          required: true,
        }),
        field({
          id: 'platformAdminCreateReason',
          label: t('platformAdmin.action.reason'),
          hint: t('platformAdmin.create.reasonHint'),
          control: reason,
          required: true,
        }),
        field({
          id: 'platformAdminCreateConfirmation',
          label: t('platformAdmin.create.confirmation'),
          hint: t('platformAdmin.create.confirmationHint'),
          control: confirmation,
          required: true,
        }),
        message,
      ]),
      actions: [cancel, create],
      labelledById: 'platformAdminCreateDialogTitle',
    });
    cancel.addEventListener('click', () => dialog.close());
    create.addEventListener('click', async () => {
      const normalizedName = displayName.value.trim();
      const normalizedReason = reason.value.trim();
      if (!normalizedName || !normalizedReason || confirmation.value !== normalizedName) {
        message.textContent = t('platformAdmin.create.validation');
        (normalizedName ? (normalizedReason ? confirmation : reason) : displayName).focus();
        return;
      }
      message.textContent = t('platformAdmin.action.running');
      create.disabled = true;
      cancel.disabled = true;
      try {
        const result = await dataSource.createTenant({
          displayName: normalizedName,
          reason: normalizedReason,
          confirmation: {
            action: 'tenant.invitation.create',
            displayName: normalizedName,
          },
        });
        dialog.close();
        actionError = false;
        await loadFleet();
        if (result.oneTimeDelivery.available) showOneTimeInvitation(result.tenant, result.oneTimeDelivery);
        announce(t('platformAdmin.create.complete'));
        showToast(t('platformAdmin.create.complete'));
      } catch {
        dialog.close();
        actionError = true;
        render();
        announce(t('platformAdmin.action.failed'), { assertive: true });
      }
    });
  }

  function confirmAction(tenant, action) {
    const reason = el('textarea', {
      attrs: { maxlength: '500', rows: '4', required: 'required' },
    });
    const message = el('p', { className: 'platform-admin-dialog-message', attrs: { role: 'alert' } });
    const cancel = button(t('common.cancel'), { className: 'secondary' });
    const confirm = button(t(`platformAdmin.action.${action}`), {
      className: ['archive', 'suspend', 'invitation_revoke', 'disable_calendar_write'].includes(action)
        ? 'danger'
        : 'primary',
      dataset: { platformAdminConfirmAction: action },
    });
    const content = el('div', {}, [
      el('p', {
        text: t('platformAdmin.action.target', {
          tenant: tenant.displayName,
          reference: tenant.reference || tenant.id,
        }),
      }),
      el('p', { text: t(`platformAdmin.action.effect.${action}`) }),
      ...(operationProofAvailable ? [el('p', { text: t('platformAdmin.passkey.operationNote') })] : []),
      el('p', { className: 'platform-admin-data-note', text: t('platformAdmin.action.recoveryNote') }),
      field({
        id: 'platformAdminActionReason',
        label: t('platformAdmin.action.reason'),
        hint: t('platformAdmin.action.reasonHint'),
        control: reason,
        required: true,
      }),
      message,
    ]);
    const dialog = openApplicationDialog({
      title: t('platformAdmin.action.confirmTitle', { action: t(`platformAdmin.action.${action}`) }),
      description: t('platformAdmin.action.confirmDescription'),
      content,
      actions: [cancel, confirm],
      labelledById: 'platformAdminActionDialogTitle',
    });
    cancel.addEventListener('click', () => dialog.close());
    confirm.addEventListener('click', async () => {
      const normalizedReason = reason.value.trim();
      if (normalizedReason.length < 1) {
        reason.setAttribute('aria-invalid', 'true');
        message.textContent = t('platformAdmin.action.reasonRequired');
        reason.focus();
        return;
      }
      reason.removeAttribute('aria-invalid');
      message.textContent = t('platformAdmin.action.running');
      confirm.disabled = true;
      cancel.disabled = true;
      try {
        const invitationAction = ['invitation_revoke', 'invitation_reissue'].includes(action);
        const result = await dataSource.runTenantAction({
          action,
          tenantId: tenant.id,
          invitationId: invitationAction ? tenant.invitationId : null,
          expectedRevision: invitationAction ? tenant.invitationRevision : tenant.version,
          reason: normalizedReason,
          confirmation: { action, tenantId: tenant.id },
        });
        dialog.close();
        actionError = false;
        await loadFleet();
        if (result.oneTimeDelivery?.available === true) {
          showOneTimeInvitation(tenant, result.oneTimeDelivery);
        }
        announce(t('platformAdmin.action.complete'));
        showToast(t('platformAdmin.action.complete'));
      } catch {
        dialog.close();
        actionError = true;
        render();
        announce(t('platformAdmin.action.failed'), { assertive: true });
      }
    });
  }

  function showOneTimeInvitation(tenant, delivery) {
    const token = el('code', {
      className: 'platform-admin-one-time-token',
      text: delivery.token,
    });
    const close = button(t('common.close'), { className: 'primary' });
    const dialog = openApplicationDialog({
      title: t('platformAdmin.delivery.title'),
      description: t('platformAdmin.delivery.description'),
      content: el('div', {}, [
        el('p', { text: t('platformAdmin.delivery.target', { tenant: tenant.displayName }) }),
        token,
        el('p', {
          className: 'platform-admin-data-note',
          text: t('platformAdmin.delivery.expiresAt', { time: formatDateTime(delivery.expiresAt) }),
        }),
      ]),
      actions: [close],
      labelledById: 'platformAdminDeliveryDialogTitle',
    });
    close.addEventListener('click', () => {
      token.textContent = '';
      dialog.close();
    });
  }

  function confirmOperationalMutation(tenant, { titleKey, effectKey, onConfirm }) {
    const reason = el('textarea', { attrs: { maxlength: '500', rows: '4', required: 'required' } });
    const confirmation = el('input', { type: 'text', attrs: { maxlength: '160', autocomplete: 'off', required: 'required' } });
    const message = el('p', { className: 'platform-admin-dialog-message', attrs: { role: 'alert' } });
    const cancel = button(t('common.cancel'), { className: 'secondary' });
    const confirm = button(t(titleKey), { className: 'danger' });
    const dialog = openApplicationDialog({
      title: t(titleKey),
      description: t(effectKey),
      content: el('div', {}, [
        ...(operationProofAvailable ? [el('p', { text: t('platformAdmin.passkey.operationNote') })] : []),
        el('p', { text: t('platformAdmin.action.target', { tenant: tenant.displayName, reference: tenant.reference || tenant.id }) }),
        field({ id: 'platformAdminResourceReason', label: t('platformAdmin.action.reason'), control: reason, required: true }),
        field({
          id: 'platformAdminResourceConfirmation',
          label: t('platformAdmin.resource.confirmation'),
          hint: t('platformAdmin.resource.confirmationHint', { tenant: tenant.displayName }),
          control: confirmation,
          required: true,
        }),
        message,
      ]),
      actions: [cancel, confirm],
      labelledById: 'platformAdminResourceDialogTitle',
    });
    cancel.addEventListener('click', () => dialog.close());
    confirm.addEventListener('click', async () => {
      const normalizedReason = reason.value.trim();
      if (!normalizedReason || confirmation.value !== tenant.displayName) {
        message.textContent = t('platformAdmin.resource.validation');
        (normalizedReason ? confirmation : reason).focus();
        return;
      }
      confirm.disabled = true;
      cancel.disabled = true;
      message.textContent = t('platformAdmin.action.running');
      try {
        await onConfirm(normalizedReason);
        dialog.close();
        actionError = false;
        announce(t('platformAdmin.action.complete'));
        showToast(t('platformAdmin.action.complete'));
      } catch {
        dialog.close();
        actionError = true;
        render();
        announce(t('platformAdmin.action.failed'), { assertive: true });
      }
    });
  }

  function editQuota(tenant, quota) {
    const stateControl = el('select');
    ['configured', 'not_configured'].forEach((value) => stateControl.append(selectedOption(value, 'platformAdmin.quota.state', documentRef)));
    stateControl.value = quota.state === 'configured' ? 'configured' : 'not_configured';
    const softLimit = el('input', { type: 'number', value: quota.softLimit ?? '', attrs: { min: '0', step: '1' } });
    const hardLimit = el('input', { type: 'number', value: quota.hardLimit ?? '', attrs: { min: '0', step: '1' } });
    const reason = el('textarea', { attrs: { maxlength: '500', rows: '4', required: 'required' } });
    const confirmation = el('input', { type: 'text', attrs: { maxlength: '32', autocomplete: 'off', required: 'required' } });
    const message = el('p', { className: 'platform-admin-dialog-message', attrs: { role: 'alert' } });
    const cancel = button(t('common.cancel'), { className: 'secondary' });
    const save = button(t('platformAdmin.metering.saveQuota'), { className: 'danger' });
    const dialog = openApplicationDialog({
      title: t('platformAdmin.metering.editQuotaTitle', { dimension: t(`platformAdmin.metering.name.${quota.dimension}`) }),
      description: t('platformAdmin.metering.editQuotaDescription'),
      content: el('div', {}, [
        el('p', { text: t('platformAdmin.action.target', { tenant: tenant.displayName, reference: tenant.reference || tenant.id }) }),
        el('p', { text: t('platformAdmin.metering.limitEffect') }),
        field({ id: 'platformAdminQuotaState', label: t('platformAdmin.metering.quotaState'), control: stateControl }),
        field({ id: 'platformAdminQuotaSoft', label: t('platformAdmin.metering.softLimit'), control: softLimit }),
        field({ id: 'platformAdminQuotaHard', label: t('platformAdmin.metering.hardLimit'), control: hardLimit }),
        field({ id: 'platformAdminQuotaReason', label: t('platformAdmin.action.reason'), control: reason, required: true }),
        field({
          id: 'platformAdminQuotaConfirmation',
          label: t('platformAdmin.metering.confirmDimension'),
          hint: t('platformAdmin.metering.confirmDimensionHint', { dimension: quota.dimension }),
          control: confirmation,
          required: true,
        }),
        message,
      ]),
      actions: [cancel, save],
      labelledById: 'platformAdminQuotaDialogTitle',
    });
    function syncLimits() {
      const disabled = stateControl.value === 'not_configured';
      softLimit.disabled = disabled;
      hardLimit.disabled = disabled;
      if (disabled) {
        softLimit.value = '';
        hardLimit.value = '';
      }
    }
    stateControl.addEventListener('change', syncLimits);
    syncLimits();
    cancel.addEventListener('click', () => dialog.close());
    save.addEventListener('click', async () => {
      const parseLimit = (control) => control.value === '' ? null : Number(control.value);
      const soft = parseLimit(softLimit);
      const hard = parseLimit(hardLimit);
      const normalizedReason = reason.value.trim();
      if (
        confirmation.value !== quota.dimension
        || !normalizedReason
        || (stateControl.value === 'configured' && soft === null && hard === null)
        || (soft !== null && (!Number.isSafeInteger(soft) || soft < 0))
        || (hard !== null && (!Number.isSafeInteger(hard) || hard < 0))
        || (soft !== null && hard !== null && soft > hard)
      ) {
        message.textContent = t('platformAdmin.metering.quotaValidation');
        return;
      }
      save.disabled = true;
      cancel.disabled = true;
      try {
        await dataSource.setQuota({
          tenantId: tenant.id,
          dimension: quota.dimension,
          state: stateControl.value,
          softLimit: soft,
          hardLimit: hard,
          expectedRevision: quota.revision,
          reason: normalizedReason,
          confirmation: { action: 'tenant.quota.set', tenantId: tenant.id, dimension: quota.dimension },
        });
        dialog.close();
        await reloadTenantResource(tenant, 'metering');
        announce(t('platformAdmin.action.complete'));
        showToast(t('platformAdmin.action.complete'));
      } catch {
        dialog.close();
        actionError = true;
        render();
        announce(t('platformAdmin.action.failed'), { assertive: true });
      }
    });
  }

  function renderTenant(route, tenant) {
    const definition = PLATFORM_ADMIN_SECTION_DEFINITIONS.find(({ id }) => id === route.section)
      || PLATFORM_ADMIN_SECTION_DEFINITIONS[0];
    ensureTenantResource(tenant, definition.id);
    const resource = tenantResources.get(`${tenant.id}:${definition.id}`);
    setHeading(tenant.displayName, t(definition.titleKey));
    const section = el('section', {
      className: 'platform-admin-tenant-section',
      dataset: { platformAdminSection: definition.id },
      attrs: { 'aria-labelledby': 'platformAdminSectionTitle' },
    }, [
      el('button', {
        type: 'button',
        className: 'platform-admin-back-link',
        text: t('platformAdmin.navigation.backToFleet'),
      }),
      el('div', { className: 'platform-admin-section-heading' }, [
        el('h2', {
          id: 'platformAdminSectionTitle',
          className: 'pavurel-icon-label',
          attrs: { tabindex: '-1' },
        }, [
          pavurelFunctionalIcon({
            overview: 'dashboard',
            lifecycle: 'settings',
            entitlements: 'settings',
            diagnostics: 'diagnostics',
            recovery: 'recovery',
            metering: 'usage',
            'runtime-status': 'system',
          }[definition.id] || 'customers'),
          el('span', { text: t(definition.titleKey) }),
        ]),
        el('p', { text: t(definition.descriptionKey) }),
      ]),
    ]);
    section.querySelector('.platform-admin-back-link').addEventListener('click', () => navigate(platformAdminFleetHash()));
    section.append(el('div', {
      className: 'platform-admin-tenant-context',
      dataset: { platformAdminTenantContext: 'true' },
    }, [
      el('div', { className: 'platform-admin-tenant-context-identity' }, [
        pavurelFunctionalIcon('customers'),
        el('div', {}, [
          el('strong', { text: tenant.displayName }),
          el('details', { className: 'platform-admin-customer-id' }, [
            el('summary', { text: t('platformAdmin.workbench.customerId') }),
            el('code', { text: tenant.reference || tenant.id }),
          ]),
        ]),
      ]),
      stateBadge(tenant.lifecycleState),
    ]));
    const sectionTabs = el('nav', {
      className: 'platform-admin-section-tabs',
      dataset: { platformAdminSectionTabs: 'true' },
      attrs: { 'aria-label': t('platformAdmin.navigation.customer', { tenant: tenant.displayName }) },
    }, [el('ul', { className: 'platform-admin-section-tabs-list' })]);
    const sectionTabList = sectionTabs.querySelector('ul');
    PLATFORM_ADMIN_SECTION_DEFINITIONS.forEach((sectionDefinition) => {
      const active = route.section === sectionDefinition.id;
      const tab = button(t(sectionDefinition.titleKey), {
        className: `platform-admin-section-tab${active ? ' active' : ''}`,
        attrs: active ? { 'aria-current': 'page' } : {},
        dataset: { platformAdminSectionTab: sectionDefinition.id },
      });
      tab.addEventListener('click', () => navigate(platformAdminTenantHash(tenant.id, sectionDefinition.id)));
      sectionTabList.append(el('li', {}, [tab]));
    });
    section.append(sectionTabs);
    if (actionError) {
      section.append(el('div', { className: 'platform-admin-error', attrs: { role: 'alert' } }, [
        el('strong', { text: t('platformAdmin.action.failedTitle') }),
        el('p', { text: t('platformAdmin.action.failed') }),
      ]));
    }
    section.append(el('div', {
      className: 'platform-admin-tenant-content',
      dataset: { platformAdminSectionContent: definition.id },
    }, [renderPlatformAdminTenantSection({
      sectionId: definition.id,
      operationProofAvailable,
      tenant: customerInvitationPresentation ? { ...tenant,
        allowedActions: tenant.allowedActions.filter(action => !['invitation_revoke','invitation_reissue'].includes(action)) } : tenant,
      operator: currentOperator,
      resource,
      summary: customerWorkbenchSummary(tenant, fleetResources, currentOperator),
      onAction: (action) => confirmAction(tenant, action),
      onOpenLifecycle: () => navigate(platformAdminTenantHash(tenant.id, 'lifecycle')),
      onOpenSection: section => navigate(platformAdminTenantHash(tenant.id, section)),
      onOpenReadiness: currentOperator.permissions.includes('platform:readiness:read')
        ? () => navigate(platformAdminFleetHash('readiness')) : null,
      onOpenIntegrations: currentOperator.permissions.includes('platform:integration-health:read')
        ? () => navigate(platformAdminFleetHash('integration-health')) : null,
      onOpenAudit: currentOperator.permissions.includes('platform:audit:read')
        ? () => navigate(platformAdminFleetHash('platform-audit')) : null,
      onStepUp,
      onRetry: () => reloadTenantResource(tenant, definition.id),
      onEntitlementPreview: (proposals) => previewEntitlements(tenant, proposals),
      onPackagePreview: (packageId) => previewPackage(tenant, packageId),
      onEntitlementApply: (preview) => applyEntitlementPreview(tenant, preview),
      onPackageApply: (preview) => applyPackagePreview(tenant, preview),
      onCorrelationLookup: (query) => lookupCorrelation(tenant, query),
      onRecoveryPreview: (recoveryId, target) => previewRecovery(tenant, recoveryId, target),
      onRecoveryExecute: (recoveryId, preview) => executeRecovery(tenant, recoveryId, preview),
      onRecoveryTargetsLoad: (recoveryId) => loadRecoveryTargets(tenant, recoveryId),
      onRecoveryTargetsMore: (recoveryId, cursor) => loadRecoveryTargets(tenant, recoveryId, cursor),
      onQuotaSet: (quota) => editQuota(tenant, quota),
    })]));
    if (customerInvitationPresentation && definition.id === 'lifecycle') {
      const panel=customerInvitationPresentation.renderTenantPanel({ tenant,operator: currentOperator,operationProofAvailable,onStepUp,
        isCurrent: () => !stopped && currentRoute().tenantId === tenant.id && currentRoute().section === 'lifecycle' });
      if (panel) section.append(panel);
    }
    return section;
  }

  function render() {
    const invitationRoute=currentRoute();
    customerInvitationPresentation?.beginRender({ key: sessionState === 'authenticated' && !stopped
      ? `${invitationRoute.view}:${invitationRoute.tenantId ?? ''}:${invitationRoute.section ?? ''}` : null });
    documentRef.title = t('platformAdmin.documentTitle');
    nodes.skipLink.textContent = t('a11y.skip');
    nodes.brandTitle.textContent = t('platformAdmin.brand.title');
    nodes.brandSubtitle.textContent = t('platformAdmin.brand.subtitle');
    renderRuntimeNotice();
    renderFooter();
    clear(nodes.app);

    if (sessionState !== 'authenticated' || !currentOperator) {
      setHeading(t('platformAdmin.title'), t('platformAdmin.subtitle'));
      renderNavigation({ view: 'fleet' }, null);
      nodes.app.appendChild(sessionState === 'unauthenticated' && renderSessionGate
        ? renderSessionGate() : sessionGate(sessionState, signInPath));
      return;
    }
    const route = currentRoute();
    if (route.view === 'fleet' && currentFleetView() !== 'directory'
      && !availableFleetViews().some(({ id }) => id === currentFleetView())) {
      navigate(platformAdminFleetHash(), { replace: true });
      return;
    }
    if (route.view === 'fleet') {
      fleetDestinations.set(currentFleetView(), platformAdminFleetHash(currentFleetView(), route.tab ?? null));
    }
    const tenant = route.tenantId ? fleet?.tenants.find(({ id }) => id === route.tenantId) : null;
    renderNavigation(route, tenant);
    if (loading) {
      setHeading(t('platformAdmin.fleet.title'), t('platformAdmin.fleet.subtitle'));
      nodes.app.append(el('section', { className: 'card', attrs: { role: 'status' } }, [
        el('h2', { text: t('platformAdmin.loading.title') }),
        el('p', { text: t('platformAdmin.loading.text') }),
      ]));
      return;
    }
    if (loadError || !fleet) {
      setHeading(t('platformAdmin.fleet.title'), t('platformAdmin.fleet.subtitle'));
      const retry = button(t('platformAdmin.load.retry'), { className: 'primary' });
      retry.addEventListener('click', loadFleet);
      nodes.app.append(el('section', { className: 'card platform-admin-error', attrs: { role: 'alert' } }, [
        el('h2', { text: t('platformAdmin.load.errorTitle') }),
        el('p', { text: t('platformAdmin.load.errorText') }),
        el('div', { className: 'button-row' }, [retry]),
      ]));
      return;
    }
    if (route.view === 'tenant' && !tenant) {
      navigate(platformAdminFleetHash(), { replace: true });
      return;
    }
    nodes.app.append(route.view === 'tenant'
      ? renderTenant(route, tenant)
      : currentFleetView() === 'directory'
        ? renderFleetDirectory()
        : renderSelectedFleetView());
  }

  async function loadFleet({ cursor = null, append = false } = {}) {
    const currentGeneration = ++fleetRequestGeneration;
    loading = !append;
    directoryLoadingMore = append;
    if (!append) loadError = false;
    actionError = false;
    renderWithFocusHandoff();
    try {
      const result = await dataSource.loadFleet({ ...filters, cursor });
      if (currentGeneration !== fleetRequestGeneration) return;
      fleet = append && fleet
        ? Object.freeze({
          ...result,
          tenants: Object.freeze([...fleet.tenants, ...result.tenants]),
        })
        : result;
      await loadCustomerSummaries();
      if (currentGeneration !== fleetRequestGeneration) return;
    } catch {
      if (currentGeneration !== fleetRequestGeneration) return;
      if (append) actionError = true;
      else {
        loadError = true;
        fleet = null;
      }
    } finally {
      if (currentGeneration === fleetRequestGeneration) {
        loading = false;
        directoryLoadingMore = false;
        renderWithFocusHandoff();
        void ensureVisibleResource();
      }
    }
  }

  function languageChanged() {
    renderWithFocusHandoff();
  }

  function routeChanged() {
    navigationGeneration += 1;
    clearRouteAnnouncements();
    actionError = false;
    render();
    void ensureVisibleResource();
    focusHeading();
  }

  async function start() {
    stopped = false;
    if (!windowRef.location.hash) windowRef.history.replaceState(null, '', platformAdminFleetHash());
    windowRef.addEventListener('hashchange', routeChanged);
    windowRef.addEventListener('popstate', routeChanged);
    windowRef.addEventListener('conference-language-changed', languageChanged);
    windowRef.addEventListener('pageshow', revalidateProjectionClocks);
    windowRef.addEventListener('focus', revalidateProjectionClocks);
    documentRef.addEventListener('visibilitychange', revalidateProjectionClocks);
    render();
    if (sessionState === 'authenticated') await loadFleet();
  }

  function stop() {
    navigationGeneration += 1;
    stopped = true;
    for (const dialog of dialogs) dialog.close();
    dialogs.clear();
    customerInvitationPresentation?.clear();
    fleetRequestGeneration += 1;
    windowRef.removeEventListener('hashchange', routeChanged);
    windowRef.removeEventListener('popstate', routeChanged);
    windowRef.removeEventListener('conference-language-changed', languageChanged);
    windowRef.removeEventListener('pageshow', revalidateProjectionClocks);
    windowRef.removeEventListener('focus', revalidateProjectionClocks);
    documentRef.removeEventListener('visibilitychange', revalidateProjectionClocks);
    clearProjectionState();
    fleetResources.delete('providers');
    fleetResources.delete('product-delivery');
    if (((productDelivery && currentFleetView() === 'product-delivery') || (providerUsage && currentFleetView() === 'providers'))
      && currentRoute().view === 'fleet') clear(nodes.app);
  }

  function invalidateSession() {
    stop();
    sessionState = 'unauthenticated';
    currentOperator = null;
    fleet = null;
    fleetResources.clear();
    tenantResources.clear();
    fleetDestinations.clear();
    loading = false;
    directoryLoadingMore = false;
    render();
  }

  if (PLATFORM_ADMIN_SECTION_DEFINITIONS.length !== PLATFORM_ADMIN_SECTIONS.length) {
    throw new TypeError('PLATFORM_ADMIN_SECTION_REGISTRY_INCOMPLETE');
  }
  return Object.freeze({ start, stop, render, openWorkspaceTenant, invalidateSession });
}
