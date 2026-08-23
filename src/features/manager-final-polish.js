import { localTodayIso } from '../core/domain.js';
import { formatDate, language, t } from '../core/i18n.js';
import { managerOverview } from './reporting.js';
import { catalogData, localized, requestData } from './parity-data.js';

const MANAGER_FINAL_POLISH_BUILD = '2026.08.23.66';
let syncFrame = 0;

const custom = (de, en) => (language() === 'en' ? en : de);

function managerBookingsSection() {
  const tabs = document.querySelector('.manager-tabs');
  const section = tabs?.nextElementSibling;
  if (!(section instanceof HTMLElement) || !section.querySelector('.manager-overview-columns')) return null;
  return section;
}

function scheduleSync() {
  cancelAnimationFrame(syncFrame);
  syncFrame = requestAnimationFrame(sync);
}

function calendarStatusText(status) {
  switch (String(status || '')) {
    case 'Tentative':
    case 'Provisional':
      return custom('Vorläufig reserviert', 'Provisionally reserved');
    case 'Busy':
    case 'Confirmed':
      return custom('Verbindlich belegt', 'Bindingly occupied');
    case 'Released':
      return custom('Freigegeben', 'Released');
    default:
      return custom('Nicht angegeben', 'Not specified');
  }
}

function decisionText(request) {
  return ['Submitted', 'In Review'].includes(request.status)
    ? custom('Entscheidung erforderlich', 'Decision required')
    : custom('Keine Entscheidung erforderlich', 'No decision required');
}

function statusItem(label, value) {
  const item = document.createElement('div');
  item.className = 'manager-decision-summary-item';
  const name = document.createElement('span');
  name.textContent = label;
  const content = document.createElement('strong');
  content.textContent = value;
  item.append(name, content);
  return item;
}

function ensureDecisionSummary(dialog) {
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return;
  const content = dialog.querySelector('[data-manager-review-content]');
  if (!(content instanceof HTMLElement)) return;
  const requestId = content.dataset.managerReviewContent || '';
  const request = requestData().find((entry) => entry.id === requestId);
  if (!request) return;

  let summary = dialog.querySelector('[data-manager-decision-summary]');
  if (!(summary instanceof HTMLElement)) {
    summary = document.createElement('section');
    summary.className = 'manager-decision-summary';
    summary.dataset.managerDecisionSummary = requestId;
    summary.setAttribute('aria-label', custom('Entscheidungsstatus', 'Decision status'));
    const body = dialog.querySelector('.modal-body');
    if (!(body instanceof HTMLElement)) return;
    body.insertBefore(summary, content);
  }

  summary.replaceChildren(
    statusItem(custom('Anfrage', 'Request'), t(`status.${request.status}`)),
    statusItem(custom('Raum', 'Room'), calendarStatusText(request.calendarStatus)),
    statusItem(custom('Nächster Schritt', 'Next step'), decisionText(request)),
  );
}

function ensureReviewHeaderClose(dialog) {
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return;
  const header = dialog.querySelector('.modal-header');
  if (!(header instanceof HTMLElement)) return;
  if (!header.querySelector('[data-manager-review-header-close]')) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'secondary manager-dialog-header-close';
    close.dataset.managerReviewHeaderClose = 'true';
    close.textContent = custom('Schließen', 'Close');
    close.setAttribute('aria-label', custom('Prüfansicht schließen', 'Close review'));
    close.addEventListener('click', () => dialog.close());
    header.appendChild(close);
  }

  const bottomClose = dialog.querySelector('.modal-actions > button:first-child');
  if (bottomClose instanceof HTMLButtonElement) bottomClose.dataset.managerReviewBottomClose = 'true';
}

function managerOverviewRow(request, catalog) {
  const room = (catalog.rooms || []).find((entry) => entry.id === request.roomId);
  const row = document.createElement('article');
  row.className = 'manager-overview-row';
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = request.title;
  const meta = document.createElement('small');
  meta.textContent = `${formatDate(request.date)} · ${request.start}–${request.end} · ${localized(room?.name || request.roomId || '')} · ${t(`status.${request.status}`)}`;
  copy.append(title, meta);
  const open = document.createElement('button');
  open.type = 'button';
  open.dataset.managerOpen = request.id;
  open.textContent = custom('Öffnen', 'Open');
  row.append(copy, open);
  return row;
}

function renderDistinctUpcoming(section) {
  const cards = [...section.querySelectorAll('.manager-overview-columns .manager-overview-card')];
  const upcomingCard = cards[1];
  if (!(upcomingCard instanceof HTMLElement)) return;

  const requests = requestData();
  const overview = managerOverview(requests, localTodayIso());
  const actionIds = new Set(overview.action.map((request) => request.id));
  const upcoming = [...overview.nextSevenDays]
    .filter((request) => !actionIds.has(request.id))
    .sort((left, right) => `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`))
    .slice(0, 4);
  const catalog = catalogData();

  upcomingCard.querySelectorAll('.manager-overview-row, p.muted').forEach((node) => node.remove());
  if (upcoming.length) {
    upcoming.forEach((request) => upcomingCard.appendChild(managerOverviewRow(request, catalog)));
  } else {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = custom('Keine weiteren Buchungen in den nächsten 7 Tagen.', 'No additional bookings in the next 7 days.');
    upcomingCard.appendChild(empty);
  }
  upcomingCard.dataset.managerDistinctUpcoming = 'true';
}

function sync() {
  const section = managerBookingsSection();
  if (section) renderDistinctUpcoming(section);
  const review = document.querySelector('dialog.manager-review-dialog');
  if (review instanceof HTMLDialogElement && review.open) {
    ensureDecisionSummary(review);
    ensureReviewHeaderClose(review);
  }
  document.documentElement.dataset.managerFinalPolishBuild = MANAGER_FINAL_POLISH_BUILD;
}

['click', 'change', 'input'].forEach((eventName) => document.addEventListener(eventName, scheduleSync));
window.addEventListener('conference-language-changed', scheduleSync);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
else scheduleSync();
window.addEventListener('load', scheduleSync, { once: true });
