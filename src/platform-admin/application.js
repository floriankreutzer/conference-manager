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

const LIFECYCLE_FILTERS = Object.freeze(['all', 'pending', 'onboarding', 'ready', 'active', 'suspended', 'archived']);
const HEALTH_FILTERS = Object.freeze(['all', 'healthy', 'degraded', 'unavailable', 'not_configured']);

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
    section.append(el('a', {
      className: 'primary button-link',
      href: signInPath,
      text: t('platformAdmin.session.signIn'),
    }));
  }
  return section;
}

export function createPlatformAdminApplication({
  dataSource,
  operator = null,
  runtime = 'production',
  sessionState = 'authenticated',
  signInPath = null,
  onSignOut = null,
  onStepUp = null,
  demoControls = null,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
} = {}) {
  if (!['production', 'demo'].includes(runtime)) throw new TypeError('PLATFORM_ADMIN_RUNTIME_INVALID');
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
  let fleetView = 'directory';
  const fleetResources = new Map();
  const tenantResources = new Map();

  function currentRoute() {
    return platformAdminRouteFromHash(windowRef.location.hash);
  }

  function setHeading(title, subtitle) {
    nodes.title.textContent = title;
    nodes.subtitle.textContent = subtitle;
  }

  function focusHeading() {
    windowRef.requestAnimationFrame(() => nodes.title.focus());
  }

  function navigate(hash, { replace = false } = {}) {
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
        el('span', { text: t(`platformAdmin.role.${currentOperator.roles[0]}`) }),
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
    nodes.sidebarFooter.append(el('label', { className: 'platform-admin-sidebar-field' }, [
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
      roleSelect.addEventListener('change', async () => {
        currentOperator = demoControls.setRole(roleSelect.value);
        actionError = false;
        fleetView = 'directory';
        fleetResources.clear();
        tenantResources.clear();
        await loadFleet();
        announce(t('platformAdmin.demo.roleChanged'));
      });
      const reset = button(t('platformAdmin.demo.reset'), {
        className: 'platform-admin-reset',
        dataset: { platformAdminDemoReset: 'true' },
      });
      reset.addEventListener('click', async () => {
        currentOperator = demoControls.reset();
        filters = normalizePlatformDirectoryQuery();
        fleetView = 'directory';
        fleetResources.clear();
        tenantResources.clear();
        navigate(platformAdminFleetHash(), { replace: true });
        await loadFleet();
        announce(t('platformAdmin.demo.resetComplete'));
        showToast(t('platformAdmin.demo.resetComplete'));
      });
      nodes.sidebarFooter.append(el('label', { className: 'platform-admin-sidebar-field' }, [
        el('span', { text: t('platformAdmin.demo.roleLabel') }),
        roleSelect,
      ]), reset);
    }

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
      nodes.sidebarFooter.appendChild(signOut);
    }
  }

  function openTenantFromFleet(tenantId) {
    const tenant = fleet?.tenants.find(({ id }) => id === tenantId);
    if (tenant) navigate(platformAdminTenantHash(tenant.id));
  }

  async function loadFleetResource(view, { cursor = null, append = false, force = false } = {}) {
    if (view === 'directory') return;
    const existing = fleetResources.get(view);
    if (!force && !cursor && existing?.status === 'ready') return;
    fleetResources.set(view, { status: 'loading', data: append ? existing?.data : null });
    render();
    try {
      let data;
      if (view === 'readiness') data = await dataSource.loadReadiness({ limit: 50, cursor });
      else if (view === 'integration-health') data = await dataSource.loadMicrosoftHealth({ limit: 50, cursor });
      else if (view === 'platform-audit') data = await dataSource.loadAudit({ limit: 100, beforeSequence: cursor });
      else data = await dataSource.loadRuntimeDeployments();
      if (append && existing?.data && Array.isArray(data.items)) {
        data = Object.freeze({ ...data, items: Object.freeze([...existing.data.items, ...data.items]) });
      }
      fleetResources.set(view, { status: 'ready', data });
    } catch {
      fleetResources.set(view, { status: 'error', data: null });
    }
    render();
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
      const targets = {};
      for (const definition of ['last-tenant-admin', 'room-mapping-repair', 'user-session-revocation']) {
        const permission = definition.includes('session-revocation')
          ? 'platform:session:revoke'
          : 'platform:recovery:execute';
        if (shouldPresentPlatformPermission(currentOperator, permission)) {
          targets[definition] = await dataSource.loadRecoveryTargets({
            tenantId: tenant.id,
            recoveryId: definition,
          });
        }
      }
      return { previews: {}, targets: Object.freeze(targets) };
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
    tenantResources.set(key, { status: 'loading', data: null });
    void reloadTenantResource(tenant, sectionId);
  }

  async function reloadTenantResource(tenant, sectionId) {
    const key = `${tenant.id}:${sectionId}`;
    tenantResources.set(key, { status: 'loading', data: tenantResources.get(key)?.data ?? null });
    render();
    try {
      const data = await tenantResourceData(tenant, sectionId);
      tenantResources.set(key, { status: 'ready', data });
    } catch {
      tenantResources.set(key, { status: 'error', data: null });
    }
    render();
  }

  async function ensureVisibleResource() {
    if (!fleet || sessionState !== 'authenticated') return;
    const route = currentRoute();
    if (route.view === 'fleet') {
      await loadFleetResource(fleetView);
      return;
    }
    const tenant = fleet.tenants.find(({ id }) => id === route.tenantId);
    if (tenant) ensureTenantResource(tenant, route.section || 'overview');
  }

  async function previewEntitlements(tenant, proposals) {
    if (!proposals.length) return;
    const key = `${tenant.id}:entitlements`;
    const resource = tenantResources.get(key);
    const knownCapabilities = resource.data.workspace.capabilities.items.map(({ capabilityId }) => capabilityId);
    const preview = await dataSource.previewEntitlements({ tenantId: tenant.id, proposals, knownCapabilities });
    tenantResources.set(key, { status: 'ready', data: { ...resource.data, preview } });
    render();
  }

  async function previewPackage(tenant, packageId) {
    const key = `${tenant.id}:entitlements`;
    const resource = tenantResources.get(key);
    const preview = await dataSource.previewPackage({ tenantId: tenant.id, packageId });
    tenantResources.set(key, { status: 'ready', data: { ...resource.data, preview } });
    render();
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
    const correlation = await dataSource.lookupCorrelation({ tenantId: tenant.id, ...query });
    tenantResources.set(key, { status: 'ready', data: { ...resource.data, correlation } });
    render();
  }

  async function previewRecovery(tenant, recoveryId, target) {
    const key = `${tenant.id}:recovery`;
    const resource = tenantResources.get(key);
    const preview = await dataSource.previewRecovery({ tenantId: tenant.id, recoveryId, ...target });
    tenantResources.set(key, {
      status: 'ready',
      data: { ...resource.data, previews: { ...resource.data.previews, [recoveryId]: preview } },
    });
    render();
  }

  async function loadMoreRecoveryTargets(tenant, recoveryId, cursor) {
    const key = `${tenant.id}:recovery`;
    const resource = tenantResources.get(key);
    const current = resource.data.targets[recoveryId];
    const page = await dataSource.loadRecoveryTargets({
      tenantId: tenant.id,
      recoveryId,
      cursor,
    });
    tenantResources.set(key, {
      status: 'ready',
      data: {
        ...resource.data,
        targets: {
          ...resource.data.targets,
          [recoveryId]: { ...page, items: Object.freeze([...current.items, ...page.items]) },
        },
      },
    });
    render();
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

  function renderNavigation(route, tenant) {
    clear(nodes.navigation);
    nodes.navigation.setAttribute('aria-label', t('platformAdmin.navigation.label'));
    const list = el('ul', { className: 'nav-list' });
    PLATFORM_FLEET_VIEW_DEFINITIONS
      .filter(({ permission }) => currentOperator?.permissions.includes(permission))
      .forEach((definition) => {
        const active = route.view === 'fleet' && fleetView === definition.id;
        const control = button(t(definition.titleKey), {
          className: `nav-item${active ? ' active' : ''}`,
          attrs: active ? { 'aria-current': 'page' } : {},
          dataset: { platformAdminFleetView: definition.id },
        });
        control.addEventListener('click', () => {
          fleetView = definition.id;
          navigate(platformAdminFleetHash());
        });
        list.append(el('li', {}, [control]));
      });
    if (tenant) {
      PLATFORM_ADMIN_SECTION_DEFINITIONS.forEach((definition) => {
        const active = route.section === definition.id;
        const control = button(t(definition.titleKey), {
          className: `nav-item${active ? ' active' : ''}`,
          attrs: active ? { 'aria-current': 'page' } : {},
          dataset: { platformAdminNavigate: definition.id },
        });
        control.addEventListener('click', () => navigate(platformAdminTenantHash(tenant.id, definition.id)));
        list.append(el('li', {}, [control]));
      });
    }
    nodes.navigation.appendChild(list);
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
    const section = el('section', { attrs: { 'aria-labelledby': 'platformAdminFleetTitle' } }, [
      el('h2', {
        id: 'platformAdminFleetTitle',
        className: 'sr-only',
        text: t('platformAdmin.fleet.directoryTitle'),
      }),
      renderFleetSummary(),
      renderCreateTenantControl(),
      renderFleetFilters(),
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
            el('h3', { text: tenant.displayName }),
            el('small', { text: tenant.reference || tenant.id }),
          ]),
          stateBadge(tenant.lifecycleState),
        ]),
        ...(tenant.readiness && tenant.integration ? [el('div', { className: 'platform-admin-inline-status' }, [
          el('span', { text: t('platformAdmin.field.readiness') }),
          stateBadge(tenant.readiness.state),
          el('span', { text: t('platformAdmin.field.integration') }),
          stateBadge(tenant.integration.state),
        ])] : []),
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
    const definition = PLATFORM_FLEET_VIEW_DEFINITIONS.find(({ id }) => id === fleetView);
    setHeading(t(definition.titleKey), t(`platformAdmin.fleetView.${fleetView}.description`));
    return renderPlatformFleetView({
      view: fleetView,
      resource: fleetResources.get(fleetView),
      onRetry: () => loadFleetResource(fleetView, { force: true }),
      onSelectTenant: openTenantFromFleet,
      onLoadMore: (cursor) => loadFleetResource(fleetView, { cursor, append: true }),
    });
  }

  function renderCreateTenantControl() {
    const permission = 'platform:invitation:manage';
    if (!currentOperator.permissions.includes(permission)) return null;
    const panel = el('section', {
      className: 'card platform-admin-create-panel',
      attrs: { 'aria-labelledby': 'platformAdminCreateTenantTitle' },
    }, [
      el('h2', { id: 'platformAdminCreateTenantTitle', text: t('platformAdmin.create.title') }),
      el('p', { text: t('platformAdmin.create.description') }),
    ]);
    const controls = el('div', { className: 'button-row' });
    if (shouldPresentPlatformPermission(currentOperator, permission)) {
      const create = button(t('platformAdmin.create.start'), {
        className: 'primary',
        dataset: { platformAdminCreateTenant: 'true' },
      });
      create.addEventListener('click', createPendingTenant);
      controls.appendChild(create);
    } else if (typeof onStepUp === 'function') {
      const stepUp = button(t('platformAdmin.actions.stepUp'), { className: 'secondary' });
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
    const dialog = openDialog({
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
    const confirm = button(t('platformAdmin.action.confirm'), {
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
    const dialog = openDialog({
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
    const dialog = openDialog({
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
    const confirm = button(t('platformAdmin.action.confirm'), { className: 'danger' });
    const dialog = openDialog({
      title: t(titleKey),
      description: t(effectKey),
      content: el('div', {}, [
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
    const dialog = openDialog({
      title: t('platformAdmin.metering.editQuotaTitle', { dimension: quota.dimension }),
      description: t('platformAdmin.metering.editQuotaDescription'),
      content: el('div', {}, [
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
    setHeading(tenant.displayName, `${tenant.reference} · ${t(definition.titleKey)}`);
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
          text: t(definition.titleKey),
          attrs: { tabindex: '-1' },
        }),
        el('p', { text: t(definition.descriptionKey) }),
      ]),
    ]);
    section.querySelector('.platform-admin-back-link').addEventListener('click', () => navigate(platformAdminFleetHash()));
    if (actionError) {
      section.append(el('div', { className: 'platform-admin-error', attrs: { role: 'alert' } }, [
        el('strong', { text: t('platformAdmin.action.failedTitle') }),
        el('p', { text: t('platformAdmin.action.failed') }),
      ]));
    }
    section.append(renderPlatformAdminTenantSection({
      sectionId: definition.id,
      tenant,
      operator: currentOperator,
      resource,
      onAction: (action) => confirmAction(tenant, action),
      onStepUp,
      onRetry: () => reloadTenantResource(tenant, definition.id),
      onEntitlementPreview: (proposals) => previewEntitlements(tenant, proposals),
      onPackagePreview: (packageId) => previewPackage(tenant, packageId),
      onEntitlementApply: (preview) => applyEntitlementPreview(tenant, preview),
      onPackageApply: (preview) => applyPackagePreview(tenant, preview),
      onCorrelationLookup: (query) => lookupCorrelation(tenant, query),
      onRecoveryPreview: (recoveryId, target) => previewRecovery(tenant, recoveryId, target),
      onRecoveryExecute: (recoveryId, preview) => executeRecovery(tenant, recoveryId, preview),
      onRecoveryTargetsMore: (recoveryId, cursor) => loadMoreRecoveryTargets(tenant, recoveryId, cursor),
      onQuotaSet: (quota) => editQuota(tenant, quota),
    }));
    return section;
  }

  function render() {
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
      nodes.app.appendChild(sessionGate(sessionState, signInPath));
      return;
    }
    const route = currentRoute();
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
      : fleetView === 'directory'
        ? renderFleetDirectory()
        : renderSelectedFleetView());
  }

  async function loadFleet({ cursor = null, append = false } = {}) {
    const currentGeneration = ++fleetRequestGeneration;
    loading = !append;
    directoryLoadingMore = append;
    if (!append) loadError = false;
    actionError = false;
    render();
    try {
      const result = await dataSource.loadFleet({ ...filters, cursor });
      if (currentGeneration !== fleetRequestGeneration) return;
      fleet = append && fleet
        ? Object.freeze({
          ...result,
          tenants: Object.freeze([...fleet.tenants, ...result.tenants]),
        })
        : result;
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
        render();
        void ensureVisibleResource();
      }
    }
  }

  function languageChanged() {
    render();
  }

  function routeChanged() {
    actionError = false;
    render();
    void ensureVisibleResource();
    focusHeading();
  }

  async function start() {
    if (!windowRef.location.hash) windowRef.history.replaceState(null, '', platformAdminFleetHash());
    windowRef.addEventListener('hashchange', routeChanged);
    windowRef.addEventListener('popstate', routeChanged);
    windowRef.addEventListener('conference-language-changed', languageChanged);
    render();
    if (sessionState === 'authenticated') await loadFleet();
  }

  function stop() {
    windowRef.removeEventListener('hashchange', routeChanged);
    windowRef.removeEventListener('popstate', routeChanged);
    windowRef.removeEventListener('conference-language-changed', languageChanged);
  }

  if (PLATFORM_ADMIN_SECTION_DEFINITIONS.length !== PLATFORM_ADMIN_SECTIONS.length) {
    throw new TypeError('PLATFORM_ADMIN_SECTION_REGISTRY_INCOMPLETE');
  }
  return Object.freeze({ start, stop, render });
}
