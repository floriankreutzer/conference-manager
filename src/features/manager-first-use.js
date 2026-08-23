import { formatDate, formatMoney, language, t } from '../core/i18n.js';
import { KEYS, readJson, readString, writeString } from '../core/storage.js';
import { button, el, openDialog } from '../core/ui.js';
import { catalogData, localized, requestData } from './parity-data.js';
import { requestIdFromCard } from './employee-visuals.js';

const LANDING_KEY = 'conference_manager_landing_v1';
const INTRO_KEY = 'conference_manager_intro_dismissed_v1';
const PRIORITY_KEY = 'conference_manager_priority_filter_v1';

const state = {
  advancedFiltersOpen: false,
  syncFrame: 0,
};

const COPY = Object.freeze({
  de: Object.freeze({
    title: 'Conference Management',
    bookingsSubtitle: 'Prüfen und steuern Sie offene Anfragen, heutige Veranstaltungen und kommende Buchungen.',
    roomPlanSubtitle: 'Behalten Sie die Raumbelegung für den gewählten Tag und Standort im Blick.',
    reportsSubtitle: 'Analysieren Sie Buchungen, Auslastung, Services und Catering im gewählten Zeitraum.',
    adminSubtitle: 'Verwalten Sie Räume, Standorte, Services und Catering-Stammdaten.',
    introTitle: 'Neu im Conference Management?',
    introText: 'Starten Sie mit dem Handlungsbedarf. Öffnen Sie eine Anfrage, prüfen Sie alle relevanten Angaben und treffen Sie anschließend Ihre Entscheidung.',
    introStep1: '1. Handlungsbedarf priorisieren',
    introStep2: '2. Anfrage vollständig prüfen',
    introStep3: '3. Bestätigen, Änderung anfordern oder ablehnen',
    introDismiss: 'Verstanden',
    moreFilters: 'Weitere Filter',
    moreFiltersHint: 'Suche, Status und Standort',
    review: 'Prüfen & entscheiden',
    details: 'Details ansehen',
    reviewTitle: 'Anfrage prüfen',
    reviewDescription: 'Prüfen Sie die Angaben vollständig, bevor Sie eine Entscheidung treffen.',
    event: 'Veranstaltung',
    requester: 'Anfragende Person',
    requesterDemo: 'Im MVP aus dem lokalen Demo-Profil angezeigt.',
    schedule: 'Termin & Raum',
    date: 'Datum',
    time: 'Uhrzeit',
    location: 'Standort',
    room: 'Raum',
    status: 'Status',
    participants: 'Teilnehmende',
    internal: 'Intern',
    external: 'Extern',
    total: 'Gesamt',
    services: 'Services',
    noServices: 'Keine zusätzlichen Services',
    catering: 'Catering & Anforderungen',
    cateringPackage: 'Paket',
    cateringPeople: 'Catering für',
    cateringItems: 'Einzeloptionen',
    dietary: 'Ernährung & Unverträglichkeiten',
    special: 'Besondere Anforderungen / Hinweise',
    none: 'Keine Angaben',
    costs: 'Kosten & Verteilung',
    estimated: 'Voraussichtliche Gesamtkosten',
    allocations: 'Kostenstellen',
    close: 'Schließen',
    confirm: 'Bestätigen',
    change: 'Änderung anfordern',
    reject: 'Ablehnen',
    confirmTitle: 'Buchung verbindlich bestätigen?',
    confirmDescription: 'Die bestehende Bestätigungslogik wird unverändert ausgeführt. Prüfen Sie die Kerndaten noch einmal.',
    confirmAction: 'Verbindlich bestätigen',
    cancel: 'Abbrechen',
    persons: 'Personen',
    noAllocation: 'Keine Kostenstellen angegeben',
  }),
  en: Object.freeze({
    title: 'Conference Management',
    bookingsSubtitle: 'Review and manage open requests, today’s events and upcoming bookings.',
    roomPlanSubtitle: 'Keep track of room occupancy for the selected day and location.',
    reportsSubtitle: 'Analyse bookings, utilisation, services and catering for the selected period.',
    adminSubtitle: 'Manage room, location, service and catering master data.',
    introTitle: 'New to Conference Management?',
    introText: 'Start with items that need attention. Open a request, review all relevant information and then make your decision.',
    introStep1: '1. Prioritise action required',
    introStep2: '2. Review the full request',
    introStep3: '3. Confirm, request changes or reject',
    introDismiss: 'Got it',
    moreFilters: 'More filters',
    moreFiltersHint: 'Search, status and location',
    review: 'Review & decide',
    details: 'View details',
    reviewTitle: 'Review request',
    reviewDescription: 'Review the complete request before making a decision.',
    event: 'Event',
    requester: 'Requester',
    requesterDemo: 'Shown from the local demo profile in the MVP.',
    schedule: 'Schedule & room',
    date: 'Date',
    time: 'Time',
    location: 'Location',
    room: 'Room',
    status: 'Status',
    participants: 'Participants',
    internal: 'Internal',
    external: 'External',
    total: 'Total',
    services: 'Services',
    noServices: 'No additional services',
    catering: 'Catering & requirements',
    cateringPackage: 'Package',
    cateringPeople: 'Catering for',
    cateringItems: 'Individual options',
    dietary: 'Dietary requirements & intolerances',
    special: 'Special requirements / notes',
    none: 'No information provided',
    costs: 'Costs & allocation',
    estimated: 'Estimated total cost',
    allocations: 'Cost centres',
    close: 'Close',
    confirm: 'Confirm',
    change: 'Request changes',
    reject: 'Reject',
    confirmTitle: 'Confirm booking as binding?',
    confirmDescription: 'The existing confirmation logic remains unchanged. Review the key details once more.',
    confirmAction: 'Confirm booking',
    cancel: 'Cancel',
    persons: 'people',
    noAllocation: 'No cost centres provided',
  }),
});

function copy(key) {
  const locale = language() === 'en' ? 'en' : 'de';
  return COPY[locale][key] || COPY.de[key] || key;
}

function scheduleSync() {
  cancelAnimationFrame(state.syncFrame);
  state.syncFrame = requestAnimationFrame(sync);
}

function managerTab() {
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
  if (readString(KEYS.role, 'employee') !== 'manager') return false;
  if (sessionStorage.getItem(LANDING_KEY) === 'true') return false;
  const managerNav = document.querySelector('#primaryNavigation button[data-view="manager"]');
  if (!(managerNav instanceof HTMLButtonElement)) return false;
  if (document.querySelector('.manager-tabs')) {
    sessionStorage.setItem(LANDING_KEY, 'true');
    return false;
  }
  const welcomeNav = document.querySelector('#primaryNavigation button[data-view="welcome"].active');
  if (!welcomeNav) return false;
  sessionStorage.setItem(LANDING_KEY, 'true');
  managerNav.click();
  return true;
}

function updateManagerHeading(tab) {
  const title = document.getElementById('viewTitle');
  const subtitle = document.getElementById('viewSubtitle');
  if (!title || !subtitle || !tab) return;
  title.textContent = copy('title');
  const subtitleKey = {
    BOOKINGS: 'bookingsSubtitle',
    ROOM_PLAN: 'roomPlanSubtitle',
    REPORTS: 'reportsSubtitle',
    ADMIN: 'adminSubtitle',
  }[tab];
  subtitle.textContent = copy(subtitleKey);
}

function addFirstUseGuide(section) {
  if (readString(INTRO_KEY, '') === 'true') return;
  if (section.querySelector('[data-manager-first-use]')) return;
  const guide = el('aside', {
    className: 'manager-first-use-banner',
    dataset: { managerFirstUse: 'true' },
    attrs: { role: 'note' },
  });
  const content = el('div', { className: 'manager-first-use-content' }, [
    el('strong', { text: copy('introTitle') }),
    el('p', { text: copy('introText') }),
  ]);
  const steps = el('div', { className: 'manager-first-use-steps' }, [
    el('span', { text: copy('introStep1') }),
    el('span', { text: copy('introStep2') }),
    el('span', { text: copy('introStep3') }),
  ]);
  content.appendChild(steps);
  const dismiss = button(copy('introDismiss'));
  dismiss.addEventListener('click', () => {
    writeString(INTRO_KEY, 'true');
    guide.remove();
  });
  guide.append(content, dismiss);
  section.prepend(guide);
}

function wrapAdvancedFilters(section) {
  const filters = section.querySelector('.manager-filters');
  if (!(filters instanceof HTMLFormElement)) return;
  if (filters.closest('[data-manager-advanced-filters]')) return;
  const details = el('details', {
    className: 'manager-advanced-filters',
    dataset: { managerAdvancedFilters: 'true' },
  });
  details.open = state.advancedFiltersOpen;
  const summary = el('summary', {}, [
    el('strong', { text: copy('moreFilters') }),
    el('span', { text: copy('moreFiltersHint') }),
  ]);
  details.addEventListener('toggle', () => { state.advancedFiltersOpen = details.open; });
  filters.before(details);
  details.append(summary, filters);
}

function applyInitialPriorityFilter(section) {
  if (sessionStorage.getItem(PRIORITY_KEY) === 'true') return;
  const actionExists = requestData().some((request) => ['Submitted', 'In Review'].includes(request.status));
  const actionFilter = section.querySelector('[data-quick-filter="ACTION"]');
  if (!(actionFilter instanceof HTMLButtonElement)) return;
  sessionStorage.setItem(PRIORITY_KEY, 'true');
  if (actionExists) actionFilter.click();
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

function requestServices(request, catalog) {
  const names = (request.serviceIds || []).map((id) => {
    const service = (catalog.services || []).find((entry) => entry.id === id);
    return localized(service?.name || id);
  }).filter(Boolean);
  return names.length ? names.join(', ') : copy('noServices');
}

function cateringPackage(request, catalog) {
  if (!request.packageSelection) return copy('none');
  if (request.packageSelection.packageName) {
    return `${request.packageSelection.packageName}${request.packageSelection.tier ? ` · ${request.packageSelection.tier}` : ''}`;
  }
  const pack = (catalog.cateringPackages || []).find((entry) => entry.id === request.packageSelection.packageId);
  return `${localized(pack?.name || request.packageSelection.packageId || '')}${request.packageSelection.tier ? ` · ${request.packageSelection.tier}` : ''}`.trim();
}

function cateringItems(request, catalog) {
  const selected = Object.entries(request.quantities || {}).filter(([, quantity]) => Number(quantity) > 0);
  if (!selected.length) return copy('none');
  return selected.map(([id, quantity]) => {
    const item = (catalog.cateringItems || []).find((entry) => entry.id === id);
    const unit = localized(item?.unit || '');
    return `${localized(item?.name || id)}: ${quantity}${unit ? ` ${unit}` : ''}`;
  }).join(', ');
}

function allocationText(request) {
  const rows = (request.allocations || []).filter((entry) => entry?.costCenter);
  if (!rows.length) return copy('noAllocation');
  return rows.map((entry) => `${entry.costCenter}: ${Number(entry.percent || 0)} %`).join(', ');
}

function requesterInfo(request) {
  if (request.requesterName) return { value: request.requesterName, fallback: false };
  const profile = readJson(KEYS.profile, { firstName: '', lastName: '' });
  const name = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
  return { value: name || copy('none'), fallback: Boolean(name) };
}

function buildReviewContent(request) {
  const catalog = catalogData();
  const room = (catalog.rooms || []).find((entry) => entry.id === request.roomId);
  const requester = requesterInfo(request);
  const content = el('section', { className: 'manager-detail-grid', dataset: { managerReviewContent: request.id } });

  const eventSection = detailSection(copy('event'), [
    [copy('requester'), requester.value],
    [copy('status'), t(`status.${request.status}`)],
  ]);
  if (requester.fallback) eventSection.appendChild(el('small', { className: 'manager-detail-note', text: copy('requesterDemo') }));

  content.append(
    eventSection,
    detailSection(copy('schedule'), [
      [copy('date'), formatDate(request.date)],
      [copy('time'), `${request.start}–${request.end}`],
      [copy('location'), request.location],
      [copy('room'), localized(room?.name || request.roomId || '')],
    ]),
    detailSection(copy('participants'), [
      [copy('internal'), Number(request.internalParticipants || 0)],
      [copy('external'), Number(request.externalParticipants || 0)],
      [copy('total'), Number(request.participants || 0)],
    ]),
    detailSection(copy('services'), [
      [copy('services'), requestServices(request, catalog)],
    ]),
    detailSection(copy('catering'), [
      [copy('cateringPackage'), cateringPackage(request, catalog)],
      [copy('cateringPeople'), request.cateringParticipants ? `${request.cateringParticipants} ${copy('persons')}` : copy('none')],
      [copy('cateringItems'), cateringItems(request, catalog)],
      [copy('dietary'), request.dietaryRequirements || copy('none')],
      [copy('special'), request.specialRequirements || copy('none')],
    ]),
    detailSection(copy('costs'), [
      [copy('estimated'), formatMoney(request.estimatedCost || 0)],
      [copy('allocations'), allocationText(request)],
    ]),
  );
  return content;
}

function findNativeAction(footer, translationKey) {
  if (!(footer instanceof HTMLElement)) return null;
  return [...footer.querySelectorAll('button')].find((control) => control.textContent.trim() === t(translationKey)) || null;
}

function openConfirmDialog(request, nativeConfirm) {
  const catalog = catalogData();
  const room = (catalog.rooms || []).find((entry) => entry.id === request.roomId);
  const summary = detailSection(copy('event'), [
    [copy('date'), formatDate(request.date)],
    [copy('time'), `${request.start}–${request.end}`],
    [copy('location'), request.location],
    [copy('room'), localized(room?.name || request.roomId || '')],
    [copy('total'), `${Number(request.participants || 0)} ${copy('persons')}`],
    [copy('estimated'), formatMoney(request.estimatedCost || 0)],
  ]);
  const cancel = button(copy('cancel'));
  const confirm = button(copy('confirmAction'), { className: 'primary', dataset: { managerConfirmFinal: request.id } });
  const dialog = openDialog({
    title: copy('confirmTitle'),
    description: copy('confirmDescription'),
    content: summary,
    actions: [cancel, confirm],
    labelledById: 'managerConfirmTitle',
  });
  dialog.classList.add('manager-confirm-dialog');
  cancel.addEventListener('click', () => dialog.close());
  confirm.addEventListener('click', () => {
    dialog.close();
    requestAnimationFrame(() => nativeConfirm?.click());
  });
}

function openReviewDialog(request, nativeFooter) {
  const actionable = ['Submitted', 'In Review'].includes(request.status);
  const close = button(copy('close'));
  const actions = [close];
  const nativeConfirm = findNativeAction(nativeFooter, 'manager.confirm');
  const nativeChange = findNativeAction(nativeFooter, 'manager.change');
  const nativeReject = findNativeAction(nativeFooter, 'manager.reject');

  if (actionable && nativeChange) {
    const change = button(copy('change'));
    change.addEventListener('click', () => {
      dialog.close();
      requestAnimationFrame(() => nativeChange.click());
    });
    actions.push(change);
  }
  if (actionable && nativeReject) {
    const reject = button(copy('reject'), { className: 'danger' });
    reject.addEventListener('click', () => {
      dialog.close();
      requestAnimationFrame(() => nativeReject.click());
    });
    actions.push(reject);
  }
  if (actionable && nativeConfirm) {
    const confirm = button(copy('confirm'), { className: 'primary', dataset: { managerConfirmFromReview: request.id } });
    confirm.addEventListener('click', () => {
      dialog.close();
      requestAnimationFrame(() => openConfirmDialog(request, nativeConfirm));
    });
    actions.push(confirm);
  }

  const dialog = openDialog({
    title: `${copy('reviewTitle')} · ${request.id}`,
    description: actionable ? copy('reviewDescription') : '',
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
    const nativeFooter = card.querySelector('.request-actions:not([data-manager-review-actions])');
    if (nativeFooter instanceof HTMLElement) {
      nativeFooter.classList.add('manager-native-actions');
      nativeFooter.hidden = true;
    }
    if (card.querySelector('[data-manager-review-actions]')) return;
    const actionable = ['Submitted', 'In Review'].includes(request.status);
    const reviewFooter = el('footer', {
      className: 'request-actions manager-review-actions',
      dataset: { managerReviewActions: request.id },
    });
    const review = button(actionable ? copy('review') : copy('details'), {
      className: actionable ? 'primary' : 'secondary',
      dataset: { managerReview: request.id },
    });
    review.addEventListener('click', () => openReviewDialog(request, nativeFooter));
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
  const tab = managerTab();
  if (!tab) return;
  updateManagerHeading(tab);
  const section = document.querySelector('.manager-tabs')?.nextElementSibling;
  if (!(section instanceof HTMLElement)) return;
  if (tab === 'BOOKINGS') enhanceBookings(section);
  document.documentElement.dataset.managerFirstUseBuild = '2026.08.23.50';
}

['click', 'change', 'input'].forEach((eventName) => document.addEventListener(eventName, scheduleSync));
window.addEventListener('conference-language-changed', scheduleSync);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
else scheduleSync();
