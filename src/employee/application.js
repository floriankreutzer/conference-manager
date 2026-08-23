import {
  REQUEST_STATUS,
  isRoomConflict,
  localTodayIso,
  totalParticipants,
  validateAllocations,
  validateRoom,
  validateSchedule,
} from '../core/domain.js';
import { formatDate, formatMoney, language, t } from '../core/i18n.js';
import {
  KEYS,
  readJson,
  remove,
  requestRepository,
  writeJson,
} from '../core/storage.js';
import {
  announce,
  button,
  clear,
  clearValidation,
  el,
  field,
  openDialog,
  safeHttpsUrl,
  setFieldInvalid,
  showToast,
  validationSummary,
} from '../core/ui.js';
import { inputControl, sectionHeading } from '../shared/application-presentation.js';
import { notify } from '../shared/notifications.js';
import { createRequestCard } from '../shared/request-card.js';
import {
  createCancelledRequest,
  createResubmittedRequest,
  createSubmittedRequest,
  requestMatchesFilter,
  validateRequestSubmission,
} from './request-lifecycle.js';
import {
  activeRooms,
  applyChangeRequestToState,
  applyRepeatToState,
  availableRoomModel as buildAvailableRoomModel,
  calculateRequestCostSummary,
  cateringParticipantCount,
  createDraftPayload,
  emptyRequestForm,
  hasMeaningfulDraft,
  resetEmployeeRequestState,
  restoreDraftState,
  selectedCateringPackage,
} from './request-session.js';

export function createEmployeeApplication({
  context,
  appRoot,
  setPageHeading,
  onNavigate,
  onHelp,
}) {
  const state = {
    step: 1,
    form: emptyRequestForm(),
    roomId: null,
    serviceIds: [],
    cateringMode: 'NONE',
    packageSelection: null,
    quantities: Object.fromEntries(context.getCatalog().cateringItems.map((item) => [item.id, 0])),
    allocations: [{ costCenter: '', percent: 100 }],
    editingRequestId: null,
    requestFilter: 'ACTIVE',
    requestDisplay: 'LIST',
    calendarReference: localTodayIso(),
  };
  let draftTimer = null;

  const catalog = () => context.getCatalog();
  const localized = (value) => context.localized(value);
  const requests = () => context.requests();
  const activeRoomList = () => activeRooms(catalog());
  const currentRoom = () => catalog().rooms.find((room) => room.id === state.roomId) || null;
  const selectedPackage = () => selectedCateringPackage(state, catalog());
  const cateringCount = () => cateringParticipantCount(state);
  const costSummary = () => calculateRequestCostSummary(state, catalog());
  const availableRoomModel = () => buildAvailableRoomModel({ state, catalog: catalog(), requests: requests() });

  function scheduleDraftSave() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 650);
  }

  function saveDraft({ notifyUser = false } = {}) {
    if (state.editingRequestId) return;
    const draft = createDraftPayload(state);
    if (!hasMeaningfulDraft(draft)) return;
    writeJson(KEYS.draft, draft);
    if (notifyUser) showToast(t('draft.saved'));
    const status = document.getElementById('draftStatus');
    if (status) {
      status.textContent = t('draft.autosaved', {
        time: new Intl.DateTimeFormat(language() === 'en' ? 'en-GB' : 'de-DE', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date()),
      });
    }
  }

  function restoreDraft() {
    const draft = readJson(KEYS.draft, null);
    if (!draft) return;
    restoreDraftState(state, draft, catalog());
    showToast(t('draft.restored'));
    onNavigate('employee');
  }

  function bindStateInput(control, key, { numeric = false, rerender = false } = {}) {
    const eventName = control.tagName === 'SELECT' ? 'change' : 'input';
    control.addEventListener(eventName, () => {
      state.form[key] = numeric && control.value !== '' ? Number(control.value) : control.value;
      if (['internalParticipants', 'externalParticipants'].includes(key) && !state.form.cateringParticipants) {
        state.form.cateringParticipants = '';
      }
      scheduleDraftSave();
      if (rerender) renderRequest();
    });
  }

  function renderStepper() {
    const labels = [
      'request.step.schedule',
      'request.step.room',
      'request.step.services',
      'request.step.catering',
      'request.step.costs',
      'request.step.review',
    ];
    const nav = el('nav', { className: 'stepper', attrs: { 'aria-label': t('a11y.steps') } });
    const list = el('ol');
    labels.forEach((key, index) => {
      const step = index + 1;
      const stepButton = button(`${step}. ${t(key)}`, {
        className: `step${state.step === step ? ' active' : ''}${state.step > step ? ' done' : ''}`,
        attrs: {
          'aria-label': t('a11y.step', { step, label: t(key) }),
          ...(state.step === step ? { 'aria-current': 'step' } : {}),
        },
      });
      stepButton.addEventListener('click', () => moveToStep(step));
      list.append(el('li', {}, stepButton));
    });
    nav.appendChild(list);
    return nav;
  }

  function validationForStep(step) {
    if (step === 1) return validateSchedule(state.form);
    if (step === 2) {
      return validateRoom({
        roomId: state.roomId,
        form: state.form,
        rooms: activeRoomList(),
        requests: requests(),
        excludeRequestId: state.editingRequestId,
      });
    }
    if (step === 5) return validateAllocations(state.allocations);
    return null;
  }

  function showValidationError(error) {
    state.step = error.step;
    renderRequest();
    const panel = document.querySelector(`[data-step-panel="${error.step}"]`);
    const message = t(error.key);
    validationSummary(panel, message);
    setFieldInvalid(error.field, true);
    const target = document.getElementById(error.field);
    if (target && !target.matches('input,select,textarea,button,a[href],[tabindex]')) target.tabIndex = -1;
    target?.focus();
    announce(message, { assertive: true });
  }

  function moveToStep(targetStep) {
    if (targetStep > state.step) {
      const error = validationForStep(state.step);
      if (error) {
        showValidationError(error);
        return;
      }
    }
    clearValidation();
    state.step = targetStep;
    renderRequest();
  }

  function renderRequest() {
    setPageHeading(
      state.editingRequestId ? t('requests.editChange') : t('request.heading'),
      t('request.subtitle'),
    );
    clear(appRoot);
    appRoot.appendChild(renderStepper());
    const panel = el('section', {
      className: 'card wizard-card',
      dataset: { stepPanel: String(state.step) },
    });
    const renderers = [
      renderScheduleStep,
      renderRoomStep,
      renderServiceStep,
      renderCateringStep,
      renderCostStep,
      renderReviewStep,
    ];
    panel.appendChild(renderers[state.step - 1]());
    const actions = el('footer', { className: 'wizard-actions' });
    if (state.step > 1) {
      const back = button(t('common.back'));
      back.addEventListener('click', () => moveToStep(state.step - 1));
      actions.appendChild(back);
    }
    actions.appendChild(el('span', { className: 'spacer' }));
    actions.appendChild(el('span', {
      id: 'draftStatus',
      className: 'draft-status',
      attrs: { role: 'status', 'aria-live': 'polite' },
    }));
    if (state.step < 6) {
      const next = button(t('common.next'), { className: 'primary' });
      next.addEventListener('click', () => moveToStep(state.step + 1));
      actions.appendChild(next);
    } else {
      const submit = button(
        state.editingRequestId ? t('review.resubmit') : t('review.submit'),
        { className: 'primary' },
      );
      submit.addEventListener('click', submitRequest);
      actions.appendChild(submit);
    }
    panel.appendChild(actions);
    appRoot.appendChild(panel);
  }

  function renderScheduleStep() {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(sectionHeading(t('schedule.heading'), t('schedule.desc')));
    const grid = el('div', { className: 'form-grid two' });

    const title = inputControl('text', state.form.title, {
      placeholder: t('schedule.titlePlaceholder'),
      required: true,
    });
    bindStateInput(title, 'title');
    grid.appendChild(field({ id: 'title', label: t('schedule.title'), control: title, required: true }));

    const location = el('select');
    location.append(el('option', { value: '', text: t('schedule.locationPlaceholder') }));
    [...new Set(activeRoomList().map((room) => room.location))]
      .sort()
      .forEach((value) => location.append(el('option', { value, text: value })));
    location.value = state.form.location;
    bindStateInput(location, 'location', { rerender: true });
    grid.appendChild(field({ id: 'location', label: t('schedule.location'), control: location, required: true }));

    const date = inputControl('date', state.form.date, { required: true });
    date.min = localTodayIso();
    bindStateInput(date, 'date');
    grid.appendChild(field({ id: 'date', label: t('schedule.date'), control: date, required: true }));

    const internal = inputControl('number', state.form.internalParticipants, {
      min: 0,
      placeholder: t('schedule.participantPlaceholder'),
      required: true,
    });
    bindStateInput(internal, 'internalParticipants', { numeric: true });
    grid.appendChild(field({
      id: 'internalParticipants',
      label: t('schedule.internal'),
      control: internal,
      required: true,
    }));

    const start = inputControl('time', state.form.start, { required: true });
    bindStateInput(start, 'start');
    grid.appendChild(field({ id: 'start', label: t('schedule.start'), control: start, required: true }));

    const end = inputControl('time', state.form.end, { required: true });
    bindStateInput(end, 'end');
    grid.appendChild(field({ id: 'end', label: t('schedule.end'), control: end, required: true }));

    const external = inputControl('number', state.form.externalParticipants, { min: 0, placeholder: '0' });
    bindStateInput(external, 'externalParticipants', { numeric: true });
    grid.appendChild(field({ id: 'externalParticipants', label: t('schedule.external'), control: external }));

    grid.appendChild(el('section', {
      className: 'participant-total',
      attrs: { 'aria-live': 'polite' },
    }, [
      el('span', { text: t('schedule.total') }),
      el('strong', { text: String(totalParticipants(state.form)) }),
      el('small', { text: t('schedule.totalHint') }),
    ]));
    fragment.appendChild(grid);

    const special = el('textarea', {
      value: state.form.specialRequirements,
      placeholder: t('schedule.specialPlaceholder'),
    });
    special.value = state.form.specialRequirements;
    bindStateInput(special, 'specialRequirements');
    fragment.appendChild(field({
      id: 'specialRequirements',
      label: t('schedule.special'),
      control: special,
      hint: t('schedule.specialHint'),
      optional: true,
    }));
    return fragment;
  }

  function renderRoomStep() {
    const fragment = document.createDocumentFragment();
    const heading = sectionHeading(t('room.heading'), t('room.desc'));
    const refresh = button(t('room.refresh'));
    refresh.addEventListener('click', renderRequest);
    heading.appendChild(refresh);
    fragment.appendChild(heading);
    fragment.appendChild(el('aside', {
      className: 'info-box',
      attrs: { role: 'note' },
      text: t('room.refreshHint'),
    }));
    const roomRoot = el('section', {
      id: 'rooms',
      className: 'selection-grid',
      attrs: { 'aria-label': t('a11y.availableRooms') },
    });
    const model = availableRoomModel();

    if (model.type !== 'available') {
      const key = model.type === 'location'
        ? 'room.noLocation'
        : model.type === 'capacity'
          ? 'room.noCapacity'
          : model.type === 'busy'
            ? 'room.noFree'
            : 'validation.room';
      const box = el('article', { className: 'recovery-card' }, [
        el('strong', { text: t(key, { capacity: model.largestCapacity || 0 }) }),
      ]);
      const actions = el('div', { className: 'button-row' });
      const dateAction = button(t('room.changeSchedule'));
      dateAction.addEventListener('click', () => {
        state.step = 1;
        renderRequest();
        requestAnimationFrame(() => document.getElementById('date')?.focus());
      });
      const peopleAction = button(t('room.changeParticipants'));
      peopleAction.addEventListener('click', () => {
        state.step = 1;
        renderRequest();
        requestAnimationFrame(() => document.getElementById('internalParticipants')?.focus());
      });
      const helpAction = button(t('room.contact'), { className: 'primary' });
      helpAction.addEventListener('click', () => onHelp());
      actions.append(dateAction, peopleAction, helpAction);
      box.appendChild(actions);
      roomRoot.appendChild(box);
    } else {
      const participantCount = totalParticipants(state.form);
      const currentRequests = requests();
      const smallestFreeCapacity = Math.min(
        ...model.rooms
          .filter((room) => !isRoomConflict(currentRequests, {
            roomId: room.id,
            date: state.form.date,
            start: state.form.start,
            end: state.form.end,
          }, state.editingRequestId))
          .map((room) => Number(room.capacity)),
        Infinity,
      );
      model.rooms.forEach((room) => {
        const busy = isRoomConflict(currentRequests, {
          roomId: room.id,
          date: state.form.date,
          start: state.form.start,
          end: state.form.end,
        }, state.editingRequestId);
        const selected = state.roomId === room.id;
        const card = el('article', {
          className: `option-card${selected ? ' selected' : ''}${busy ? ' disabled' : ''}`,
        });
        card.append(
          el('span', { className: `badge ${busy ? 'danger' : 'success'}`, text: busy ? t('room.busy') : t('room.available') }),
          el('h3', { text: localized(room.name) }),
          el('p', { text: t('room.capacity', { capacity: room.capacity, needed: participantCount }) }),
          el('p', { text: localized(room.equipment) }),
          el('strong', { className: 'price', text: `${formatMoney(room.rate)} · ${t('room.cost')}` }),
        );
        if (!busy && Number(room.capacity) === smallestFreeCapacity) {
          card.appendChild(el('span', { className: 'recommendation', text: t('room.bestFit') }));
        }
        const actions = el('div', { className: 'button-row' });
        const select = button(selected ? t('a11y.selected') : t('a11y.roomSelect'), {
          className: selected ? 'primary' : 'secondary',
          disabled: busy,
          attrs: { 'aria-pressed': String(selected) },
        });
        select.addEventListener('click', () => {
          state.roomId = room.id;
          scheduleDraftSave();
          renderRequest();
        });
        const plan = button(t('room.floorplan'));
        plan.addEventListener('click', () => openFloorplan(room));
        actions.append(select, plan);
        card.appendChild(actions);
        roomRoot.appendChild(card);
      });
    }
    fragment.appendChild(roomRoot);
    return fragment;
  }

  function openFloorplan(room) {
    const content = el('section', { className: 'floorplan-layout' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 800 420');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', localized(room.name));
    svg.classList.add('floorplan-svg');
    const title = document.createElementNS(svg.namespaceURI, 'title');
    title.textContent = localized(room.name);
    svg.appendChild(title);
    const addRect = (x, y, width, height, className) => {
      const node = document.createElementNS(svg.namespaceURI, 'rect');
      Object.entries({ x, y, width, height }).forEach(([key, value]) => node.setAttribute(key, String(value)));
      node.setAttribute('class', className);
      svg.appendChild(node);
    };
    const addText = (x, y, text, className) => {
      const node = document.createElementNS(svg.namespaceURI, 'text');
      node.setAttribute('x', String(x));
      node.setAttribute('y', String(y));
      node.setAttribute('class', className);
      node.textContent = text;
      svg.appendChild(node);
    };
    addRect(20, 20, 760, 380, 'fp-room');
    addRect(170, 135, 330, 150, 'fp-table');
    addText(335, 215, t('room.table'), 'fp-label');
    addRect(570, 70, 150, 42, 'fp-screen');
    addText(645, 98, t('room.screen'), 'fp-small');
    addRect(575, 160, 140, 90, 'fp-presentation');
    addText(645, 210, t('room.presentation'), 'fp-small');
    addText(65, 370, t('room.entrance'), 'fp-small');
    content.append(svg, el('dl', { className: 'details-list' }, [
      el('dt', { text: t('room.floor') }),
      el('dd', { text: localized(room.floor) }),
      el('dt', { text: t('manager.capacity') }),
      el('dd', { text: String(room.capacity) }),
      el('dt', { text: t('manager.equipment') }),
      el('dd', { text: localized(room.equipment) }),
    ]));
    const close = button(t('common.close'), { className: 'primary' });
    const dialog = openDialog({
      title: localized(room.name),
      content,
      actions: [close],
      labelledById: 'floorplanTitle',
    });
    close.addEventListener('click', () => dialog.close());
  }

  function renderServiceStep() {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(
      sectionHeading(`${t('services.heading')} (${t('common.optional')})`, t('services.desc')),
    );
    fragment.appendChild(el('p', { className: 'muted', text: t('services.none') }));
    const grid = el('section', {
      className: 'selection-grid compact',
      attrs: { 'aria-label': t('a11y.services') },
    });
    const external = Number(state.form.externalParticipants || 0);
    const withCatering = state.cateringMode !== 'NONE';
    catalog().services.filter((service) => service.active !== false).forEach((service) => {
      const selected = state.serviceIds.includes(service.id);
      const card = el('article', { className: `option-card${selected ? ' selected' : ''}` });
      const hintKey = service.id === 'host'
        ? 'services.hostHint'
        : service.id === 'av'
          ? 'services.avHint'
          : service.id === 'it'
            ? 'services.itHint'
            : 'services.staffHint';
      const recommended = (service.id === 'host' && external > 0) || (service.id === 'service' && withCatering);
      card.append(
        el('h3', { text: localized(service.name) }),
        el('p', { text: localized(service.description) }),
        el('strong', { className: 'price', text: formatMoney(service.price) }),
        el('p', {
          className: recommended ? 'recommendation' : 'muted',
          text: recommended ? t('services.recommended') : t(hintKey),
        }),
      );
      const select = button(
        selected
          ? t('a11y.serviceRemove', { name: localized(service.name) })
          : t('a11y.serviceAdd', { name: localized(service.name) }),
        {
          className: selected ? 'primary' : 'secondary',
          attrs: { 'aria-pressed': String(selected) },
        },
      );
      select.addEventListener('click', () => {
        state.serviceIds = selected
          ? state.serviceIds.filter((id) => id !== service.id)
          : [...state.serviceIds, service.id];
        scheduleDraftSave();
        renderRequest();
      });
      card.appendChild(select);
      grid.appendChild(card);
    });
    fragment.appendChild(grid);
    return fragment;
  }

  function renderCateringStep() {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(sectionHeading(`${t('catering.heading')} (${t('common.optional')})`, t('catering.desc')));
    const modes = el('fieldset', { className: 'mode-selector' });
    modes.appendChild(el('legend', { text: t('catering.desc') }));
    [
      ['NONE', 'catering.mode.none'],
      ['PACKAGE', 'catering.mode.package'],
      ['ITEMS', 'catering.mode.items'],
      ['BOTH', 'catering.mode.both'],
    ].forEach(([value, key]) => {
      const label = el('label', { className: 'mode-option' });
      const radio = inputControl('radio', '');
      radio.name = 'cateringMode';
      radio.value = value;
      radio.checked = state.cateringMode === value;
      radio.addEventListener('change', () => {
        state.cateringMode = value;
        if (value === 'NONE') {
          state.packageSelection = null;
          state.quantities = Object.fromEntries(catalog().cateringItems.map((item) => [item.id, 0]));
        }
        scheduleDraftSave();
        renderRequest();
      });
      label.append(radio, el('span', { text: t(key) }));
      modes.appendChild(label);
    });
    fragment.appendChild(modes);
    if (state.cateringMode === 'NONE') return fragment;

    const count = inputControl(
      'number',
      state.form.cateringParticipants || totalParticipants(state.form),
      { min: 1, step: 1 },
    );
    bindStateInput(count, 'cateringParticipants', { numeric: true });
    fragment.appendChild(field({
      id: 'cateringParticipants',
      label: t('catering.people'),
      control: count,
      hint: t('catering.peopleHint'),
    }));

    if (['PACKAGE', 'BOTH'].includes(state.cateringMode)) {
      const packageGrid = el('section', {
        className: 'package-grid',
        attrs: { 'aria-label': t('catering.package') },
      });
      catalog().cateringPackages.forEach((pack) => pack.variants.forEach((variant) => {
        const selected = state.packageSelection?.packageId === pack.id
          && state.packageSelection?.tier === variant.tier;
        const card = el('article', { className: `option-card${selected ? ' selected' : ''}` }, [
          el('h3', { text: `${localized(pack.name)} · ${variant.tier}` }),
          el('p', { text: localized(variant.description) }),
          el('strong', {
            className: 'price',
            text: `${formatMoney(variant.pricePerPerson)} / ${t('common.person')} · ${formatMoney(Number(variant.pricePerPerson) * cateringCount())}`,
          }),
        ]);
        const select = button(selected ? t('a11y.selected') : t('common.edit'), {
          className: selected ? 'primary' : 'secondary',
          attrs: { 'aria-pressed': String(selected) },
        });
        select.addEventListener('click', () => {
          state.packageSelection = selected ? null : { packageId: pack.id, tier: variant.tier };
          scheduleDraftSave();
          renderRequest();
        });
        card.appendChild(select);
        packageGrid.appendChild(card);
      }));
      fragment.appendChild(packageGrid);
    }

    if (['ITEMS', 'BOTH'].includes(state.cateringMode)) {
      fragment.appendChild(el('h3', { text: t('catering.items') }));
      const itemList = el('section', {
        className: 'item-list',
        attrs: { 'aria-label': t('catering.items') },
      });
      catalog().cateringItems.filter((item) => item.active !== false).forEach((item) => {
        const quantity = Number(state.quantities[item.id] || 0);
        const row = el('article', { className: 'item-row' }, [
          el('div', {}, [
            el('strong', { text: localized(item.name) }),
            el('small', { text: `${formatMoney(item.price)} / ${localized(item.unit)}` }),
          ]),
        ]);
        const controls = el('div', { className: 'quantity-control' });
        const decrease = button('−', {
          attrs: { 'aria-label': t('a11y.quantityDecrease', { name: localized(item.name) }) },
        });
        decrease.disabled = quantity <= 0;
        decrease.addEventListener('click', () => {
          state.quantities[item.id] = Math.max(0, quantity - 1);
          scheduleDraftSave();
          renderRequest();
        });
        const amount = el('strong', { text: String(quantity), attrs: { 'aria-live': 'polite' } });
        const increase = button('+', {
          attrs: { 'aria-label': t('a11y.quantityIncrease', { name: localized(item.name) }) },
        });
        increase.addEventListener('click', () => {
          state.quantities[item.id] = quantity + 1;
          scheduleDraftSave();
          renderRequest();
        });
        controls.append(decrease, amount, increase);
        row.append(controls, el('strong', { text: formatMoney(quantity * Number(item.price)) }));
        itemList.appendChild(row);
      });
      fragment.appendChild(itemList);
    }

    const dietary = el('textarea', { placeholder: t('catering.dietaryPlaceholder') });
    dietary.value = state.form.dietaryRequirements;
    bindStateInput(dietary, 'dietaryRequirements');
    fragment.appendChild(field({
      id: 'dietaryRequirements',
      label: t('catering.dietary'),
      control: dietary,
      optional: true,
    }));
    return fragment;
  }

  function renderCostStep() {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(sectionHeading(t('cost.heading'), t('cost.desc')));
    const costs = costSummary();
    const summary = el('section', { className: 'cost-summary' });
    [
      [t('cost.room'), costs.roomCost],
      [t('cost.services'), costs.serviceCost],
      [t('cost.catering'), costs.cateringCost],
      [t('cost.total'), costs.total],
    ].forEach(([label, value], index) => summary.append(el('article', { className: index === 3 ? 'total' : '' }, [
      el('span', { text: label }),
      el('strong', { text: formatMoney(value) }),
    ])));
    fragment.append(summary, el('p', { className: 'muted', text: t('cost.help') }));

    const header = el('header', { className: 'allocation-header' }, [
      el('div', {}, [el('h3', { text: t('cost.allocations') }), el('p', { text: t('cost.allocHint') })]),
    ]);
    const add = button(t('cost.add'));
    add.addEventListener('click', () => {
      state.allocations.push({ costCenter: '', percent: 0 });
      scheduleDraftSave();
      renderRequest();
    });
    header.appendChild(add);
    fragment.appendChild(header);

    const allocations = el('section', { id: 'allocations', className: 'allocations' });
    state.allocations.forEach((allocation, index) => {
      const row = el('article', { className: 'allocation-row' });
      const cc = inputControl('text', allocation.costCenter, { placeholder: t('cost.costCenter') });
      cc.id = `allocation-cost-center-${index}`;
      cc.setAttribute('aria-label', t('a11y.costCenter', { index: index + 1 }));
      cc.addEventListener('input', () => {
        state.allocations[index].costCenter = cc.value;
        scheduleDraftSave();
      });
      const pct = inputControl('number', allocation.percent, { min: 0, max: 100, step: 1 });
      pct.id = `allocation-percent-${index}`;
      pct.setAttribute('aria-label', t('a11y.costPercent', { index: index + 1 }));
      pct.addEventListener('input', () => {
        state.allocations[index].percent = Number(pct.value || 0);
        scheduleDraftSave();
      });
      const amount = el('output', {
        text: formatMoney(costs.total * Number(allocation.percent || 0) / 100),
      });
      row.append(cc, pct, amount);
      if (state.allocations.length > 1) {
        const removeButton = button('×', {
          attrs: { 'aria-label': t('a11y.removeCostCenter', { index: index + 1 }) },
        });
        removeButton.addEventListener('click', () => {
          state.allocations.splice(index, 1);
          scheduleDraftSave();
          renderRequest();
        });
        row.appendChild(removeButton);
      }
      allocations.appendChild(row);
    });
    fragment.appendChild(allocations);
    const sum = state.allocations.reduce((total, allocation) => total + Number(allocation.percent || 0), 0);
    fragment.append(
      el('p', {
        className: Math.abs(sum - 100) < 0.01 ? 'validation-ok' : 'validation-bad',
        text: t('cost.sum', { sum: sum.toFixed(0) }),
        attrs: { role: 'status', 'aria-live': 'polite' },
      }),
      el('p', { className: 'muted', text: t('cost.note') }),
    );
    return fragment;
  }

  function reviewCard(title, lines) {
    const card = el('article', { className: 'review-card' }, [el('h3', { text: title })]);
    lines.filter(Boolean).forEach((line) => card.appendChild(el('p', { text: line })));
    return card;
  }

  function renderReviewStep() {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(sectionHeading(t('review.heading'), t('review.desc')));
    const grid = el('section', { className: 'review-grid' });
    const room = currentRoom();
    const pack = selectedPackage();
    const selectedServices = catalog().services.filter((service) => state.serviceIds.includes(service.id));
    const selectedItems = catalog().cateringItems.filter((item) => Number(state.quantities[item.id] || 0) > 0);
    const costs = costSummary();
    grid.append(
      reviewCard(t('review.schedule'), [
        `${state.form.title}`,
        `${formatDate(state.form.date)} · ${state.form.start}–${state.form.end}`,
        `${totalParticipants(state.form)} · ${state.form.location}`,
      ]),
      reviewCard(t('review.room'), [localized(room?.name || ''), localized(room?.equipment || '')]),
      reviewCard(t('review.services'), [
        selectedServices.length
          ? selectedServices.map((service) => localized(service.name)).join(' · ')
          : t('common.none'),
      ]),
      reviewCard(t('review.catering'), [
        pack ? `${localized(pack.pack.name)} · ${pack.variant.tier}` : t('catering.noPackage'),
        selectedItems.length
          ? selectedItems.map((item) => `${state.quantities[item.id]}× ${localized(item.name)}`).join(' · ')
          : t('catering.noItems'),
        state.cateringMode !== 'NONE'
          ? `${cateringCount()} · ${state.form.dietaryRequirements || t('catering.noDietary')}`
          : '',
      ]),
      reviewCard(t('review.costs'), state.allocations.map((allocation) => `${allocation.costCenter} · ${allocation.percent}%`)),
      reviewCard(t('review.total'), [formatMoney(costs.total)]),
    );
    if (state.form.specialRequirements) {
      grid.appendChild(reviewCard(t('review.special'), [state.form.specialRequirements]));
    }
    fragment.appendChild(grid);
    const after = el('section', { className: 'info-box' }, [el('h3', { text: t('review.after') })]);
    const list = el('ol');
    ['review.after1', 'review.after2', 'review.after3', 'review.after4']
      .forEach((key) => list.append(el('li', { text: t(key) })));
    after.appendChild(list);
    fragment.append(
      after,
      el('aside', { className: 'tentative-box', attrs: { role: 'note' } }, [
        el('strong', { text: t('review.provisional') }),
        el('p', { text: t('review.provisionalText') }),
      ]),
    );
    return fragment;
  }

  function submitRequest() {
    const error = validateRequestSubmission({
      state,
      catalog: catalog(),
      requests: requests(),
      today: localTodayIso(),
    });
    if (error) {
      showValidationError(error);
      return;
    }
    const now = new Date().toISOString();
    if (state.editingRequestId) {
      requestRepository.update((list) => list.map((request) => (
        request.id === state.editingRequestId
          ? createResubmittedRequest({
            existing: request,
            state,
            catalog: catalog(),
            localized,
            now,
          })
          : request
      )));
      const request = requests().find((entry) => entry.id === state.editingRequestId);
      if (request) notify('resubmitted', request, { title: request.title });
    } else {
      const id = `CR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const request = createSubmittedRequest({
        state,
        catalog: catalog(),
        localized,
        now,
        id,
      });
      requestRepository.save([request, ...requests()]);
      notify('received', request, { title: request.title });
    }
    remove(KEYS.draft);
    resetEmployeeRequestState(state, catalog());
    showToast(t('notification.received'));
    onNavigate('requests');
  }

  function renderRequests() {
    setPageHeading(t('requests.heading'), t('requests.subtitle'));
    const current = requests().filter((request) => requestMatchesFilter(request, state.requestFilter));
    const tools = el('section', { className: 'toolbar' });
    const filters = el('div', { className: 'segmented', attrs: { 'aria-label': t('manager.filter') } });
    [
      ['ACTIVE', 'common.active'],
      ['PAST', 'common.past'],
      ['ALL', 'common.all'],
    ].forEach(([value, key]) => {
      const control = button(t(key), { attrs: { 'aria-pressed': String(state.requestFilter === value) } });
      control.addEventListener('click', () => {
        state.requestFilter = value;
        renderRequestsViewOnly();
      });
      filters.appendChild(control);
    });
    const displays = el('div', { className: 'segmented' });
    [
      ['LIST', 'requests.list'],
      ['CALENDAR', 'requests.calendar'],
    ].forEach(([value, key]) => {
      const control = button(t(key), { attrs: { 'aria-pressed': String(state.requestDisplay === value) } });
      control.addEventListener('click', () => {
        state.requestDisplay = value;
        renderRequestsViewOnly();
      });
      displays.appendChild(control);
    });
    tools.append(filters, displays);
    appRoot.appendChild(tools);
    if (state.requestDisplay === 'CALENDAR') appRoot.appendChild(renderRequestCalendar(current));
    else appRoot.appendChild(renderRequestList(current));
  }

  function renderRequestsViewOnly() {
    clear(appRoot);
    renderRequests();
  }

  function employeeRequestCard(request) {
    return createRequestCard({
      request,
      catalog: catalog(),
      localized,
      onDetails: openRequestDetails,
      onGuestInfo: openGuestInfo,
      onPrint: printWelcome,
      onEditChange: editChangeRequest,
      onCancel: confirmCancel,
      onRepeat: repeatRequest,
    });
  }

  function renderRequestList(list) {
    const section = el('section', { className: 'request-list' });
    if (!list.length) {
      section.appendChild(el('p', { className: 'info-box', text: t('requests.none') }));
      return section;
    }
    list.forEach((request) => section.appendChild(employeeRequestCard(request)));
    return section;
  }

  function renderRequestCalendar(list) {
    const reference = new Date(`${state.calendarReference}T12:00:00`);
    const year = reference.getFullYear();
    const month = reference.getMonth();
    const first = new Date(year, month, 1, 12);
    const offset = (first.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - offset, 12);
    const wrapper = el('section', { className: 'calendar-shell' });
    const header = el('header', { className: 'calendar-header' });
    const prev = button('‹', { attrs: { 'aria-label': t('common.back') } });
    prev.addEventListener('click', () => {
      const d = new Date(year, month - 1, 1, 12);
      state.calendarReference = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      renderRequestsViewOnly();
    });
    const next = button('›', { attrs: { 'aria-label': t('common.next') } });
    next.addEventListener('click', () => {
      const d = new Date(year, month + 1, 1, 12);
      state.calendarReference = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      renderRequestsViewOnly();
    });
    header.append(
      prev,
      el('h3', {
        text: new Intl.DateTimeFormat(language() === 'en' ? 'en-GB' : 'de-DE', {
          month: 'long',
          year: 'numeric',
        }).format(reference),
      }),
      next,
    );
    wrapper.appendChild(header);
    const table = el('table', { className: 'calendar-table' });
    const thead = el('thead');
    const hr = el('tr');
    const baseMonday = new Date(2026, 0, 5, 12);
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(baseMonday);
      d.setDate(baseMonday.getDate() + i);
      hr.append(el('th', {
        text: new Intl.DateTimeFormat(language() === 'en' ? 'en-GB' : 'de-DE', { weekday: 'short' }).format(d),
      }));
    }
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = el('tbody');
    for (let week = 0; week < 6; week += 1) {
      const row = el('tr');
      for (let day = 0; day < 7; day += 1) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + week * 7 + day);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const cell = el('td', { className: d.getMonth() === month ? '' : 'other-month' }, [
          el('span', { className: 'calendar-day', text: String(d.getDate()) }),
        ]);
        list.filter((request) => request.date === iso).forEach((request) => {
          const event = button(`${request.start} · ${request.title}`, { className: 'calendar-event' });
          event.addEventListener('click', () => openRequestDetails(request));
          cell.appendChild(event);
        });
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  }

  function openRequestDetails(request) {
    const room = catalog().rooms.find((entry) => entry.id === request.roomId);
    const content = el('section', { className: 'details-grid' });
    const add = (label, value) => content.append(el('section', { className: 'detail-card' }, [
      el('h3', { text: label }),
      el('p', { text: value || '—' }),
    ]));
    add(t('review.schedule'), `${formatDate(request.date)} · ${request.start}–${request.end}`);
    add(t('review.room'), localized(room?.name || request.roomId || ''));
    add(t('schedule.total'), String(request.participants || totalParticipants(request)));
    add(
      t('review.services'),
      request.serviceIds?.length
        ? catalog().services
          .filter((service) => request.serviceIds.includes(service.id))
          .map((service) => localized(service.name))
          .join(' · ')
        : t('common.none'),
    );
    add(t('review.special'), request.specialRequirements || t('common.none'));
    add(t('catering.dietary'), request.dietaryRequirements || t('catering.noDietary'));
    add(t('cost.total'), formatMoney(request.estimatedCost || 0));
    if (request.changeReason) add(t('requests.changeReason'), request.changeReason);
    if (request.rejectionReason) add(t('requests.rejectionReason'), request.rejectionReason);
    const close = button(t('common.close'), { className: 'primary' });
    const dialog = openDialog({
      title: `${request.id} · ${request.title}`,
      content,
      actions: [close],
      labelledById: 'requestDetailsTitle',
    });
    close.addEventListener('click', () => dialog.close());
  }

  function confirmCancel(request) {
    const content = el('p', {
      text: `${request.title} · ${formatDate(request.date)} · ${request.start}–${request.end}. ${t('dialog.cancelText')}`,
    });
    const close = button(t('common.back'));
    const confirm = button(t('dialog.cancelConfirm'), { className: 'danger' });
    const dialog = openDialog({
      title: t('dialog.cancelTitle'),
      content,
      actions: [close, confirm],
      labelledById: 'cancelTitle',
    });
    close.addEventListener('click', () => dialog.close());
    confirm.addEventListener('click', () => {
      const now = new Date().toISOString();
      requestRepository.update((list) => list.map((entry) => (
        entry.id === request.id ? createCancelledRequest(entry, now) : entry
      )));
      notify('cancelled', request, { title: request.title });
      dialog.close();
      renderRequestsViewOnly();
    });
  }

  function repeatRequest(request) {
    const copied = applyRepeatToState(state, request, catalog());
    showToast(copied.copiedFromPast ? t('draft.copiedPast') : t('draft.copied'));
    onNavigate('employee');
  }

  function editChangeRequest(request) {
    applyChangeRequestToState(state, request, catalog());
    onNavigate('employee');
  }

  function openGuestInfo(request) {
    const room = catalog().rooms.find((entry) => entry.id === request.roomId);
    const site = context.getSiteInfo()[request.location] || {};
    const content = el('section');
    if (site.mockData) {
      content.appendChild(el('aside', {
        className: 'info-box',
        attrs: { role: 'note' },
        text: t('guest.demo'),
      }));
    }
    const grid = el('section', { className: 'details-grid' });
    const card = (title, values) => {
      const section = el('article', { className: 'detail-card' }, [el('h3', { text: title })]);
      values.filter(Boolean).forEach((value) => section.appendChild(el('p', { text: localized(value) })));
      return section;
    };
    grid.append(
      card(t('guest.scheduleRoom'), [
        formatDate(request.date, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
        `${request.start}–${request.end}`,
        localized(room?.name || request.roomId || ''),
      ]),
      card(t('guest.address'), [site.address || t('guest.askOrganizer'), site.publicTransport, site.carArrival]),
      card(t('guest.parking'), [site.parking, site.reception, site.building, site.visitorNotes]),
      card(t('guest.contact'), [
        site.contact || t('guest.contactDefault'),
        site.contactDetails,
        site.accessibility,
      ]),
    );
    content.appendChild(grid);
    const route = safeHttpsUrl(site.mapsUrl);
    if (route) {
      content.append(el('p', {}, el('a', {
        href: route,
        target: '_blank',
        rel: 'noopener noreferrer',
        text: t('guest.route'),
      })));
    }
    if (site.wifiName && site.wifiPassword) {
      content.append(el('section', { className: 'wifi-box' }, [
        el('h3', { text: t('guest.wifi') }),
        el('p', { text: `${t('guest.network')}: ${site.wifiName}` }),
        el('p', { text: `${t('guest.code')}: ${site.wifiPassword}` }),
        el('p', { text: localized(site.wifiInstructions) }),
      ]));
    }
    const close = button(t('common.close'));
    const print = button(t('guest.print'), { className: 'primary' });
    const dialog = openDialog({
      title: t('guest.welcome', { title: request.title }),
      description: t('guest.subtitle'),
      content,
      actions: [close, print],
      labelledById: 'guestTitle',
    });
    close.addEventListener('click', () => dialog.close());
    print.addEventListener('click', () => printWelcome(request));
  }

  function printWelcome(request) {
    const room = catalog().rooms.find((entry) => entry.id === request.roomId);
    const site = context.getSiteInfo()[request.location] || {};
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) return;
    const doc = printWindow.document;
    doc.documentElement.lang = language();
    doc.title = `${t('requests.pdf')} · ${request.id}`;
    const style = doc.createElement('style');
    style.textContent = 'body{font-family:Arial,sans-serif;margin:40px;color:#111}header{border-bottom:6px solid #7A1F3D;padding-bottom:18px;margin-bottom:24px}h1{font-size:32px}section{margin:22px 0}dl{display:grid;grid-template-columns:180px 1fr;gap:8px}dt{font-weight:700}@media print{button{display:none}}';
    doc.head.appendChild(style);
    const body = doc.body;
    body.append(el('header', {}, [
      el('p', { text: t('app.title') }),
      el('h1', { text: t('guest.welcome', { title: request.title }) }),
      el('p', { text: t('guest.subtitle') }),
    ]));
    const dl = el('dl');
    [
      [t('schedule.date'), formatDate(request.date, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })],
      [t('schedule.start'), `${request.start}–${request.end}`],
      [t('review.room'), localized(room?.name || request.roomId || '')],
      [t('schedule.location'), request.location],
      [t('guest.address'), site.address || t('guest.askOrganizer')],
      [t('guest.contact'), site.contact || t('guest.contactDefault')],
      [t('guest.network'), site.wifiName || '—'],
      [t('guest.code'), site.wifiPassword || '—'],
    ].forEach(([term, value]) => dl.append(el('dt', { text: term }), el('dd', { text: value })));
    body.appendChild(dl);
    const printButton = el('button', { type: 'button', text: t('guest.print') });
    printButton.addEventListener('click', () => printWindow.print());
    body.appendChild(printButton);
    printWindow.focus();
  }

  return {
    renderRequest,
    renderRequests,
    restoreDraft,
    hasDraft() {
      return Boolean(readJson(KEYS.draft, null));
    },
    saveDraft,
  };
}
