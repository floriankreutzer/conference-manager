import { formatNumber, locale, t } from '../core/i18n.js';
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
    const root = el('section', { className: 'card' }, [
      el('p', { className: 'muted', text: t('production.common.loading') }),
    ]);
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

    const room = el('select');
    room.appendChild(el('option', { value: '', text: t('schedule.locationPlaceholder') }));
    rooms.forEach((entry) => room.appendChild(el('option', { value: entry.id, text: roomLabel(entry) })));
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
    const cateringPanel = el('section', { attrs: { 'aria-label': t('catering.heading') } });
    const renderCateringControls = () => {
      clear(cateringPanel);
      if (!room.value) {
        cateringPanel.append(
          el('h3', { text: t('catering.heading') }),
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
        el('h3', { text: t('catering.heading') }),
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
      className: 'muted',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
    const checkAvailability = button(t('production.employee.checkAvailability'));
    const submit = button(t(isResubmission ? 'review.resubmit' : 'production.employee.submit'), { className: 'primary', disabled: true });
    let verifiedAvailabilityKey = null;
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
    const invalidateAvailability = () => {
      availabilityGeneration += 1;
      verifiedAvailabilityKey = null;
      checkAvailability.disabled = false;
      submit.disabled = true;
      status.className = 'muted';
      status.textContent = t('production.employee.availabilityRequired');
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

    const step = (number, label, children) => el('fieldset', { className: 'card' }, [
      el('legend', { text: `${number}/6 · ${label}` }), ...children,
    ]);
    root.append(
      step(1, t('production.employee.title'), [
        field({ id: 'productionTitle', label: t('production.employee.title'), control: title, required: true }),
      ]),
      step(2, t('schedule.date'), [
        field({ id: 'productionDate', label: t('schedule.date'), control: date, required: true }),
        field({ id: 'productionStart', label: t('production.employee.start'), control: start, required: true }),
        field({ id: 'productionEndDate', label: t('production.employee.endDate'), control: endDate, required: true }),
        field({ id: 'productionEnd', label: t('production.employee.end'), control: end, required: true }),
      ]),
      step(3, t('production.employee.room'), [
        field({ id: 'productionRoom', label: t('production.employee.room'), control: room, required: true }),
      ]),
      step(4, t('production.common.participants', { count: 0 }), [
        field({ id: 'productionInternal', label: t('production.employee.internal'), control: internal, required: true }),
        field({ id: 'productionExternal', label: t('production.employee.external'), control: external, required: true }),
      ]),
      step(5, t('settings.catalogue.title'), [
        servicePanel,
        cateringPanel,
      ]),
      step(6, t('production.employee.submit'), [
        allocationPanel,
        field({ id: 'productionDietary', label: t('catering.dietary'), control: dietaryRequirements }),
        field({ id: 'productionSpecial', label: t('production.manager.reason'), control: specialRequirements }),
      ]),
      status,
      el('div', { className: 'button-row' }, [checkAvailability, submit]),
    );
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
      submit.disabled = true;
      checkAvailability.disabled = true;
      status.className = 'muted';
      status.textContent = t('production.employee.checkingAvailability');
      try {
        const result = await persistence.checkRoomAvailability(window, isResubmission ? sourceRequest.id : null);
        if (!isCurrentEditor()
          || availabilityRequestGeneration !== availabilityGeneration
          || key !== availabilityKey(currentAvailabilityWindow())) return;
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
        if (!isCurrentEditor() || availabilityRequestGeneration !== availabilityGeneration) return;
        status.className = 'error-box';
        status.textContent = t('production.employee.availabilityError');
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
      const valid = window && availabilityKey(window) === verifiedAvailabilityKey
        && Date.parse(window.startsAt) > Date.now() && internalParticipants !== null
        && externalParticipants !== null && total >= 1 && total <= MAX_PARTICIPANTS
        && normalizedTitle.length >= 1 && normalizedTitle.length <= 160;
      if (!valid) {
        status.textContent = window && availabilityKey(window) !== verifiedAvailabilityKey
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
        verifiedAvailabilityKey = null;
        status.className = 'error-box';
        status.textContent = errorMessage(error);
      } finally {
        if (isCurrentEditor()) {
          submit.disabled = availabilityKey(currentAvailabilityWindow()) !== verifiedAvailabilityKey;
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
        root.appendChild(el('div', { className: 'button-row' }, [refreshButton]));
        if (!requests.length) {
          root.appendChild(el('p', { className: 'info-box', text: t('requests.none') }));
          return;
        }
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
          root.appendChild(card);
          const activeMutation = requestMutations.get(request.id);
          if (activeMutation?.kind === 'cancel' && activeMutation.promise) {
            activeMutation.promise.then(
              () => { void reconcileMutation(activeMutation); },
              (caught) => { void reconcileMutation(activeMutation, caught); },
            );
          }
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
