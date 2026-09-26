import { formatNumber, locale, t } from '../core/i18n.js';
import { button, el, field } from '../core/ui.js';
import { formatProductionDateTime, productionUtcInstant } from '../core/production-time.js';
import { roomPlanProjection, siteLocalIsoDate } from './server-room-plan.js';
import {
  reportSiteOptions,
  roomPlanSiteOptions,
  serverReportModel,
  serverReportRange,
} from './server-cockpit-model.js';
import { authorityFailureCode } from '../shared/authority-failure.js';

function tableSection(title, columns, rows, emptyKey) {
  const section = el('section', { className: 'report-card' }, [el('h3', { text: title })]);
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
  const load = button(t('manager.restore.loadReport'), { type: 'submit' });
  const controls = el('form', { className: 'report-toolbar' }, [
    field({ id: 'managerReportSite', label: t('manager.location'), control: site }),
    field({ id: 'managerReportPeriod', label: t('manager.report.period'), control: period }),
    field({ id: 'managerReportDate', label: t('manager.referenceDate'), control: reference, required: true }),
    load,
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
    try {
      const report = await persistence.loadRequestReport(range.fromInclusive, range.toExclusive);
      if (!isCurrent() || sequence !== currentSequence || !panel.isConnected) return;
      const model = serverReportModel({ requests: report.requests, catalog, siteId: state.siteId, range });
      const number = (value) => formatNumber(value, { maximumFractionDigits: 1 });
      const name = (row) => row.name || t('manager.restore.unavailableName');
      const rangeLabel = t('manager.report.range', {
        start: dateText(range.fromInclusive, range.timeZone),
        end: dateText(new Date(Date.parse(range.toExclusive) - 1).toISOString(), range.timeZone),
      });
      const metrics = [
        ['manager.bookings', model.scoped.length], ['manager.confirmedBookings', model.confirmed.length],
        ['manager.totalParticipants', model.participants], ['production.manager.roomHours', model.hours],
        ['manager.cateringBookings', model.cateringBookings],
      ];
      results.replaceChildren(
        el('p', { text: rangeLabel, attrs: { role: 'status' } }),
        el('p', { className: 'muted', text: t('manager.restore.reportBasis') }),
        el('section', { className: 'dashboard-grid' }, metrics.map(([key, value]) => el('article', { className: 'kpi' }, [
          el('strong', { text: number(value) }), el('span', { text: t(key) }),
        ]))),
        tableSection(t('production.manager.utilizationReport'), [t('manager.final.room'), t('manager.bookings'), t('manager.report.hours'), t('manager.totalParticipants')],
          model.roomRows.map((row) => [name(row), number(row.bookings), number(row.hours), number(row.participants)]), 'manager.report.noRoomData'),
        tableSection(t('production.manager.serviceReport'), [t('manager.services'), t('manager.bookings')],
          model.serviceRows.map((row) => [name(row), number(row.bookings)]), 'manager.report.noServiceData'),
        el('h3', { text: t('production.manager.cateringReport') }),
        tableSection(t('manager.report.packages'), [t('catering.package'), t('manager.bookings'), t('manager.totalParticipants')],
          model.packageRows.map((row) => [name(row), number(row.bookings), number(row.participants)]), 'manager.report.noPackageData'),
        tableSection(t('manager.report.items'), [t('manager.report.item'), t('manager.report.quantity'), t('manager.bookings')],
          model.itemRows.map((row) => [name(row), number(row.quantity), number(row.bookings)]), 'manager.report.noItemData'),
      );
      const insights = el('section', { className: 'report-insight-card' }, [el('h3', { text: t('manager.report.insights') })]);
      if (model.openCount) insights.appendChild(el('p', { text: t('manager.report.openAttention', { count: number(model.openCount) }) }));
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
  [site, period, reference].forEach((control) => control.addEventListener('change', () => { void refresh(); }));
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
  const controls = el('form', { className: 'room-plan-toolbar' }, [
    field({ id: 'productionRoomPlanSite', label: t('schedule.location'), control: site }),
    field({ id: 'productionRoomPlanDate', label: t('manager.referenceDate'), control: date, required: true }), view,
  ]);
  controls.addEventListener('submit', (event) => event.preventDefault());
  panel.append(controls, error, results);
  const render = () => {
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
    const requestControl = (request) => {
      const control = button(title(request), { attrs: { 'aria-label': t('manager.roomPlan.bookingLabel', {
        title: title(request), start: time(request.startsAt), end: time(request.endsAt),
        participants: formatNumber(request.internalParticipants + request.externalParticipants), status: t(`status.${request.status}`),
      }) } });
      control.addEventListener('click', () => openRequest(request.id));
      return control;
    };
    if (state.view === 'TIMELINE') {
      const day = serverReportRange('DAY', date.value, selectedSite.timeZone);
      const start = Date.parse(day.fromInclusive);
      const end = Date.parse(day.toExclusive);
      const chart = el('div', { className: 'manager-timeline-chart' });
      const ticks = el('div', { className: 'manager-timeline-ticks', attrs: { 'aria-hidden': 'true' } });
      for (const hour of [0, 6, 12, 18, 24]) {
        const value = hour === 24 ? end : Date.parse(productionUtcInstant(date.value, `${String(hour).padStart(2, '0')}:00`, selectedSite.timeZone));
        const tick = el('span', { text: new Intl.DateTimeFormat(locale(), { timeZone: selectedSite.timeZone, timeStyle: 'short' }).format(value) });
        tick.style.setProperty('--timeline-start', `${(value - start) / (end - start) * 100}%`);
        ticks.appendChild(tick);
      }
      chart.appendChild(ticks);
      projection.forEach(({ room, requests: bookings }) => {
        const row = el('section', { className: 'manager-timeline-room' }, [el('h3', { text: room.name })]);
        if (!bookings.length) row.appendChild(el('p', { text: t('room.available') }));
        [...bookings].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).forEach((request) => {
          const lane = el('div', { className: 'manager-timeline-lane' });
          const control = requestControl(request);
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
          el('td', { text: time(request.endsAt) }), el('td', {}, [requestControl(request)]), el('td', { text: t(`status.${request.status}`) }),
        ])));
      });
      table.appendChild(body);
      results.appendChild(el('div', { className: 'manager-data-scroll', attrs: { role: 'region', tabindex: '0', 'aria-label': t('manager.roomPlan.schedule') } }, [table]));
    }
    results.appendChild(el('p', { attrs: { role: 'status' }, text: t('manager.restore.planningCount', {
      count: formatNumber(new Set(projection.flatMap((entry) => entry.requests.map((request) => request.id))).size),
    }) }));
  };
  for (const [value, key] of [['LIST', 'requests.list'], ['TIMELINE', 'manager.roomPlan.timeline']]) {
    const radio = el('input', { type: 'radio', name: 'managerRoomPlanView', value, checked: state.view === value });
    radio.addEventListener('change', () => { state.view = value; render(); });
    view.appendChild(el('label', {}, [radio, el('span', { text: t(key) })]));
  }
  site.addEventListener('change', render); date.addEventListener('change', render);
  render();
}
