import { t } from '../core/i18n.js';
import { managerTabControl } from './manager-tabs.js';

const CONFERENCE_MANAGER_READY_BUILD = '2026.08.23.69';
const MOBILE_QUERY = '(max-width: 760px)';
const SECONDARY_FILTERS = ['7D', 'UPCOMING'];

function requestManagerSync() {
  requestAnimationFrame(() => window.dispatchEvent(new Event('conference:manager-sync-request')));
}

function isMobile() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function managerBookingsSection() {
  const tabs = document.querySelector('.manager-tabs');
  const section = tabs?.nextElementSibling;
  if (!(section instanceof HTMLElement) || !section.querySelector('.manager-quick-filters')) return null;
  return section;
}

function ensureBookingsTabLabel() {
  const control = managerTabControl('BOOKINGS');
  if (!(control instanceof HTMLButtonElement)) return;
  control.dataset.managerReadyBookingsTab = 'true';
  const label = t('manager.ready.bookingsTab');
  control.textContent = label;
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
  if (summary) summary.textContent = t('manager.ready.helpTitle');

  const body = details.querySelector('[data-manager-ready-help-body]');
  if (!(body instanceof HTMLElement)) return;
  body.replaceChildren(
    helpStep(t('manager.ready.help1Title'), t('manager.ready.help1Text')),
    helpStep(t('manager.ready.help2Title'), t('manager.ready.help2Text')),
    helpStep(t('manager.ready.help3Title'), t('manager.ready.help3Text')),
    helpStep(t('manager.ready.help4Title'), t('manager.ready.help4Text')),
  );
}

function ensureSecondaryFilterPanel(section) {
  const quick = section.querySelector('.manager-quick-filters');
  if (!(quick instanceof HTMLElement)) return null;

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
  return details;
}

function bindSecondaryClose(control, details) {
  if (!(control instanceof HTMLButtonElement) || control.dataset.managerReadySecondaryBound === 'true') return;
  control.dataset.managerReadySecondaryBound = 'true';
  control.addEventListener('click', () => {
    if (isMobile() && control.closest('[data-manager-ready-secondary-filters]')) details.open = false;
    requestManagerSync();
  });
}

function placeSecondaryFilters(section) {
  const quick = section.querySelector('.manager-quick-filters');
  const details = ensureSecondaryFilterPanel(section);
  const controls = details?.querySelector('[data-manager-ready-secondary-controls]');
  if (!(quick instanceof HTMLElement) || !(details instanceof HTMLDetailsElement) || !(controls instanceof HTMLElement)) return;

  const secondary = SECONDARY_FILTERS
    .map((filter) => section.querySelector(`[data-quick-filter="${filter}"]`))
    .filter((control) => control instanceof HTMLButtonElement);

  secondary.forEach((control) => bindSecondaryClose(control, details));

  if (isMobile()) {
    secondary.forEach((control) => controls.appendChild(control));
  } else {
    const tentative = quick.querySelector('[data-quick-filter="TENTATIVE"]');
    const all = quick.querySelector('[data-quick-filter="ALL"]');
    const sevenDays = secondary.find((control) => control.dataset.quickFilter === '7D');
    const upcoming = secondary.find((control) => control.dataset.quickFilter === 'UPCOMING');
    if (sevenDays) quick.insertBefore(sevenDays, tentative || all || null);
    if (upcoming) quick.insertBefore(upcoming, all || null);
    details.open = false;
  }

  const active = secondary.find((control) => control.getAttribute('aria-pressed') === 'true');
  const summary = details.querySelector('[data-manager-ready-secondary-summary]');
  if (summary) {
    summary.textContent = active
      ? t('manager.ready.periodActive', { value: active.textContent.trim() })
      : t('manager.ready.morePeriods');
  }
}

function markReady() {
  document.documentElement.dataset.conferenceManagerReadiness = 'ready';
  document.documentElement.dataset.conferenceManagerReadyBuild = CONFERENCE_MANAGER_READY_BUILD;
}

export function enhanceConferenceManagerReady() {
  ensureBookingsTabLabel();
  const section = managerBookingsSection();
  if (section) {
    ensurePersistentHelp(section);
    placeSecondaryFilters(section);
  }
  markReady();
}
