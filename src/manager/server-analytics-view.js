import { formatNumber, locale, t } from '../core/i18n.js';
import { button, el, field } from '../core/ui.js';
import { pavurelFunctionalIcon } from '../core/pavurel-functional-icon.js';
import { formatProductionDateTime, productionUtcInstant } from '../core/production-time.js';
import { roomPlanPreview } from './room-plan-preview.js';
import { roomPlanProjection, siteLocalIsoDate } from './server-room-plan.js';
import {
  reportSiteOptions,
  roomPlanSiteOptions,
  serverReportModel,
  serverReportRange,
} from './server-cockpit-model.js';
import { authorityFailureCode } from '../shared/authority-failure.js';

function tableSection(title, columns, rows, emptyKey, labelKey = null) {
  const section = el('section', { className: 'report-card',
    attrs: labelKey ? { 'aria-label': t(labelKey) } : {},
  }, [el('h3', { text: title })]);
  if (!rows.length) {
    section.appendChild(el('p', { className: 'muted', text: t(emptyKey) }));
    return section;
  }
  const table = el('table', { className: 'data-table' }, [
    el('caption', { className: 'sr-only', text: title }),
    el('thead', {}, el('tr', {}, columns.map((text) => el('th', { text, attrs: { scope: 'col' } })))),
    el('tbody', {}, rows.map((values) => el('tr', {}, values.map((text, index) => el(index ? 'td' : 'th', {
      text, attrs: index ? {} : { scope: 'row' },
    }))))),
  ]);
  section.appendChild(el('div', {
    className: 'manager-data-scroll', attrs: { role: 'region', tabindex: '0', 'aria-label': title },
  }, [table]));
  return section;
}

function siteControl(sites, state) {
  if (!sites.some((site) => site.id === state.siteId)) state.siteId = sites[0].id;
  const select = el('select');
  sites.forEach((site) => select.appendChild(el('option', { value: site.id, text: site.name })));
  select.value = state.siteId;
  return select;
}

function dateText(value, timeZone) {
  return new Intl.DateTimeFormat(locale(), { timeZone, dateStyle: 'medium' }).format(Date.parse(value));
}

export async function renderManagerReports({
  panel,
  catalog,
  persistence,
  state,
  isCurrent,
  errorMessage,
  onAuthorityFailure,
}) {
  if (typeof onAuthorityFailure !== 'function') {
    throw new TypeError('MANAGER_REPORT_AUTHORITY_HANDLER_REQUIRED');
  }
  const sites = reportSiteOptions(catalog);
  if (!sites.length) {
    panel.appendChild(el('p', { className: 'info-box', text: t('production.employee.timeZoneUnavailable') }));
    return;
  }
  const site = siteControl(sites, state);
  const period = el('select');
  ['DAY', 'MONTH', 'QUARTER', 'YEAR'].forEach((value) => period.appendChild(el('option', {
    value, text: t(`manager.report.${value.toLowerCase()}`),
  })));
  period.value = state.period;
  const initialSite = sites.find((entry) => entry.id === state.siteId);
  const reference = el('input', { type: 'date', value: state.date || siteLocalIsoDate(Date.now(), initialSite.timeZone),
    attrs: { required: 'required', 'aria-describedby': 'managerReportError' } });
  const error = el('p', { id: 'managerReportError', className: 'field-error', attrs: { role: 'alert' } });
  const load = button(t('manager.restore.loadReport'), { type: 'submit', className: 'primary' });
  const reset = button(t('manager.ux.resetFilters'));
  const room = el('select', {}, [el('option', { value: '', text: t('production.manager.reportAllRooms') })]);
  const controls = el('form', { className: 'report-toolbar' }, [
    field({ id: 'managerReportSite', label: t('manager.location'), control: site }),
    field({ id: 'managerReportRoom', label: t('production.employee.room'), control: room }),
    field({ id: 'managerReportPeriod', label: t('manager.report.period'), control: period }),
    field({ id: 'managerReportDate', label: t('manager.referenceDate'), control: reference, required: true }),
    el('div', { className: 'button-row' }, [load, reset]),
  ]);
  const results = el('section', { dataset: { reportContent: 'true' } });
  panel.append(controls, error, results);
  let sequence = 0;
  const refresh = async () => {
    const currentSequence = ++sequence;
    let range;
    state.siteId = site.value;
    state.period = period.value;
    state.date = reference.value;
    const selectedSite = sites.find((entry) => entry.id === state.siteId);
    try { range = serverReportRange(state.period, state.date, selectedSite.timeZone); }
    catch {
      reference.setAttribute('aria-invalid', 'true');
      error.textContent = t('validation.date');
      results.replaceChildren();
      reference.focus();
      return;
    }
    reference.removeAttribute('aria-invalid');
    error.textContent = '';
    results.setAttribute('aria-busy', 'true');
    results.replaceChildren(el('p', { attrs: { role: 'status' }, text: t('production.common.loading') }));
    load.disabled = true;
    room.disabled = true;
    try {
      const report = await persistence.loadRequestReport(range.fromInclusive, range.toExclusive);
      if (!isCurrent() || sequence !== currentSequence || !panel.isConnected) return;
      const model = serverReportModel({ requests: report.requests, catalog, siteId: state.siteId, range, roomId: state.roomId || null });
      const previousRoomName = room.selectedOptions[0]?.textContent;
      const roomOptions = [...model.roomOptions];
      if (state.roomId && !roomOptions.some((entry) => entry.id === state.roomId)) {
        roomOptions.push({ id: state.roomId, name: previousRoomName });
      }
      room.replaceChildren(el('option', { value: '', text: t('production.manager.reportAllRooms') }),
        ...roomOptions.map((entry) => el('option', { value: entry.id, text: entry.name || t('manager.restore.unavailableName') })));
      room.value = state.roomId || '';
      room.disabled = false;
      const number = (value) => value === null ? t('production.manager.reportUnavailable')
        : formatNumber(value, { maximumFractionDigits: 1 });
      const name = (row) => row.name || t('manager.restore.unavailableName');
      const rangeLabel = t('manager.report.range', {
        start: dateText(range.fromInclusive, range.timeZone),
        end: dateText(new Date(Date.parse(range.toExclusive) - 1).toISOString(), range.timeZone),
      });
      const metrics = [
        ['manager.bookings', model.scoped.length, 'calendar'], ['manager.confirmedBookings', model.confirmed.length, 'check'],
        ['production.manager.reportConfirmedParticipants', model.participants, 'participants'], ['production.manager.roomHours', model.hours, 'usage'],
        ['manager.cateringBookings', model.cateringBookings, 'catering'],
      ];
      results.replaceChildren(
        el('p', { text: rangeLabel, attrs: { role: 'status' } }),
        el('p', { className: 'muted', text: t('production.manager.reportScope', { site: selectedSite.name, timeZone: range.timeZone }) }),
        el('p', { className: 'muted', text: t('manager.restore.reportBasis') }),
        el('p', { className: model.detailsComplete ? 'muted' : 'info-box', text: t(!model.detailsComplete
          ? 'production.manager.reportIncompleteRows' : model.scoped.length === 1
            ? 'production.manager.reportCompleteOne' : 'production.manager.reportComplete', { count: number(model.scoped.length) }) }),
        el('section', { className: 'manager-report-metrics', attrs: { 'aria-label': t('production.manager.reportMetrics') } },
          metrics.map(([key, value, icon]) => el('article', { className: 'kpi' }, [
            pavurelFunctionalIcon(icon), el('strong', { text: number(value) }), el('span', { text: t(key) }),
          ]))),
        el('div', { className: 'manager-report-grid' }, [
          tableSection(t('production.manager.utilizationReport'), [t('manager.final.room'), t('manager.bookings'), t('manager.report.hours'), t('manager.totalParticipants')],
            model.roomRows.map((row) => [name(row), number(row.bookings), number(row.hours), number(row.participants)]), 'manager.report.noRoomData'),
          tableSection(t('manager.report.packages'), [t('catering.package'), t('manager.bookings'), t('manager.totalParticipants')],
            model.packageRows.map((row) => [name(row), number(row.bookings), number(row.participants)]),
            model.detailsComplete ? 'manager.report.noPackageData' : 'production.manager.reportDetailsUnavailable', 'production.manager.cateringReport'),
          tableSection(t('production.manager.serviceReport'), [t('manager.services'), t('manager.bookings')],
            model.serviceRows.map((row) => [name(row), number(row.bookings)]), model.detailsComplete ? 'manager.report.noServiceData' : 'production.manager.reportDetailsUnavailable'),
          tableSection(t('manager.report.items'), [t('manager.report.item'), t('manager.report.quantity'), t('manager.bookings')],
            model.itemRows.map((row) => [name(row), number(row.quantity), number(row.bookings)]), model.detailsComplete ? 'manager.report.noItemData' : 'production.manager.reportDetailsUnavailable'),
        ]),
      );
      const insights = el('section', { className: 'report-insight-card' }, [el('h3', { text: t('manager.report.insights') })]);
      if (model.openCount) insights.appendChild(el('p', { text: t(model.openCount === 1 ? 'production.manager.reportOpenOne' : 'manager.report.openAttention', { count: number(model.openCount) }) }));
      for (const [rows, key] of [[model.roomRows, 'manager.report.topRoom'], [model.serviceRows, 'manager.report.topService'], [model.packageRows, 'manager.report.topCatering']]) {
        if (rows.length) insights.appendChild(el('p', { text: t(key, { name: name(rows[0]), count: number(rows[0].bookings) }) }));
      }
      if (!model.confirmed.length) insights.appendChild(el('p', { text: t('manager.report.notEnoughPositive') }));
      results.appendChild(insights);
    } catch (caught) {
      if (authorityFailureCode(caught)) {
        onAuthorityFailure(caught);
        return;
      }
      if (!isCurrent() || sequence !== currentSequence || !panel.isConnected) return;
      results.replaceChildren(el('p', {
        className: 'error-box', attrs: { role: 'alert' }, text: errorMessage(caught),
      }));
    } finally {
      if (isCurrent() && sequence === currentSequence && panel.isConnected) {
        results.removeAttribute('aria-busy');
        load.disabled = false;
      }
    }
  };
  controls.addEventListener('submit', (event) => { event.preventDefault(); void refresh(); });
  [period, reference].forEach((control) => control.addEventListener('change', () => { void refresh(); }));
  site.addEventListener('change', () => { state.roomId = null; void refresh(); });
  room.addEventListener('change', () => { state.roomId = room.value || null; void refresh(); });
  reset.addEventListener('click', () => {
    site.value = sites[0].id; period.value = 'YEAR';
    const resetSite = sites.find((entry) => entry.id === site.value);
    reference.value = siteLocalIsoDate(Date.now(), resetSite.timeZone); state.roomId = null;
    void refresh();
  });
  await refresh();
}

export function renderManagerRoomPlan({ panel, catalog, requests, state, openRequest }) {
  const sites = roomPlanSiteOptions(catalog);
  if (!sites.length) {
    panel.appendChild(el('p', { className: 'info-box', text: t('production.employee.timeZoneUnavailable') }));
    return;
  }
  const site = siteControl(sites, state);
  const initialSite = sites.find((entry) => entry.id === state.siteId);
  const date = el('input', { type: 'date', value: state.date || siteLocalIsoDate(Date.now(), initialSite.timeZone),
    attrs: { required: 'required', 'aria-describedby': 'managerRoomPlanError' } });
  const error = el('p', { id: 'managerRoomPlanError', className: 'field-error', attrs: { role: 'alert', 'aria-live': 'assertive' } });
  const view = el('fieldset', { className: 'room-plan-view' }, [el('legend', { text: t('manager.roomPlan.view') })]);
  const results = el('section', { dataset: { roomPlanBody: 'true' } });
  const preview = roomPlanPreview({ openRequest });
  const windowSelect = el('select', {}, [
    el('option', { value: 'DAY', text: t('production.manager.roomPlan.fullDay') }),
    el('option', { value: 'WORK', text: t('production.manager.roomPlan.workDay') }),
  ]);
  windowSelect.value = state.window === 'WORK' ? 'WORK' : 'DAY';
  const controls = el('form', { className: 'room-plan-toolbar' }, [
    field({ id: 'productionRoomPlanSite', label: t('schedule.location'), control: site }),
    field({ id: 'productionRoomPlanDate', label: t('manager.referenceDate'), control: date, required: true }), view,
    field({ id: 'productionRoomPlanWindow', label: t('production.manager.roomPlan.window'), control: windowSelect }),
  ]);
  controls.addEventListener('submit', (event) => event.preventDefault());
  panel.append(controls, error, preview.node, results);
  const render = () => {
    preview.clear();
    state.window = windowSelect.value;
    windowSelect.disabled = state.view !== 'TIMELINE';
    state.siteId = site.value;
    state.date = date.value;
    const selectedSite = sites.find((entry) => entry.id === site.value);
    let projection;
    try { projection = roomPlanProjection({ catalog, requests, siteId: site.value, date: date.value }); }
    catch (caught) {
      if (caught?.message !== 'ROOM_PLAN_DATE_INVALID') throw caught;
      date.setAttribute('aria-invalid', 'true'); error.textContent = t('validation.date'); results.replaceChildren(); date.focus(); return;
    }
    date.removeAttribute('aria-invalid'); error.textContent = '';
    results.replaceChildren();
    const title = (request) => request.details?.title || t('production.common.requestId', { id: request.id });
    const time = (value) => formatProductionDateTime(value, { locale: locale(), timeZone: selectedSite.timeZone });
    const requestControl = (request, room) => {
      const control = button(title(request), { attrs: { 'aria-label': t('manager.roomPlan.bookingLabel', {
        title: title(request), start: time(request.startsAt), end: time(request.endsAt),
        participants: formatNumber(request.internalParticipants + request.externalParticipants), status: t(`status.${request.status}`),
      }) } });
      preview.bind(control, request, room, selectedSite.timeZone);
      return control;
    };
    if (state.view === 'TIMELINE') {
      const day = serverReportRange('DAY', date.value, selectedSite.timeZone);
      const workingDay = state.window === 'WORK';
      const start = Date.parse(workingDay ? productionUtcInstant(date.value, '08:00', selectedSite.timeZone) : day.fromInclusive);
      const end = Date.parse(workingDay ? productionUtcInstant(date.value, '18:00', selectedSite.timeZone) : day.toExclusive);
      const chart = el('div', { className: 'manager-timeline-chart' });
      const ticks = el('div', { className: 'manager-timeline-ticks', attrs: { 'aria-hidden': 'true' } });
      for (const hour of (workingDay ? [8, 10, 12, 14, 16, 18] : [0, 6, 12, 18, 24])) {
        const value = hour === 24 ? end : Date.parse(productionUtcInstant(date.value, `${String(hour).padStart(2, '0')}:00`, selectedSite.timeZone));
        const tick = el('span', { text: new Intl.DateTimeFormat(locale(), { timeZone: selectedSite.timeZone, timeStyle: 'short' }).format(value) });
        tick.style.setProperty('--timeline-start', `${(value - start) / (end - start) * 100}%`);
        ticks.appendChild(tick);
      }
      chart.appendChild(ticks);
      projection.forEach(({ room, requests: bookings }) => {
        const row = el('section', { className: 'manager-timeline-room' }, [el('h3', { text: room.name })]);
        if (!bookings.length) row.appendChild(el('p', { text: t('room.available') }));
        const visibleBookings = bookings.filter((request) => Date.parse(request.startsAt) < end && Date.parse(request.endsAt) > start);
        if (visibleBookings.length < bookings.length) row.appendChild(el('p', { text: t('production.manager.roomPlan.outsideWindow') }));
        [...visibleBookings].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).forEach((request) => {
          const lane = el('div', { className: 'manager-timeline-lane' });
          const control = requestControl(request, room);
          const from = Math.max(start, Date.parse(request.startsAt));
          const to = Math.min(end, Date.parse(request.endsAt));
          control.style.setProperty('--timeline-start', `${(from - start) / (end - start) * 100}%`);
          control.style.setProperty('--timeline-width', `${(to - from) / (end - start) * 100}%`);
          lane.appendChild(control); row.appendChild(lane);
        });
        chart.appendChild(row);
      });
      results.appendChild(el('div', { className: 'manager-data-scroll', attrs: {
        role: 'region', tabindex: '0', 'aria-label': t('manager.roomPlan.schedule'),
      } }, [chart]));
    } else {
      const table = el('table', { className: 'data-table' }, [
        el('caption', { text: t('manager.roomPlan.schedule') }),
        el('thead', {}, el('tr', {}, ['production.employee.room', 'production.employee.start', 'production.employee.end', 'schedule.title', 'production.common.status'].map((key) => el('th', { text: t(key), attrs: { scope: 'col' } })))),
      ]);
      const body = el('tbody');
      projection.forEach(({ room, requests: bookings }) => {
        if (!bookings.length) body.appendChild(el('tr', {}, [el('th', { text: room.name, attrs: { scope: 'row' } }), el('td', { text: t('room.available'), attrs: { colspan: '4' } })]));
        [...bookings].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).forEach((request) => body.appendChild(el('tr', {}, [
          el('th', { text: room.name, attrs: { scope: 'row' } }), el('td', { text: time(request.startsAt) }),
          el('td', { text: time(request.endsAt) }), el('td', {}, [requestControl(request, room)]), el('td', { text: t(`status.${request.status}`) }),
        ])));
      });
      table.appendChild(body);
      results.appendChild(el('div', { className: 'manager-data-scroll', attrs: { role: 'region', tabindex: '0', 'aria-label': t('manager.roomPlan.schedule') } }, [table]));
    }
    const bookingCount = new Set(projection.flatMap((entry) => entry.requests.map((request) => request.id))).size;
    results.appendChild(el('p', { attrs: { role: 'status' }, text: t(bookingCount === 1
      ? 'manager.restore.planningCountOne' : 'manager.restore.planningCount', {
      count: formatNumber(bookingCount),
    }) }));
  };
  for (const [value, key] of [['LIST', 'requests.list'], ['TIMELINE', 'manager.roomPlan.timeline']]) {
    const radio = el('input', { type: 'radio', name: 'managerRoomPlanView', value, checked: state.view === value });
    radio.addEventListener('change', () => { state.view = value; render(); });
    view.appendChild(el('label', {}, [radio, el('span', { text: t(key) })]));
  }
  site.addEventListener('change', render); date.addEventListener('change', render);
  windowSelect.addEventListener('change', render);
  render();
}
