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
    el('dd', { text: t(`status.${request.status}`) }),
  ]);
}

export function createProductionManagerApplication({ appRoot, setPageHeading, persistence } = {}) {
  if (!appRoot || typeof setPageHeading !== 'function') throw new TypeError('PRODUCTION_MANAGER_UI_REQUIRED');
  if (
    !persistence
    || typeof persistence.listRequests !== 'function'
    || typeof persistence.loadCatalog !== 'function'
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
        clear(root);
        const refreshButton = button(t('production.common.refresh'));
        refreshButton.addEventListener('click', refresh);
        root.appendChild(el('div', { className: 'button-row' }, [refreshButton]));
        if (!requests.length) {
          root.appendChild(el('p', { className: 'info-box', text: t('production.manager.none') }));
          return;
        }
        for (const request of requests) {
          const article = el('article', {
            className: 'request-card',
            dataset: { productionRequestId: request.id },
            attrs: { tabindex: '-1' },
          }, [
            el('h3', { text: t('production.common.requestId', { id: request.id }) }),
            requestSummary(request, catalog),
          ]);
          if (request.statusReason) article.appendChild(el('p', { text: request.statusReason }));
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
