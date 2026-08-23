import { language } from '../core/i18n.js';
import { requestData } from './parity-data.js';

const MOBILE_QUERY = '(max-width: 760px)';
const mobileMedia = window.matchMedia(MOBILE_QUERY);
let syncFrame = 0;
let resetFrame = 0;

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

function clarifyManagerNavigation() {
  const managerNav = document.querySelector('#primaryNavigation button[data-view="manager"]');
  if (!(managerNav instanceof HTMLButtonElement)) return;
  managerNav.textContent = custom('Conference Management', 'Conference Management');
  const personalNav = document.querySelector('#primaryNavigation button[data-view="requests"]');
  if (personalNav instanceof HTMLButtonElement) personalNav.textContent = custom('Meine Buchungen', 'My bookings');
}

function compactFirstUseGuide(section) {
  const guide = section.querySelector('[data-manager-first-use]');
  if (!(guide instanceof HTMLElement)) return;
  const content = guide.querySelector('.manager-first-use-content');
  const description = content?.querySelector(':scope > p');
  if (description) {
    description.textContent = custom(
      'Starten Sie mit offenen Anfragen. Prüfen Sie die Angaben vollständig und treffen Sie anschließend Ihre Entscheidung.',
      'Start with open requests. Review the information completely and then make your decision.',
    );
  }

  const steps = guide.querySelector('.manager-first-use-steps');
  if (!(steps instanceof HTMLElement)) return;
  const firstStep = steps.querySelector('span');
  if (firstStep) firstStep.textContent = custom('1. Offene Anfragen priorisieren', '1. Prioritise open requests');
  if (steps.closest('.manager-first-use-how')) return;

  const details = document.createElement('details');
  details.className = 'manager-first-use-how';
  details.open = !mobileMedia.matches;
  const summary = document.createElement('summary');
  summary.textContent = custom('So funktioniert es', 'How it works');
  steps.before(details);
  details.append(summary, steps);
}

function clarifyOverviewWording(section) {
  const actionKpiLabel = section.querySelector('[data-overview-filter="ACTION"] span');
  if (actionKpiLabel) actionKpiLabel.textContent = custom('Offene Anfragen', 'Open requests');

  const actionQuickFilter = section.querySelector('[data-quick-filter="ACTION"]');
  if (actionQuickFilter instanceof HTMLButtonElement) actionQuickFilter.textContent = custom('Offene Anfragen', 'Open requests');

  const actionCard = section.querySelector('.manager-overview-columns .manager-overview-card:first-child');
  const heading = actionCard?.querySelector('h3');
  if (heading) heading.textContent = custom('Jetzt prüfen', 'Review now');

  const empty = actionCard?.querySelector('p.muted');
  if (empty && !actionCard.querySelector('.manager-overview-row')) {
    empty.textContent = custom('Keine offenen Anfragen.', 'No open requests.');
  }
}

function advancedFilterElements(section) {
  const filters = section.querySelector('.manager-filters');
  if (!(filters instanceof HTMLFormElement)) return { filters: null, search: null, selects: [] };
  const search = filters.querySelector('input[type="search"]');
  const selects = [...filters.querySelectorAll('select')];
  return { filters, search, selects };
}

function activeFilterDescriptors(section) {
  const descriptors = [];
  const requestsExist = requestData().length > 0;
  const quick = [...section.querySelectorAll('[data-quick-filter]')]
    .find((control) => control.getAttribute('aria-pressed') === 'true');
  if (requestsExist && quick instanceof HTMLButtonElement && quick.dataset.quickFilter !== 'ALL') {
    descriptors.push(quick.textContent.trim());
  }

  const { search, selects } = advancedFilterElements(section);
  if (search instanceof HTMLInputElement && search.value.trim()) {
    descriptors.push(custom(`Suche: ${search.value.trim()}`, `Search: ${search.value.trim()}`));
  }
  selects.forEach((select, index) => {
    if (select.value === 'ALL') return;
    const selectedText = select.selectedOptions[0]?.textContent?.trim() || select.value;
    descriptors.push(index === 0
      ? custom(`Status: ${selectedText}`, `Status: ${selectedText}`)
      : custom(`Standort: ${selectedText}`, `Location: ${selectedText}`));
  });
  return descriptors;
}

function resetAllFilters() {
  cancelAnimationFrame(resetFrame);
  const section = managerBookingsSection();
  if (!section) return;

  const allQuick = section.querySelector('[data-quick-filter="ALL"]');
  if (allQuick instanceof HTMLButtonElement && allQuick.getAttribute('aria-pressed') !== 'true') allQuick.click();

  const { search, selects } = advancedFilterElements(section);
  if (search instanceof HTMLInputElement && search.value) {
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    resetFrame = requestAnimationFrame(resetAllFilters);
    return;
  }

  const changedSelect = selects.find((select) => select.value !== 'ALL');
  if (changedSelect) {
    changedSelect.value = 'ALL';
    changedSelect.dispatchEvent(new Event('change', { bubbles: true }));
    resetFrame = requestAnimationFrame(resetAllFilters);
    return;
  }

  const advanced = section.querySelector('[data-manager-advanced-filters]');
  if (advanced instanceof HTMLDetailsElement) advanced.open = false;
  scheduleSync();
}

function updateAdvancedFilterSummary(section) {
  const details = section.querySelector('[data-manager-advanced-filters]');
  if (!(details instanceof HTMLDetailsElement)) return;
  const summaryHint = details.querySelector('summary span');
  if (!summaryHint) return;
  const { search, selects } = advancedFilterElements(section);
  const count = Number(Boolean(search instanceof HTMLInputElement && search.value.trim()))
    + selects.filter((select) => select.value !== 'ALL').length;
  summaryHint.textContent = count
    ? custom(`${count} Filter aktiv`, `${count} filter${count === 1 ? '' : 's'} active`)
    : custom('Suche, Status und Standort', 'Search, status and location');
}

function renderActiveFilters(section) {
  const quickFilters = section.querySelector('.manager-quick-filters');
  if (!(quickFilters instanceof HTMLElement)) return;
  const descriptors = activeFilterDescriptors(section);
  let bar = section.querySelector('[data-manager-active-filters]');

  if (!descriptors.length) {
    bar?.remove();
    section.querySelector('[data-manager-filter-empty]')?.remove();
    return;
  }

  if (!(bar instanceof HTMLElement)) {
    bar = document.createElement('section');
    bar.className = 'manager-active-filters';
    bar.dataset.managerActiveFilters = 'true';
    bar.setAttribute('aria-live', 'polite');

    const copy = document.createElement('div');
    copy.className = 'manager-active-filter-copy';
    const label = document.createElement('strong');
    label.textContent = custom('Aktive Filter', 'Active filters');
    const value = document.createElement('span');
    value.dataset.managerActiveFilterText = 'true';
    copy.append(label, value);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'secondary';
    reset.textContent = custom('Alle Filter zurücksetzen', 'Reset all filters');
    reset.dataset.managerResetFilters = 'true';
    reset.addEventListener('click', resetAllFilters);
    bar.append(copy, reset);
    quickFilters.after(bar);
  }

  const value = bar.querySelector('[data-manager-active-filter-text]');
  if (value) value.textContent = descriptors.join(' · ');

  const cards = [...section.querySelectorAll('.request-card')];
  const visibleCards = cards.filter((card) => !card.classList.contains('feature-filter-hidden'));
  let empty = section.querySelector('[data-manager-filter-empty]');
  if (cards.length > 0 && visibleCards.length === 0) {
    if (!(empty instanceof HTMLElement)) {
      empty = document.createElement('p');
      empty.className = 'info-box manager-filter-empty';
      empty.dataset.managerFilterEmpty = 'true';
      bar.after(empty);
    }
    empty.textContent = custom('Keine Buchungen passen zu den aktuellen Filtern.', 'No bookings match the current filters.');
  } else {
    empty?.remove();
  }

  if (cards.length === 0) {
    const baseEmpty = [...section.querySelectorAll(':scope > .info-box')]
      .find((node) => !node.matches('[data-manager-filter-empty]'));
    const hasAdvancedFilter = descriptors.some((descriptor) => descriptor.includes(':'));
    if (baseEmpty && hasAdvancedFilter) {
      baseEmpty.textContent = custom('Keine Buchungen passen zu den aktuellen Filtern.', 'No bookings match the current filters.');
    }
  }
}

function markCardTimelines(section) {
  section.querySelectorAll('.request-card .request-timeline').forEach((timeline) => {
    timeline.classList.add('manager-card-timeline');
  });
}

function patchRequester(dialog, requestId) {
  const request = requestData().find((entry) => entry.id === requestId);
  const requesterName = String(request?.requesterName || '').trim();
  const requesterLabel = custom('Anfragende Person', 'Requester');
  const row = [...dialog.querySelectorAll('.manager-detail-list > div')]
    .find((entry) => entry.querySelector('dt')?.textContent?.trim() === requesterLabel);
  if (!row) return;
  const value = row.querySelector('dd');
  if (value) value.textContent = requesterName || custom('Nicht in der Anfrage gespeichert', 'Not stored in the request');

  const eventSection = row.closest('.manager-detail-section');
  eventSection?.querySelectorAll('.manager-detail-note').forEach((note) => note.remove());
  if (!requesterName && eventSection) {
    const note = document.createElement('small');
    note.className = 'manager-detail-note';
    note.textContent = custom(
      'Für diese Anfrage wurde keine anfragende Person gespeichert.',
      'No requester was stored for this request.',
    );
    eventSection.appendChild(note);
  }
}

function appendHistoryToReview(dialog, timeline) {
  if (!(timeline instanceof HTMLElement) || dialog.querySelector('[data-manager-review-history]')) return;
  const grid = dialog.querySelector('.manager-detail-grid');
  if (!(grid instanceof HTMLElement)) return;
  const history = timeline.cloneNode(true);
  history.classList.remove('manager-card-timeline');
  history.classList.add('manager-review-history');
  history.dataset.managerReviewHistory = 'true';
  grid.appendChild(history);
}

function patchReviewDialog(requestId, timeline) {
  const dialog = document.querySelector('dialog.manager-review-dialog');
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return;
  patchRequester(dialog, requestId);
  appendHistoryToReview(dialog, timeline);
}

function patchConfirmationDialog() {
  const dialog = document.querySelector('dialog.manager-confirm-dialog');
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return;
  const description = dialog.querySelector('.modal-header p');
  if (description) {
    description.textContent = custom(
      'Mit der Bestätigung wird die Anfrage bestätigt und der Raum verbindlich als belegt geführt.',
      'Confirming approves the request and marks the room as bindingly occupied.',
    );
  }
}

function handleClick(event) {
  if (!(event.target instanceof Element)) return;
  const review = event.target.closest('[data-manager-review]');
  if (review instanceof HTMLButtonElement) {
    const card = review.closest('.request-card');
    const timeline = card?.querySelector('.request-timeline');
    const requestId = review.dataset.managerReview || '';
    requestAnimationFrame(() => patchReviewDialog(requestId, timeline));
  }

  if (event.target.closest('[data-manager-confirm-from-review]')) {
    requestAnimationFrame(patchConfirmationDialog);
  }
  scheduleSync();
}

function sync() {
  clarifyManagerNavigation();
  const section = managerBookingsSection();
  if (!section) return;
  compactFirstUseGuide(section);
  clarifyOverviewWording(section);
  updateAdvancedFilterSummary(section);
  renderActiveFilters(section);
  markCardTimelines(section);
  document.documentElement.dataset.managerUxPolishBuild = '2026.08.23.60';
}

document.addEventListener('click', handleClick);
['change', 'input'].forEach((eventName) => document.addEventListener(eventName, scheduleSync));
window.addEventListener('conference-language-changed', scheduleSync);
mobileMedia.addEventListener('change', scheduleSync);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
else scheduleSync();
