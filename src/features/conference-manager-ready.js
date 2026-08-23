import { language, t } from '../core/i18n.js';

const CONFERENCE_MANAGER_READY_BUILD = '2026.08.23.67';
const MOBILE_QUERY = '(max-width: 760px)';
const mobileMedia = window.matchMedia(MOBILE_QUERY);
const SECONDARY_FILTERS = ['7D', 'UPCOMING'];
let syncFrame = 0;

const custom = (de, en) => (language() === 'en' ? en : de);

function scheduleSync() {
  cancelAnimationFrame(syncFrame);
  syncFrame = requestAnimationFrame(sync);
}

function managerBookingsSection() {
  const tabs = document.querySelector('.manager-tabs');
  const section = tabs?.nextElementSibling;
  if (!(section instanceof HTMLElement) || !section.querySelector('.manager-quick-filters')) return null;
  return section;
}

function ensureBookingsTabLabel() {
  const controls = [...document.querySelectorAll('.manager-tabs button')];
  const control = controls.find((button) => button.dataset.managerReadyBookingsTab === 'true'
    || button.textContent.trim() === t('manager.bookings'));
  if (!(control instanceof HTMLButtonElement)) return;
  control.dataset.managerReadyBookingsTab = 'true';
  const label = custom('Anfragen & Buchungen', 'Requests & bookings');
  control.setAttribute('aria-label', label);
  control.title = label;
}

function helpStep(title, text) {
  const item = document.createElement('div');
  item.className = 'manager-ready-help-item';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const copy = document.createElement('span');
  copy.textContent = text;
  item.append(heading, copy);
  return item;
}

function ensurePersistentHelp(section) {
  let details = section.querySelector('[data-manager-ready-help]');
  if (!(details instanceof HTMLDetailsElement)) {
    details = document.createElement('details');
    details.className = 'manager-ready-help';
    details.dataset.managerReadyHelp = 'true';

    const summary = document.createElement('summary');
    summary.dataset.managerReadyHelpSummary = 'true';
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'manager-ready-help-body';
    body.dataset.managerReadyHelpBody = 'true';
    details.appendChild(body);

    const firstUse = section.querySelector('[data-manager-first-use]');
    const overview = section.querySelector('[data-feature-manager-overview]');
    if (firstUse instanceof HTMLElement) firstUse.after(details);
    else if (overview instanceof HTMLElement) overview.before(details);
    else section.prepend(details);
  }

  const summary = details.querySelector('[data-manager-ready-help-summary]');
  if (summary) summary.textContent = custom('Hilfe zum Conference Management', 'Conference Management help');

  const body = details.querySelector('[data-manager-ready-help-body]');
  if (!(body instanceof HTMLElement)) return;
  body.replaceChildren(
    helpStep(
      custom('1. Offene Anfragen zuerst', '1. Open requests first'),
      custom('Bearbeiten Sie zuerst Vorgänge mit „Zur Prüfung“ oder „In Prüfung“.', 'Start with items marked “Pending review” or “In review”.'),
    ),
    helpStep(
      custom('2. Anfrage und Raum getrennt lesen', '2. Read request and room separately'),
      custom('„Vorläufig reserviert“ hält den Raum frei; verbindlich wird er erst nach Ihrer Bestätigung.', '“Provisionally reserved” holds the room; it becomes binding only after your confirmation.'),
    ),
    helpStep(
      custom('3. Vollständig prüfen', '3. Review completely'),
      custom('Prüfen Sie Termin, Raum, Teilnehmende, Services, Catering, Anforderungen und Kosten.', 'Review schedule, room, participants, services, catering, requirements and costs.'),
    ),
    helpStep(
      custom('4. Entscheidung treffen', '4. Make a decision'),
      custom('Bestätigen Sie die Anfrage, fordern Sie eine Änderung an oder lehnen Sie mit Begründung ab.', 'Confirm the request, request a change or reject it with a reason.'),
    ),
  );
}

function ensureSecondaryFilterPanel(section) {
  const quick = section.querySelector('.manager-quick-filters');
  if (!(quick instanceof HTMLElement)) return;

  let details = section.querySelector('[data-manager-ready-secondary-filters]');
  if (!(details instanceof HTMLDetailsElement)) {
    details = document.createElement('details');
    details.className = 'manager-ready-secondary-filters';
    details.dataset.managerReadySecondaryFilters = 'true';

    const summary = document.createElement('summary');
    summary.dataset.managerReadySecondarySummary = 'true';
    details.appendChild(summary);

    const controls = document.createElement('div');
    controls.className = 'manager-ready-secondary-controls';
    controls.dataset.managerReadySecondaryControls = 'true';
    details.appendChild(controls);
    quick.after(details);
  }

  const controls = details.querySelector('[data-manager-ready-secondary-controls]');
  if (!(controls instanceof HTMLElement)) return;

  let activeSecondaryLabel = '';
  SECONDARY_FILTERS.forEach((filter) => {
    const source = quick.querySelector(`[data-quick-filter="${filter}"]`);
    if (!(source instanceof HTMLButtonElement)) return;

    let proxy = controls.querySelector(`[data-manager-ready-filter-proxy="${filter}"]`);
    if (!(proxy instanceof HTMLButtonElement)) {
      proxy = document.createElement('button');
      proxy.type = 'button';
      proxy.className = 'secondary';
      proxy.dataset.managerReadyFilterProxy = filter;
      proxy.addEventListener('click', () => {
        source.click();
        if (mobileMedia.matches) details.open = false;
        scheduleSync();
      });
      controls.appendChild(proxy);
    }

    proxy.textContent = source.textContent.trim();
    const pressed = source.getAttribute('aria-pressed') === 'true';
    proxy.setAttribute('aria-pressed', String(pressed));
    if (pressed) activeSecondaryLabel = proxy.textContent;
  });

  const summary = details.querySelector('[data-manager-ready-secondary-summary]');
  if (summary) {
    summary.textContent = activeSecondaryLabel
      ? custom(`Zeitraum: ${activeSecondaryLabel}`, `Period: ${activeSecondaryLabel}`)
      : custom('Weitere Zeiträume', 'More time periods');
  }
}

function markReady() {
  document.documentElement.dataset.conferenceManagerReadiness = 'ready';
  document.documentElement.dataset.conferenceManagerReadyBuild = CONFERENCE_MANAGER_READY_BUILD;
}

function sync() {
  ensureBookingsTabLabel();
  const section = managerBookingsSection();
  if (section) {
    ensurePersistentHelp(section);
    ensureSecondaryFilterPanel(section);
  }
  markReady();
}

['click', 'change', 'input'].forEach((eventName) => document.addEventListener(eventName, scheduleSync));
window.addEventListener('conference-language-changed', scheduleSync);
mobileMedia.addEventListener('change', scheduleSync);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
else scheduleSync();
window.addEventListener('load', scheduleSync, { once: true });
