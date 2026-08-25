import { t } from '../core/i18n.js';
import { button, clear, el, field, showToast } from '../core/ui.js';
import { productionUtcInstant } from './production-time.js';

const CANCELLABLE_STATUSES = new Set(['Submitted', 'In Review', 'Change Requested']);
const MAX_PARTICIPANTS = 500;

function safeParticipantCount(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_PARTICIPANTS ? parsed : null;
}

function errorMessage(error) {
  const causeCode = error?.cause?.code;
  if (causeCode === 'HTTP_401') return t('production.error.session');
  if (causeCode === 'HTTP_403') return t('production.error.forbidden');
  if (causeCode === 'HTTP_409') return t('production.error.conflict');
  return t('production.error.generic');
}

function roomLabel(room) {
  const capacity = Number.isSafeInteger(Number(room.capacity)) ? Number(room.capacity) : null;
  return capacity ? `${room.name} · ${capacity}` : String(room.name || room.id);
}

function requestCard(request, catalog, onCancel) {
  const room = catalog.rooms.find((entry) => entry.id === request.roomId);
  const participants = Number(request.internalParticipants || 0) + Number(request.externalParticipants || 0);
  const article = el('article', { className: 'request-card' }, [
    el('h3', { text: t('production.common.requestId', { id: request.id }) }),
    el('p', { text: room ? roomLabel(room) : request.roomId }),
    el('p', { text: `${request.startsAt} – ${request.endsAt}` }),
    el('p', { text: t('production.common.participants', { count: participants }) }),
    el('p', { text: `${t('production.common.status')}: ${t(`status.${request.status}`)}` }),
  ]);
  if (request.statusReason) article.appendChild(el('p', { text: request.statusReason }));
  if (CANCELLABLE_STATUSES.has(request.status)) {
    const cancel = button(t('requests.cancel'), { className: 'danger' });
    cancel.addEventListener('click', () => onCancel(request.id, cancel));
    article.appendChild(cancel);
  }
  return article;
}

export function createProductionEmployeeApplication({ appRoot, setPageHeading, persistence } = {}) {
  if (!appRoot || typeof setPageHeading !== 'function') throw new TypeError('PRODUCTION_EMPLOYEE_UI_REQUIRED');
  if (!persistence || typeof persistence.loadCatalog !== 'function') {
    throw new TypeError('PRODUCTION_PERSISTENCE_REQUIRED');
  }

  let catalog = Object.freeze({ rooms: Object.freeze([]) });

  async function loadCatalog() {
    catalog = await persistence.loadCatalog();
    return catalog;
  }

  async function renderRequest() {
    clear(appRoot);
    setPageHeading(t('production.employee.title'), t('production.employee.subtitle'));
    const root = el('section', { className: 'card' }, [
      el('p', { className: 'muted', text: t('production.common.loading') }),
    ]);
    appRoot.appendChild(root);
    try {
      await loadCatalog();
    } catch {
      clear(root);
      root.appendChild(el('p', { className: 'error-box', text: t('production.employee.loadError') }));
      return;
    }
    clear(root);
    const rooms = catalog.rooms.filter((room) => room.active !== false);
    if (!rooms.length) {
      root.appendChild(el('p', { className: 'info-box', text: t('production.employee.noRooms') }));
      return;
    }

    const room = el('select');
    room.appendChild(el('option', { value: '', text: t('schedule.locationPlaceholder') }));
    rooms.forEach((entry) => room.appendChild(el('option', { value: entry.id, text: roomLabel(entry) })));
    const date = el('input', { attrs: { type: 'date' } });
    const start = el('input', { attrs: { type: 'time' } });
    const end = el('input', { attrs: { type: 'time' } });
    const internal = el('input', { attrs: { type: 'number', min: '0', max: String(MAX_PARTICIPANTS), value: '1' } });
    const external = el('input', { attrs: { type: 'number', min: '0', max: String(MAX_PARTICIPANTS), value: '0' } });
    const status = el('p', { className: 'muted', attrs: { role: 'status', 'aria-live': 'polite' } });
    const submit = button(t('production.employee.submit'), { className: 'primary' });

    root.append(
      field({ id: 'productionRoom', label: t('production.employee.room'), control: room, required: true }),
      field({ id: 'productionDate', label: t('schedule.date'), control: date, required: true }),
      field({ id: 'productionStart', label: t('production.employee.start'), control: start, required: true }),
      field({ id: 'productionEnd', label: t('production.employee.end'), control: end, required: true }),
      field({ id: 'productionInternal', label: t('production.employee.internal'), control: internal, required: true }),
      field({ id: 'productionExternal', label: t('production.employee.external'), control: external, required: true }),
      status,
      el('div', { className: 'button-row' }, [submit]),
    );

    submit.addEventListener('click', async () => {
      const startsAt = productionUtcInstant(date.value, start.value);
      const endsAt = productionUtcInstant(date.value, end.value);
      const internalParticipants = safeParticipantCount(internal.value);
      const externalParticipants = safeParticipantCount(external.value);
      const total = Number(internalParticipants) + Number(externalParticipants);
      const valid = room.value && startsAt && endsAt && Date.parse(endsAt) > Date.parse(startsAt)
        && Date.parse(startsAt) > Date.now() && internalParticipants !== null
        && externalParticipants !== null && total >= 1 && total <= MAX_PARTICIPANTS;
      if (!valid) {
        status.textContent = t('production.employee.validation');
        status.className = 'error-box';
        return;
      }
      submit.disabled = true;
      status.className = 'muted';
      status.textContent = t('production.employee.submitting');
      try {
        await persistence.createRequest({
          roomId: room.value,
          startsAt,
          endsAt,
          internalParticipants,
          externalParticipants,
        });
        status.textContent = t('production.employee.submitted');
        showToast(t('production.employee.submitted'));
      } catch (error) {
        status.className = 'error-box';
        status.textContent = errorMessage(error);
      } finally {
        submit.disabled = false;
      }
    });
  }

  async function renderRequests() {
    clear(appRoot);
    setPageHeading(t('production.employee.requestsTitle'), t('production.employee.requestsSubtitle'));
    const root = el('section', { className: 'card' }, [
      el('p', { className: 'muted', text: t('production.common.loading') }),
    ]);
    appRoot.appendChild(root);

    async function refresh() {
      clear(root);
      root.appendChild(el('p', { className: 'muted', text: t('production.common.loading') }));
      try {
        const [nextCatalog, requests] = await Promise.all([loadCatalog(), persistence.listRequests()]);
        clear(root);
        const refreshButton = button(t('production.common.refresh'));
        refreshButton.addEventListener('click', refresh);
        root.appendChild(el('div', { className: 'button-row' }, [refreshButton]));
        if (!requests.length) {
          root.appendChild(el('p', { className: 'info-box', text: t('requests.none') }));
          return;
        }
        for (const request of requests) {
          root.appendChild(requestCard(request, nextCatalog, async (requestId, control) => {
            control.disabled = true;
            try {
              await persistence.transitionRequest(requestId, { transition: 'cancel' });
              showToast(t('production.employee.cancelled'));
              await refresh();
            } catch (error) {
              control.disabled = false;
              showToast(errorMessage(error));
            }
          }));
        }
      } catch {
        clear(root);
        root.appendChild(el('p', { className: 'error-box', text: t('production.employee.loadError') }));
      }
    }

    await refresh();
  }

  return Object.freeze({
    renderRequest,
    renderRequests,
    hasDraft: () => false,
    restoreDraft: () => {},
  });
}
