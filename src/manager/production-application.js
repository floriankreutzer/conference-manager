import { locale, t } from '../core/i18n.js';
import { loadOpenBookingChanges } from '../shared/booking-change-loader.js';
import { openProductionBookingChangeDialog } from '../shared/production-booking-change-editor.js';
import {
  loadCoherentRequestRoomContext,
  loadMissingRequestRoomContexts,
} from '../shared/request-room-context-loader.js';
import { formatProductionDateTime } from '../core/production-time.js';
import { button, clear, el, field, openDialog, showToast } from '../core/ui.js';
import { roomPlanProjection, siteLocalIsoDate } from './server-room-plan.js';
import { renderProductionRequestBusinessDetails } from '../shared/production-request-details.js';
import {
  managerCanProposeBookingChange,
  managerRequestActions,
} from './production-request-actions.js';

const REASON_TRANSITIONS = new Set(['reject', 'request_change']);
const ACTION_LABEL = Object.freeze({
  start_review: 'production.manager.startReview',
  confirm: 'production.manager.confirm',
  reject: 'production.manager.reject',
  request_change: 'production.manager.requestChange',
  cancel: 'production.manager.cancel',
});

function errorMessage(error) {
  const causeCode = error?.cause?.code;
  if (causeCode === 'HTTP_401') return t('production.error.session');
  if (causeCode === 'HTTP_403') return t('production.error.forbidden');
  if (causeCode === 'HTTP_409') return t('production.error.conflict');
  return t('production.error.generic');
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
    el('dd', { text: ['pending', 'applying', 'applied', 'rejected'].includes(request.status)
      ? t(`production.bookingChange.status.${request.status}`)
      : t(`status.${request.status}`) }),
  ]);
}

export function createProductionManagerApplication({
  appRoot,
  setPageHeading,
  persistence,
  requestMutations = new Map(),
} = {}) {
  if (!appRoot || typeof setPageHeading !== 'function') throw new TypeError('PRODUCTION_MANAGER_UI_REQUIRED');
  if (!(requestMutations instanceof Map)) {
    throw new TypeError('PRODUCTION_MANAGER_MUTATION_STATE_REQUIRED');
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

  function cancelRequestDialog(
    request,
    catalog,
    currentRoomContext,
    refresh,
    beginMutation,
    restoreMutationControls,
    isCurrent,
  ) {
    const dismiss = button(t('common.cancel'));
    const confirm = button(t('production.manager.cancel'), { className: 'danger' });
    const error = el('p', {
      className: 'field-error',
      attrs: { role: 'alert', 'aria-live': 'assertive' },
    });
    const requestTitle = request.details?.title
      || t('production.common.requestId', { id: request.id });
    const dialog = openDialog({
      title: t('production.manager.cancelTitle'),
      description: t('production.manager.cancelDescription', { title: requestTitle }),
      content: el('section', {}, [requestSummary(request, catalog, currentRoomContext), error]),
      actions: [dismiss, confirm],
      labelledById: `managerCancelTitle-${request.id}`,
    });
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
      const mutation = beginMutation('cancel', () => (
        persistence.transitionRequest(request.id, { transition: 'cancel' })
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
        showToast(t('production.manager.cancelled'));
        mutation.refreshed = true;
        await refresh(request.id);
      } catch (caught) {
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

  function reasonDialog(request, transition, refresh, beginMutation, restoreMutationControls, isCurrent) {
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
        persistence.transitionRequest(request.id, { transition, reason })
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
      } catch (error) {
        pending = false;
        restoreMutationControls();
        submit.disabled = false;
        cancel.disabled = false;
        if (isCurrent()) showToast(errorMessage(error));
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

  async function renderManager() {
    clear(appRoot);
    setPageHeading(t('production.manager.title'), t('production.manager.subtitle'));
    const root = el('section', { className: 'card' }, [
      el('p', { className: 'muted', text: t('production.common.loading') }),
    ]);
    appRoot.appendChild(root);
    let refreshGeneration = 0;
    let hasCommittedProjection = false;
    let committedProjectionGeneration = 0;
    let interactiveProjectionGeneration = 0;
    const isActiveSurface = () => (
      root.isConnected
      && document.documentElement.dataset.sessionLocked !== 'true'
    );
    const isCurrent = (generation) => (
      generation === refreshGeneration
      && isActiveSurface()
    );
    const isInteractiveProjection = (generation) => (
      generation === interactiveProjectionGeneration
      && isActiveSurface()
    );

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
        clear(root);
        root.removeAttribute('aria-busy');
        hasCommittedProjection = true;
        committedProjectionGeneration = generation;
        interactiveProjectionGeneration = generation;
        const refreshButton = button(t('production.common.refresh'));
        refreshButton.addEventListener('click', () => { void refresh(); });
        const roomPlanButton = button(t('manager.roomPlan'));
        roomPlanButton.addEventListener('click', () => {
          const sites = catalog.sites.filter((site) => (
            catalog.rooms.some((room) => room.siteId === site.id) && site.timeZone
          ));
          if (!sites.length) {
            showToast(t('production.employee.timeZoneUnavailable'));
            return;
          }
          const siteSelect = el('select');
          sites.forEach((site) => siteSelect.appendChild(el('option', {
            value: site.id,
            text: site.name,
          })));
          const dateErrorId = 'productionRoomPlanDateError';
          const date = el('input', {
            attrs: {
              type: 'date',
              value: siteLocalIsoDate(Date.now(), sites[0].timeZone),
              required: 'required',
              'aria-describedby': dateErrorId,
            },
          });
          const dateError = el('p', {
            id: dateErrorId,
            className: 'field-error',
            attrs: { role: 'alert', 'aria-live': 'assertive' },
          });
          const tableRoot = el('section');
          const renderTable = () => {
            const site = sites.find((entry) => entry.id === siteSelect.value);
            let projection;
            try {
              projection = roomPlanProjection({
                catalog,
                requests,
                siteId: site.id,
                date: date.value,
              });
            } catch (error) {
              if (error instanceof Error && error.message === 'ROOM_PLAN_DATE_INVALID') {
                date.setAttribute('aria-invalid', 'true');
                dateError.textContent = t('validation.date');
                tableRoot.replaceChildren();
                return;
              }
              throw error;
            }
            date.removeAttribute('aria-invalid');
            dateError.textContent = '';
            const table = el('table', { className: 'data-table' });
            table.appendChild(el('thead', {}, el('tr', {}, [
              el('th', { text: t('production.employee.room') }),
              el('th', { text: t('production.employee.start') }),
              el('th', { text: t('schedule.title') }),
              el('th', { text: t('production.common.status') }),
            ])));
            const body = el('tbody');
            projection.forEach(({ room, requests: bookings }) => {
              if (!bookings.length) {
                body.appendChild(el('tr', {}, [
                  el('td', { text: roomLabel(room) }),
                  el('td', { text: '—' }),
                  el('td', { text: '—' }),
                  el('td', { text: t('room.available') }),
                ]));
                return;
              }
              bookings.forEach((request) => body.appendChild(el('tr', {}, [
                el('td', { text: roomLabel(room) }),
                el('td', { text: formattedRequestTime(request.startsAt, site.timeZone) }),
                el('td', { text: request.details?.title || t('production.common.requestId', { id: request.id }) }),
                el('td', { text: t(`status.${request.status}`) }),
              ])));
            });
            table.appendChild(body);
            tableRoot.replaceChildren(table);
          };
          siteSelect.addEventListener('change', () => {
            const site = sites.find((entry) => entry.id === siteSelect.value);
            date.value = siteLocalIsoDate(Date.now(), site.timeZone);
            renderTable();
          });
          date.addEventListener('change', renderTable);
          renderTable();
          const close = button(t('common.close'));
          const dialog = openDialog({
            title: t('manager.roomPlan'),
            description: t('manager.roomPlanDesc'),
            content: el('section', {}, [
              field({
                id: 'productionRoomPlanSite',
                label: t('schedule.location'),
                control: siteSelect,
              }),
              field({
                id: 'productionRoomPlanDate',
                label: t('manager.referenceDate'),
                control: date,
                required: true,
              }),
              dateError,
              tableRoot,
            ]),
            actions: [close],
            labelledById: 'productionRoomPlan',
          });
          close.addEventListener('click', () => dialog.close());
        });
        const reportButton = button(t('production.manager.reportTab'));
        reportButton.addEventListener('click', async () => {
          const reportGeneration = generation;
          const reportRefreshGeneration = refreshGeneration;
          const reportIsCurrent = () => (
            reportRefreshGeneration === refreshGeneration
            && isInteractiveProjection(reportGeneration)
            && reportButton.isConnected
          );
          reportButton.disabled = true;
          try {
            const year = new Date().getUTCFullYear();
            const report = await persistence.loadRequestReport(
              `${year}-01-01T00:00:00.000Z`, `${year + 1}-01-01T00:00:00.000Z`,
            );
            if (!reportIsCurrent()) return;
            const participants = report.requests.reduce((sum, entry) => (
              sum + entry.internalParticipants + entry.externalParticipants
            ), 0);
            const hours = report.requests.reduce((sum, entry) => (
              sum + (Date.parse(entry.endsAt) - Date.parse(entry.startsAt)) / 3_600_000
            ), 0);
            showToast(t('production.manager.reportSummary', {
              count: report.requests.length, participants, hours: hours.toFixed(1),
            }));
          } catch (error) {
            if (reportIsCurrent()) showToast(errorMessage(error));
          } finally {
            if (isActiveSurface() && reportButton.isConnected) reportButton.disabled = false;
          }
        });
        root.appendChild(el('div', { className: 'button-row' }, [
          refreshButton, roomPlanButton, reportButton,
        ]));
        if (!requests.length) {
          root.appendChild(el('p', { className: 'info-box', text: t('production.manager.none') }));
          return;
        }
        for (const [index, request] of requests.entries()) {
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
            if (mutationInFlight()) return null;
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
              const content = history.length
                ? history.map((entry) => el('p', {
                  text: `${entry.version} · ${t(`timeline.operation.${entry.operation}`)} · ${formattedRequestTime(entry.capturedAt, 'UTC')}`,
                }))
                : [el('p', { text: t('production.manager.historyEmpty') })];
              const close = button(t('common.close'));
              const dialog = openDialog({
                title: t('production.manager.historyTab'), content: el('section', {}, content),
                actions: [close], labelledById: `requestHistory-${request.id}`,
              });
              close.addEventListener('click', () => dialog.close());
            } catch (error) {
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
              el('h4', { text: t('production.bookingChange.pendingTitle') }),
              requestSummary(bookingChange, catalog),
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
          } else if (managerCanProposeBookingChange(request.status, bookingChange)) {
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
                openProductionBookingChangeDialog({
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
                });
              } catch (caught) {
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
                if (transition === 'cancel') {
                  cancelRequestDialog(
                    request,
                    catalog,
                    roomContexts[index],
                    refresh,
                    beginMutation,
                    restoreMutationControls,
                    isActiveSurface,
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
                  );
                  return;
                }
                const mutation = beginMutation(transition, () => (
                  persistence.transitionRequest(request.id, { transition })
                ));
                if (!mutation) return;
                try {
                  await mutation.promise;
                  if (!isActiveSurface()) return;
                  showToast(t('production.manager.transitioned'));
                  mutation.refreshed = true;
                  await refresh(request.id);
                } catch (error) {
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
              () => { restoreMutationControls(); },
            );
          }
          root.appendChild(article);
        }
        if (focusRequestId) {
          requestAnimationFrame(() => {
            if (!isCurrent(generation)) return;
            [...root.querySelectorAll('[data-production-request-id]')]
              .find((card) => card.dataset.productionRequestId === focusRequestId)
              ?.focus();
          });
        }
      } catch {
        if (!isCurrent(generation)) return;
        root.removeAttribute('aria-busy');
        if (hasCommittedProjection && focusRequestId === null) {
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
