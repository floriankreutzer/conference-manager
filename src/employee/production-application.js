import { locale, t } from '../core/i18n.js';
import { loadOpenBookingChanges } from '../shared/booking-change-loader.js';
import { button, clear, el, field, openDialog, showToast } from '../core/ui.js';
import {
  formatProductionDateTime,
  isProductionTimeZone,
  productionUtcInstant,
} from '../core/production-time.js';
import {
  composeServerRequestDraft,
  repeatRequestProjection,
} from './server-request-projection.js';
import {
  cateringEditorOptions,
  normalizeAllocationEditorDraft,
  normalizeCateringEditorDraft,
  serviceEditorOptions,
} from './server-request-editor.js';

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

function requestCard(request, catalog, openChange, {
  onCancel, onChange, onHistory, onPrint, onRepeat, onResubmit,
}) {
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
    const change = button(t('production.bookingChange.propose'));
    change.addEventListener('click', () => onChange(request));
    article.appendChild(change);
  }
  if (CANCELLABLE_STATUSES.has(request.status)) {
    const cancel = button(t('requests.cancel'), { className: 'danger' });
    cancel.addEventListener('click', () => onCancel(request.id, cancel));
    article.appendChild(cancel);
  }
  const history = button(t('production.manager.historyTab'));
  history.addEventListener('click', () => onHistory(request, history));
  const print = button(t('guest.print'));
  print.addEventListener('click', () => onPrint(request));
  const repeat = button(t(request.status === 'Rejected' ? 'requests.repeatRejected' : 'requests.repeat'));
  repeat.addEventListener('click', () => onRepeat(request));
  article.appendChild(el('div', { className: 'button-row' }, [history, print, repeat]));
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
} = {}) {
  if (!appRoot || typeof setPageHeading !== 'function') throw new TypeError('PRODUCTION_EMPLOYEE_UI_REQUIRED');
  if (
    !persistence
    || typeof persistence.loadCatalog !== 'function'
    || typeof persistence.checkRoomAvailability !== 'function'
    || typeof persistence.loadBookingChange !== 'function'
    || typeof persistence.proposeBookingChange !== 'function'
  ) {
    throw new TypeError('PRODUCTION_PERSISTENCE_REQUIRED');
  }

  let catalog = Object.freeze({ rooms: Object.freeze([]) });
  let queuedRequest = null;
  let queuedResubmission = false;

  function queueRequest(request, { resubmit = false } = {}) {
    if (resubmit || Date.parse(request.startsAt) > Date.now()) {
      queuedRequest = request;
    } else {
      const room = catalog.rooms.find((entry) => entry.id === request.roomId);
      queuedRequest = repeatRequestProjection(request, Date.now(), roomTimeZone(room, catalog));
    }
    queuedResubmission = resubmit;
    if (typeof onNavigate === 'function') onNavigate('employee');
    else void renderRequest();
  }

  function printRequest(request) {
    const printWindow = openDetachedPrintWindow();
    if (!printWindow) return;
    const doc = printWindow.document;
    const room = catalog.rooms.find((entry) => entry.id === request.roomId);
    const site = catalog.sites?.find((entry) => entry.id === room?.siteId);
    const details = siteInfo?.sites?.find?.((entry) => entry.id === site?.id) || {};
    doc.documentElement.lang = locale().split('-')[0];
    doc.title = `${t('requests.pdf')} · ${request.id}`;
    const heading = doc.createElement('h1');
    heading.textContent = t('guest.welcome', {
      title: request.details?.title || t('production.common.requestId', { id: request.id }),
    });
    const list = doc.createElement('dl');
    [
      [t('production.employee.start'), formattedRequestValue(request.startsAt, room, catalog)],
      [t('production.employee.end'), formattedRequestValue(request.endsAt, room, catalog)],
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

  function formattedRequestValue(value, room, requestCatalog) {
    return formatProductionDateTime(value, {
      locale: locale(),
      timeZone: roomTimeZone(room, requestCatalog),
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

  function changeDialog(request, refresh) {
    const selectedRoom = catalog.rooms.find((entry) => entry.id === request.roomId);
    const timeZone = roomTimeZone(selectedRoom, catalog);
    if (!isProductionTimeZone(timeZone)) {
      showToast(t('production.employee.timeZoneUnavailable'));
      return;
    }
    const startValue = wallValues(request.startsAt, timeZone);
    const endValue = wallValues(request.endsAt, timeZone);
    const room = el('select');
    catalog.rooms.filter((entry) => entry.active || entry.id === request.roomId).forEach((entry) => {
      room.appendChild(el('option', { value: entry.id, text: roomLabel(entry) }));
    });
    room.value = request.roomId;
    const date = el('input', { attrs: { type: 'date', value: startValue.date } });
    const start = el('input', { attrs: { type: 'time', value: startValue.time } });
    const end = el('input', { attrs: { type: 'time', value: endValue.time } });
    const internal = el('input', { attrs: { type: 'number', min: '0', max: String(MAX_PARTICIPANTS), value: String(request.internalParticipants) } });
    const external = el('input', { attrs: { type: 'number', min: '0', max: String(MAX_PARTICIPANTS), value: String(request.externalParticipants) } });
    const error = el('p', { className: 'field-error', attrs: { role: 'alert' } });
    const content = el('section', {}, [
      field({ id: `changeRoom-${request.id}`, label: t('production.employee.room'), control: room, required: true }),
      field({ id: `changeDate-${request.id}`, label: t('schedule.date'), control: date, required: true }),
      field({ id: `changeStart-${request.id}`, label: t('production.employee.start'), control: start, required: true }),
      field({ id: `changeEnd-${request.id}`, label: t('production.employee.end'), control: end, required: true }),
      field({ id: `changeInternal-${request.id}`, label: t('production.employee.internal'), control: internal, required: true }),
      field({ id: `changeExternal-${request.id}`, label: t('production.employee.external'), control: external, required: true }),
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
    cancel.addEventListener('click', () => dialog.close());
    submit.addEventListener('click', async () => {
      const targetRoom = catalog.rooms.find((entry) => entry.id === room.value);
      const targetTimeZone = roomTimeZone(targetRoom, catalog);
      const startsAt = productionUtcInstant(date.value, start.value, targetTimeZone);
      const endsAt = productionUtcInstant(date.value, end.value, targetTimeZone);
      const internalParticipants = safeParticipantCount(internal.value);
      const externalParticipants = safeParticipantCount(external.value);
      const totalParticipants = Number(internalParticipants) + Number(externalParticipants);
      if (!startsAt || !endsAt || Date.parse(startsAt) <= Date.now()
        || Date.parse(endsAt) <= Date.parse(startsAt)
        || internalParticipants === null || externalParticipants === null
        || totalParticipants < 1 || totalParticipants > MAX_PARTICIPANTS) {
        error.textContent = t('production.employee.validation');
        return;
      }
      submit.disabled = true;
      try {
        await persistence.proposeBookingChange(request.id, compositionDraft(request, catalog, {
          roomId: room.value, startsAt, endsAt, internalParticipants, externalParticipants,
        }));
        dialog.close();
        showToast(t('production.bookingChange.proposed'));
        await refresh(request.id);
      } catch (caught) {
        submit.disabled = false;
        error.textContent = errorMessage(caught);
      }
    });
  }

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
    const sourceRequest = queuedRequest;
    const isResubmission = queuedResubmission;
    queuedRequest = null;
    queuedResubmission = false;
    const rooms = catalog.rooms.filter((room) => room.active !== false);
    if (!rooms.length) {
      root.appendChild(el('p', { className: 'info-box', text: t('production.employee.noRooms') }));
      return;
    }

    const room = el('select');
    room.appendChild(el('option', { value: '', text: t('schedule.locationPlaceholder') }));
    rooms.forEach((entry) => room.appendChild(el('option', { value: entry.id, text: roomLabel(entry) })));
    const sourceRoom = rooms.find((entry) => entry.id === sourceRequest?.roomId);
    const sourceTimeZone = roomTimeZone(sourceRoom, catalog);
    const sourceStart = sourceRequest && isProductionTimeZone(sourceTimeZone)
      ? wallValues(sourceRequest.startsAt, sourceTimeZone) : null;
    const sourceEnd = sourceRequest && isProductionTimeZone(sourceTimeZone)
      ? wallValues(sourceRequest.endsAt, sourceTimeZone) : null;
    if (sourceRoom) room.value = sourceRoom.id;
    const date = el('input', { attrs: { type: 'date', value: sourceStart?.date || '' } });
    const start = el('input', { attrs: { type: 'time', value: sourceStart?.time || '' } });
    const end = el('input', { attrs: { type: 'time', value: sourceEnd?.time || '' } });
    const internal = el('input', { attrs: { type: 'number', min: '0', max: String(MAX_PARTICIPANTS), value: String(sourceRequest?.internalParticipants ?? 1) } });
    const external = el('input', { attrs: { type: 'number', min: '0', max: String(MAX_PARTICIPANTS), value: String(sourceRequest?.externalParticipants ?? 0) } });
    const title = el('input', { attrs: { type: 'text', maxlength: '160', value: sourceRequest?.details?.title || '' } });
    const specialRequirements = el('textarea', { attrs: { maxlength: '2000' }, value: sourceRequest?.details?.specialRequirements || '' });
    const dietaryRequirements = el('textarea', { attrs: { maxlength: '2000' }, value: sourceRequest?.details?.dietaryRequirements || '' });
    const selectedServices = new Set(sourceRequest?.details?.serviceIds || []);
    let packageSelection = sourceRequest?.details?.catering?.packageSelection
      ? { ...sourceRequest.details.catering.packageSelection } : null;
    const itemQuantities = Object.fromEntries(
      (sourceRequest?.details?.catering?.itemQuantities || []).map((entry) => [entry.itemId, entry.quantity]),
    );
    const cateringParticipants = el('input', {
      attrs: {
        type: 'number', min: '0', max: String(MAX_PARTICIPANTS), step: '1',
        value: String(sourceRequest?.details?.catering?.participantCount || 0),
      },
    });
    const servicePanel = el('section');
    const renderServiceControls = () => {
      clear(servicePanel);
      const services = serviceEditorOptions(catalog, room.value);
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
      const options = cateringEditorOptions(catalog, room.value);
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

    const allocationRows = (sourceRequest?.allocations?.entries || []).map((entry) => ({
      costCenterId: entry.costCenterId,
      percentage: (entry.percentageBasisPoints / 100).toFixed(2).replace(/\.00$/, ''),
    }));
    if (!allocationRows.length && catalog.costAllocation?.allocationRequired && catalog.costCenters.length) {
      allocationRows.push({ costCenterId: catalog.costCenters[0].id, percentage: '100' });
    }
    const allocationPanel = el('section', { attrs: { 'aria-label': t('cost.allocations') } });
    const renderAllocationControls = () => {
      clear(allocationPanel);
      allocationPanel.append(
        el('h3', { text: t('cost.allocations') }),
        el('p', { className: 'muted', text: t('cost.allocHint') }),
      );
      allocationRows.forEach((allocation, index) => {
        const row = el('article', { className: 'allocation-row' });
        const center = el('select');
        center.appendChild(el('option', { value: '', text: t('cost.costCenter') }));
        catalog.costCenters.filter((entry) => entry.active !== false).forEach((entry) => {
          center.appendChild(el('option', { value: entry.id, text: `${entry.code} · ${entry.name}` }));
        });
        center.value = allocation.costCenterId;
        center.addEventListener('change', () => { allocation.costCenterId = center.value; });
        const percentage = el('input', {
          attrs: { type: 'number', min: '0.01', max: '100', step: '0.01', value: allocation.percentage },
        });
        percentage.addEventListener('input', () => { allocation.percentage = percentage.value; });
        const remove = button(t('common.delete'));
        remove.addEventListener('click', () => {
          allocationRows.splice(index, 1);
          renderAllocationControls();
        });
        row.append(
          field({ id: `productionAllocationCenter-${index}`, label: t('cost.costCenter'), control: center, required: true }),
          field({ id: `productionAllocationPercent-${index}`, label: t('cost.percent'), control: percentage, required: true }),
          remove,
        );
        allocationPanel.appendChild(row);
      });
      const sum = allocationRows.reduce((total, entry) => total + Number(entry.percentage || 0), 0);
      allocationPanel.appendChild(el('p', {
        className: Math.abs(sum - 100) < 0.001 || (!allocationRows.length && !catalog.costAllocation?.allocationRequired)
          ? 'validation-ok' : 'validation-bad',
        text: t('cost.sum', { sum: sum.toFixed(2).replace(/\.00$/, '') }),
        attrs: { role: 'status', 'aria-live': 'polite' },
      }));
      const add = button(t('cost.add'));
      add.disabled = allocationRows.length >= Math.min(100, catalog.costCenters.length);
      add.addEventListener('click', () => {
        const used = new Set(allocationRows.map((entry) => entry.costCenterId));
        const next = catalog.costCenters.find((entry) => entry.active !== false && !used.has(entry.id));
        if (next) allocationRows.push({ costCenterId: next.id, percentage: '0' });
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
          catalog,
          roomId: window.roomId,
        });
        allocations = normalizeAllocationEditorDraft({ allocations: allocationRows, catalog });
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
            compositionDraft(sourceRequest, catalog, overrides),
          );
        } else {
          await persistence.createRequest(compositionDraft(sourceRequest, catalog, overrides));
        }
        status.textContent = t('production.employee.submitted');
        showToast(t('production.employee.submitted'));
        verifiedAvailabilityKey = null;
        if (typeof onNavigate === 'function') onNavigate('requests');
      } catch (error) {
        verifiedAvailabilityKey = null;
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
        const changes = await loadOpenBookingChanges(requests, persistence);
        clear(root);
        const refreshButton = button(t('production.common.refresh'));
        refreshButton.addEventListener('click', refresh);
        root.appendChild(el('div', { className: 'button-row' }, [refreshButton]));
        if (!requests.length) {
          root.appendChild(el('p', { className: 'info-box', text: t('requests.none') }));
          return;
        }
        for (const [index, request] of requests.entries()) {
          root.appendChild(requestCard(request, nextCatalog, changes[index], {
            onCancel: async (requestId, control) => {
            control.disabled = true;
            try {
              await persistence.transitionRequest(requestId, { transition: 'cancel' });
              showToast(t('production.employee.cancelled'));
              await refresh(requestId);
            } catch (error) {
              control.disabled = false;
              showToast(errorMessage(error));
            }
            },
            onChange: (target) => changeDialog(target, refresh),
            onHistory: async (target, control) => {
              control.disabled = true;
              try {
                const entries = await persistence.loadRequestHistory(target.id);
                const content = el('section', {}, entries.length
                  ? entries.map((entry) => el('p', {
                    text: `${entry.version} · ${entry.operation} · ${formatProductionDateTime(entry.capturedAt, { locale: locale(), timeZone: 'UTC' })}`,
                  }))
                  : [el('p', { text: t('production.manager.historyEmpty') })]);
                const close = button(t('common.close'));
                const dialog = openDialog({
                  title: t('production.manager.historyTab'), content, actions: [close],
                  labelledById: `employeeHistory-${target.id}`,
                });
                close.addEventListener('click', () => dialog.close());
              } catch (error) {
                showToast(errorMessage(error));
              } finally {
                control.disabled = false;
              }
            },
            onPrint: printRequest,
            onRepeat: (target) => queueRequest(target),
            onResubmit: (target) => queueRequest(target, { resubmit: true }),
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
