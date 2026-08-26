import { locale, t } from '../core/i18n.js';
import { button, clear, el, field, showToast } from '../core/ui.js';
import {
  formatProductionDateTime,
  isProductionTimeZone,
  productionUtcInstant,
} from '../core/production-time.js';

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

function roomTimeZone(room, catalog) {
  const site = catalog.sites?.find((entry) => entry.id === room?.siteId);
  return site?.timeZone || null;
}

function requestCard(request, catalog, onCancel) {
  const room = catalog.rooms.find((entry) => entry.id === request.roomId);
  const timeZone = roomTimeZone(room, catalog);
  const startsAt = formatProductionDateTime(request.startsAt, { locale: locale(), timeZone });
  const endsAt = formatProductionDateTime(request.endsAt, { locale: locale(), timeZone });
  const participants = Number(request.internalParticipants || 0) + Number(request.externalParticipants || 0);
  const article = el('article', {
    className: 'request-card',
    dataset: { productionRequestId: request.id },
    attrs: { tabindex: '-1' },
  }, [
    el('h3', { text: t('production.common.requestId', { id: request.id }) }),
    el('p', { text: room ? roomLabel(room) : request.roomId }),
    el('p', {
      text: startsAt && endsAt ? `${startsAt} – ${endsAt}` : t('production.common.timeUnavailable'),
    }),
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
  if (
    !persistence
    || typeof persistence.loadCatalog !== 'function'
    || typeof persistence.checkRoomAvailability !== 'function'
  ) {
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
    const status = el('p', {
      className: 'muted',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
    const checkAvailability = button(t('production.employee.checkAvailability'));
    const submit = button(t('production.employee.submit'), { className: 'primary', disabled: true });
    let verifiedAvailabilityKey = null;
    let availabilityGeneration = 0;

    const currentAvailabilityWindow = () => {
      const selectedRoom = catalog.rooms.find((entry) => entry.id === room.value);
      const timeZone = roomTimeZone(selectedRoom, catalog);
      const startsAt = productionUtcInstant(date.value, start.value, timeZone);
      const endsAt = productionUtcInstant(date.value, end.value, timeZone);
      if (!selectedRoom || !startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return null;
      return Object.freeze({ roomId: selectedRoom.id, startsAt, endsAt });
    };
    const availabilityKey = (window) => window
      ? `${window.roomId}|${window.startsAt}|${window.endsAt}`
      : null;
    const invalidateAvailability = () => {
      availabilityGeneration += 1;
      verifiedAvailabilityKey = null;
      checkAvailability.disabled = false;
      submit.disabled = true;
      status.className = 'muted';
      status.textContent = t('production.employee.availabilityRequired');
    };
    [room, date, start, end].forEach((control) => control.addEventListener('input', invalidateAvailability));

    root.append(
      field({ id: 'productionRoom', label: t('production.employee.room'), control: room, required: true }),
      field({ id: 'productionDate', label: t('schedule.date'), control: date, required: true }),
      field({ id: 'productionStart', label: t('production.employee.start'), control: start, required: true }),
      field({ id: 'productionEnd', label: t('production.employee.end'), control: end, required: true }),
      field({ id: 'productionInternal', label: t('production.employee.internal'), control: internal, required: true }),
      field({ id: 'productionExternal', label: t('production.employee.external'), control: external, required: true }),
      status,
      el('div', { className: 'button-row' }, [checkAvailability, submit]),
    );
    invalidateAvailability();

    checkAvailability.addEventListener('click', async () => {
      const selectedRoom = catalog.rooms.find((entry) => entry.id === room.value);
      if (selectedRoom && !isProductionTimeZone(roomTimeZone(selectedRoom, catalog))) {
        status.className = 'error-box';
        status.textContent = t('production.employee.timeZoneUnavailable');
        return;
      }
      const window = currentAvailabilityWindow();
      if (!window || Date.parse(window.startsAt) <= Date.now()) {
        status.className = 'error-box';
        status.textContent = t('production.employee.validation');
        return;
      }
      const generation = ++availabilityGeneration;
      const key = availabilityKey(window);
      verifiedAvailabilityKey = null;
      submit.disabled = true;
      checkAvailability.disabled = true;
      status.className = 'muted';
      status.textContent = t('production.employee.checkingAvailability');
      try {
        const result = await persistence.checkRoomAvailability(window);
        if (generation !== availabilityGeneration || key !== availabilityKey(currentAvailabilityWindow())) return;
        if (!result.available) {
          status.className = 'error-box';
          status.textContent = t('production.employee.availabilityOccupied');
          return;
        }
        verifiedAvailabilityKey = key;
        submit.disabled = false;
        status.className = 'info-box';
        status.textContent = t('production.employee.availabilityAvailable');
      } catch {
        if (generation !== availabilityGeneration) return;
        status.className = 'error-box';
        status.textContent = t('production.employee.availabilityError');
      } finally {
        if (generation === availabilityGeneration) checkAvailability.disabled = false;
      }
    });

    submit.addEventListener('click', async () => {
      const window = currentAvailabilityWindow();
      const internalParticipants = safeParticipantCount(internal.value);
      const externalParticipants = safeParticipantCount(external.value);
      const total = Number(internalParticipants) + Number(externalParticipants);
      const valid = window && availabilityKey(window) === verifiedAvailabilityKey
        && Date.parse(window.startsAt) > Date.now() && internalParticipants !== null
        && externalParticipants !== null && total >= 1 && total <= MAX_PARTICIPANTS;
      if (!valid) {
        status.textContent = window && availabilityKey(window) !== verifiedAvailabilityKey
          ? t('production.employee.availabilityRequired')
          : t('production.employee.validation');
        status.className = 'error-box';
        submit.disabled = true;
        return;
      }
      submit.disabled = true;
      status.className = 'muted';
      status.textContent = t('production.employee.submitting');
      try {
        await persistence.createRequest({
          roomId: window.roomId,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          internalParticipants,
          externalParticipants,
        });
        status.textContent = t('production.employee.submitted');
        showToast(t('production.employee.submitted'));
        verifiedAvailabilityKey = null;
      } catch (error) {
        status.className = 'error-box';
        status.textContent = errorMessage(error);
      } finally {
        submit.disabled = availabilityKey(currentAvailabilityWindow()) !== verifiedAvailabilityKey;
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

    async function refresh(focusRequestId = null) {
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
              await refresh(requestId);
            } catch (error) {
              control.disabled = false;
              showToast(errorMessage(error));
            }
          }));
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

  return Object.freeze({
    renderRequest,
    renderRequests,
    hasDraft: () => false,
    restoreDraft: () => {},
  });
}
