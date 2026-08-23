import { language } from '../core/i18n.js';

const MANAGER_OPERATIONAL_UX_BUILD = '2026.08.23.68';
let syncFrame = 0;

const custom = (de, en) => (language() === 'en' ? en : de);

function managerBookingsSection() {
  const tabs = document.querySelector('.manager-tabs');
  const section = tabs?.nextElementSibling;
  if (!(section instanceof HTMLElement) || !section.querySelector('.manager-quick-filters')) return null;
  return section;
}

function scheduleSync() {
  cancelAnimationFrame(syncFrame);
  syncFrame = requestAnimationFrame(sync);
}

function scheduleSettledSync(rounds = 6) {
  let remaining = Math.max(1, Number(rounds) || 1);
  const settle = () => {
    scheduleSync();
    remaining -= 1;
    if (remaining > 0) requestAnimationFrame(settle);
  };
  requestAnimationFrame(settle);
}

function scheduleManagerSync() {
  if (!document.querySelector('.manager-tabs')) return;
  scheduleSettledSync();
}

function ensureTentativeQuickFilter(section) {
  const quick = section.querySelector('.manager-quick-filters');
  if (!(quick instanceof HTMLElement)) return;

  let control = section.querySelector('[data-quick-filter="TENTATIVE"]');
  if (!(control instanceof HTMLButtonElement)) {
    control = document.createElement('button');
    control.type = 'button';
    control.dataset.quickFilter = 'TENTATIVE';
    control.setAttribute('aria-pressed', 'false');
    control.addEventListener('click', () => {
      const kpi = section.querySelector('[data-overview-filter="TENTATIVE"]');
      if (kpi instanceof HTMLButtonElement) kpi.click();
      scheduleSettledSync();
    });

    const upcoming = quick.querySelector('[data-quick-filter="UPCOMING"]');
    quick.insertBefore(control, upcoming || quick.lastElementChild);
  }

  control.textContent = custom('Vorläufig reserviert', 'Provisionally reserved');
}

function reviewControl(requestId) {
  return [...document.querySelectorAll('[data-manager-review]')]
    .find((control) => control instanceof HTMLButtonElement && control.dataset.managerReview === requestId) || null;
}

function filterSnapshot(section) {
  if (!(section instanceof HTMLElement)) return null;
  const filters = section.querySelector('.manager-filters');
  const activeQuick = [...section.querySelectorAll('[data-quick-filter]')]
    .find((control) => control.getAttribute('aria-pressed') === 'true');
  return {
    quickFilter: activeQuick?.dataset.quickFilter || 'ALL',
    search: filters?.querySelector('input[type="search"]')?.value || '',
    selects: filters ? [...filters.querySelectorAll('select')].map((select) => select.value) : [],
    advancedOpen: section.querySelector('[data-manager-advanced-filters]')?.open === true,
  };
}

function restoreAdvancedFilterState(snapshot, rounds = 8) {
  if (!snapshot) return;
  let remaining = Math.max(1, Number(rounds) || 1);
  const settle = () => {
    const currentSection = managerBookingsSection();
    const advanced = currentSection?.querySelector('[data-manager-advanced-filters]');
    if (advanced instanceof HTMLDetailsElement && advanced.open !== snapshot.advancedOpen) {
      advanced.open = snapshot.advancedOpen;
    }
    remaining -= 1;
    if (remaining > 0) requestAnimationFrame(settle);
  };
  requestAnimationFrame(settle);
}

function restoreFilterSnapshot(section, snapshot) {
  const currentSection = managerBookingsSection() || section;
  if (!(currentSection instanceof HTMLElement) || !snapshot) return;
  const quick = currentSection.querySelector(`[data-quick-filter="${snapshot.quickFilter}"]`);
  if (quick instanceof HTMLButtonElement && quick.getAttribute('aria-pressed') !== 'true') quick.click();

  const filters = currentSection.querySelector('.manager-filters');
  if (filters instanceof HTMLFormElement) {
    const search = filters.querySelector('input[type="search"]');
    if (search instanceof HTMLInputElement && search.value !== snapshot.search) {
      search.value = snapshot.search;
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    [...filters.querySelectorAll('select')].forEach((select, index) => {
      const value = snapshot.selects[index];
      if (value !== undefined && select.value !== value) {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  const advanced = currentSection.querySelector('[data-manager-advanced-filters]');
  if (advanced instanceof HTMLDetailsElement) advanced.open = snapshot.advancedOpen;
  scheduleSettledSync();
  restoreAdvancedFilterState(snapshot);
}

function clearOneBlockingFilter(section) {
  if (!(section instanceof HTMLElement)) return false;

  const allQuick = section.querySelector('[data-quick-filter="ALL"]');
  if (allQuick instanceof HTMLButtonElement && allQuick.getAttribute('aria-pressed') !== 'true') {
    allQuick.click();
    return true;
  }

  const filters = section.querySelector('.manager-filters');
  if (!(filters instanceof HTMLFormElement)) return false;

  const search = filters.querySelector('input[type="search"]');
  if (search instanceof HTMLInputElement && search.value) {
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  const changedSelect = [...filters.querySelectorAll('select')]
    .find((select) => select.value !== 'ALL');
  if (changedSelect instanceof HTMLSelectElement) {
    changedSelect.value = 'ALL';
    changedSelect.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  return false;
}

function openRequestReview(requestId, attempts = 18, snapshot = null) {
  const section = managerBookingsSection();
  const preserved = snapshot || filterSnapshot(section);
  const review = reviewControl(requestId);
  if (review) {
    review.click();
    requestAnimationFrame(() => restoreFilterSnapshot(managerBookingsSection(), preserved));
    return;
  }

  if (attempts <= 0) {
    restoreFilterSnapshot(section, preserved);
    return;
  }
  clearOneBlockingFilter(section);
  requestAnimationFrame(() => openRequestReview(requestId, attempts - 1, preserved));
}

function handleOverviewOpen(event) {
  if (!(event.target instanceof Element)) return;
  const control = event.target.closest('[data-manager-open]');
  if (!(control instanceof HTMLButtonElement)) return;

  const requestId = String(control.dataset.managerOpen || '').trim();
  if (!requestId) return;

  event.preventDefault();
  event.stopPropagation();
  openRequestReview(requestId);
}

function sync() {
  const section = managerBookingsSection();
  if (!section) return;
  ensureTentativeQuickFilter(section);
  document.documentElement.dataset.managerOperationalUxBuild = MANAGER_OPERATIONAL_UX_BUILD;
}

document.addEventListener('click', handleOverviewOpen, true);
document.addEventListener('click', scheduleManagerSync);
['change', 'input'].forEach((eventName) => document.addEventListener(eventName, scheduleManagerSync));
window.addEventListener('conference-language-changed', scheduleManagerSync);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleSettledSync, { once: true });
else scheduleSettledSync();
window.addEventListener('load', scheduleSettledSync, { once: true });
