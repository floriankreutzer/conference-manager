import { locale, t } from '../core/i18n.js';
import { isProductionTimeZone } from '../core/production-time.js';
import { button, el } from '../core/ui.js';
import { productionRequestRoomTimeZone } from '../shared/request-room-context-loader.js';

const MONTH_REFERENCE_PATTERN = /^(\d{4})-(\d{2})-01$/;

function calendarWallTime(value, timeZone) {
  if (!isProductionTimeZone(timeZone)) return null;
  const timestamp = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return null;
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(timestamp)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value: partValue }) => [type, partValue]));
    return Object.freeze({
      date: `${parts.year}-${parts.month}-${parts.day}`,
      time: `${parts.hour}:${parts.minute}`,
      timestamp,
      timeZone,
    });
  } catch {
    return null;
  }
}

export function projectServerRequestCalendar(requests, catalog, roomContexts = []) {
  const entries = [];
  const unplaced = [];
  requests.forEach((request, index) => {
    const room = catalog?.rooms?.find((entry) => entry.id === request.roomId)
      || (roomContexts[index]?.room?.id === request.roomId ? roomContexts[index].room : null);
    const wallTime = calendarWallTime(
      request.startsAt,
      productionRequestRoomTimeZone(room, catalog, roomContexts[index]),
    );
    const projected = Object.freeze({ request, room, wallTime });
    if (wallTime) entries.push(projected);
    else unplaced.push(projected);
  });
  entries.sort((left, right) => left.wallTime.timestamp - right.wallTime.timestamp);
  return Object.freeze({
    entries: Object.freeze(entries),
    unplaced: Object.freeze(unplaced),
  });
}

function validMonthReference(value) {
  const match = typeof value === 'string' ? value.match(MONTH_REFERENCE_PATTERN) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const normalized = new Date(Date.UTC(year, month - 1, 1));
  return normalized.getUTCFullYear() === year ? value : null;
}

export function initialServerRequestCalendarMonth(projection, now = Date.now()) {
  const firstDate = projection?.entries?.[0]?.wallTime?.date;
  if (firstDate) return `${firstDate.slice(0, 7)}-01`;
  const fallback = new Date(now);
  return `${fallback.getUTCFullYear()}-${String(fallback.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function shiftServerRequestCalendarMonth(reference, offset) {
  const normalized = validMonthReference(reference);
  if (!normalized || !Number.isSafeInteger(offset)) return null;
  const [year, month] = normalized.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function calendarGrid(reference) {
  const [year, month] = reference.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = Date.UTC(year, month - 1, 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start + (index * 24 * 60 * 60 * 1000));
    return Object.freeze({
      date: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      currentMonth: date.getUTCMonth() === month - 1,
    });
  });
}

function requestTitle(request) {
  return request.details?.title || t('production.common.requestId', { id: request.id });
}

export function renderServerRequestCalendar({
  projection,
  reference,
  onReferenceChange,
  onSelect,
}) {
  const activeReference = validMonthReference(reference)
    || initialServerRequestCalendarMonth(projection);
  const [year, month] = activeReference.split('-').map(Number);
  const monthDate = new Date(Date.UTC(year, month - 1, 1));
  const monthLabel = new Intl.DateTimeFormat(locale(), {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(monthDate);
  const wrapper = el('section', { className: 'calendar-shell' });
  const header = el('header', { className: 'calendar-header' });
  const previous = button('‹', { attrs: { 'aria-label': t('production.employee.calendarPreviousMonth') } });
  previous.addEventListener('click', () => onReferenceChange(
    shiftServerRequestCalendarMonth(activeReference, -1),
  ));
  const next = button('›', { attrs: { 'aria-label': t('production.employee.calendarNextMonth') } });
  next.addEventListener('click', () => onReferenceChange(
    shiftServerRequestCalendarMonth(activeReference, 1),
  ));
  header.append(previous, el('h3', { text: monthLabel }), next);
  wrapper.appendChild(header);

  const table = el('table', { className: 'calendar-table' });
  table.appendChild(el('caption', {
    className: 'sr-only',
    text: t('production.employee.calendarCaption', { month: monthLabel }),
  }));
  const headingRow = el('tr');
  const monday = Date.UTC(2026, 0, 5);
  for (let index = 0; index < 7; index += 1) {
    headingRow.appendChild(el('th', {
      text: new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'UTC' })
        .format(new Date(monday + (index * 24 * 60 * 60 * 1000))),
      attrs: { scope: 'col' },
    }));
  }
  table.appendChild(el('thead', {}, [headingRow]));
  const body = el('tbody');
  const days = calendarGrid(activeReference);
  const entriesByDate = new Map();
  projection.entries.forEach((entry) => {
    const entries = entriesByDate.get(entry.wallTime.date) || [];
    entries.push(entry);
    entriesByDate.set(entry.wallTime.date, entries);
  });
  for (let week = 0; week < 6; week += 1) {
    const row = el('tr');
    days.slice(week * 7, week * 7 + 7).forEach((day) => {
      const localizedDate = new Intl.DateTimeFormat(locale(), {
        dateStyle: 'full', timeZone: 'UTC',
      }).format(new Date(`${day.date}T00:00:00.000Z`));
      const cell = el('td', {
        className: day.currentMonth ? '' : 'other-month',
        dataset: { calendarDate: day.date },
      }, [el('time', {
        className: 'calendar-day',
        text: String(day.day),
        attrs: { datetime: day.date, 'aria-label': localizedDate },
      })]);
      (entriesByDate.get(day.date) || []).forEach((entry) => {
          const title = requestTitle(entry.request);
          const status = t(`status.${entry.request.status}`);
          const event = button(`${entry.wallTime.time} · ${title} · ${status}`, {
            className: 'calendar-event',
            attrs: {
              'aria-label': t('production.employee.calendarEvent', {
                date: localizedDate,
                time: entry.wallTime.time,
                title,
                status,
              }),
            },
          });
          event.addEventListener('click', () => onSelect(entry.request));
          cell.appendChild(event);
        });
      row.appendChild(cell);
    });
    body.appendChild(row);
  }
  table.appendChild(body);
  wrapper.appendChild(table);

  if (projection.unplaced.length) {
    const fallback = el('section', { className: 'info-box' }, [
      el('h3', { text: t('production.employee.calendarUnplaced') }),
      el('p', { text: t('production.employee.calendarUnplacedDescription') }),
    ]);
    const list = el('ul');
    projection.unplaced.forEach(({ request }) => {
      const select = button(requestTitle(request));
      select.addEventListener('click', () => onSelect(request));
      list.appendChild(el('li', {}, [select]));
    });
    fallback.appendChild(list);
    wrapper.appendChild(fallback);
  }
  return wrapper;
}
