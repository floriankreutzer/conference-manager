import { formatDate, formatMoney, language, t } from '../core/i18n.js';
import { KEYS, readJson, readString, writeString } from '../core/storage.js';
import { button, el, openDialog } from '../core/ui.js';
import { catalogData, localized, requestData } from './parity-data.js';
import { requestIdFromCard } from './employee-visuals.js';

const INTRO_KEY = 'conference_manager_intro_dismissed_v1';
const state = {
  landingHandled: false,
  priorityHandled: false,
  advancedFiltersOpen: false,
  syncFrame: 0,
};

const custom = (de, en) => (language() === 'en' ? en : de);
const totalParticipants = (request) => Number(request.participants ?? (Number(request.internalParticipants || 0) + Number(request.externalParticipants || 0)));

function scheduleSync() {
  cancelAnimationFrame(state.syncFrame);
  state.syncFrame = requestAnimationFrame(sync);
}

function currentManagerTab() {
  const active = document.querySelector('.manager-tabs button[aria-pressed="true"]');
  if (!active) return null;
  const label = active.textContent.trim();
  if (label === t('manager.bookings')) return 'BOOKINGS';
  if (label === t('manager.roomPlan')) return 'ROOM_PLAN';
  if (label === t('manager.reports')) return 'REPORTS';
  if (label === t('manager.admin')) return 'ADMIN';
  return null;
}

function applyManagerLanding() {
  if (state.landingHandled || readString(KEYS.role, 'employee') !== 'manager') return false;
  const managerNav = document.querySelector('#primaryNavigation button[data-view="manager"]');
  if (!(managerNav instanceof HTMLButtonElement)) return false;
  state.landingHandled = true;
  if (document.querySelector('.manager-tabs')) return false;
  const welcomeNav = document.querySelector('#primaryNavigation button[data-view="welcome"].active');
  if (!welcomeNav) return false;
  managerNav.click();
  return true;
}

function updateManagerHeading(tab) {
  const title = document.getElementById('viewTitle');
  const subtitle = document.getElementById('viewSubtitle');
  if (!title || !subtitle || !tab) return;
  title.textContent = 'Conference Management';
  const subtitles = {
    BOOKINGS: custom(
      'Prüfen und steuern Sie offene Anfragen, heutige Veranstaltungen und kommende Buchungen.',
      'Review and manage open requests, today’s events and upcoming bookings.',
    ),
    ROOM_PLAN: custom(
      'Behalten Sie die Raumbelegung für den gewählten Tag und Standort im Blick.',
      'Keep track of room occupancy for the selected day and location.',
    ),
    REPORTS: custom(
      'Analysieren Sie Buchungen, Auslastung, Services und Catering im gewählten Zeitraum.',
      'Analyse bookings, utilisation, services and catering for the selected period.',
    ),
    ADMIN: custom(
      'Verwalten Sie Räume, Standorte, Services und Catering-Stammdaten.',
      'Manage room, location, service and catering master data.',
    ),
  };
  subtitle.textContent = subtitles[tab];
}

function addFirstUseGuide(section) {
  if (readString(INTRO_KEY, '') === 'true' || section.querySelector('[data-manager-first-use]')) return;
  const guide = el('aside', {
    className: 'manager-first-use-banner',
    dataset: { managerFirstUse: 'true' },
    attrs: { role: 'note' },
  });
  const content = el('div', { className: 'manager-first-use-content' }, [
    el('strong', { text: custom('Neu im Conference Management?', 'New to Conference Management?') }),
    el('p', { text: custom(
      'Starten Sie mit dem Handlungsbedarf. Öffnen Sie eine Anfrage, prüfen Sie alle relevanten Angaben und treffen Sie anschließend Ihre Entscheidung.',
      'Start with items that need attention. Open a request, review all relevant information and then make your decision.',
    ) }),
  ]);
  content.appendChild(el('div', { className: 'manager-first-use-steps' }, [
    el('span', { text: custom('1. Handlungsbedarf priorisieren', '1. Prioritise action required') }),
    el('span', { text: custom('2. Anfrage vollständig prüfen', '2. Review the full request') }),
    el('span', { text: custom('3. Bestätigen, Änderung anfordern oder ablehnen', '3. Confirm, request changes or reject') }),
  ]));
  const dismiss = button(custom('Verstanden', 'Got it'));
  dismiss.addEventListener('click', () => {
    writeString(INTRO_KEY, 'true');
    guide.remove();
  });
  guide.append(content, dismiss);
  section.prepend(guide);
}

function wrapAdvancedFilters(section) {
  const filters = section.querySelector('.manager-filters');
  if (!(filters instanceof HTMLFormElement) || filters.closest('[data-manager-advanced-filters]')) return;
  const details = el('details', {
    className: 'manager-advanced-filters',
    dataset: { managerAdvancedFilters: 'true' },
  });
  details.open = state.advancedFiltersOpen;
  details.appendChild(el('summary', {}, [
    el('strong', { text: custom('Weitere Filter', 'More filters') }),
    el('span', { text: custom('Suche, Status und Standort', 'Search, status and location') }),
  ]));
  details.addEventListener('toggle', () => { state.advancedFiltersOpen = details.open; });
  filters.before(details);
  details.appendChild(filters);
}

function applyInitialPriorityFilter(section) {
  if (state.priorityHandled) return;
  const actionFilter = section.querySelector('[data-quick-filter="ACTION"]');
  if (!(actionFilter instanceof HTMLButtonElement)) return;
  state.priorityHandled = true;
  if (requestData().some((request) => ['Submitted', 'In Review'].includes(request.status))) actionFilter.click();
}

function detailSection(title, rows) {
  const section = el('section', { className: 'manager-detail-section' }, [el('h3', { text: title })]);
  const list = el('dl', { className: 'manager-detail-list' });
  rows.filter(([, value]) => value !== null && value !== undefined && value !== '').forEach(([label, value]) => {
    list.append(el('div', {}, [el('dt', { text: label }), el('dd', { text: String(value) })]));
  });
  section.appendChild(list);
  return section;
}

function serviceText(request, catalog) {
  const names = (request.serviceIds || []).map((id) => {
    const service = (catalog.services || []).find((entry) => entry.id === id);
    return localized(service?.name || id);
  }).filter(Boolean);
  return names.length ? names.join(', ') : custom('Keine zusätzlichen Services', 'No additional services');
}

function packageText(request, catalog) {
  if (!request.packageSelection) return t('catering.noPackage');
  if (request.packageSelection.packageName) {
    return `${request.packageSelection.packageName}${request.packageSelection.tier ? ` · ${request.packageSelection.tier}` : ''}`;
  }
  const pack = (catalog.cateringPackages || []).find((entry) => entry.id === request.packageSelection.packageId);
  return `${localized(pack?.name || request.packageSelection.packageId || '')}${request.packageSelection.tier ? ` · ${request.packageSelection.tier}` : ''}`.trim();
}

function itemText(request, catalog) {
  const selected = Object.entries(request.quantities || {}).filter(([, quantity]) => Number(quantity) > 0);
  if (!selected.length) return t('catering.noItems');
  return selected.map(([id, quantity]) => {
    const item = (catalog.cateringItems || []).find((entry) => entry.id === id);
    const unit = localized(item?.unit || '');
    return `${localized(item?.name || id)}: ${quantity}${unit ? ` ${unit}` : ''}`;
  }).join(', ');
}

function allocationText(request) {
  const allocations = (request.allocations || []).filter((entry) => entry?.costCenter);
  if (!allocations.length) return custom('Keine Kostenstellen angegeben', 'No cost centres provided');
  return allocations.map((entry) => `${entry.costCenter}: ${Number(entry.percent || 0)} %`).join(', ');
}

function requesterInfo(request) {
  if (request.requesterName) return { name: request.requesterName, fallback: false };
  const profile = readJson(KEYS.profile, { firstName: '', lastName: '' });
  const name = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
  return { name: name || custom('Nicht gespeichert', 'Not stored'), fallback: Boolean(name) };
}

function buildReviewContent(request) {
  const catalog = catalogData();
  const room = (catalog.rooms || []).find((entry) => entry.id === request.roomId);
  const requester = requesterInfo(request);
  const noInfo = custom('Keine Angaben', 'No information provided');
  const content = el('section', { className: 'manager-detail-grid', dataset: { managerReviewContent: request.id } });
  const event = detailSection(custom('Veranstaltung', 'Event'), [
    [t('schedule.title'), request.title],
    [custom('Anfragende Person', 'Requester'), requester.name],
    [t('manager.status'), t(`status.${request.status}`)],
  ]);
  if (requester.fallback) event.appendChild(el('small', {
    className: 'manager-detail-note',
    text: custom('Im MVP aus dem lokalen Demo-Profil angezeigt.', 'Shown from the local demo profile in the MVP.'),
  }));

  content.append(
    event,
    detailSection(custom('Termin & Raum', 'Schedule & room'), [
      [t('schedule.date'), formatDate(request.date)],
      [`${t('schedule.start')} / ${t('schedule.end')}`, `${request.start}–${request.end}`],
      [t('schedule.location'), request.location],
      [t('review.room'), localized(room?.name || request.roomId || '')],
    ]),
    detailSection(t('schedule.total'), [
      [t('schedule.internal'), Number(request.internalParticipants || 0)],
      [t('schedule.external'), Number(request.externalParticipants || 0)],
      [t('schedule.total'), totalParticipants(request)],
    ]),
    detailSection(t('review.services'), [
      [t('review.services'), serviceText(request, catalog)],
    ]),
    detailSection(custom('Catering & Anforderungen', 'Catering & requirements'), [
      [t('catering.package'), packageText(request, catalog)],
      [t('catering.people'), request.cateringParticipants ? String(request.cateringParticipants) : noInfo],
      [t('catering.items'), itemText(request, catalog)],
      [t('catering.dietary'), request.dietaryRequirements || noInfo],
      [t('schedule.special'), request.specialRequirements || noInfo],
    ]),
    detailSection(t('review.costs'), [
      [t('review.total'), formatMoney(request.estimatedCost || 0)],
      [t('cost.allocations'), allocationText(request)],
    ]),
  );
  return content;
}

function nativeAction(footer, key) {
  if (!(footer instanceof HTMLElement)) return null;
  return [...footer.querySelectorAll('button')].find((control) => control.textContent.trim() === t(key)) || null;
}

function openConfirmDialog(request, originalConfirm) {
  const catalog = catalogData();
  const room = (catalog.rooms || []).find((entry) => entry.id === request.roomId);
  const summary = detailSection(custom('Kerndaten', 'Key details'), [
    [t('schedule.title'), request.title],
    [t('schedule.date'), formatDate(request.date)],
    [`${t('schedule.start')} / ${t('schedule.end')}`, `${request.start}–${request.end}`],
    [t('schedule.location'), request.location],
    [t('review.room'), localized(room?.name || request.roomId || '')],
    [t('schedule.total'), totalParticipants(request)],
    [t('review.total'), formatMoney(request.estimatedCost || 0)],
  ]);
  const cancel = button(t('common.cancel'));
  const confirm = button(custom('Verbindlich bestätigen', 'Confirm booking'), {
    className: 'primary',
    dataset: { managerConfirmFinal: request.id },
  });
  const dialog = openDialog({
    title: custom('Buchung verbindlich bestätigen?', 'Confirm booking as binding?'),
    description: custom(
      'Prüfen Sie die Kerndaten noch einmal. Die bestehende Bestätigungslogik bleibt unverändert.',
      'Review the key details once more. The existing confirmation logic remains unchanged.',
    ),
    content: summary,
    actions: [cancel, confirm],
    labelledById: 'managerConfirmTitle',
  });
  dialog.classList.add('manager-confirm-dialog');
  cancel.addEventListener('click', () => dialog.close());
  confirm.addEventListener('click', () => {
    dialog.close();
    requestAnimationFrame(() => originalConfirm?.click());
  });
}

function openReviewDialog(request, originalFooter) {
  const actionable = ['Submitted', 'In Review'].includes(request.status);
  const close = button(t('common.close'));
  const actions = [close];
  const confirmOriginal = nativeAction(originalFooter, 'manager.confirm');
  const changeOriginal = nativeAction(originalFooter, 'manager.change');
  const rejectOriginal = nativeAction(originalFooter, 'manager.reject');
  let dialog;

  if (actionable && changeOriginal) {
    const change = button(t('manager.change'));
    change.addEventListener('click', () => {
      dialog.close();
      requestAnimationFrame(() => changeOriginal.click());
    });
    actions.push(change);
  }
  if (actionable && rejectOriginal) {
    const reject = button(t('manager.reject'), { className: 'danger' });
    reject.addEventListener('click', () => {
      dialog.close();
      requestAnimationFrame(() => rejectOriginal.click());
    });
    actions.push(reject);
  }
  if (actionable && confirmOriginal) {
    const confirm = button(t('manager.confirm'), {
      className: 'primary',
      dataset: { managerConfirmFromReview: request.id },
    });
    confirm.addEventListener('click', () => {
      dialog.close();
      requestAnimationFrame(() => openConfirmDialog(request, confirmOriginal));
    });
    actions.push(confirm);
  }

  dialog = openDialog({
    title: `${custom('Anfrage prüfen', 'Review request')} · ${request.id}`,
    description: actionable ? custom(
      'Prüfen Sie die Angaben vollständig, bevor Sie eine Entscheidung treffen.',
      'Review the complete request before making a decision.',
    ) : '',
    content: buildReviewContent(request),
    actions,
    labelledById: 'managerReviewTitle',
  });
  dialog.classList.add('manager-review-dialog');
  close.addEventListener('click', () => dialog.close());
}

function decorateManagerCards(section) {
  const requests = new Map(requestData().map((request) => [request.id, request]));
  section.querySelectorAll('.request-card').forEach((card) => {
    const requestId = requestIdFromCard(card);
    const request = requests.get(requestId);
    if (!request) return;
    const originalFooter = card.querySelector('.request-actions:not([data-manager-review-actions])');
    if (originalFooter instanceof HTMLElement) {
      originalFooter.classList.add('manager-native-actions');
      originalFooter.hidden = true;
    }
    if (card.querySelector('[data-manager-review-actions]')) return;
    const actionable = ['Submitted', 'In Review'].includes(request.status);
    const reviewFooter = el('footer', {
      className: 'request-actions manager-review-actions',
      dataset: { managerReviewActions: request.id },
    });
    const review = button(
      actionable ? custom('Prüfen & entscheiden', 'Review & decide') : custom('Details ansehen', 'View details'),
      {
        className: actionable ? 'primary' : 'secondary',
        dataset: { managerReview: request.id },
      },
    );
    review.addEventListener('click', () => openReviewDialog(request, originalFooter));
    reviewFooter.appendChild(review);
    card.appendChild(reviewFooter);
  });
}

function enhanceBookings(section) {
  addFirstUseGuide(section);
  wrapAdvancedFilters(section);
  decorateManagerCards(section);
  applyInitialPriorityFilter(section);
}

function sync() {
  if (applyManagerLanding()) {
    scheduleSync();
    return;
  }
  const tab = currentManagerTab();
  if (!tab) return;
  updateManagerHeading(tab);
  const section = document.querySelector('.manager-tabs')?.nextElementSibling;
  if (!(section instanceof HTMLElement)) return;
  if (tab === 'BOOKINGS') enhanceBookings(section);
  document.documentElement.dataset.managerFirstUseBuild = '2026.08.23.51';
}

['click', 'change', 'input'].forEach((eventName) => document.addEventListener(eventName, scheduleSync));
window.addEventListener('conference-language-changed', scheduleSync);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
else scheduleSync();
