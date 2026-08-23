import { localTodayIso } from '../core/domain.js';
import { formatDate, t } from '../core/i18n.js';
import { button, clear, el, field, openDialog } from '../core/ui.js';
import { enhanceAdmin } from './admin-parity.js';
import { pt } from './parity-i18n.js';
import {
  buildReportModel,
  managerOverview,
  reportRange,
  totalParticipantsForRequest,
} from './reporting.js';
import { catalogData, localized, requestData } from './parity-data.js';
import { currentManagerTab } from './manager-tabs.js';
import { timelinePosition } from './timeline-position.js';

const state = {
  quickFilter: 'UPCOMING',
  reportPeriod: 'MONTH',
  reportReferenceDate: localTodayIso(),
  roomPlanDate: localTodayIso(),
  roomPlanLocation: 'ALL',
  roomPlanView: 'TIMELINE',
};

function managerKpi(label, value, filter) {
  const control = button('', {
    className: 'manager-parity-kpi',
    attrs: { 'aria-label': `${label}: ${value}` },
    dataset: { overviewFilter: filter },
  });
  control.append(el('span', { text: label }), el('strong', { text: String(value) }));
  return control;
}

function sortedUpcoming(list) {
  return [...list].sort((left, right) => `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`));
}

function managerOverviewRow(request, catalog) {
  const room = (catalog.rooms || []).find((entry) => entry.id === request.roomId);
  const row = el('article', { className: 'manager-overview-row' });
  row.append(el('div', {}, [
    el('strong', { text: request.title }),
    el('small', { text: `${formatDate(request.date)} · ${request.start}–${request.end} · ${localized(room?.name || request.roomId || '')} · ${t(`status.${request.status}`)}` }),
  ]));
  row.appendChild(button(pt('parity.manager.open'), { dataset: { managerOpen: request.id } }));
  return row;
}

function applyQuickFilter(section) {
  const allRequests = requestData();
  const map = new Map(allRequests.map((request) => [request.id, request]));
  const today = localTodayIso();
  const overview = managerOverview(allRequests, today);
  const cards = [...section.querySelectorAll('.request-card[data-request-id]')];
  let shown = 0;

  cards.forEach((card) => {
    const request = map.get(card.dataset.requestId);
    if (!request) return;
    let visible = true;
    switch (state.quickFilter) {
      case 'ACTION': visible = ['Submitted', 'In Review'].includes(request.status); break;
      case 'TODAY': visible = request.date === today && !['Rejected', 'Cancelled'].includes(request.status); break;
      case '7D': visible = request.date >= today && request.date <= overview.endIso && !['Rejected', 'Cancelled'].includes(request.status); break;
      case 'TENTATIVE': visible = ['Tentative', 'Provisional'].includes(request.calendarStatus) && !['Rejected', 'Cancelled'].includes(request.status); break;
      case 'UPCOMING': visible = request.date >= today && !['Rejected', 'Cancelled'].includes(request.status); break;
      case 'ALL': default: visible = true; break;
    }
    card.classList.toggle('feature-filter-hidden', !visible);
    if (visible) shown += 1;
  });

  section.querySelectorAll('[data-quick-filter]').forEach((control) => control.setAttribute('aria-pressed', String(control.dataset.quickFilter === state.quickFilter)));
  const count = section.querySelector('[data-feature-filter-count]');
  if (count) count.textContent = pt('parity.manager.displayed', { shown, total: cards.length });
}

function enhanceManagerBookings(section) {
  if (section.querySelector('[data-feature-manager-overview]')) {
    applyQuickFilter(section);
    return;
  }
  const allRequests = requestData();
  const catalog = catalogData();
  const overview = managerOverview(allRequests, localTodayIso());
  const actionItems = sortedUpcoming(overview.action).slice(0, 4);
  const upcomingItems = sortedUpcoming(overview.nextSevenDays).slice(0, 4);
  const container = el('section', { className: 'manager-parity-overview', dataset: { featureManagerOverview: 'true' } });
  const kpis = el('section', { className: 'manager-parity-kpis' });
  kpis.append(
    managerKpi(pt('parity.manager.action'), overview.action.length, 'ACTION'),
    managerKpi(pt('parity.manager.today'), overview.today.length, 'TODAY'),
    managerKpi(pt('parity.manager.next7'), overview.nextSevenDays.length, '7D'),
    managerKpi(pt('parity.manager.tentative'), overview.tentative.length, 'TENTATIVE'),
  );

  const columns = el('section', { className: 'manager-overview-columns' });
  const actionCard = el('section', { className: 'manager-overview-card' }, [el('h3', { text: pt('parity.manager.workNow') })]);
  if (actionItems.length) actionItems.forEach((request) => actionCard.appendChild(managerOverviewRow(request, catalog)));
  else actionCard.appendChild(el('p', { className: 'muted', text: pt('parity.manager.noAction') }));
  const upcomingCard = el('section', { className: 'manager-overview-card' }, [el('h3', { text: pt('parity.manager.upcoming') })]);
  if (upcomingItems.length) upcomingItems.forEach((request) => upcomingCard.appendChild(managerOverviewRow(request, catalog)));
  else upcomingCard.appendChild(el('p', { className: 'muted', text: pt('parity.manager.noUpcoming') }));
  columns.append(actionCard, upcomingCard);

  const quick = el('nav', { className: 'manager-quick-filters', attrs: { 'aria-label': pt('parity.manager.quickFilters') } });
  [
    ['ACTION', pt('parity.manager.action')], ['TODAY', pt('parity.manager.today')], ['7D', pt('parity.manager.next7')],
    ['UPCOMING', pt('parity.manager.upcomingFilter')], ['ALL', pt('parity.manager.all')],
  ].forEach(([value, label]) => {
    const control = button(label, { dataset: { quickFilter: value }, attrs: { 'aria-pressed': String(state.quickFilter === value) } });
    control.addEventListener('click', () => { state.quickFilter = value; applyQuickFilter(section); });
    quick.appendChild(control);
  });
  const count = el('p', { className: 'muted manager-filter-count', dataset: { featureFilterCount: 'true' }, attrs: { role: 'status', 'aria-live': 'polite' } });
  container.append(kpis, columns, quick, count);
  const filters = section.querySelector('.manager-filters');
  section.insertBefore(container, filters || section.firstChild);

  container.addEventListener('click', (event) => {
    const overviewFilter = event.target.closest('[data-overview-filter]');
    if (overviewFilter) { state.quickFilter = overviewFilter.dataset.overviewFilter; applyQuickFilter(section); return; }
    const open = event.target.closest('[data-manager-open]');
    if (!open) return;
    state.quickFilter = 'ALL';
    const search = section.querySelector('input[type="search"]');
    if (!search) return;
    search.value = open.dataset.managerOpen;
    search.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => {
      const card = document.querySelector(`.request-card[data-request-id="${CSS.escape(open.dataset.managerOpen)}"]`);
      card?.scrollIntoView({ block: 'center' });
      card?.setAttribute('tabindex', '-1');
      card?.focus();
    }, 0);
  });
  applyQuickFilter(section);
}

function roomPlanBookings(catalog, requests) {
  return requests.filter((request) => request.date === state.roomPlanDate && !['Rejected', 'Cancelled'].includes(request.status) && (state.roomPlanLocation === 'ALL' || request.location === state.roomPlanLocation))
    .sort((left, right) => String(left.start).localeCompare(String(right.start)))
    .map((request) => ({ ...request, room: (catalog.rooms || []).find((room) => room.id === request.roomId) }));
}

function openRequestSummary(request, room) {
  const content = el('dl', { className: 'details-list' });
  [
    [pt('parity.roomPlan.event'), request.title], [pt('parity.roomPlan.time'), `${formatDate(request.date)} · ${request.start}–${request.end}`],
    [pt('parity.roomPlan.room'), localized(room?.name || request.roomId || '')], [pt('parity.roomPlan.participants'), String(totalParticipantsForRequest(request))],
    [pt('parity.roomPlan.status'), t(`status.${request.status}`)],
  ].forEach(([label, value]) => content.append(el('dt', { text: label }), el('dd', { text: value })));
  const close = button(t('common.close'), { className: 'primary' });
  const dialog = openDialog({ title: `${request.id} · ${request.title}`, content, actions: [close], labelledById: 'roomPlanBookingTitle' });
  close.addEventListener('click', () => dialog.close());
}

function createRoomPlanTable(bookings) {
  if (!bookings.length) return el('p', { className: 'info-box', text: pt('parity.roomPlan.noBookings') });
  const table = el('table', { className: 'data-table room-plan-list' });
  const head = el('thead');
  head.append(el('tr', {}, [
    el('th', { text: pt('parity.roomPlan.time') }), el('th', { text: pt('parity.roomPlan.room') }), el('th', { text: pt('parity.roomPlan.event') }),
    el('th', { text: pt('parity.roomPlan.participants') }), el('th', { text: pt('parity.roomPlan.status') }),
  ]));
  const body = el('tbody');
  bookings.forEach((request) => body.append(el('tr', {}, [
    el('td', { text: `${request.start}–${request.end}` }), el('td', { text: localized(request.room?.name || request.roomId || '') }),
    el('td', { text: request.title }), el('td', { text: String(totalParticipantsForRequest(request)) }), el('td', { text: t(`status.${request.status}`) }),
  ])));
  table.append(head, body);
  return table;
}

function createRoomTimeline(catalog, bookings) {
  const wrapper = el('section', { className: 'room-timeline', attrs: { 'aria-label': pt('parity.roomPlan.schedule') } });
  const scale = el('div', { className: 'room-time-scale', attrs: { 'aria-hidden': 'true' } });
  [6, 10, 14, 18, 22].forEach((hour) => scale.appendChild(el('span', { text: `${String(hour).padStart(2, '0')}:00` })));
  wrapper.appendChild(scale);
  const rooms = (catalog.rooms || []).filter((room) => room.active !== false).filter((room) => state.roomPlanLocation === 'ALL' || room.location === state.roomPlanLocation);
  rooms.forEach((room) => {
    const row = el('section', { className: 'room-timeline-row' });
    row.appendChild(el('strong', { className: 'room-timeline-label', text: localized(room.name) }));
    const track = el('div', { className: 'room-timeline-track' });
    const roomBookings = bookings.filter((request) => request.roomId === room.id);
    if (!roomBookings.length) track.appendChild(el('span', { className: 'room-timeline-free', text: pt('parity.roomPlan.free') }));
    else roomBookings.forEach((request) => {
      const position = timelinePosition(request.start, request.end);
      const event = button(request.title, {
        className: `room-timeline-booking ${position.startClass} ${position.widthClass}`,
        dataset: {
          requestId: request.id,
          timelineStart: position.startPercent,
          timelineWidth: position.widthPercent,
        },
        attrs: {
          'aria-label': pt('parity.roomPlan.bookingLabel', {
            title: request.title,
            start: request.start,
            end: request.end,
            participants: totalParticipantsForRequest(request),
            status: t(`status.${request.status}`),
          }),
        },
      });
      event.addEventListener('click', () => openRequestSummary(request, room));
      track.appendChild(event);
    });
    row.appendChild(track);
    wrapper.appendChild(row);
  });
  return wrapper;
}

function renderRoomPlanBody(section) {
  const body = section.querySelector('[data-room-plan-body]');
  if (!body) return;
  clear(body);
  const catalog = catalogData();
  const bookings = roomPlanBookings(catalog, requestData());
  body.appendChild(state.roomPlanView === 'LIST' ? createRoomPlanTable(bookings) : createRoomTimeline(catalog, bookings));
  section.querySelectorAll('[data-room-plan-view]').forEach((control) => control.setAttribute('aria-pressed', String(control.dataset.roomPlanView === state.roomPlanView)));
}

function enhanceRoomPlan(section) {
  if (section.dataset.featureParity === 'room-plan') return;
  section.dataset.featureParity = 'room-plan';
  clear(section);
  section.appendChild(el('header', { className: 'section-heading' }, [el('div', {}, [el('h2', { text: t('manager.roomPlan') }), el('p', { text: t('manager.roomPlanDesc') })])]));
  const toolbar = el('section', { className: 'room-plan-toolbar' });
  const date = el('input', { type: 'date', value: state.roomPlanDate });
  date.addEventListener('change', () => { state.roomPlanDate = date.value || localTodayIso(); renderRoomPlanBody(section); });
  toolbar.appendChild(field({ id: 'roomPlanDate', label: pt('parity.roomPlan.date'), control: date }));
  const location = el('select');
  location.appendChild(el('option', { value: 'ALL', text: pt('parity.roomPlan.allLocations') }));
  [...new Set((catalogData().rooms || []).map((room) => room.location).filter(Boolean))].sort().forEach((value) => location.appendChild(el('option', { value, text: value })));
  location.value = state.roomPlanLocation;
  location.addEventListener('change', () => { state.roomPlanLocation = location.value; renderRoomPlanBody(section); });
  toolbar.appendChild(field({ id: 'roomPlanLocation', label: pt('parity.roomPlan.location'), control: location }));
  const view = el('fieldset', { className: 'room-plan-view' });
  view.appendChild(el('legend', { text: pt('parity.roomPlan.view') }));
  [['TIMELINE', pt('parity.roomPlan.timeline')], ['LIST', pt('parity.roomPlan.list')]].forEach(([value, label]) => {
    const control = button(label, { dataset: { roomPlanView: value }, attrs: { 'aria-pressed': String(state.roomPlanView === value) } });
    control.addEventListener('click', () => { state.roomPlanView = value; renderRoomPlanBody(section); });
    view.appendChild(control);
  });
  toolbar.appendChild(view);
  section.append(toolbar, el('section', { dataset: { roomPlanBody: 'true' } }));
  renderRoomPlanBody(section);
}

function tableOrEmpty({ rows, columns, emptyKey, rowFactory, className = '' }) {
  if (!rows.length) return el('p', { className: 'muted', text: pt(emptyKey) });
  const table = el('table', { className: `data-table ${className}`.trim() });
  const head = el('thead');
  head.append(el('tr', {}, columns.map((column) => el('th', { text: column }))));
  const body = el('tbody');
  rows.forEach((row) => body.appendChild(rowFactory(row)));
  table.append(head, body);
  return table;
}

function reportInsights(model, catalog) {
  const positive = [];
  const attention = [];
  const { kpis } = model;
  const topRoom = model.roomRows.find((room) => room.bookings > 0);
  const topService = model.serviceRows.find((service) => service.bookings > 0);
  const topPackage = model.packageRows[0];
  if (kpis.confirmationRate >= 80 && (model.confirmed.length + model.negative.length)) positive.push(pt('parity.report.goodConfirmation', { value: kpis.confirmationRate.toFixed(0) }));
  if (kpis.negativeRate <= 10 && model.scoped.length) positive.push(pt('parity.report.goodNegativeRate', { value: kpis.negativeRate.toFixed(0) }));
  if (topRoom) positive.push(pt('parity.report.topRoom', { name: localized(topRoom.name), count: topRoom.bookings }));
  if (topService) positive.push(pt('parity.report.topService', { name: localized(topService.name), count: topService.bookings }));
  if (topPackage) {
    const pack = (catalog.cateringPackages || []).find((entry) => entry.id === topPackage.packageId);
    positive.push(pt('parity.report.topCatering', { name: `${localized(pack?.name || topPackage.name)} · ${topPackage.tier}`, count: topPackage.bookings }));
  }
  if (model.open.length > Math.max(2, model.scoped.length * 0.2)) attention.push(pt('parity.report.openAttention', { count: model.open.length }));
  if (kpis.negativeRate > 15) attention.push(pt('parity.report.negativeAttention', { value: kpis.negativeRate.toFixed(0) }));
  if (kpis.utilization < 10 && model.confirmed.length) attention.push(pt('parity.report.utilizationAttention', { value: kpis.utilization.toFixed(1) }));
  if (model.unusedRooms.length) attention.push(pt('parity.report.unusedRooms', { count: model.unusedRooms.length }));
  if (model.unusedServices.length) attention.push(pt('parity.report.unusedServices', { count: model.unusedServices.length }));
  if (!positive.length) positive.push(pt('parity.report.notEnoughPositive'));
  if (!attention.length) attention.push(pt('parity.report.noNegativePattern'));
  const wrapper = el('section', { className: 'report-insights' });
  [[pt('parity.report.positive'), positive, 'good'], [pt('parity.report.attention'), attention, 'attention']].forEach(([heading, values, className]) => {
    const card = el('article', { className: `report-insight-card ${className}` }, [el('h3', { text: heading })]);
    const list = el('ul');
    values.forEach((value) => list.appendChild(el('li', { text: value })));
    card.appendChild(list);
    wrapper.appendChild(card);
  });
  return wrapper;
}

function renderReportContent(section) {
  const root = section.querySelector('[data-report-content]');
  if (!root) return;
  clear(root);
  const catalog = catalogData();
  const range = reportRange(state.reportPeriod, state.reportReferenceDate);
  const model = buildReportModel({ requests: requestData(), catalog, range });
  const rangeLabel = section.querySelector('[data-report-range]');
  if (rangeLabel) rangeLabel.textContent = pt('parity.report.range', { start: formatDate(range.start), end: formatDate(range.end) });
  const kpis = el('section', { className: 'report-kpis dashboard-grid' });
  [
    [pt('parity.report.confirmed'), model.kpis.confirmedBookings], [pt('parity.report.participants'), model.kpis.participants],
    [pt('parity.report.confirmationRate'), `${model.kpis.confirmationRate.toFixed(0)} %`], [pt('parity.report.open'), model.kpis.openRequests],
    [pt('parity.report.utilization'), `${model.kpis.utilization.toFixed(1)} %`],
  ].forEach(([label, value]) => kpis.appendChild(el('article', { className: 'report-kpi' }, [el('small', { text: label }), el('strong', { text: String(value) })])));

  const grids = el('section', { className: 'report-grid' });
  const roomCard = el('article', { className: 'report-card' }, [el('h3', { text: pt('parity.report.rooms') })]);
  roomCard.appendChild(tableOrEmpty({ rows: model.roomRows.filter((room) => room.bookings > 0), columns: [pt('parity.roomPlan.room'), pt('parity.report.roomBookings'), pt('parity.report.hours'), pt('parity.report.participants')], emptyKey: 'parity.report.noRoomData', rowFactory: (room) => el('tr', {}, [el('td', {}, [el('strong', { text: localized(room.name) })]), el('td', { text: String(room.bookings) }), el('td', { text: room.hours.toFixed(1) }), el('td', { text: String(room.participants) })]) }));
  roomCard.appendChild(el('p', { className: 'muted report-caption', text: pt('parity.report.utilizationHint') }));
  const serviceCard = el('article', { className: 'report-card' }, [el('h3', { text: pt('parity.report.services') })]);
  serviceCard.appendChild(tableOrEmpty({ rows: model.serviceRows.filter((service) => service.bookings > 0), columns: [t('manager.services'), pt('parity.report.roomBookings')], emptyKey: 'parity.report.noServiceData', rowFactory: (service) => el('tr', {}, [el('td', { text: localized(service.name) }), el('td', { text: String(service.bookings) })]) }));
  grids.append(roomCard, serviceCard);

  const cateringSummary = el('section', { className: 'report-catering-summary', attrs: { 'aria-label': pt('parity.report.cateringSummary') } });
  [[pt('parity.report.cateringBookings'), model.kpis.cateringBookings], [pt('parity.report.cateringRate'), `${model.kpis.cateringRate.toFixed(0)} %`], [pt('parity.report.cateringParticipants'), model.kpis.cateringParticipants]].forEach(([label, value]) => cateringSummary.appendChild(el('article', {}, [el('small', { text: label }), el('strong', { text: String(value) })])));
  const cateringGrid = el('section', { className: 'report-grid' });
  const packageCard = el('article', { className: 'report-card' }, [el('h3', { text: pt('parity.report.packages') })]);
  packageCard.appendChild(tableOrEmpty({ rows: model.packageRows, columns: [pt('parity.report.package'), pt('parity.report.roomBookings'), pt('parity.report.participants')], emptyKey: 'parity.report.noPackageData', rowFactory: (entry) => {
    const pack = (catalog.cateringPackages || []).find((item) => item.id === entry.packageId);
    return el('tr', {}, [el('td', { text: `${localized(pack?.name || entry.name)} · ${entry.tier}` }), el('td', { text: String(entry.bookings) }), el('td', { text: String(entry.participants) })]);
  } }));
  const itemCard = el('article', { className: 'report-card' }, [el('h3', { text: pt('parity.report.items') })]);
  itemCard.appendChild(tableOrEmpty({ rows: model.itemRows, columns: [pt('parity.report.item'), pt('parity.report.roomBookings'), pt('parity.report.quantity')], emptyKey: 'parity.report.noItemData', rowFactory: (entry) => el('tr', {}, [el('td', { text: localized(entry.name) }), el('td', { text: String(entry.bookings) }), el('td', { text: `${entry.quantity} ${localized(entry.unit)}`.trim() })]) }));
  cateringGrid.append(packageCard, itemCard);
  root.append(kpis, grids, cateringSummary, cateringGrid, reportInsights(model, catalog));
}

function enhanceReports(section) {
  if (section.dataset.featureParity === 'reports') return;
  section.dataset.featureParity = 'reports';
  clear(section);
  section.appendChild(el('header', { className: 'section-heading' }, [el('div', {}, [el('h2', { text: t('manager.reports') }), el('p', { text: t('manager.reportDesc') })])]));
  const toolbar = el('section', { className: 'report-toolbar' });
  const period = el('select');
  [['DAY', pt('parity.report.day')], ['MONTH', pt('parity.report.month')], ['QUARTER', pt('parity.report.quarter')], ['YEAR', pt('parity.report.year')]].forEach(([value, label]) => period.appendChild(el('option', { value, text: label })));
  period.value = state.reportPeriod;
  period.addEventListener('change', () => { state.reportPeriod = period.value; renderReportContent(section); });
  toolbar.appendChild(field({ id: 'reportPeriod', label: pt('parity.report.period'), control: period }));
  const reference = el('input', { type: 'date', value: state.reportReferenceDate });
  reference.addEventListener('change', () => { state.reportReferenceDate = reference.value || localTodayIso(); renderReportContent(section); });
  toolbar.appendChild(field({ id: 'reportReferenceDate', label: pt('parity.report.referenceDate'), control: reference }));
  toolbar.appendChild(el('p', { className: 'report-range', dataset: { reportRange: 'true' }, attrs: { role: 'status', 'aria-live': 'polite' } }));
  section.append(toolbar, el('section', { dataset: { reportContent: 'true' } }));
  renderReportContent(section);
}

export function enhanceManager() {
  const tab = currentManagerTab();
  const tabs = document.querySelector('.manager-tabs');
  const section = tabs?.nextElementSibling;
  if (!(section instanceof HTMLElement)) return;
  if (tab === 'BOOKINGS') enhanceManagerBookings(section);
  if (tab === 'ROOM_PLAN') enhanceRoomPlan(section);
  if (tab === 'REPORTS') enhanceReports(section);
  if (tab === 'ADMIN') enhanceAdmin(section);
}
