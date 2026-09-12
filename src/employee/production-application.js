import { formatMoney, formatNumber, locale, t } from '../core/i18n.js';
import { loadOpenBookingChanges } from '../shared/booking-change-loader.js';
import { openProductionBookingChangeDialog } from '../shared/production-booking-change-editor.js';
import {
  loadCoherentRequestRoomContext,
  loadMissingRequestRoomContexts,
  productionRequestRoomTimeZone,
} from '../shared/request-room-context-loader.js';
import { button, clear, el, field, openDialog, showToast } from '../core/ui.js';
import {
  formatProductionDateTime,
  isProductionTimeZone,
  productionUtcInstant,
} from '../core/production-time.js';
import {
  repeatRequestProjection,
} from './server-request-projection.js';
import {
  initialServerRequestCalendarMonth,
  projectServerRequestCalendar,
  renderServerRequestCalendar,
} from './server-request-calendar.js';
import { composeServerRequestDraft } from '../shared/production-request-draft.js';
import {
  cateringEditorOptions,
  normalizeAllocationEditorDraft,
  normalizeCateringEditorDraft,
  roomEditorOptions,
  roomSupportsParticipants,
  serviceEditorOptions,
} from './server-request-editor.js';
import { renderProductionRequestBusinessDetails } from '../shared/production-request-details.js';

const CANCELLABLE_STATUSES = new Set(['Submitted', 'In Review', 'Change Requested', 'Confirmed']);
const MAX_PARTICIPANTS = 500;

function safeParticipantCount(value) {
  if (String(value).trim() === '') return null;
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

function compositionDraft(request, catalog, overrides = {}) {
  return composeServerRequestDraft({
    request,
    catalog,
    overrides,
    defaultTitle: t('production.employee.title'),
  });
}

function openDetachedPrintWindow() {
  const printWindow = globalThis.window?.open?.('', '_blank');
  if (!printWindow) return null;
  try {
    printWindow.opener = null;
    if (printWindow.opener !== null) {
      printWindow.close?.();
      return null;
    }
  } catch {
    try { printWindow.close?.(); } catch {}
    return null;
  }
  return printWindow;
}

function requestCard(request, catalog, currentRoomContext, openChange, {
  mutationInFlight = () => false,
  onCancel, onChange, onHistory, onPrint, onRepeat, onResubmit,
}) {
  const room = catalog.rooms.find((entry) => entry.id === request.roomId)
    || (currentRoomContext?.room?.id === request.roomId ? currentRoomContext.room : null);
  const timeZone = productionRequestRoomTimeZone(room, catalog, currentRoomContext);
  const startsAt = formatProductionDateTime(request.startsAt, { locale: locale(), timeZone });
  const endsAt = formatProductionDateTime(request.endsAt, { locale: locale(), timeZone });
  const participants = Number(request.internalParticipants || 0) + Number(request.externalParticipants || 0);
  const article = el('article', {
    className: 'request-card',
    dataset: { productionRequestId: request.id },
    attrs: { tabindex: '-1' },
  }, [
    el('h3', { text: request.details?.title || t('production.common.requestId', { id: request.id }) }),
    request.details?.title
      ? el('p', { className: 'muted', text: t('production.common.requestId', { id: request.id }) })
      : null,
    el('p', { text: room ? roomLabel(room) : request.roomId }),
    el('p', {
      text: startsAt && endsAt ? `${startsAt} – ${endsAt}` : t('production.common.timeUnavailable'),
    }),
    el('p', { text: t('production.common.participants', { count: participants }) }),
    el('p', { text: `${t('production.common.status')}: ${t(`status.${request.status}`)}` }),
  ]);
  const businessDetails = renderProductionRequestBusinessDetails(request);
  if (businessDetails) article.appendChild(businessDetails);
  if (request.statusReason) article.appendChild(el('p', { text: request.statusReason }));
  const mutationControls = [];
  let interactionPending = false;
  const updateMutationControls = () => {
    const disabled = interactionPending || mutationInFlight();
    mutationControls.forEach((control) => { control.disabled = disabled; });
  };
  const registerMutationControl = (control) => {
    mutationControls.push(control);
    updateMutationControls();
    return control;
  };
  const runMutation = async (operation) => {
    if (interactionPending || mutationInFlight()) return;
    interactionPending = true;
    updateMutationControls();
    try {
      await operation();
    } finally {
      interactionPending = false;
      if (article.isConnected) updateMutationControls();
    }
  };
  if (openChange === undefined && request.status === 'Confirmed') {
    article.appendChild(el('p', {
      className: 'error-box',
      text: t('production.bookingChange.unavailable'),
    }));
  } else if (openChange) {
    article.appendChild(el('p', {
      className: 'info-box',
      text: t(`production.bookingChange.status.${openChange.status}`),
    }));
  } else if (request.status === 'Confirmed') {
    const change = registerMutationControl(button(t('production.bookingChange.propose')));
    change.addEventListener('click', () => { void runMutation(() => onChange(request)); });
    article.appendChild(change);
  }
  if (CANCELLABLE_STATUSES.has(request.status)) {
    const cancel = registerMutationControl(button(t('requests.cancel'), { className: 'danger' }));
    cancel.addEventListener('click', () => { void runMutation(() => onCancel(request.id)); });
    article.appendChild(cancel);
  }
  const history = button(t('production.manager.historyTab'));
  history.addEventListener('click', () => onHistory(request, history));
  const secondaryActions = [history];
  if (request.status === 'Confirmed') {
    const print = button(t('guest.print'));
    print.addEventListener('click', () => onPrint(request, currentRoomContext));
    secondaryActions.push(print);
  }
  if (['Rejected', 'Cancelled'].includes(request.status)) {
    const repeat = button(t(request.status === 'Rejected' ? 'requests.repeatRejected' : 'requests.repeat'));
    repeat.addEventListener('click', () => onRepeat(request));
    secondaryActions.push(repeat);
  }
  article.appendChild(el('div', { className: 'button-row' }, secondaryActions));
  if (request.status === 'Change Requested') {
    const resubmit = button(t('requests.editChange'), { className: 'primary' });
    resubmit.addEventListener('click', () => onResubmit(request));
    article.appendChild(resubmit);
  }
  return article;
}

export function createProductionEmployeeApplication({
  appRoot,
  setPageHeading,
  persistence,
  onNavigate = null,
  siteInfo = Object.freeze({}),
  draftStore = null,
} = {}) {
  if (!appRoot || typeof setPageHeading !== 'function') throw new TypeError('PRODUCTION_EMPLOYEE_UI_REQUIRED');
  if (
    !persistence
    || typeof persistence.loadCatalog !== 'function'
    || typeof persistence.checkRoomAvailability !== 'function'
    || typeof persistence.loadBookingChange !== 'function'
    || typeof persistence.loadRequestRoomContext !== 'function'
    || typeof persistence.proposeBookingChange !== 'function'
  ) {
    throw new TypeError('PRODUCTION_PERSISTENCE_REQUIRED');
  }

  let catalog = Object.freeze({ rooms: Object.freeze([]) });
  let queuedRequest = null;
  let queuedResubmission = false;
  let editorRenderGeneration = 0;
  let activeRequestsRefresh = null;
  const requestMutations = new Map();

  function reserveRequestMutation(requestId, kind) {
    if (requestMutations.has(requestId)) return null;
    const tracked = {
      kind, notified: false, reconciled: false, promise: null,
    };
    requestMutations.set(requestId, tracked);
    return tracked;
  }

  function beginRequestMutation(requestId, kind, operation) {
    const tracked = reserveRequestMutation(requestId, kind);
    if (!tracked) return null;
    tracked.promise = Promise.resolve().then(operation);
    return tracked;
  }

  function queueRequest(request, { resubmit = false } = {}) {
    if (resubmit || Date.parse(request.startsAt) > Date.now()) {
      queuedRequest = request;
    } else {
      const room = catalog.rooms.find((entry) => entry.id === request.roomId);
      const timeZone = productionRequestRoomTimeZone(room, catalog);
      queuedRequest = isProductionTimeZone(timeZone)
        ? repeatRequestProjection(request, Date.now(), timeZone)
        : Object.freeze({ ...request, roomId: '', startsAt: '', endsAt: '' });
    }
    queuedResubmission = resubmit;
    if (typeof onNavigate === 'function') onNavigate('employee');
    else void renderRequest();
  }

  function printRequest(request, currentRoomContext = null) {
    const printWindow = openDetachedPrintWindow();
    if (!printWindow) return;
    const doc = printWindow.document;
    const room = catalog.rooms.find((entry) => entry.id === request.roomId)
      || (currentRoomContext?.room?.id === request.roomId ? currentRoomContext.room : null);
    const site = catalog.sites?.find((entry) => entry.id === room?.siteId)
      || (currentRoomContext?.site?.id === room?.siteId ? currentRoomContext.site : null);
    const details = siteInfo?.sites?.find?.((entry) => entry.id === site?.id) || {};
    doc.documentElement.lang = locale().split('-')[0];
    doc.title = `${t('requests.pdf')} · ${request.id}`;
    const heading = doc.createElement('h1');
    heading.textContent = t('guest.welcome', {
      title: request.details?.title || t('production.common.requestId', { id: request.id }),
    });
    const list = doc.createElement('dl');
    [
      [t('production.employee.start'), formattedRequestValue(
        request.startsAt, room, catalog, currentRoomContext,
      )],
      [t('production.employee.end'), formattedRequestValue(
        request.endsAt, room, catalog, currentRoomContext,
      )],
      [t('production.employee.room'), roomLabel(room || { id: request.roomId })],
      [t('guest.address'), details.address || t('guest.askOrganizer')],
      [t('guest.contact'), details.contact || t('guest.contactDefault')],
    ].forEach(([term, value]) => {
      const dt = doc.createElement('dt');
      const dd = doc.createElement('dd');
      dt.textContent = term;
      dd.textContent = value;
      list.append(dt, dd);
    });
    const print = doc.createElement('button');
    print.type = 'button';
    print.textContent = t('guest.print');
    print.addEventListener('click', () => printWindow.print());
    doc.body.append(heading, list, print);
    printWindow.focus();
  }

  function formattedRequestValue(value, room, requestCatalog, currentRoomContext = null) {
    return formatProductionDateTime(value, {
      locale: locale(),
      timeZone: productionRequestRoomTimeZone(room, requestCatalog, currentRoomContext),
    }) || t('production.common.timeUnavailable');
  }

  function wallValues(timestamp, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(Date.parse(timestamp));
    const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value]));
    return Object.freeze({ date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` });
  }

  async function renderRequest() {
    const generation = ++editorRenderGeneration;
    activeRequestsRefresh = null;
    clear(appRoot);
    setPageHeading(t('production.employee.title'), t('production.employee.subtitle'));
    const root = el('form', { className: 'card', attrs: { novalidate: 'novalidate' } }, [
      el('p', { className: 'muted', text: t('production.common.loading') }),
    ]);
    root.addEventListener('submit', (event) => event.preventDefault());
    appRoot.appendChild(root);
    const isCurrentEditor = () => (
      generation === editorRenderGeneration
      && root.parentNode === appRoot
      && document.documentElement.dataset.sessionLocked !== 'true'
    );
    let requestCatalog;
    try {
      requestCatalog = await persistence.loadCatalog();
      if (!isCurrentEditor()) return;
      catalog = requestCatalog;
    } catch {
      if (!isCurrentEditor()) return;
      clear(root);
      root.appendChild(el('p', { className: 'error-box', text: t('production.employee.loadError') }));
      return;
    }
    clear(root);
    const sourceRequest = queuedRequest;
    const isResubmission = queuedResubmission;
    queuedRequest = null;
    queuedResubmission = false;
    const restoredDraft = sourceRequest ? null : draftStore?.load?.() || null;
    const rooms = roomEditorOptions(requestCatalog);
    if (!rooms.length) {
      root.appendChild(el('p', { className: 'info-box', text: t('production.employee.noRooms') }));
      return;
    }

    const room = el('input', { id: 'productionRoom', attrs: { type: 'hidden' } });
    const sourceRoom = rooms.find((entry) => entry.id === sourceRequest?.roomId);
    const restoredRoom = rooms.find((entry) => entry.id === restoredDraft?.roomId);
    const sourceTimeZone = productionRequestRoomTimeZone(sourceRoom, requestCatalog);
    const sourceStart = sourceRequest && isProductionTimeZone(sourceTimeZone)
      ? wallValues(sourceRequest.startsAt, sourceTimeZone) : null;
    const sourceEnd = sourceRequest && isProductionTimeZone(sourceTimeZone)
      ? wallValues(sourceRequest.endsAt, sourceTimeZone) : null;
    if (sourceRoom) room.value = sourceRoom.id;
    else if (restoredRoom) room.value = restoredRoom.id;
    const date = el('input', { attrs: { type: 'date', value: sourceStart?.date || restoredDraft?.startDate || '' } });
    const endDate = el('input', { attrs: { type: 'date', value: sourceEnd?.date || restoredDraft?.endDate || sourceStart?.date || '' } });
    const start = el('input', { attrs: { type: 'time', value: sourceStart?.time || restoredDraft?.startTime || '' } });
    const end = el('input', { attrs: { type: 'time', value: sourceEnd?.time || restoredDraft?.endTime || '' } });
    const internal = el('input', { attrs: { type: 'number', min: '0', max: String(MAX_PARTICIPANTS), value: String(sourceRequest?.internalParticipants ?? restoredDraft?.internalParticipants ?? 1) } });
    const external = el('input', { attrs: { type: 'number', min: '0', max: String(MAX_PARTICIPANTS), value: String(sourceRequest?.externalParticipants ?? restoredDraft?.externalParticipants ?? 0) } });
    const title = el('input', { attrs: { type: 'text', maxlength: '160', value: sourceRequest?.details?.title || restoredDraft?.title || '' } });
    const specialRequirements = el('textarea', { attrs: { maxlength: '2000' }, value: sourceRequest?.details?.specialRequirements || restoredDraft?.specialRequirements || '' });
    const dietaryRequirements = el('textarea', { attrs: { maxlength: '2000' }, value: sourceRequest?.details?.dietaryRequirements || restoredDraft?.dietaryRequirements || '' });
    [title, date, endDate, start, end, internal, external].forEach((control) => {
      control.required = true;
      control.setAttribute('aria-required', 'true');
    });
    const selectedServices = new Set(sourceRequest?.details?.serviceIds || restoredDraft?.serviceIds || []);
    let packageSelection = sourceRequest?.details?.catering?.packageSelection
      ? { ...sourceRequest.details.catering.packageSelection }
      : (restoredDraft?.packageSelection ? { ...restoredDraft.packageSelection } : null);
    const itemQuantities = Object.fromEntries(
      sourceRequest?.details?.catering?.itemQuantities
        ? sourceRequest.details.catering.itemQuantities.map((entry) => [entry.itemId, entry.quantity])
        : Object.entries(restoredDraft?.itemQuantities || {}),
    );
    const cateringParticipants = el('input', {
      attrs: {
        type: 'number', min: '0', max: String(MAX_PARTICIPANTS), step: '1',
        value: String(sourceRequest?.details?.catering?.participantCount ?? restoredDraft?.cateringParticipants ?? 0),
      },
    });
    const servicePanel = el('section');
    const renderServiceControls = () => {
      clear(servicePanel);
      if (!room.value) {
        servicePanel.appendChild(el('p', {
          className: 'muted', text: t('schedule.locationPlaceholder'),
        }));
        return;
      }
      const services = serviceEditorOptions(requestCatalog, room.value);
      const applicableIds = new Set(services.map((entry) => entry.id));
      [...selectedServices].forEach((serviceId) => {
        if (!applicableIds.has(serviceId)) selectedServices.delete(serviceId);
      });
      if (!services.length) {
        servicePanel.appendChild(el('p', { className: 'muted', text: t('production.common.timeUnavailable') }));
        return;
      }
      services.forEach((service) => {
        const control = el('input', { attrs: { type: 'checkbox', value: service.id } });
        control.checked = selectedServices.has(service.id);
        control.addEventListener('change', () => {
          if (control.checked) selectedServices.add(service.id); else selectedServices.delete(service.id);
        });
        servicePanel.appendChild(el('label', {}, [control, document.createTextNode(` ${service.name}`)]));
      });
    };
    const roomSelectionGrid = el('div', { className: 'selection-grid' });
    const roomSelectionPanel = el('fieldset', { className: 'room-option-fieldset' }, [
      el('legend', { className: 'sr-only', text: t('production.employee.roomOptions') }),
      roomSelectionGrid,
    ]);
    const renderRoomControls = () => {
      clear(roomSelectionGrid);
      const participants = (safeParticipantCount(internal.value) || 0)
        + (safeParticipantCount(external.value) || 0);
      const selectedRoom = rooms.find((entry) => entry.id === room.value);
      if (selectedRoom && !roomSupportsParticipants(
        selectedRoom,
        participants,
        requestCatalog.bookingPolicy?.rules?.maximumParticipants,
      )) room.value = '';
      rooms.forEach((entry, index) => {
        const supported = roomSupportsParticipants(
          entry,
          participants,
          requestCatalog.bookingPolicy?.rules?.maximumParticipants,
        );
        const selected = room.value === entry.id;
        const capacityStatusDescriptionId = `productionRoomCapacityStatus-${index}`;
        const capacityDescriptionId = `productionRoomCapacity-${index}`;
        const roomStateDescriptionId = `productionRoomState-${index}`;
        const roomNameId = `productionRoomName-${index}`;
        const currentKey = availabilityKey(currentAvailabilityWindow());
        const roomAvailabilityState = selected && availabilityStateKey !== null
          && currentKey === availabilityStateKey ? availabilityState : 'unchecked';
        const availabilityMessageKey = {
          available: 'production.employee.roomStateAvailable',
          checking: 'production.employee.roomStateChecking',
          occupied: 'production.employee.roomStateOccupied',
          error: 'production.employee.roomStateError',
          unchecked: 'production.employee.roomStateUnchecked',
        }[roomAvailabilityState];
        const control = el('input', {
          id: `productionRoomOption-${index}`,
          attrs: {
            type: 'radio',
            name: 'productionRoomChoice',
            value: entry.id,
            required: 'required',
            'aria-labelledby': roomNameId,
            'aria-describedby': [
              capacityStatusDescriptionId,
              capacityDescriptionId,
              ...(selected ? [roomStateDescriptionId] : []),
            ].join(' '),
          },
          checked: selected,
          disabled: !supported,
        });
        control.addEventListener('change', () => {
          if (!control.checked) return;
          const focusId = control.id;
          room.value = entry.id;
          room.dispatchEvent(new Event('input', { bubbles: true }));
          room.dispatchEvent(new Event('change', { bubbles: true }));
          requestAnimationFrame(() => document.getElementById(focusId)?.focus());
        });
        const card = el('article', {
          className: `option-card${selected ? ' selected' : ''}${supported ? '' : ' disabled'}`,
          dataset: { roomId: entry.id },
        }, [
          control,
          el('span', {
            id: capacityStatusDescriptionId,
            className: `badge ${supported ? 'success' : 'danger'}`,
            text: supported
              ? t('production.employee.roomCapacitySuitable')
              : t('production.employee.roomCapacityInsufficient'),
          }),
          el('h3', { id: roomNameId }, [
            el('label', { attrs: { for: control.id }, text: entry.name }),
          ]),
          el('p', {
            id: capacityDescriptionId,
            text: t('room.capacity', { capacity: entry.capacity, needed: participants }),
          }),
          selected ? el('p', {
            id: roomStateDescriptionId,
            className: roomAvailabilityState === 'available'
              ? 'validation-ok'
              : (['occupied', 'error'].includes(roomAvailabilityState) ? 'validation-bad' : 'muted'),
            dataset: { roomAvailabilityState },
            text: t(availabilityMessageKey),
          }) : null,
        ]);
        if (entry.price) {
          card.appendChild(el('strong', {
            className: 'price',
            text: `${formatMoney(Number(entry.price.amountMinor || 0) / 100)} · ${t('room.cost')}`,
          }));
        }
        roomSelectionGrid.appendChild(card);
      });
    };
    let roomSelectionWasCleared = false;
    const refreshRoomsForParticipants = () => {
      const previousRoomId = room.value;
      renderRoomControls();
      if (previousRoomId && !room.value) {
        roomSelectionWasCleared = true;
        renderServiceControls();
        renderCateringControls();
      }
    };
    internal.addEventListener('input', refreshRoomsForParticipants);
    external.addEventListener('input', refreshRoomsForParticipants);
    const cateringPanel = el('section', { attrs: { 'aria-label': t('catering.heading') } });
    const renderCateringControls = () => {
      clear(cateringPanel);
      if (!room.value) {
        cateringPanel.append(
          el('h2', { text: t('catering.heading'), attrs: { tabindex: '-1' } }),
          el('p', { className: 'muted', text: t('schedule.locationPlaceholder') }),
        );
        return;
      }
      const options = cateringEditorOptions(requestCatalog, room.value);
      const applicableItemIds = new Set(options.items.map((entry) => entry.id));
      Object.keys(itemQuantities).forEach((itemId) => {
        if (!applicableItemIds.has(itemId)) delete itemQuantities[itemId];
      });
      const packageOptions = options.packages.flatMap((entry) => (
        (entry.variants || []).filter((variant) => variant.active !== false)
          .map((variant) => ({ packageId: entry.id, variantId: variant.id, label: `${entry.name} · ${variant.name}` }))
      ));
      const packageControl = el('select');
      packageControl.appendChild(el('option', { value: '', text: t('catering.noPackage') }));
      packageOptions.forEach((entry, index) => {
        packageControl.appendChild(el('option', { value: String(index), text: entry.label }));
        if (entry.packageId === packageSelection?.packageId && entry.variantId === packageSelection?.variantId) {
          packageControl.value = String(index);
        }
      });
      if (!packageOptions.some((entry) => entry.packageId === packageSelection?.packageId
        && entry.variantId === packageSelection?.variantId)) packageSelection = null;
      packageControl.addEventListener('change', () => {
        packageSelection = packageControl.value === '' ? null : {
          packageId: packageOptions[Number(packageControl.value)].packageId,
          variantId: packageOptions[Number(packageControl.value)].variantId,
        };
      });
      cateringPanel.append(
        el('h2', { text: t('catering.heading'), attrs: { tabindex: '-1' } }),
        field({
          id: 'productionCateringParticipants', label: t('catering.people'), control: cateringParticipants,
          hint: t('catering.peopleHint'),
        }),
        field({ id: 'productionCateringPackage', label: t('catering.package'), control: packageControl }),
        el('h3', { text: t('catering.items') }),
      );
      if (!options.items.length) cateringPanel.appendChild(el('p', { className: 'muted', text: t('catering.noItems') }));
      options.items.forEach((item) => {
        const quantity = el('input', {
          attrs: { type: 'number', min: '0', max: '1000', step: '1', value: String(itemQuantities[item.id] || 0) },
        });
        quantity.addEventListener('input', () => { itemQuantities[item.id] = quantity.value; });
        cateringPanel.appendChild(field({
          id: `productionCateringItem-${item.id}`, label: item.name, control: quantity,
        }));
      });
    };

    const activeCostCenterIds = new Set(requestCatalog.costCenters
      .filter((entry) => entry.active !== false).map((entry) => entry.id));
    const allocationRows = sourceRequest?.allocations?.entries
      ? sourceRequest.allocations.entries.map((entry) => ({
        costCenterId: entry.costCenterId,
        percentage: (entry.percentageBasisPoints / 100).toFixed(2).replace(/\.00$/, ''),
      }))
      : (restoredDraft?.allocations || [])
        .filter((entry) => activeCostCenterIds.has(entry.costCenterId))
        .map((entry) => ({ ...entry }));
    if (!sourceRequest && !restoredDraft && !allocationRows.length
      && requestCatalog.costAllocation?.allocationRequired && requestCatalog.costCenters.length) {
      allocationRows.push({ costCenterId: requestCatalog.costCenters[0].id, percentage: '100' });
    }
    const allocationPanel = el('section', { attrs: { 'aria-label': t('cost.allocations') } });
    let scheduleDraftSave = () => {};
    const renderAllocationControls = () => {
      clear(allocationPanel);
      allocationPanel.append(
        el('h3', { text: t('cost.allocations') }),
        el('p', { className: 'muted', text: t('cost.allocHint') }),
      );
      const allocationStatus = el('p', {
        attrs: { role: 'status', 'aria-live': 'polite' },
      });
      const updateAllocationStatus = () => {
        const sum = allocationRows.reduce((total, entry) => total + Number(entry.percentage || 0), 0);
        allocationStatus.className = Math.abs(sum - 100) < 0.001
          || (!allocationRows.length && !requestCatalog.costAllocation?.allocationRequired)
          ? 'validation-ok' : 'validation-bad';
        allocationStatus.textContent = t('cost.sum', {
          sum: formatNumber(sum, { maximumFractionDigits: 2 }),
        });
      };
      allocationRows.forEach((allocation, index) => {
        const row = el('article', { className: 'allocation-row' });
        const center = el('select');
        center.appendChild(el('option', { value: '', text: t('cost.costCenter') }));
        requestCatalog.costCenters.filter((entry) => entry.active !== false).forEach((entry) => {
          center.appendChild(el('option', { value: entry.id, text: `${entry.code} · ${entry.name}` }));
        });
        center.value = allocation.costCenterId;
        center.addEventListener('change', () => { allocation.costCenterId = center.value; });
        const percentage = el('input', {
          attrs: { type: 'number', min: '0.01', max: '100', step: '0.01', value: allocation.percentage },
        });
        percentage.addEventListener('input', () => {
          allocation.percentage = percentage.value;
          updateAllocationStatus();
        });
        const remove = button(t('common.delete'));
        remove.addEventListener('click', () => {
          allocationRows.splice(index, 1);
          scheduleDraftSave();
          renderAllocationControls();
        });
        row.append(
          field({ id: `productionAllocationCenter-${index}`, label: t('cost.costCenter'), control: center, required: true }),
          field({ id: `productionAllocationPercent-${index}`, label: t('cost.percent'), control: percentage, required: true }),
          remove,
        );
        allocationPanel.appendChild(row);
      });
      allocationPanel.appendChild(allocationStatus);
      updateAllocationStatus();
      const add = button(t('cost.add'));
      add.disabled = allocationRows.length >= Math.min(100, requestCatalog.costCenters.length);
      add.addEventListener('click', () => {
        const used = new Set(allocationRows.map((entry) => entry.costCenterId));
        const next = requestCatalog.costCenters.find((entry) => entry.active !== false && !used.has(entry.id));
        if (next) {
          allocationRows.push({ costCenterId: next.id, percentage: '0' });
          scheduleDraftSave();
        }
        renderAllocationControls();
      });
      allocationPanel.appendChild(add);
    };
    renderCateringControls();
    renderServiceControls();
    renderAllocationControls();
    const status = el('p', {
      id: 'productionEmployeeStatus',
      className: 'muted',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
    const scheduleControls = [title, date, start, endDate, end, internal, external];
    const clearControlValidation = (control) => {
      control.removeAttribute('aria-invalid');
      if (control.getAttribute('aria-describedby') === status.id) {
        control.removeAttribute('aria-describedby');
      }
    };
    const showControlValidation = (control, message = t('production.employee.validation')) => {
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', status.id);
      status.className = 'error-box';
      status.textContent = message;
      control.focus();
      return false;
    };
    scheduleControls.forEach((control) => {
      control.addEventListener('input', () => clearControlValidation(control));
    });
    cateringParticipants.addEventListener('input', () => clearControlValidation(cateringParticipants));
    const checkAvailability = button(t('production.employee.checkAvailability'));
    const submit = button(t(isResubmission ? 'review.resubmit' : 'production.employee.submit'), { className: 'primary', disabled: true });
    let verifiedAvailabilityKey = null;
    let availabilityState = 'unchecked';
    let availabilityStateKey = null;
    let availabilityGeneration = 0;

    const currentAvailabilityWindow = () => {
      const selectedRoom = rooms.find((entry) => entry.id === room.value);
      const internalParticipants = safeParticipantCount(internal.value);
      const externalParticipants = safeParticipantCount(external.value);
      const totalParticipants = internalParticipants === null || externalParticipants === null
        ? null : internalParticipants + externalParticipants;
      const timeZone = productionRequestRoomTimeZone(selectedRoom, requestCatalog);
      const startsAt = productionUtcInstant(date.value, start.value, timeZone);
      const endsAt = productionUtcInstant(endDate.value, end.value, timeZone);
      if (!roomSupportsParticipants(
        selectedRoom,
        totalParticipants,
        requestCatalog.bookingPolicy?.rules?.maximumParticipants,
      )
        || !startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return null;
      return Object.freeze({ roomId: selectedRoom.id, startsAt, endsAt });
    };
    const availabilityKey = (window) => window
      ? `${window.roomId}|${window.startsAt}|${window.endsAt}`
      : null;
    const isAvailabilityVerified = (window = currentAvailabilityWindow()) => {
      const key = availabilityKey(window);
      return verifiedAvailabilityKey !== null && key !== null && key === verifiedAvailabilityKey;
    };
    const invalidateAvailability = () => {
      availabilityGeneration += 1;
      verifiedAvailabilityKey = null;
      availabilityState = 'unchecked';
      availabilityStateKey = availabilityKey(currentAvailabilityWindow());
      checkAvailability.disabled = false;
      submit.disabled = true;
      status.className = 'muted';
      status.textContent = t(roomSelectionWasCleared
        ? 'production.employee.roomSelectionCleared'
        : 'production.employee.availabilityRequired');
      roomSelectionWasCleared = false;
      roomSelectionPanel.removeAttribute('aria-invalid');
      roomSelectionPanel.removeAttribute('aria-describedby');
      renderRoomControls();
      if (actions?.isConnected) renderActiveStep();
    };
    let previousStartDate = date.value;
    date.addEventListener('input', () => {
      if (!endDate.value || endDate.value === previousStartDate) endDate.value = date.value;
      previousStartDate = date.value;
    });
    [room, date, endDate, start, end, internal, external]
      .forEach((control) => control.addEventListener('input', invalidateAvailability));
    room.addEventListener('change', () => {
      renderServiceControls();
      renderCateringControls();
    });

    const stepLabels = [
      'request.step.schedule',
      'request.step.room',
      'request.step.services',
      'request.step.catering',
      'request.step.costs',
      'request.step.review',
    ];
    const participantTotal = el('section', {
      className: 'participant-total',
      attrs: { 'aria-live': 'polite' },
    });
    const updateParticipantTotal = () => {
      const count = (safeParticipantCount(internal.value) || 0)
        + (safeParticipantCount(external.value) || 0);
      clear(participantTotal);
      participantTotal.append(
        el('span', { text: t('schedule.total') }),
        el('strong', { text: String(count) }),
        el('small', { text: t('schedule.totalHint') }),
      );
    };
    internal.addEventListener('input', updateParticipantTotal);
    external.addEventListener('input', updateParticipantTotal);
    updateParticipantTotal();

    const scheduleGrid = el('div', { className: 'form-grid two' }, [
      field({ id: 'productionTitle', label: t('schedule.title'), control: title, required: true }),
      field({ id: 'productionDate', label: t('schedule.date'), control: date, required: true }),
      field({ id: 'productionStart', label: t('production.employee.start'), control: start, required: true }),
      field({ id: 'productionEndDate', label: t('production.employee.endDate'), control: endDate, required: true }),
      field({ id: 'productionEnd', label: t('production.employee.end'), control: end, required: true }),
      field({ id: 'productionInternal', label: t('production.employee.internal'), control: internal, required: true }),
      field({ id: 'productionExternal', label: t('production.employee.external'), control: external, required: true }),
      participantTotal,
    ]);
    const panels = [
      el('section', { className: 'card wizard-card', dataset: { stepPanel: '1' } }, [
        el('div', { className: 'section-heading' }, [
          el('div', {}, [el('h2', { text: t('schedule.heading'), attrs: { tabindex: '-1' } }), el('p', { text: t('schedule.desc') })]),
        ]),
        scheduleGrid,
        field({
          id: 'productionSpecial', label: t('schedule.special'), control: specialRequirements,
          hint: t('schedule.specialHint'), optional: true,
        }),
      ]),
      el('section', { className: 'card wizard-card', dataset: { stepPanel: '2' } }, [
        el('div', { className: 'section-heading' }, [
          el('div', {}, [
            el('h2', {
              text: t('production.employee.roomOptionsHeading'),
              attrs: { tabindex: '-1' },
            }),
            el('p', { text: t('production.employee.roomOptionsDescription') }),
          ]),
        ]),
        room,
        roomSelectionPanel,
        el('aside', {
          className: 'info-box',
          attrs: { role: 'note' },
          text: t('production.employee.roomAvailabilityInstruction'),
        }),
      ]),
      el('section', { className: 'card wizard-card', dataset: { stepPanel: '3' } }, [
        el('div', { className: 'section-heading' }, [
          el('div', {}, [el('h2', { text: t('services.heading'), attrs: { tabindex: '-1' } }), el('p', { text: t('services.desc') })]),
        ]),
        servicePanel,
      ]),
      el('section', { className: 'card wizard-card', dataset: { stepPanel: '4' } }, [
        cateringPanel,
        field({ id: 'productionDietary', label: t('catering.dietary'), control: dietaryRequirements }),
      ]),
      el('section', { className: 'card wizard-card', dataset: { stepPanel: '5' } }, [
        el('div', { className: 'section-heading' }, [
          el('div', {}, [el('h2', { text: t('cost.heading'), attrs: { tabindex: '-1' } }), el('p', { text: t('cost.desc') })]),
        ]),
        allocationPanel,
      ]),
      el('section', { className: 'card wizard-card', dataset: { stepPanel: '6' } }),
    ];
    const stepper = el('nav', { className: 'stepper', attrs: { 'aria-label': t('a11y.steps') } });
    const stepperList = el('ol');
    const stepControls = stepLabels.map((key, index) => {
      const number = index + 1;
      const control = button(`${number}. ${t(key)}`, {
        className: 'step',
        attrs: { 'aria-label': t('a11y.step', { step: number, label: t(key) }) },
      });
      stepperList.appendChild(el('li', {}, [control]));
      return control;
    });
    stepper.appendChild(stepperList);
    const mobileProgress = el('section', {
      className: 'ux-mobile-progress',
      dataset: { uxMobileProgress: 'true' },
      attrs: { role: 'group' },
    });
    const actionStatus = el('div', {}, [
      status,
      el('span', { id: 'draftStatus', className: 'draft-status', attrs: { role: 'status', 'aria-live': 'polite' } }),
    ]);
    const actions = el('footer', { className: 'wizard-actions' });
    let activeStep = 1;

    const renderReview = () => {
      const review = panels[5];
      clear(review);
      const selectedRoom = rooms.find((entry) => entry.id === room.value);
      const selectedServiceNames = serviceEditorOptions(requestCatalog, room.value)
        .filter((entry) => selectedServices.has(entry.id)).map((entry) => entry.name);
      const selectedPackage = packageSelection
        ? cateringEditorOptions(requestCatalog, room.value).packages.find(
          (entry) => entry.id === packageSelection.packageId,
        ) : null;
      const window = currentAvailabilityWindow();
      const timeZone = productionRequestRoomTimeZone(selectedRoom, requestCatalog);
      const schedule = window ? t('production.employee.reviewSchedule', {
        start: formatProductionDateTime(window.startsAt, { locale: locale(), timeZone }),
        end: formatProductionDateTime(window.endsAt, { locale: locale(), timeZone }),
      }) : '';
      const reviewGrid = el('div', { className: 'review-grid' });
      const reviewCard = (heading, value, targetStep) => {
        const edit = button(t('review.edit'), { className: 'ux-review-edit' });
        edit.setAttribute('aria-label', t('review.editAria', { section: heading }));
        edit.addEventListener('click', () => moveToStep(targetStep));
        return el('article', { className: 'review-card' }, [
          el('div', { className: 'ux-review-card-header' }, [el('h3', { text: heading }), edit]),
          el('p', { text: value || t('common.none') }),
        ]);
      };
      reviewGrid.append(
        reviewCard(t('review.schedule'), schedule, 1),
        reviewCard(t('review.room'), roomLabel(selectedRoom || {}), 2),
        reviewCard(t('review.services'), selectedServiceNames.join(' · '), 3),
        reviewCard(t('review.catering'), selectedPackage?.name || t('common.none'), 4),
        reviewCard(t('review.costs'), allocationRows.map((entry) => {
          const center = requestCatalog.costCenters.find((candidate) => candidate.id === entry.costCenterId);
          return center ? `${center.code} · ${entry.percentage} %` : '';
        }).filter(Boolean).join(' · '), 5),
      );
      review.append(
        el('div', { className: 'section-heading' }, [
          el('div', {}, [el('h2', { text: t('review.heading'), attrs: { tabindex: '-1' } }), el('p', { text: t('review.desc') })]),
        ]),
        reviewGrid,
        el('aside', { className: 'tentative-box', attrs: { role: 'note' } }, [
          el('strong', { text: t('review.provisional') }),
          el('p', { text: t('review.provisionalText') }),
        ]),
      );
    };

    const renderActiveStep = () => {
      panels.forEach((panel, index) => { panel.hidden = index + 1 !== activeStep; });
      stepControls.forEach((control, index) => {
        const number = index + 1;
        control.className = `step${number === activeStep ? ' active' : ''}${number < activeStep ? ' done' : ''}`;
        control.disabled = number > activeStep;
        if (number === activeStep) control.setAttribute('aria-current', 'step');
        else control.removeAttribute('aria-current');
      });
      clear(mobileProgress);
      const progressLabel = t('a11y.step', { step: activeStep, label: t(stepLabels[activeStep - 1]) });
      mobileProgress.setAttribute('aria-label', progressLabel);
      mobileProgress.append(
        el('strong', { text: progressLabel }),
        el('span', { className: 'ux-progress-dots' }, stepLabels.map((_, index) => el('span', {
          className: `ux-progress-dot${index + 1 === activeStep ? ' active' : ''}${index + 1 < activeStep ? ' done' : ''}`,
        }))),
      );
      if (activeStep === 6) renderReview();
      clear(actions);
      if (activeStep > 1) {
        const back = button(t('common.back'));
        back.addEventListener('click', () => moveToStep(activeStep - 1));
        actions.appendChild(back);
      }
      actions.appendChild(el('span', { className: 'spacer' }));
      if (activeStep === 2) actions.appendChild(checkAvailability);
      if (activeStep < 6) {
        const next = button(t('common.next'), { className: 'primary' });
        next.disabled = activeStep === 2 && !isAvailabilityVerified();
        next.addEventListener('click', () => moveToStep(activeStep + 1));
        actions.appendChild(next);
      } else actions.appendChild(submit);
    };

    const focusStep = () => requestAnimationFrame(() => {
      panels[activeStep - 1].querySelector('h2, input, select, textarea, button')?.focus();
    });
    const validateStep = (stepNumber) => {
      if (stepNumber === 1) {
        scheduleControls.forEach(clearControlValidation);
        const internalParticipants = safeParticipantCount(internal.value);
        const externalParticipants = safeParticipantCount(external.value);
        const participantCount = internalParticipants === null || externalParticipants === null
          ? null : internalParticipants + externalParticipants;
        const startsAtLocal = `${date.value}T${start.value}`;
        const endsAtLocal = `${endDate.value}T${end.value}`;
        const invalidControl = [title, date, start, endDate, end]
          .find((control) => !control.value || !control.checkValidity())
          || (!title.value.trim() ? title : null)
          || (internalParticipants === null ? internal : null)
          || (externalParticipants === null ? external : null)
          || (participantCount < 1 || participantCount > MAX_PARTICIPANTS ? internal : null)
          || (endsAtLocal <= startsAtLocal ? end : null);
        if (invalidControl) return showControlValidation(invalidControl);
      }
      if (stepNumber === 2 && !isAvailabilityVerified()) {
        roomSelectionPanel.setAttribute('aria-invalid', 'true');
        roomSelectionPanel.setAttribute('aria-describedby', status.id);
        status.className = 'error-box';
        status.textContent = t('production.employee.availabilityRequired');
        checkAvailability.focus();
        return false;
      }
      if (stepNumber === 4) {
        clearControlValidation(cateringParticipants);
        try {
          normalizeCateringEditorDraft({
            participantCount: cateringParticipants.value,
            packageSelection,
            itemQuantities,
            totalParticipants: (safeParticipantCount(internal.value) || 0)
              + (safeParticipantCount(external.value) || 0),
            catalog: requestCatalog,
            roomId: room.value,
          });
        } catch {
          return showControlValidation(cateringParticipants);
        }
      }
      if (stepNumber === 5) {
        try {
          normalizeAllocationEditorDraft({ allocations: allocationRows, catalog: requestCatalog });
        } catch {
          const invalidControl = allocationPanel.querySelector('select, input, button');
          return invalidControl ? showControlValidation(invalidControl) : false;
        }
      }
      return true;
    };
    function moveToStep(targetStep) {
      if (targetStep > activeStep && !validateStep(activeStep)) return;
      activeStep = Math.max(1, Math.min(6, targetStep));
      status.className = 'muted';
      if (activeStep !== 2) status.textContent = '';
      renderActiveStep();
      focusStep();
    }
    stepControls.forEach((control, index) => {
      control.addEventListener('click', () => moveToStep(index + 1));
    });
    root.append(mobileProgress, stepper, ...panels, actionStatus, actions);
    renderRoomControls();
    renderActiveStep();
    invalidateAvailability();

    if (restoredDraft) showToast(t('draft.restored'));
    let draftTimer = null;
    let draftDirty = false;
    if (!sourceRequest && draftStore) {
      const saveDraft = () => {
        draftTimer = null;
        if (!draftDirty || !isCurrentEditor()) return;
        draftStore.save({
          roomId: room.value,
          startDate: date.value,
          endDate: endDate.value,
          startTime: start.value,
          endTime: end.value,
          title: title.value,
          internalParticipants: internal.value,
          externalParticipants: external.value,
          serviceIds: [...selectedServices].sort(),
          cateringParticipants: cateringParticipants.value,
          packageSelection,
          itemQuantities,
          allocations: allocationRows,
          dietaryRequirements: dietaryRequirements.value,
          specialRequirements: specialRequirements.value,
        });
      };
      scheduleDraftSave = () => {
        draftDirty = true;
        if (draftTimer) clearTimeout(draftTimer);
        draftTimer = setTimeout(saveDraft, 400);
      };
      root.addEventListener('input', scheduleDraftSave);
      root.addEventListener('change', scheduleDraftSave);
    }

    checkAvailability.addEventListener('click', async () => {
      if (!isCurrentEditor()) return;
      const selectedRoom = rooms.find((entry) => entry.id === room.value);
      if (selectedRoom && !isProductionTimeZone(productionRequestRoomTimeZone(selectedRoom, requestCatalog))) {
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
      const availabilityRequestGeneration = ++availabilityGeneration;
      const key = availabilityKey(window);
      verifiedAvailabilityKey = null;
      availabilityState = 'checking';
      availabilityStateKey = key;
      submit.disabled = true;
      checkAvailability.disabled = true;
      status.className = 'muted';
      status.textContent = t('production.employee.checkingAvailability');
      renderRoomControls();
      try {
        const result = await persistence.checkRoomAvailability(window, isResubmission ? sourceRequest.id : null);
        if (!isCurrentEditor()
          || availabilityRequestGeneration !== availabilityGeneration
          || key !== availabilityKey(currentAvailabilityWindow())) return;
        if (!result.available) {
          availabilityState = 'occupied';
          status.className = 'error-box';
          status.textContent = t('production.employee.availabilityOccupied');
          renderRoomControls();
          return;
        }
        verifiedAvailabilityKey = key;
        availabilityState = 'available';
        submit.disabled = false;
        status.className = 'info-box';
        status.textContent = t('production.employee.availabilityAvailable');
        roomSelectionPanel.removeAttribute('aria-invalid');
        renderRoomControls();
        renderActiveStep();
        requestAnimationFrame(() => checkAvailability.focus());
      } catch {
        if (!isCurrentEditor() || availabilityRequestGeneration !== availabilityGeneration) return;
        availabilityState = 'error';
        status.className = 'error-box';
        status.textContent = t('production.employee.availabilityError');
        renderRoomControls();
      } finally {
        if (isCurrentEditor() && availabilityRequestGeneration === availabilityGeneration) {
          checkAvailability.disabled = false;
        }
      }
    });

    submit.addEventListener('click', async () => {
      if (!isCurrentEditor()) return;
      const window = currentAvailabilityWindow();
      const internalParticipants = safeParticipantCount(internal.value);
      const externalParticipants = safeParticipantCount(external.value);
      const total = Number(internalParticipants) + Number(externalParticipants);
      const normalizedTitle = title.value.trim();
      const valid = window && isAvailabilityVerified(window)
        && Date.parse(window.startsAt) > Date.now() && internalParticipants !== null
        && externalParticipants !== null && total >= 1 && total <= MAX_PARTICIPANTS
        && normalizedTitle.length >= 1 && normalizedTitle.length <= 160;
      if (!valid) {
        status.textContent = window && !isAvailabilityVerified()
          ? t('production.employee.availabilityRequired')
          : t('production.employee.validation');
        status.className = 'error-box';
        submit.disabled = true;
        return;
      }
      let catering;
      let allocations;
      try {
        catering = normalizeCateringEditorDraft({
          participantCount: cateringParticipants.value,
          packageSelection,
          itemQuantities,
          totalParticipants: total,
          catalog: requestCatalog,
          roomId: window.roomId,
        });
        allocations = normalizeAllocationEditorDraft({
          allocations: allocationRows,
          catalog: requestCatalog,
        });
      } catch {
        status.className = 'error-box';
        status.textContent = t('production.employee.validation');
        return;
      }
      submit.disabled = true;
      status.className = 'muted';
      status.textContent = t('production.employee.submitting');
      try {
        const overrides = {
          title: normalizedTitle, roomId: window.roomId,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          internalParticipants,
          externalParticipants,
          serviceIds: [...selectedServices].sort(),
          catering,
          dietaryRequirements: dietaryRequirements.value.trim() || null,
          specialRequirements: specialRequirements.value.trim() || null,
          allocations,
        };
        if (isResubmission) {
          await persistence.resubmitRequest(
            sourceRequest.id,
            sourceRequest.version,
            compositionDraft(sourceRequest, requestCatalog, overrides),
          );
        } else {
          await persistence.createRequest(compositionDraft(sourceRequest, requestCatalog, overrides));
        }
        if (!isCurrentEditor()) return;
        status.textContent = t('production.employee.submitted');
        showToast(t('production.employee.submitted'));
        if (!sourceRequest && draftStore) {
          draftDirty = false;
          if (draftTimer) clearTimeout(draftTimer);
          draftTimer = null;
          draftStore.clear();
        }
        verifiedAvailabilityKey = null;
        if (typeof onNavigate === 'function') onNavigate('requests');
      } catch (error) {
        if (!isCurrentEditor()) return;
        status.className = 'error-box';
        status.textContent = errorMessage(error);
        if (error?.cause?.code === 'HTTP_409') {
          verifiedAvailabilityKey = null;
          availabilityState = 'unchecked';
          availabilityStateKey = null;
          activeStep = 2;
          renderRoomControls();
          renderActiveStep();
          focusStep();
        }
      } finally {
        if (isCurrentEditor()) {
          submit.disabled = !isAvailabilityVerified();
        }
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
    let refreshGeneration = 0;
    let hasCommittedProjection = false;
    let committedProjectionGeneration = 0;
    let interactiveProjectionGeneration = 0;
    let requestDisplay = 'list';
    let calendarReference = null;
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
        const [nextCatalog, requests] = await Promise.all([
          persistence.loadCatalog(), persistence.listRequests(),
        ]);
        if (!isCurrent(generation)) return;
        const [changes, roomContexts] = await Promise.all([
          loadOpenBookingChanges(requests, persistence),
          loadMissingRequestRoomContexts(requests, nextCatalog, persistence),
        ]);
        if (!isCurrent(generation)) return;
        catalog = nextCatalog;
        clear(root);
        root.removeAttribute('aria-busy');
        hasCommittedProjection = true;
        committedProjectionGeneration = generation;
        interactiveProjectionGeneration = generation;
        const refreshButton = button(t('production.common.refresh'));
        refreshButton.addEventListener('click', () => { void refresh(); });
        if (!requests.length) {
          root.appendChild(el('div', { className: 'button-row' }, [refreshButton]));
          root.appendChild(el('p', { className: 'info-box', text: t('requests.none') }));
          return;
        }
        if (focusRequestId) requestDisplay = 'list';
        const calendarProjection = projectServerRequestCalendar(
          requests, nextCatalog, roomContexts,
        );
        calendarReference ||= initialServerRequestCalendarMonth(calendarProjection);
        const listButton = button(t('requests.list'), {
          attrs: { 'aria-pressed': String(requestDisplay === 'list') },
        });
        const calendarButton = button(t('requests.calendar'), {
          attrs: { 'aria-pressed': String(requestDisplay === 'calendar') },
        });
        const displayControls = el('div', {
          className: 'segmented',
          attrs: { role: 'group', 'aria-label': t('production.employee.requestDisplay') },
        }, [listButton, calendarButton]);
        root.appendChild(el('section', { className: 'toolbar' }, [refreshButton, displayControls]));
        const listSection = el('section', {
          className: 'request-list',
          attrs: { 'aria-label': t('requests.list') },
        });
        const calendarHost = el('div');
        root.append(listSection, calendarHost);
        const showDisplay = (nextDisplay) => {
          requestDisplay = nextDisplay;
          const showCalendar = requestDisplay === 'calendar';
          listButton.setAttribute('aria-pressed', String(!showCalendar));
          calendarButton.setAttribute('aria-pressed', String(showCalendar));
          listSection.hidden = showCalendar;
          calendarHost.hidden = !showCalendar;
          if (!showCalendar) return;
          calendarHost.replaceChildren(renderServerRequestCalendar({
            projection: calendarProjection,
            reference: calendarReference,
            onReferenceChange: (nextReference) => {
              calendarReference = nextReference;
              showDisplay('calendar');
            },
            onSelect: (target) => {
              showDisplay('list');
              requestAnimationFrame(() => {
                if (!isCurrent(generation)) return;
                [...listSection.querySelectorAll('[data-production-request-id]')]
                  .find((candidate) => candidate.dataset.productionRequestId === target.id)
                  ?.focus();
              });
            },
          }));
        };
        listButton.addEventListener('click', () => showDisplay('list'));
        calendarButton.addEventListener('click', () => showDisplay('calendar'));
        for (const [index, request] of requests.entries()) {
          let card = null;
          const isActiveCard = () => isActiveSurface() && card?.isConnected;
          const isCurrentCard = () => (
            isInteractiveProjection(generation) && card?.isConnected
          );
          const reconcileMutation = async (tracked, caught = null) => {
            if (!isActiveSurface() || tracked.reconciled) return;
            tracked.reconciled = true;
            if (requestMutations.get(request.id) === tracked) {
              requestMutations.delete(request.id);
            }
            if (!tracked.notified) {
              tracked.notified = true;
              showToast(caught
                ? errorMessage(caught)
                : t('production.employee.cancelled'));
            }
            await refresh(request.id);
          };
          card = requestCard(request, nextCatalog, roomContexts[index], changes[index], {
            mutationInFlight: () => requestMutations.has(request.id),
            onCancel: async (requestId) => {
              const mutation = beginRequestMutation(requestId, 'cancel', () => (
                persistence.transitionRequest(requestId, { transition: 'cancel' })
              ));
              if (!mutation) return;
              try {
                await mutation.promise;
                await reconcileMutation(mutation);
              } catch (error) {
                await reconcileMutation(mutation, error);
              }
            },
            onChange: async (target) => {
              const interaction = reserveRequestMutation(target.id, 'proposal');
              if (!interaction) return;
              const interactionGeneration = refreshGeneration;
              const isCurrentInteraction = () => (
                interactionGeneration === refreshGeneration && isCurrentCard()
              );
              const releaseProposal = async ({ reconcile = true } = {}) => {
                if (requestMutations.get(target.id) !== interaction) return false;
                requestMutations.delete(target.id);
                if (reconcile && typeof activeRequestsRefresh === 'function') {
                  await activeRequestsRefresh(target.id);
                }
                return true;
              };
              try {
                const prepared = await loadCoherentRequestRoomContext(
                  target, nextCatalog, persistence,
                );
                if (!isCurrentInteraction()) {
                  await releaseProposal();
                  return;
                }
                if (!prepared) {
                  showToast(t('production.error.conflict'));
                  await releaseProposal();
                  return;
                }
                const proposalPersistence = Object.freeze({
                  proposeBookingChange: (...args) => {
                    if (requestMutations.get(target.id) !== interaction) {
                      return Promise.reject(new TypeError('PRODUCTION_REQUEST_MUTATION_STALE'));
                    }
                    interaction.promise = Promise.resolve()
                      .then(() => persistence.proposeBookingChange(...args));
                    return interaction.promise;
                  },
                });
                const dialog = openProductionBookingChangeDialog({
                  request: target,
                  catalog: prepared.catalog,
                  currentRoomContext: prepared.currentRoomContext,
                  persistence: proposalPersistence,
                  refresh: async (requestId) => {
                    if (await releaseProposal({ reconcile: false })
                      && typeof activeRequestsRefresh === 'function') {
                      await activeRequestsRefresh(requestId);
                    }
                  },
                  errorMessage,
                });
                if (!dialog) {
                  await releaseProposal();
                  return;
                }
                dialog.addEventListener('close', () => {
                  void releaseProposal();
                }, { once: true });
              } catch (caught) {
                const shouldNotify = isCurrentInteraction();
                await releaseProposal();
                if (shouldNotify) showToast(errorMessage(caught));
              }
            },
            onHistory: async (target, control) => {
              const interactionGeneration = refreshGeneration;
              const isCurrentInteraction = () => (
                interactionGeneration === refreshGeneration && isCurrentCard()
              );
              control.disabled = true;
              try {
                const entries = await persistence.loadRequestHistory(target.id);
                if (!isCurrentInteraction() || !control.isConnected) return;
                const content = el('section', {}, entries.length
                  ? entries.map((entry) => el('p', {
                    text: `${entry.version} · ${t(`timeline.operation.${entry.operation}`)} · ${formatProductionDateTime(entry.capturedAt, { locale: locale(), timeZone: 'UTC' })}`,
                  }))
                  : [el('p', { text: t('production.manager.historyEmpty') })]);
                const close = button(t('common.close'));
                const dialog = openDialog({
                  title: t('production.manager.historyTab'), content, actions: [close],
                  labelledById: `employeeHistory-${target.id}`,
                });
                close.addEventListener('click', () => dialog.close());
              } catch (error) {
                if (isCurrentInteraction()) showToast(errorMessage(error));
              } finally {
                if (isActiveCard() && control.isConnected) control.disabled = false;
              }
            },
            onPrint: printRequest,
            onRepeat: (target) => queueRequest(target),
            onResubmit: (target) => queueRequest(target, { resubmit: true }),
          });
          listSection.appendChild(card);
          const activeMutation = requestMutations.get(request.id);
          if (activeMutation?.kind === 'cancel' && activeMutation.promise) {
            activeMutation.promise.then(
              () => { void reconcileMutation(activeMutation); },
              (caught) => { void reconcileMutation(activeMutation, caught); },
            );
          }
        }
        showDisplay(requestDisplay);
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

    activeRequestsRefresh = refresh;
    await refresh();
  }

  return Object.freeze({
    renderRequest,
    renderRequests,
    hasDraft: () => Boolean(draftStore?.has?.()),
    restoreDraft: () => {
      if (typeof onNavigate === 'function') onNavigate('employee');
      else void renderRequest();
    },
  });
}
