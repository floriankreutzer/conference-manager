import { formatNumber, locale, t } from '../core/i18n.js';
import { loadOpenBookingChanges } from '../shared/booking-change-loader.js';
import { openProductionBookingChangeDialog } from '../shared/production-booking-change-editor.js';
import {
  loadCoherentRequestRoomContext,
  loadMissingRequestRoomContexts,
} from '../shared/request-room-context-loader.js';
import { formatProductionDateTime } from '../core/production-time.js';
import { button, clear, el, field, openDialog, showToast } from '../core/ui.js';
import { managerCockpitModel, filterManagerEntries } from './server-cockpit-model.js';
import { renderManagerReports, renderManagerRoomPlan } from './server-analytics-view.js';
import { renderProductionRequestBusinessDetails } from '../shared/production-request-details.js';
import {
  managerCanProposeBookingChange,
  managerRequestActions,
} from './production-request-actions.js';
import { authorityFailureCode } from '../shared/authority-failure.js';
import { createAuthoritySurfaceRegistry } from '../shared/authority-surface-registry.js';
import { closeDetachedPrintWindows } from '../shared/detached-print-window.js';

const REASON_TRANSITIONS = new Set(['reject', 'request_change']);
const ACTION_LABEL = Object.freeze({
  start_review: 'production.manager.startReview',
  confirm: 'production.manager.confirm',
  reject: 'production.manager.reject',
  request_change: 'production.manager.requestChange',
  cancel: 'production.manager.cancel',
});

function errorMessage(error) {
  const causeCode = authorityFailureCode(error) || error?.cause?.code;
  if (causeCode === 'HTTP_401') return t('production.error.session');
  if (causeCode === 'HTTP_403') return t('production.error.forbidden');
  if (causeCode === 'HTTP_409') return t('production.error.conflict');
  return t('production.error.generic');
}

function attributionText(snapshot, key = 'manager.restore.actor') {
  return t(key, { name: snapshot?.displayName || t('manager.restore.unavailableName'),
    role: snapshot?.roleAtAction ? t(`manager.restore.role.${snapshot.roleAtAction}`) : t('manager.restore.unavailableName') });
}

function roomLabel(room) {
  return room ? String(room.name || room.id) : '';
}

function roomTimeZone(room, catalog, currentRoomContext = null) {
  const site = catalog.sites?.find((entry) => entry.id === room?.siteId);
  return site?.timeZone || (
    currentRoomContext?.site?.id === room?.siteId ? currentRoomContext.site.timeZone : null
  );
}

function formattedRequestTime(value, timeZone) {
  return formatProductionDateTime(value, { locale: locale(), timeZone })
    || t('production.common.timeUnavailable');
}

function requestSummary(request, catalog, currentRoomContext = null) {
  const room = catalog.rooms.find((entry) => entry.id === request.roomId)
    || (currentRoomContext?.room?.id === request.roomId ? currentRoomContext.room : null);
  const timeZone = roomTimeZone(room, catalog, currentRoomContext);
  const participants = Number(request.internalParticipants || 0) + Number(request.externalParticipants || 0);
  return el('dl', { className: 'details-list' }, [
    el('dt', { text: t('production.employee.room') }),
    el('dd', { text: roomLabel(room) || request.roomId }),
    el('dt', { text: t('production.employee.start') }),
    el('dd', { text: formattedRequestTime(request.startsAt, timeZone) }),
    el('dt', { text: t('production.employee.end') }),
    el('dd', { text: formattedRequestTime(request.endsAt, timeZone) }),
    el('dt', { text: t('production.common.participants', { count: participants }) }),
    el('dd', { text: `${request.internalParticipants} / ${request.externalParticipants}` }),
    el('dt', { text: t('production.common.status') }),
    el('dd', { text: ['pending', 'applying', 'applied', 'rejected', 'superseded'].includes(request.status)
      ? t(`production.bookingChange.status.${request.status}`)
      : t(`status.${request.status}`) }),
  ]);
}

export function createProductionManagerApplication({
  appRoot,
  setPageHeading,
  persistence,
  requestMutations = new Map(),
  onOpenBusinessSettings = null,
  onAuthorityFailure = null,
} = {}) {
  if (!appRoot || typeof setPageHeading !== 'function') throw new TypeError('PRODUCTION_MANAGER_UI_REQUIRED');
  if (!(requestMutations instanceof Map)) {
    throw new TypeError('PRODUCTION_MANAGER_MUTATION_STATE_REQUIRED');
  }
  if (onOpenBusinessSettings !== null && typeof onOpenBusinessSettings !== 'function') {
    throw new TypeError('PRODUCTION_MANAGER_SETTINGS_NAVIGATION_REQUIRED');
  }
  if (onAuthorityFailure !== null && typeof onAuthorityFailure !== 'function') {
    throw new TypeError('PRODUCTION_MANAGER_AUTHORITY_HANDLER_REQUIRED');
  }
  if (
    !persistence
    || typeof persistence.listRequests !== 'function'
    || typeof persistence.loadCatalog !== 'function'
    || typeof persistence.loadBookingChange !== 'function'
    || typeof persistence.loadRequestRoomContext !== 'function'
    || typeof persistence.proposeBookingChange !== 'function'
    || typeof persistence.decideBookingChange !== 'function'
    || typeof persistence.transitionRequest !== 'function'
    || typeof persistence.loadRequestHistory !== 'function'
    || typeof persistence.loadRequestReport !== 'function'
  ) {
    throw new TypeError('PRODUCTION_PERSISTENCE_REQUIRED');
  }
  const authoritySurfaces = createAuthoritySurfaceRegistry();

  function requestDecisionDialog(
    request,
    catalog,
    currentRoomContext,
    refresh,
    beginMutation,
    restoreMutationControls,
    isCurrent,
    onAuthorityFailure,
    transition = 'cancel',
  ) {
    const dismiss = button(t('common.cancel'));
    const confirm = button(t(ACTION_LABEL[transition]), { className: transition === 'cancel' ? 'danger' : 'primary' });
    const error = el('p', {
      className: 'field-error',
      attrs: { role: 'alert', 'aria-live': 'assertive' },
    });
    const requestTitle = request.details?.title
      || t('production.common.requestId', { id: request.id });
    const dialog = openDialog({
      title: t(transition === 'cancel' ? 'production.manager.cancelTitle' : 'manager.restore.confirmTitle'),
      description: t(transition === 'cancel' ? 'production.manager.cancelDescription' : 'manager.restore.confirmDescription', { title: requestTitle }),
      content: el('section', {}, [requestSummary(request, catalog, currentRoomContext), error]),
      actions: [dismiss, confirm],
      labelledById: `managerDecisionTitle-${request.id}`,
    });
    authoritySurfaces.track(dialog);
    let pending = false;
    dialog.addEventListener('cancel', (event) => {
      if (!pending) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true });
    dismiss.addEventListener('click', () => { if (!pending) dialog.close(); });
    confirm.addEventListener('click', async () => {
      if (pending) return;
      pending = true;
      confirm.disabled = true;
      dismiss.disabled = true;
      error.textContent = '';
      const mutation = beginMutation(transition, () => (
        transition === 'cancel'
          ? persistence.transitionRequest(request.id, { transition: 'cancel' }, request)
          : persistence.transitionRequest(request.id, { transition }, request)
      ));
      if (!mutation) {
        pending = false;
        confirm.disabled = false;
        dismiss.disabled = false;
        return;
      }
      try {
        await mutation.promise;
        dialog.close();
        if (!isCurrent()) return;
        showToast(t(transition === 'cancel' ? 'production.manager.cancelled' : 'production.manager.transitioned'));
        mutation.refreshed = true;
        await refresh(request.id);
      } catch (caught) {
        if (authorityFailureCode(caught)) {
          onAuthorityFailure(caught);
          return;
        }
        pending = false;
        restoreMutationControls();
        confirm.disabled = false;
        dismiss.disabled = false;
        if (isCurrent()) {
          if (dialog.isConnected) error.textContent = errorMessage(caught);
          else showToast(errorMessage(caught));
        }
      }
    });
  }

  function reasonDialog(
    request,
    transition,
    refresh,
    beginMutation,
    restoreMutationControls,
    isCurrent,
    onAuthorityFailure,
  ) {
    const textarea = el('textarea', { attrs: { maxlength: '1000', required: 'required' } });
    const errorId = `productionReasonError-${request.id}`;
    textarea.setAttribute('aria-describedby', errorId);
    const error = el('p', {
      id: errorId,
      className: 'field-error',
      attrs: { role: 'alert', 'aria-live': 'assertive' },
    });
    const content = el('section', {}, [field({
      id: `productionReason-${request.id}`,
      label: t('production.manager.reason'),
      control: textarea,
      required: true,
    }), error]);
    const cancel = button(t('common.cancel'));
    const submit = button(t(ACTION_LABEL[transition]), { className: transition === 'reject' ? 'danger' : 'primary' });
    const dialog = openDialog({
      title: t(ACTION_LABEL[transition]),
      content,
      actions: [cancel, submit],
      labelledById: `productionReasonTitle-${request.id}`,
    });
    authoritySurfaces.track(dialog);
    let pending = false;
    dialog.addEventListener('cancel', (event) => {
      if (!pending) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true });
    textarea.addEventListener('input', () => {
      textarea.removeAttribute('aria-invalid');
      error.textContent = '';
    });
    cancel.addEventListener('click', () => { if (!pending) dialog.close(); });
    submit.addEventListener('click', async () => {
      if (pending) return;
      const reason = textarea.value.trim();
      if (!reason) {
        textarea.setAttribute('aria-invalid', 'true');
        error.textContent = t('production.manager.reasonRequired');
        textarea.focus();
        return;
      }
      pending = true;
      submit.disabled = true;
      cancel.disabled = true;
      const mutation = beginMutation(transition, () => (
        persistence.transitionRequest(request.id, { transition, reason }, request)
      ));
      if (!mutation) {
        pending = false;
        submit.disabled = false;
        cancel.disabled = false;
        return;
      }
      try {
        await mutation.promise;
        dialog.close();
        if (!isCurrent()) return;
        showToast(t('production.manager.transitioned'));
        mutation.refreshed = true;
        await refresh(request.id);
      } catch (caught) {
        if (authorityFailureCode(caught)) {
          onAuthorityFailure(caught);
          return;
        }
        pending = false;
        restoreMutationControls();
        submit.disabled = false;
        cancel.disabled = false;
        if (isCurrent()) error.textContent = errorMessage(caught);
      }
    });
  }

  function rejectChangeDialog(request, change, beginMutation, handleDecisionResult, handleDecisionError) {
    const errorId = `changeRejectError-${change.id}`;
    const textarea = el('textarea', {
      attrs: { maxlength: '1000', required: 'required', 'aria-describedby': errorId },
    });
    const error = el('p', {
      id: errorId,
      className: 'field-error',
      attrs: { role: 'alert', 'aria-live': 'assertive' },
    });
    const cancel = button(t('common.cancel'));
    const reject = button(t('production.bookingChange.reject'), { className: 'danger' });
    const dialog = openDialog({
      title: t('production.bookingChange.reject'),
      content: el('section', {}, [
        field({ id: `changeReject-${change.id}`, label: t('production.manager.reason'), control: textarea, required: true }),
        error,
      ]),
      actions: [cancel, reject],
      labelledById: `changeRejectTitle-${change.id}`,
    });
    authoritySurfaces.track(dialog);
    textarea.addEventListener('input', () => {
      textarea.removeAttribute('aria-invalid');
      error.textContent = '';
    });
    let pending = false;
    dialog.addEventListener('cancel', (event) => {
      if (!pending) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true });
    cancel.addEventListener('click', () => { if (!pending) dialog.close(); });
    reject.addEventListener('click', async () => {
      if (pending) return;
      const reason = textarea.value.trim();
      if (!reason) {
        textarea.setAttribute('aria-invalid', 'true');
        error.textContent = t('production.manager.reasonRequired');
        textarea.focus();
        return;
      }
      const decision = beginMutation('reject', () => (
        persistence.decideBookingChange(request.id, change.id, 'reject', reason)
      ));
      if (!decision) return;
      pending = true;
      reject.disabled = true;
      cancel.disabled = true;
      try {
        const result = await decision.promise;
        dialog.close();
        await handleDecisionResult(decision, result);
      } catch (caught) {
        pending = false;
        reject.disabled = false;
        cancel.disabled = false;
        handleDecisionError(decision, caught);
      }
    });
  }

  let activeTab = 'BOOKINGS';
  let managerSearch = '';
  let managerStatus = 'ALL';
  let managerSite = 'ALL';
  let managerQuick = 'ALL';
  const roomPlanState = { siteId: null, date: null, view: 'LIST' };
  const reportState = { siteId: null, date: null, period: 'YEAR' };

  async function renderManager() {
    clear(appRoot);
    setPageHeading(t('production.manager.title'), t('production.manager.subtitle'));
    const root = el('section', { className: 'card manager-surface' }, [
      el('p', { className: 'muted', text: t('production.common.loading') }),
    ]);
    appRoot.appendChild(root);
    let refreshGeneration = 0;
    let hasCommittedProjection = false;
    let committedProjectionGeneration = 0;
    let interactiveProjectionGeneration = 0;
    let pendingTabFocus = null;
    let authorityProjectionInvalid = false;
    const isActiveSurface = () => (
      root.isConnected
      && document.documentElement.dataset.sessionLocked !== 'true'
      && !authorityProjectionInvalid
    );
    const isCurrent = (generation) => (
      generation === refreshGeneration
      && isActiveSurface()
    );
    const isInteractiveProjection = (generation) => (
      generation === interactiveProjectionGeneration
      && isActiveSurface()
    );
    const invalidateAuthorityProjection = (error) => {
      authorityProjectionInvalid = true;
      refreshGeneration += 1;
      requestMutations.clear();
      hasCommittedProjection = false;
      committedProjectionGeneration = 0;
      interactiveProjectionGeneration = 0;
      pendingTabFocus = null;
      closeDetachedPrintWindows();
      authoritySurfaces.closeAll();
      if (onAuthorityFailure?.(error)) return true;
      if (!root.isConnected) return false;
      clear(root);
      root.removeAttribute('aria-busy');
      const status = el('p', {
        className: 'error-box',
        text: errorMessage(error),
        attrs: { tabindex: '-1', role: 'status' },
      });
      root.appendChild(status);
      requestAnimationFrame(() => {
        if (authorityProjectionInvalid && root.isConnected) status.focus();
      });
      return true;
    };
    const handleAuthorityFailure = (error) => {
      if (!authorityFailureCode(error)) return false;
      invalidateAuthorityProjection(error);
      return true;
    };

    async function refresh(focusRequestId = null) {
      const generation = ++refreshGeneration;
      if (!isCurrent(generation)) return;
      interactiveProjectionGeneration = 0;
      if (hasCommittedProjection) {
        root.setAttribute('aria-busy', 'true');
      } else {
        clear(root);
        root.appendChild(el('p', { className: 'muted', text: t('production.common.loading') }));
      }
      try {
        const [catalog, requests] = await Promise.all([
          persistence.loadCatalog(),
          persistence.listRequests(),
        ]);
        if (!isCurrent(generation)) return;
        const [changes, roomContexts] = await Promise.all([
          loadOpenBookingChanges(requests, persistence),
          loadMissingRequestRoomContexts(requests, catalog, persistence),
        ]);
        if (!isCurrent(generation)) return;
        authorityProjectionInvalid = false;
        clear(root);
        root.removeAttribute('aria-busy');
        hasCommittedProjection = true;
        committedProjectionGeneration = generation;
        interactiveProjectionGeneration = generation;
        const tabs = el('nav', {
          className: 'manager-tabs',
          attrs: { role: 'tablist', 'aria-label': t('production.manager.title') },
        });
        const tabDefinitions = [
          ['BOOKINGS', 'manager.ready.bookingsTab'],
          ['ROOM_PLAN', 'manager.roomPlan'],
          ['REPORTS', 'manager.reports'],
          ['ADMIN', 'manager.admin'],
        ];
        tabDefinitions.forEach(([tabId, label], tabIndex) => {
          const tab = button(t(label), {
            id: `managerTab-${tabId}`,
            dataset: { managerTab: tabId },
            attrs: {
              role: 'tab',
              'aria-controls': 'managerWorkspacePanel',
              'aria-selected': String(activeTab === tabId),
              tabindex: activeTab === tabId ? '0' : '-1',
            },
          });
          tab.addEventListener('click', () => {
            if (activeTab === tabId) return;
            activeTab = tabId;
            pendingTabFocus = tabId;
            void refresh().then(() => {
              if (activeTab === tabId) root.querySelector(`[data-manager-tab="${tabId}"]`)?.focus();
            });
          });
          tab.addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const nextIndex = event.key === 'Home'
              ? 0
              : (event.key === 'End'
                ? tabDefinitions.length - 1
                : (tabIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabDefinitions.length)
                  % tabDefinitions.length);
            const [nextTab] = tabDefinitions[nextIndex];
            activeTab = nextTab;
            pendingTabFocus = nextTab;
            void refresh().then(() => {
              if (activeTab === nextTab) {
                root.querySelector(`[data-manager-tab="${nextTab}"]`)?.focus();
              }
            });
          });
          tabs.appendChild(tab);
        });
        root.appendChild(tabs);
        if (pendingTabFocus === activeTab) requestAnimationFrame(() => {
          if (!isCurrent(generation) || pendingTabFocus !== activeTab) return;
          root.querySelector(`[data-manager-tab="${activeTab}"]`)?.focus();
          pendingTabFocus = null;
        });

        const refreshButton = button(t('production.common.refresh'));
        refreshButton.addEventListener('click', () => { void refresh(); });
        root.appendChild(el('div', { className: 'button-row' }, [refreshButton]));

        const panel = el('section', {
          id: 'managerWorkspacePanel', className: 'manager-workspace-panel',
          attrs: { role: 'tabpanel', 'aria-labelledby': `managerTab-${activeTab}`, tabindex: '0' },
        });
        root.appendChild(panel);
        const openRequest = (id) => {
          activeTab = 'BOOKINGS'; managerSearch = ''; managerStatus = 'ALL'; managerSite = 'ALL'; managerQuick = 'ALL';
          void refresh(id);
        };
        if (activeTab === 'ROOM_PLAN') {
          panel.append(el('h2', { text: t('manager.roomPlan') }), el('p', { className: 'muted', text: t('manager.roomPlanDesc') }));
          renderManagerRoomPlan({ panel, catalog, requests, state: roomPlanState, openRequest });
          return;
        }
        if (activeTab === 'REPORTS') {
          panel.append(el('h2', { text: t('manager.reports') }), el('p', { className: 'muted', text: t('manager.reportDesc') }));
          await renderManagerReports({ panel, catalog, persistence: { loadRequestReport: (...range) => persistence.loadRequestReport(...range) }, state: reportState,
            isCurrent: () => isCurrent(generation) && activeTab === 'REPORTS', errorMessage,
            onAuthorityFailure: invalidateAuthorityProjection });
          return;
        }
        if (activeTab === 'ADMIN') {
          const adminRoot = el('div');
          const openSettings = button(t('managerSettings.title'), { className: 'primary' });
          openSettings.disabled = onOpenBusinessSettings === null;
          openSettings.addEventListener('click', () => (
            onOpenBusinessSettings?.(adminRoot, invalidateAuthorityProjection)
          ));
          panel.append(el('h2', { text: t('manager.admin') }),
            el('p', { text: t('managerSettings.description') }),
            el('div', { className: 'button-row' }, [openSettings]), adminRoot);
          onOpenBusinessSettings?.(adminRoot, invalidateAuthorityProjection);
          return;
        }

        const model = managerCockpitModel({ requests, catalog, roomContexts, changes });
        const quickDefinitions = [
          ['ACTION', 'manager.operational.action', model.action.length],
          ['TODAY', 'common.today', model.today.length],
          ['NEXT_SEVEN', 'manager.operational.next7', model.nextSevenDays.length],
          ['UPCOMING', 'manager.operational.upcomingFilter', model.upcoming.length],
        ];
        const metrics = el('section', { className: 'dashboard-grid' });
        quickDefinitions.forEach(([quick, key, count]) => {
          const control = button('', { className: 'kpi manager-parity-kpi', dataset: { managerQuick: quick }, attrs: { 'aria-pressed': String(managerQuick === quick) } });
          control.append(el('strong', { text: formatNumber(count) }), el('span', { text: t(key) }));
          control.addEventListener('click', () => { managerQuick = managerQuick === quick ? 'ALL' : quick; void refresh().then(() => root.querySelector(`[data-manager-quick="${quick}"]`)?.focus()); });
          metrics.appendChild(control);
        });
        panel.appendChild(metrics);
        const summaries = el('section', { className: 'manager-overview-columns' });
        for (const [entries, titleKey, emptyKey] of [
          [model.action, 'manager.operational.workNow', 'manager.operational.noAction'],
          [model.upcoming, 'manager.operational.upcoming', 'manager.operational.noUpcoming'],
        ]) {
          const summary = el('section', { className: 'manager-overview-card' }, [el('h3', { text: t(titleKey) })]);
          entries.slice(0, 4).forEach(({ request, room, site }) => {
            const open = button(t('manager.final.open'));
            open.addEventListener('click', () => openRequest(request.id));
            summary.appendChild(el('article', { className: 'manager-overview-row' }, [
              el('div', {}, [el('strong', { text: request.details?.title || t('production.common.requestId', { id: request.id }) }),
                el('small', { text: [room?.name, formattedRequestTime(request.startsAt, site?.timeZone), t(`status.${request.status}`)].filter(Boolean).join(' · ') })]), open,
            ]));
          });
          if (!entries.length) summary.appendChild(el('p', { className: 'muted', text: t(emptyKey) }));
          summaries.appendChild(summary);
        }
        panel.appendChild(summaries);
        const filters = el('form', { className: 'manager-filters' });
        const search = el('input', { value: managerSearch, attrs: { type: 'search', placeholder: t('manager.search') } });
        const status = el('select');
        status.appendChild(el('option', { value: 'ALL', text: t('manager.allStatuses') }));
        status.appendChild(el('option', { value: 'OPEN', text: t('manager.ux.openRequests') }));
        ['Submitted', 'In Review', 'Change Requested', 'Confirmed', 'Rejected', 'Cancelled'].forEach((value) => {
          status.appendChild(el('option', { value, text: t(`status.${value}`) }));
        });
        status.value = managerStatus;
        const site = el('select');
        site.appendChild(el('option', { value: 'ALL', text: t('manager.allLocations') }));
        catalog.sites.forEach((entry) => site.appendChild(el('option', { value: entry.id, text: entry.name })));
        site.value = managerSite;
        const applyFilters = () => {
          const focusedId = document.activeElement?.id;
          managerSearch = search.value.trim(); managerStatus = status.value; managerSite = site.value;
          void refresh().then(() => {
            if (['managerSearch', 'managerStatus', 'managerSite'].includes(focusedId)) root.querySelector(`#${focusedId}`)?.focus();
          });
        };
        filters.addEventListener('submit', (event) => { event.preventDefault(); applyFilters(); });
        search.addEventListener('change', applyFilters);
        status.addEventListener('change', applyFilters);
        site.addEventListener('change', applyFilters);
        const openOnly = button(t('manager.ux.openRequests'), { attrs: { 'aria-pressed': String(managerStatus === 'OPEN') } });
        openOnly.addEventListener('click', () => { managerStatus = 'OPEN'; void refresh(); });
        const reset = button(t('manager.ux.resetFilters'));
        reset.addEventListener('click', () => { managerSearch = ''; managerStatus = 'ALL'; managerSite = 'ALL'; managerQuick = 'ALL'; void refresh().then(() => root.querySelector('#managerSearch')?.focus()); });
        filters.append(
          field({ id: 'managerSearch', label: t('manager.search'), control: search }),
          field({ id: 'managerStatus', label: t('manager.status'), control: status }),
          field({ id: 'managerSite', label: t('manager.location'), control: site }), openOnly, reset,
        );
        panel.appendChild(filters);
        const visibleEntries = filterManagerEntries(model.entries, { search: managerSearch, status: managerStatus, siteId: managerSite, quick: managerQuick, locale: locale() });
        panel.appendChild(el('p', { className: 'manager-filter-count', attrs: { role: 'status' }, text: t('manager.operational.displayed', { shown: formatNumber(visibleEntries.length), total: formatNumber(requests.length) }) }));
        if (!visibleEntries.length) {
          panel.appendChild(el('p', { className: 'info-box', text: t(requests.length ? 'manager.restore.noResults' : 'production.manager.none') }));
          return;
        }
        for (const { request, index } of visibleEntries) {
          const bookingChange = changes[index];
          const article = el('article', {
            className: 'request-card',
            dataset: { productionRequestId: request.id },
            attrs: { tabindex: '-1' },
          }, [
            el('h3', { text: request.details?.title || t('production.common.requestId', { id: request.id }) }),
            request.details?.title
              ? el('p', { className: 'muted', text: t('production.common.requestId', { id: request.id }) })
              : null,
            el('p', { className: 'manager-requester', text: t('manager.restore.requester', { name: request.requesterAttribution?.displayName || t('manager.restore.unavailableName') }) }),
            requestSummary(request, catalog, roomContexts[index]),
          ]);
          const isActiveArticle = () => isActiveSurface() && article.isConnected;
          const isCurrentArticle = () => (
            isInteractiveProjection(generation) && article.isConnected
          );
          const businessDetails = renderProductionRequestBusinessDetails(request);
          if (businessDetails) article.appendChild(businessDetails);
          if (request.statusReason) article.appendChild(el('p', { text: request.statusReason }));
          const mutationControls = [];
          const mutationInFlight = () => requestMutations.has(request.id);
          const registerMutationControl = (control) => {
            mutationControls.push(control);
            control.disabled = mutationInFlight();
            return control;
          };
          const restoreMutationControls = () => {
            if (!isActiveArticle() || mutationInFlight()) return;
            mutationControls.forEach((control) => { control.disabled = false; });
          };
          const beginMutation = (kind, operation) => {
            if (!isCurrentArticle() || mutationInFlight()) return null;
            const tracked = {
              kind, notified: false, refreshed: false, promise: null,
            };
            tracked.promise = Promise.resolve().then(operation).finally(() => {
              if (requestMutations.get(request.id) === tracked) {
                requestMutations.delete(request.id);
              }
            });
            requestMutations.set(request.id, tracked);
            mutationControls.forEach((control) => { control.disabled = true; });
            tracked.promise.catch(() => { restoreMutationControls(); });
            return tracked;
          };
          const historyButton = button(t('production.manager.historyTab'));
          historyButton.addEventListener('click', async () => {
            const interactionGeneration = refreshGeneration;
            const isCurrentInteraction = () => (
              interactionGeneration === refreshGeneration && isCurrentArticle()
            );
            historyButton.disabled = true;
            try {
              const history = await persistence.loadRequestHistory(request.id);
              if (!isCurrentInteraction() || !historyButton.isConnected) return;
              const historicalRoom = catalog.rooms.find((entry) => entry.id === request.roomId) || roomContexts[index]?.room;
              const timeZone = roomTimeZone(historicalRoom, catalog, roomContexts[index]);
              const content = history.length
                ? [el('ol', { className: 'manager-request-timeline' }, [...history].sort((a, b) => a.version - b.version).map((entry) => el('li', {}, [
                  el('h3', { text: t(`timeline.operation.${entry.operation}`) }),
                  el('p', { text: formattedRequestTime(entry.capturedAt, timeZone) }),
                  el('p', { text: attributionText(entry.actorAttribution) }),
                  el('p', { text: t(`status.${entry.request.status}`) }),
                  entry.request.statusReason ? el('p', { text: entry.request.statusReason }) : null,
                ])))]
                : [el('p', { text: t('production.manager.historyEmpty') })];
              const close = button(t('common.close'));
              const dialog = openDialog({
                title: t('production.manager.historyTab'), content: el('section', {}, content),
                actions: [close], labelledById: `requestHistory-${request.id}`,
              });
              authoritySurfaces.track(dialog);
              close.addEventListener('click', () => dialog.close());
              dialog.addEventListener('close', () => {
                if (isCurrentInteraction() && historyButton.isConnected) historyButton.focus();
              });
            } catch (error) {
              if (handleAuthorityFailure(error)) return;
              if (isCurrentInteraction()) showToast(errorMessage(error));
            } finally {
              if (isActiveArticle() && historyButton.isConnected) historyButton.disabled = false;
            }
          });
          article.appendChild(historyButton);
          const notifyDecision = (tracked, message) => {
            if (!isActiveSurface() || tracked.notified) return;
            tracked.notified = true;
            showToast(message);
          };
          const handleDecisionResult = async (tracked, result) => {
            if (!isActiveSurface()) return;
            if (tracked.kind === 'reject') {
              notifyDecision(tracked, t('production.bookingChange.rejected'));
            } else if (result.status === 'blocked') {
              const labels = result.alternatives.map((id) => roomLabel(
                catalog.rooms.find((room) => room.id === id),
              ) || id);
              notifyDecision(tracked, labels.length
                ? t('production.bookingChange.blockedAlternatives', { alternatives: labels.join(', ') })
                : t('production.bookingChange.blocked'));
            } else {
              notifyDecision(tracked, t('production.bookingChange.applied'));
            }
            if (tracked.refreshed) return;
            tracked.refreshed = true;
            await refresh(request.id);
          };
          const handleDecisionError = (tracked, caught) => {
            if (handleAuthorityFailure(caught)) return;
            if (!isActiveSurface()) return;
            notifyDecision(tracked, errorMessage(caught));
            restoreMutationControls();
          };
          if (bookingChange === undefined && request.status === 'Confirmed') {
            article.appendChild(el('p', {
              className: 'error-box',
              text: t('production.bookingChange.unavailable'),
            }));
          } else if (bookingChange) {
            article.append(
              el('h4', { text: t(bookingChange.status === 'pending' ? 'production.bookingChange.pendingTitle' : 'manager.restore.changeRecord') }),
              requestSummary(bookingChange, catalog),
              el('p', { text: attributionText(bookingChange.initiatorAttribution, 'manager.restore.initiator') }),
              el('p', { text: ['pending', 'applying'].includes(bookingChange.status) ? t('manager.restore.decisionPending') : attributionText(bookingChange.deciderAttribution, 'manager.restore.decider') }),
            );
            if (bookingChange.status === 'pending') {
              const approve = registerMutationControl(button(
                t('production.bookingChange.approve'),
                { className: 'primary' },
              ));
              const reject = registerMutationControl(button(
                t('production.bookingChange.reject'),
                { className: 'danger' },
              ));
              approve.addEventListener('click', async () => {
                const decision = beginMutation('approve', () => persistence.decideBookingChange(
                  request.id,
                  bookingChange.id,
                  'approve',
                ));
                if (!decision) return;
                try {
                  const result = await decision.promise;
                  await handleDecisionResult(decision, result);
                } catch (caught) {
                  handleDecisionError(decision, caught);
                }
              });
              reject.addEventListener('click', () => {
                if (!mutationInFlight()) {
                  rejectChangeDialog(
                    request,
                    bookingChange,
                    beginMutation,
                    handleDecisionResult,
                    handleDecisionError,
                  );
                }
              });
              article.appendChild(el('div', { className: 'button-row' }, [approve, reject]));
            }
          }
          if (managerCanProposeBookingChange(request.status, bookingChange)) {
            const proposeChange = registerMutationControl(button(t('production.bookingChange.propose')));
            proposeChange.addEventListener('click', async () => {
              const interactionGeneration = refreshGeneration;
              const isCurrentInteraction = () => (
                interactionGeneration === refreshGeneration && isCurrentArticle()
              );
              const preparation = beginMutation('prepare-proposal', () => (
                loadCoherentRequestRoomContext(request, catalog, persistence)
              ));
              if (!preparation) return;
              try {
                const prepared = await preparation.promise;
                if (!isCurrentInteraction()) {
                  restoreMutationControls();
                  return;
                }
                if (!prepared) {
                  showToast(t('production.error.conflict'));
                  await refresh(request.id);
                  return;
                }
                restoreMutationControls();
                const dialog = openProductionBookingChangeDialog({
                  request,
                  catalog: prepared.catalog,
                  currentRoomContext: prepared.currentRoomContext,
                  persistence: {
                    proposeBookingChange: (...args) => {
                      const mutation = beginMutation('propose', () => (
                        persistence.proposeBookingChange(...args)
                      ));
                      return mutation?.promise || Promise.reject(new Error('REQUEST_MUTATION_IN_PROGRESS'));
                    },
                  },
                  refresh,
                  errorMessage,
                  onAuthorityFailure: invalidateAuthorityProjection,
                });
                if (dialog) authoritySurfaces.track(dialog);
              } catch (caught) {
                if (handleAuthorityFailure(caught)) return;
                if (!isCurrentInteraction()) return;
                restoreMutationControls();
                showToast(errorMessage(caught));
              }
            });
            article.appendChild(proposeChange);
          }
          const actions = managerRequestActions(request.status);
          if (actions.length) {
            const row = el('div', { className: 'button-row' });
            actions.forEach((transition) => {
              const control = registerMutationControl(button(t(ACTION_LABEL[transition]), {
                className: transition === 'confirm'
                  ? 'primary'
                  : (['reject', 'cancel'].includes(transition) ? 'danger' : ''),
              }));
              control.addEventListener('click', async () => {
                if (mutationInFlight()) return;
                if (['cancel', 'confirm'].includes(transition)) {
                  requestDecisionDialog(
                    request,
                    catalog,
                    roomContexts[index],
                    refresh,
                    beginMutation,
                    restoreMutationControls,
                    isActiveSurface,
                    invalidateAuthorityProjection,
                    transition,
                  );
                  return;
                }
                if (REASON_TRANSITIONS.has(transition)) {
                  reasonDialog(
                    request,
                    transition,
                    refresh,
                    beginMutation,
                    restoreMutationControls,
                    isActiveSurface,
                    invalidateAuthorityProjection,
                  );
                  return;
                }
                const mutation = beginMutation(transition, () => (
                  persistence.transitionRequest(request.id, { transition }, request)
                ));
                if (!mutation) return;
                try {
                  await mutation.promise;
                  if (!isActiveSurface()) return;
                  showToast(t('production.manager.transitioned'));
                  mutation.refreshed = true;
                  await refresh(request.id);
                } catch (error) {
                  if (handleAuthorityFailure(error)) return;
                  if (!isActiveSurface()) return;
                  restoreMutationControls();
                  showToast(errorMessage(error));
                }
              });
              row.appendChild(control);
            });
            article.appendChild(row);
          }
          const activeMutation = requestMutations.get(request.id);
          if (activeMutation && ['approve', 'reject'].includes(activeMutation.kind)) {
            activeMutation.promise.then(
              (result) => { void handleDecisionResult(activeMutation, result); },
              (caught) => { handleDecisionError(activeMutation, caught); },
            );
          } else if (activeMutation) {
            activeMutation.promise.then(
              () => {
                if (!isActiveSurface() || activeMutation.refreshed) return;
                activeMutation.refreshed = true;
                void refresh(request.id);
              },
              (caught) => {
                if (handleAuthorityFailure(caught)) return;
                if (isActiveSurface()) restoreMutationControls();
              },
            );
          }
          panel.appendChild(article);
        }
        if (focusRequestId) {
          requestAnimationFrame(() => {
            if (!isCurrent(generation)) return;
            [...root.querySelectorAll('[data-production-request-id]')]
              .find((card) => card.dataset.productionRequestId === focusRequestId)
              ?.focus();
          });
        }
      } catch (caught) {
        if (handleAuthorityFailure(caught)) return;
        if (generation !== refreshGeneration || !root.isConnected) return;
        if (!isCurrent(generation)) return;
        root.removeAttribute('aria-busy');
        if (hasCommittedProjection && focusRequestId === null && !authorityFailureCode(caught)) {
          interactiveProjectionGeneration = committedProjectionGeneration;
          showToast(t('production.employee.loadError'));
          return;
        }
        hasCommittedProjection = false;
        committedProjectionGeneration = 0;
        interactiveProjectionGeneration = 0;
        clear(root);
        root.appendChild(el('p', { className: 'error-box', text: t('production.employee.loadError') }));
      }
    }

    await refresh();
  }

  return Object.freeze({ renderManager });
}
