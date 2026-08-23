import { language } from '../core/i18n.js';

const MANAGER_OPERATIONAL_UX_BUILD = '2026.08.23.63';
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

  let control = quick.querySelector('[data-quick-filter="TENTATIVE"]');
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

function openRequestReview(requestId, attempts = 18) {
  const review = reviewControl(requestId);
  if (review) {
    review.click();
    return;
  }

  if (attempts <= 0) return;
  clearOneBlockingFilter(managerBookingsSection());
  requestAnimationFrame(() => openRequestReview(requestId, attempts - 1));
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
