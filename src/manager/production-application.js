import { locale, t } from '../core/i18n.js';
import { formatProductionDateTime } from '../core/production-time.js';
import { button, clear, el, field, openDialog, showToast } from '../core/ui.js';

const ACTIONS_BY_STATUS = Object.freeze({
  Submitted: Object.freeze(['start_review', 'reject', 'request_change']),
  'In Review': Object.freeze(['confirm', 'reject', 'request_change']),
});
const REASON_TRANSITIONS = new Set(['reject', 'request_change']);
const ACTION_LABEL = Object.freeze({
  start_review: 'production.manager.startReview',
  confirm: 'production.manager.confirm',
  reject: 'production.manager.reject',
  request_change: 'production.manager.requestChange',
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

function roomTimeZone(room, catalog) {
  const site = catalog.sites?.find((entry) => entry.id === room?.siteId);
  return site?.timeZone || null;
}

function formattedRequestTime(value, timeZone) {
  return formatProductionDateTime(value, { locale: locale(), timeZone })
    || t('production.common.timeUnavailable');
}

function requestSummary(request, catalog) {
  const room = catalog.rooms.find((entry) => entry.id === request.roomId);
  const timeZone = roomTimeZone(room, catalog);
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

export function createProductionManagerApplication({ appRoot, setPageHeading, persistence } = {}) {
  if (!appRoot || typeof setPageHeading !== 'function') throw new TypeError('PRODUCTION_MANAGER_UI_REQUIRED');
  if (
    !persistence
    || typeof persistence.listRequests !== 'function'
    || typeof persistence.loadCatalog !== 'function'
    || typeof persistence.loadBookingChange !== 'function'
    || typeof persistence.decideBookingChange !== 'function'
  ) {
    throw new TypeError('PRODUCTION_PERSISTENCE_REQUIRED');
  }

  function reasonDialog(request, transition, refresh) {
    const textarea = el('textarea', { attrs: { maxlength: '1000' } });
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
    textarea.addEventListener('input', () => {
      textarea.removeAttribute('aria-invalid');
      error.textContent = '';
    });
    cancel.addEventListener('click', () => dialog.close());
    submit.addEventListener('click', async () => {
      const reason = textarea.value.trim();
      if (!reason) {
        textarea.setAttribute('aria-invalid', 'true');
        error.textContent = t('production.manager.reasonRequired');
        textarea.focus();
        return;
      }
      submit.disabled = true;
      try {
        await persistence.transitionRequest(request.id, { transition, reason });
        dialog.close();
        showToast(t('production.manager.transitioned'));
        await refresh(request.id);
      } catch (error) {
        submit.disabled = false;
        showToast(errorMessage(error));
      }
    });
  }

  function rejectChangeDialog(request, change, refresh) {
    const textarea = el('textarea', { attrs: { maxlength: '1000' } });
    const error = el('p', { className: 'field-error', attrs: { role: 'alert' } });
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
    cancel.addEventListener('click', () => dialog.close());
    reject.addEventListener('click', async () => {
      const reason = textarea.value.trim();
      if (!reason) {
        error.textContent = t('production.manager.reasonRequired');
        textarea.focus();
        return;
      }
      reject.disabled = true;
      try {
        await persistence.decideBookingChange(request.id, change.id, 'reject', reason);
        dialog.close();
        showToast(t('production.bookingChange.rejected'));
        await refresh(request.id);
      } catch (caught) {
        reject.disabled = false;
        showToast(errorMessage(caught));
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

    async function refresh(focusRequestId = null) {
      clear(root);
      root.appendChild(el('p', { className: 'muted', text: t('production.common.loading') }));
      try {
        const [catalog, requests] = await Promise.all([
          persistence.loadCatalog(),
          persistence.listRequests(),
        ]);
        const changes = await Promise.all(requests.map((request) => (
          request.status === 'Confirmed' ? persistence.loadBookingChange(request.id) : null
        )));
        clear(root);
        const refreshButton = button(t('production.common.refresh'));
        refreshButton.addEventListener('click', refresh);
        root.appendChild(el('div', { className: 'button-row' }, [refreshButton]));
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
            el('h3', { text: t('production.common.requestId', { id: request.id }) }),
            requestSummary(request, catalog),
          ]);
          if (request.statusReason) article.appendChild(el('p', { text: request.statusReason }));
          if (bookingChange) {
            article.append(
              el('h4', { text: t('production.bookingChange.pendingTitle') }),
              requestSummary(bookingChange, catalog),
            );
            const approve = button(t('production.bookingChange.approve'), { className: 'primary' });
            const reject = button(t('production.bookingChange.reject'), { className: 'danger' });
            approve.addEventListener('click', async () => {
              approve.disabled = true;
              try {
                const result = await persistence.decideBookingChange(
                  request.id,
                  bookingChange.id,
                  'approve',
                );
                if (result.status === 'blocked') {
                  const labels = result.alternatives.map((id) => roomLabel(
                    catalog.rooms.find((room) => room.id === id),
                  ) || id);
                  showToast(labels.length
                    ? t('production.bookingChange.blockedAlternatives', { alternatives: labels.join(', ') })
                    : t('production.bookingChange.blocked'));
                  approve.disabled = false;
                  return;
                }
                showToast(t('production.bookingChange.applied'));
                await refresh(request.id);
              } catch (caught) {
                approve.disabled = false;
                showToast(errorMessage(caught));
              }
            });
            reject.addEventListener('click', () => rejectChangeDialog(request, bookingChange, refresh));
            article.appendChild(el('div', { className: 'button-row' }, [approve, reject]));
          }
          const actions = ACTIONS_BY_STATUS[request.status] || [];
          if (actions.length) {
            const row = el('div', { className: 'button-row' });
            actions.forEach((transition) => {
              const control = button(t(ACTION_LABEL[transition]), {
                className: transition === 'confirm' ? 'primary' : (transition === 'reject' ? 'danger' : ''),
              });
              control.addEventListener('click', async () => {
                if (REASON_TRANSITIONS.has(transition)) {
                  reasonDialog(request, transition, refresh);
                  return;
                }
                control.disabled = true;
                try {
                  await persistence.transitionRequest(request.id, { transition });
                  showToast(t('production.manager.transitioned'));
                  await refresh(request.id);
                } catch (error) {
                  control.disabled = false;
                  showToast(errorMessage(error));
                }
              });
              row.appendChild(control);
            });
            article.appendChild(row);
          }
          root.appendChild(article);
        }
        if (focusRequestId) {
          requestAnimationFrame(() => {
            [...root.querySelectorAll('[data-production-request-id]')]
              .find((card) => card.dataset.productionRequestId === focusRequestId)
              ?.focus();
          });
        }
      } catch {
        clear(root);
        root.appendChild(el('p', { className: 'error-box', text: t('production.employee.loadError') }));
      }
    }

    await refresh();
  }

  return Object.freeze({ renderManager });
}
