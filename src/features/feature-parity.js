import { t } from '../core/i18n.js';
import { decorateEmployeeParity, openRichFloorplan } from './employee-visuals.js';
import { PARITY_RETURN_KEY, getAdminSection, setAdminSection } from './admin-parity.js';
import { ensureParityCatalog } from './parity-data.js';
import { enhanceManager } from './manager-parity.js';
import { richPrint } from './welcome-print.js';

let syncFrame = 0;
let restoreInProgress = false;

function scheduleSync() {
  cancelAnimationFrame(syncFrame);
  syncFrame = requestAnimationFrame(sync);
}

function restoreManagerPosition() {
  if (restoreInProgress) return;
  const raw = sessionStorage.getItem(PARITY_RETURN_KEY);
  if (!raw) return;
  let restore;
  try { restore = JSON.parse(raw); } catch {
    sessionStorage.removeItem(PARITY_RETURN_KEY);
    return;
  }

  const managerNav = [...document.querySelectorAll('#primaryNavigation button')]
    .find((control) => control.textContent.trim().includes(t('nav.manager')));
  if (!document.querySelector('.manager-tabs')) {
    if (managerNav) {
      restoreInProgress = true;
      managerNav.click();
      requestAnimationFrame(() => { restoreInProgress = false; scheduleSync(); });
    }
    return;
  }

  const adminTab = [...document.querySelectorAll('.manager-tabs button')]
    .find((control) => control.textContent.trim() === t('manager.admin'));
  if (restore.managerTab === 'ADMIN' && adminTab?.getAttribute('aria-pressed') !== 'true') {
    restoreInProgress = true;
    adminTab?.click();
    requestAnimationFrame(() => { restoreInProgress = false; scheduleSync(); });
    return;
  }

  setAdminSection(restore.adminSection || getAdminSection());
  sessionStorage.removeItem(PARITY_RETURN_KEY);
  scheduleSync();
}

function sync() {
  restoreManagerPosition();
  decorateEmployeeParity();
  enhanceManager();
  document.documentElement.dataset.featureParityBuild = '2026.08.22.41';
}

document.addEventListener('click', (event) => {
  const floorplan = event.target.closest('[data-feature-floorplan]');
  if (floorplan) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openRichFloorplan(floorplan.dataset.featureFloorplan);
    return;
  }
  const pdf = event.target.closest('[data-feature-pdf]');
  if (pdf) {
    event.preventDefault();
    event.stopImmediatePropagation();
    richPrint(pdf.dataset.featurePdf);
  }
}, true);

['click', 'change', 'input'].forEach((eventName) => document.addEventListener(eventName, scheduleSync));
ensureParityCatalog();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
else scheduleSync();
