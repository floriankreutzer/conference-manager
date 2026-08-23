import { REQUEST_STATUS, localTodayIso, totalParticipants } from '../core/domain.js';
import { language, t } from '../core/i18n.js';
import { KEYS, requestRepository, writeJson } from '../core/storage.js';
import { announce, button, clear, el, field, openDialog, showToast } from '../core/ui.js';
import { inputControl, kpi, sectionHeading } from '../shared/application-presentation.js';
import { notify } from '../shared/notifications.js';
import { createRequestCard } from '../shared/request-card.js';
import { confirmBooking, decideBooking } from './booking-lifecycle.js';

export function createManagerApplication({
  context,
  appRoot,
  setPageHeading,
  onNavigationRefresh,
}) {
  const state = {
    managerTab: 'BOOKINGS',
    managerSearch: '',
    managerStatus: 'ALL',
    managerLocation: 'ALL',
    roomPlanDate: localTodayIso(),
    adminTab: 'ROOMS',
  };

  const catalog = () => context.getCatalog();
  const siteInfo = () => context.getSiteInfo();
  const localized = (value) => context.localized(value);
  const requests = () => context.requests();
  const localizedStatus = (status) => t(`status.${status}`);
  const activeRooms = () => catalog().rooms.filter((room) => room.active !== false);

  function renderManager() {
    setPageHeading(t('manager.heading'), t('manager.adminDesc'));
    const tabs = el('nav', { className: 'manager-tabs', attrs: { 'aria-label': t('manager.heading') } });
    [
      ['BOOKINGS', 'manager.bookings'],
      ['ROOM_PLAN', 'manager.roomPlan'],
      ['REPORTS', 'manager.reports'],
      ['ADMIN', 'manager.admin'],
    ].forEach(([value, key]) => {
      const control = button(t(key), { attrs: { 'aria-pressed': String(state.managerTab === value) } });
      control.addEventListener('click', () => {
        state.managerTab = value;
        renderManagerViewOnly();
      });
      tabs.appendChild(control);
    });
    appRoot.appendChild(tabs);
    if (state.managerTab === 'BOOKINGS') appRoot.appendChild(renderManagerBookings());
    if (state.managerTab === 'ROOM_PLAN') appRoot.appendChild(renderRoomPlan());
    if (state.managerTab === 'REPORTS') appRoot.appendChild(renderReports());
    if (state.managerTab === 'ADMIN') appRoot.appendChild(renderAdmin());
  }

  function renderManagerViewOnly() {
    clear(appRoot);
    renderManager();
  }

  function managerRequestCard(request) {
    return createRequestCard({
      request,
      manager: true,
      catalog: catalog(),
      localized,
      onManagerConfirm: (requestId) => managerAction(requestId, 'confirm'),
      onManagerReason: reasonAction,
    });
  }

  function renderManagerBookings() {
    const section = el('section', { className: 'card' });
    const filters = el('form', { className: 'manager-filters' });
    const search = inputControl('search', state.managerSearch, { placeholder: t('manager.search') });
    search.setAttribute('aria-label', t('manager.search'));
    search.addEventListener('input', () => {
      state.managerSearch = search.value;
      renderManagerViewOnly();
    });

    const status = el('select');
    status.append(el('option', { value: 'ALL', text: t('manager.allStatuses') }));
    Object.values(REQUEST_STATUS).forEach((value) => {
      status.append(el('option', { value, text: localizedStatus(value) }));
    });
    status.value = state.managerStatus;
    status.addEventListener('change', () => {
      state.managerStatus = status.value;
      renderManagerViewOnly();
    });

    const location = el('select');
    location.append(el('option', { value: 'ALL', text: t('manager.allLocations') }));
    [...new Set(activeRooms().map((room) => room.location))].forEach((value) => {
      location.append(el('option', { value, text: value }));
    });
    location.value = state.managerLocation;
    location.addEventListener('change', () => {
      state.managerLocation = location.value;
      renderManagerViewOnly();
    });

    filters.append(search, status, location);
    section.appendChild(filters);
    const list = requests().filter((request) => (
      (state.managerStatus === 'ALL' || request.status === state.managerStatus)
      && (state.managerLocation === 'ALL' || request.location === state.managerLocation)
      && (!state.managerSearch
        || `${request.id} ${request.title}`.toLowerCase().includes(state.managerSearch.toLowerCase()))
    ));
    if (!list.length) {
      section.appendChild(el('p', { className: 'info-box', text: t('manager.noRequests') }));
    } else {
      list.forEach((request) => section.appendChild(managerRequestCard(request)));
    }
    return section;
  }

  function managerAction(requestId, action) {
    const now = new Date().toISOString();
    let changed = null;
    requestRepository.update((list) => list.map((request) => {
      if (request.id !== requestId) return request;
      if (action === 'confirm') {
        changed = confirmBooking(request, now);
        return changed;
      }
      return request;
    }));
    if (changed) notify('confirmed', changed, { title: changed.title });
    renderManagerViewOnly();
  }

  function reasonAction(request, action) {
    const textarea = el('textarea', {
      placeholder: t('dialog.reasonPlaceholder'),
      attrs: { 'aria-label': t('dialog.reason') },
    });
    const close = button(t('common.cancel'));
    const submit = button(action === 'reject' ? t('manager.reject') : t('manager.change'), {
      className: action === 'reject' ? 'danger' : 'primary',
    });
    const content = field({
      id: 'reasonText',
      label: t('dialog.reason'),
      control: textarea,
      required: true,
    });
    const dialog = openDialog({
      title: action === 'reject' ? t('dialog.rejectTitle') : t('dialog.changeTitle'),
      content,
      actions: [close, submit],
      labelledById: 'reasonTitle',
    });
    close.addEventListener('click', () => dialog.close());
    submit.addEventListener('click', () => {
      const reason = textarea.value.trim();
      if (!reason) {
        textarea.setAttribute('aria-invalid', 'true');
        announce(t('dialog.reasonRequired'), { assertive: true });
        textarea.focus();
        return;
      }
      const now = new Date().toISOString();
      let changed = null;
      requestRepository.update((list) => list.map((entry) => {
        if (entry.id !== request.id) return entry;
        changed = decideBooking(entry, action, reason, now);
        return changed;
      }));
      if (changed) notify(action === 'reject' ? 'rejected' : 'change', changed, { title: changed.title });
      dialog.close();
      renderManagerViewOnly();
    });
  }

  function renderRoomPlan() {
    const section = el('section', { className: 'card' }, [
      sectionHeading(t('manager.roomPlan'), t('manager.roomPlanDesc')),
    ]);
    const date = inputControl('date', state.roomPlanDate);
    date.addEventListener('change', () => {
      state.roomPlanDate = date.value;
      renderManagerViewOnly();
    });
    section.appendChild(field({
      id: 'roomPlanDate',
      label: t('manager.referenceDate'),
      control: date,
    }));
    const table = el('table', { className: 'data-table' });
    const head = el('thead', {}, el('tr', {}, [
      el('th', { text: t('review.room') }),
      el('th', { text: t('schedule.start') }),
      el('th', { text: t('schedule.title') }),
      el('th', { text: t('manager.status') }),
    ]));
    const body = el('tbody');
    activeRooms().forEach((room) => {
      const bookings = requests().filter((request) => (
        request.roomId === room.id
        && request.date === state.roomPlanDate
        && ![REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED].includes(request.status)
      ));
      if (!bookings.length) {
        body.append(el('tr', {}, [
          el('td', { text: localized(room.name) }),
          el('td', { text: '—' }),
          el('td', { text: '—' }),
          el('td', { text: t('room.available') }),
        ]));
      } else {
        bookings.forEach((request) => body.append(el('tr', {}, [
          el('td', { text: localized(room.name) }),
          el('td', { text: `${request.start}–${request.end}` }),
          el('td', { text: request.title }),
          el('td', { text: localizedStatus(request.status) }),
        ])));
      }
    });
    table.append(head, body);
    section.appendChild(table);
    return section;
  }

  function renderReports() {
    const section = el('section', { className: 'card' }, [
      sectionHeading(t('manager.reports'), t('manager.reportDesc')),
    ]);
    const all = requests();
    const confirmed = all.filter((request) => request.status === REQUEST_STATUS.CONFIRMED);
    const open = all.filter((request) => [
      REQUEST_STATUS.SUBMITTED,
      REQUEST_STATUS.IN_REVIEW,
      REQUEST_STATUS.CHANGE_REQUESTED,
    ].includes(request.status));
    const catering = confirmed.filter((request) => (
      request.packageSelection
      || Object.values(request.quantities || {}).some((value) => Number(value) > 0)
    ));
    const participants = confirmed.reduce(
      (sum, request) => sum + Number(request.participants || totalParticipants(request)),
      0,
    );
    const grid = el('section', { className: 'dashboard-grid' });
    grid.append(
      kpi(t('manager.confirmedBookings'), confirmed.length),
      kpi(t('manager.openRequests'), open.length),
      kpi(t('manager.cateringBookings'), catering.length),
      kpi(t('manager.totalParticipants'), participants),
    );
    section.appendChild(grid);
    return section;
  }

  function setLocalized(current, value) {
    const base = current && typeof current === 'object'
      ? { ...current }
      : { de: String(current || ''), en: String(current || '') };
    base[language()] = value;
    return base;
  }

  function renderAdmin() {
    const section = el('section', { className: 'card' }, [
      sectionHeading(t('manager.admin'), t('manager.adminDesc')),
    ]);
    const tabs = el('nav', { className: 'segmented' });
    [
      ['ROOMS', 'manager.rooms'],
      ['SERVICES', 'manager.services'],
      ['CATERING', 'manager.catering'],
      ['SITES', 'manager.sites'],
    ].forEach(([value, key]) => {
      const control = button(t(key), { attrs: { 'aria-pressed': String(state.adminTab === value) } });
      control.addEventListener('click', () => {
        state.adminTab = value;
        renderManagerViewOnly();
      });
      tabs.appendChild(control);
    });
    section.appendChild(tabs);
    const editor = el('section', { className: 'admin-editor' });
    if (state.adminTab === 'ROOMS') renderRoomAdmin(editor);
    if (state.adminTab === 'SERVICES') renderServiceAdmin(editor);
    if (state.adminTab === 'CATERING') renderCateringAdmin(editor);
    if (state.adminTab === 'SITES') renderSiteAdmin(editor);
    section.appendChild(editor);
    return section;
  }

  function renderRoomAdmin(root) {
    catalog().rooms.forEach((room) => {
      const card = el('article', { className: 'admin-card' });
      const name = inputControl('text', localized(room.name));
      const capacity = inputControl('number', room.capacity, { min: 1 });
      const price = inputControl('number', room.rate, { min: 0, step: 0.01 });
      const equipment = inputControl('text', localized(room.equipment));
      const active = inputControl('checkbox', '');
      active.checked = room.active !== false;
      card.append(
        field({ id: `room-name-${room.id}`, label: t('manager.name'), control: name }),
        field({ id: `room-cap-${room.id}`, label: t('manager.capacity'), control: capacity }),
        field({ id: `room-price-${room.id}`, label: t('manager.price'), control: price }),
        field({ id: `room-equip-${room.id}`, label: t('manager.equipment'), control: equipment }),
        field({ id: `room-active-${room.id}`, label: t('manager.active'), control: active }),
      );
      const save = button(t('common.save'), { className: 'primary' });
      save.addEventListener('click', () => {
        room.name = setLocalized(room.name, name.value.trim());
        room.capacity = Math.max(1, Number(capacity.value || 1));
        room.rate = Math.max(0, Number(price.value || 0));
        room.equipment = setLocalized(room.equipment, equipment.value.trim());
        room.active = active.checked;
        persistCatalog();
      });
      card.appendChild(save);
      root.appendChild(card);
    });
    const add = button(t('manager.addRoom'));
    add.addEventListener('click', () => {
      catalog().rooms.push({
        id: `ROOM-${Date.now()}`,
        location: 'Berlin',
        name: { de: '', en: '' },
        capacity: 8,
        equipment: { de: '', en: '' },
        floor: { de: '', en: '' },
        rate: 0,
        active: true,
      });
      persistCatalog();
      renderManagerViewOnly();
    });
    root.appendChild(add);
  }

  function renderServiceAdmin(root) {
    catalog().services.forEach((service) => {
      const card = el('article', { className: 'admin-card' });
      const name = inputControl('text', localized(service.name));
      const description = inputControl('text', localized(service.description));
      const price = inputControl('number', service.price, { min: 0, step: 0.01 });
      const active = inputControl('checkbox', '');
      active.checked = service.active !== false;
      card.append(
        field({ id: `service-name-${service.id}`, label: t('manager.name'), control: name }),
        field({ id: `service-desc-${service.id}`, label: t('manager.description'), control: description }),
        field({ id: `service-price-${service.id}`, label: t('manager.price'), control: price }),
        field({ id: `service-active-${service.id}`, label: t('manager.active'), control: active }),
      );
      const save = button(t('common.save'), { className: 'primary' });
      save.addEventListener('click', () => {
        service.name = setLocalized(service.name, name.value.trim());
        service.description = setLocalized(service.description, description.value.trim());
        service.price = Math.max(0, Number(price.value || 0));
        service.active = active.checked;
        persistCatalog();
      });
      card.appendChild(save);
      root.appendChild(card);
    });
    const add = button(t('manager.addService'));
    add.addEventListener('click', () => {
      catalog().services.push({
        id: `SERVICE-${Date.now()}`,
        name: { de: '', en: '' },
        description: { de: '', en: '' },
        price: 0,
        active: true,
      });
      persistCatalog();
      renderManagerViewOnly();
    });
    root.appendChild(add);
  }

  function renderCateringAdmin(root) {
    catalog().cateringItems.forEach((item) => {
      const card = el('article', { className: 'admin-card' });
      const name = inputControl('text', localized(item.name));
      const unit = inputControl('text', localized(item.unit));
      const price = inputControl('number', item.price, { min: 0, step: 0.01 });
      const active = inputControl('checkbox', '');
      active.checked = item.active !== false;
      card.append(
        field({ id: `item-name-${item.id}`, label: t('manager.name'), control: name }),
        field({ id: `item-unit-${item.id}`, label: t('manager.unit'), control: unit }),
        field({ id: `item-price-${item.id}`, label: t('manager.price'), control: price }),
        field({ id: `item-active-${item.id}`, label: t('manager.active'), control: active }),
      );
      const save = button(t('common.save'), { className: 'primary' });
      save.addEventListener('click', () => {
        item.name = setLocalized(item.name, name.value.trim());
        item.unit = setLocalized(item.unit, unit.value.trim());
        item.price = Math.max(0, Number(price.value || 0));
        item.active = active.checked;
        persistCatalog();
      });
      card.appendChild(save);
      root.appendChild(card);
    });
    const add = button(t('manager.addItem'));
    add.addEventListener('click', () => {
      catalog().cateringItems.push({
        id: `ITEM-${Date.now()}`,
        name: { de: '', en: '' },
        unit: { de: '', en: '' },
        price: 0,
        active: true,
      });
      persistCatalog();
      renderManagerViewOnly();
    });
    root.appendChild(add);
  }

  function renderSiteAdmin(root) {
    Object.keys(siteInfo()).sort().forEach((location) => {
      const site = siteInfo()[location];
      const card = el('article', { className: 'admin-card' }, [el('h3', { text: location })]);
      const fields = [
        ['address', 'manager.address'],
        ['publicTransport', 'manager.publicTransport'],
        ['parking', 'manager.parking'],
        ['reception', 'manager.reception'],
        ['accessibility', 'manager.accessibility'],
        ['contact', 'manager.contact'],
      ];
      const controls = {};
      fields.forEach(([key, label]) => {
        const control = inputControl('text', localized(site[key]));
        controls[key] = control;
        card.appendChild(field({ id: `site-${location}-${key}`, label: t(label), control }));
      });
      const save = button(t('common.save'), { className: 'primary' });
      save.addEventListener('click', () => {
        fields.forEach(([key]) => {
          site[key] = key === 'address' || key === 'contact'
            ? controls[key].value.trim()
            : setLocalized(site[key], controls[key].value.trim());
        });
        writeJson(KEYS.siteInfo, siteInfo());
        showToast(t('manager.saved'));
      });
      card.appendChild(save);
      root.appendChild(card);
    });
  }

  function persistCatalog() {
    writeJson(KEYS.catalog, catalog());
    showToast(t('manager.saved'));
    onNavigationRefresh();
  }

  return {
    renderManager,
  };
}
