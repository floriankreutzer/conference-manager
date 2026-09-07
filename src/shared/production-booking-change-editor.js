import { t } from '../core/i18n.js';
import { isProductionTimeZone } from '../core/production-time.js';
import { button, el, field, openDialog, showToast } from '../core/ui.js';
import {
  PRODUCTION_BOOKING_CHANGE_MAX_PARTICIPANTS,
  productionBookingChangeOverrides,
  productionRoomTimeZone,
} from './production-booking-change.js';
import { composeServerRequestDraft } from './production-request-draft.js';

function roomLabel(room) {
  const capacity = Number.isSafeInteger(Number(room?.capacity)) ? Number(room.capacity) : null;
  return capacity ? `${room.name} · ${capacity}` : String(room?.name || room?.id || '');
}

function wallValues(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(Date.parse(timestamp));
  const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, value]));
  return Object.freeze({
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  });
}

export function openProductionBookingChangeDialog({
  request,
  catalog,
  persistence,
  refresh,
  errorMessage,
  currentRoomContext,
} = {}) {
  if (
    !request
    || !catalog
    || typeof persistence?.proposeBookingChange !== 'function'
    || typeof refresh !== 'function'
    || typeof errorMessage !== 'function'
    || !currentRoomContext
    || currentRoomContext.room?.id !== request.roomId
    || currentRoomContext.room?.siteId !== currentRoomContext.site?.id
    || currentRoomContext.locationsRevision !== catalog.configurationRevisions?.locations
  ) throw new TypeError('PRODUCTION_BOOKING_CHANGE_EDITOR_REQUIRED');

  const selectedRoom = catalog.rooms.find((entry) => entry.id === request.roomId);
  const selectedSite = catalog.sites?.find((entry) => entry.id === selectedRoom?.siteId);
  const currentRoomIsSelectable = Boolean(
    selectedRoom?.active
    && selectedSite?.active
    && currentRoomContext.room.active
    && currentRoomContext.site.active,
  );
  const timeZone = currentRoomIsSelectable
    ? productionRoomTimeZone(selectedRoom, catalog)
    : currentRoomContext.site.timeZone;
  if (!isProductionTimeZone(timeZone)) {
    showToast(t('production.employee.timeZoneUnavailable'));
    return null;
  }

  const startValue = wallValues(request.startsAt, timeZone);
  const endValue = wallValues(request.endsAt, timeZone);
  const room = el('select', { attrs: { required: 'required' } });
  catalog.rooms.filter((entry) => (
    entry.active
    && catalog.sites?.some((site) => site.id === entry.siteId && site.active)
    && (entry.id !== request.roomId || currentRoomIsSelectable)
  )).forEach((entry) => {
    room.appendChild(el('option', { value: entry.id, text: roomLabel(entry) }));
  });
  if (!currentRoomIsSelectable) {
    room.appendChild(el('option', {
      value: currentRoomContext.room.id,
      text: t('production.bookingChange.currentRoomInactive', {
        room: roomLabel(currentRoomContext.room),
      }),
      attrs: { disabled: 'disabled' },
    }));
  }
  room.value = request.roomId;
  const date = el('input', { attrs: { type: 'date', value: startValue.date, required: 'required' } });
  const endDate = el('input', { attrs: { type: 'date', value: endValue.date, required: 'required' } });
  const start = el('input', { attrs: { type: 'time', value: startValue.time, required: 'required' } });
  const end = el('input', { attrs: { type: 'time', value: endValue.time, required: 'required' } });
  const internal = el('input', {
    attrs: {
      type: 'number',
      min: '0',
      max: String(PRODUCTION_BOOKING_CHANGE_MAX_PARTICIPANTS),
      value: String(request.internalParticipants),
      required: 'required',
    },
  });
  const external = el('input', {
    attrs: {
      type: 'number',
      min: '0',
      max: String(PRODUCTION_BOOKING_CHANGE_MAX_PARTICIPANTS),
      value: String(request.externalParticipants),
      required: 'required',
    },
  });
  const errorId = `bookingChangeError-${request.id}`;
  const error = el('p', {
    id: errorId,
    className: 'field-error',
    attrs: { role: 'alert', 'aria-live': 'assertive', tabindex: '-1' },
  });
  const controls = [room, date, start, endDate, end, internal, external];
  controls.forEach((control) => {
    control.setAttribute('aria-describedby', errorId);
    control.addEventListener('input', () => { error.textContent = ''; });
  });
  const content = el('section', {}, [
    field({ id: `changeRoom-${request.id}`, label: t('production.employee.room'), control: room, required: true }),
    field({ id: `changeDate-${request.id}`, label: t('schedule.date'), control: date, required: true }),
    field({ id: `changeStart-${request.id}`, label: t('production.employee.start'), control: start, required: true }),
    field({ id: `changeEndDate-${request.id}`, label: t('production.employee.endDate'), control: endDate, required: true }),
    field({ id: `changeEnd-${request.id}`, label: t('production.employee.end'), control: end, required: true }),
    field({ id: `changeInternal-${request.id}`, label: t('production.employee.internal'), control: internal, required: true }),
    field({ id: `changeExternal-${request.id}`, label: t('production.employee.external'), control: external, required: true }),
    currentRoomIsSelectable ? null : el('p', {
      className: 'info-box',
      text: t('production.bookingChange.selectActiveRoom'),
    }),
    error,
  ]);
  const cancel = button(t('common.cancel'));
  const submit = button(t('production.bookingChange.submit'), { className: 'primary' });
  const dialog = openDialog({
    title: t('production.bookingChange.propose'),
    description: t('production.bookingChange.originalActive'),
    content,
    actions: [cancel, submit],
    labelledById: `bookingChangeTitle-${request.id}`,
  });
  let pending = false;
  dialog.addEventListener('cancel', (event) => {
    if (!pending) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
  cancel.addEventListener('click', () => { if (!pending) dialog.close(); });
  let previousStartDate = date.value;
  date.addEventListener('input', () => {
    if (!endDate.value || endDate.value === previousStartDate) endDate.value = date.value;
    previousStartDate = date.value;
  });
  submit.addEventListener('click', async () => {
    if (pending) return;
    const overrides = productionBookingChangeOverrides({
      catalog,
      roomId: room.value,
      startDate: date.value,
      endDate: endDate.value,
      startTime: start.value,
      endTime: end.value,
      internalParticipants: internal.value,
      externalParticipants: external.value,
    });
    if (!overrides) {
      error.textContent = t('production.employee.validation');
      error.focus();
      return;
    }
    pending = true;
    submit.disabled = true;
    cancel.disabled = true;
    try {
      const result = await persistence.proposeBookingChange(
        request.id,
        request.version,
        composeServerRequestDraft({
          request,
          catalog,
          overrides,
          defaultTitle: t('production.employee.title'),
        }),
      );
      dialog.close();
      showToast(t(result.change.status === 'applied'
        ? 'production.bookingChange.applied'
        : 'production.bookingChange.proposed'));
      await refresh(request.id);
    } catch (caught) {
      pending = false;
      submit.disabled = false;
      cancel.disabled = false;
      if (dialog.isConnected) {
        error.textContent = errorMessage(caught);
        error.focus();
      } else {
        showToast(errorMessage(caught));
      }
    }
  });
  return dialog;
}
