import { t } from '../core/i18n.js';
import { decorateEmployeeParity, openRichFloorplan } from './employee-visuals.js';
import { enhanceEmployeeUx } from './employee-ux.js?v=20260823-02';
import { enhanceEmployeeAccessibilityPolish } from './employee-accessibility-polish.js?v=20260823-04';
import { captureEmployeeIdentityPresentation, enhanceEmployeeFirstUsePersonalization } from './employee-first-use-personalization.js?v=20260823-03';
import { PARITY_RETURN_KEY, getAdminSection, setAdminSection } from './admin-parity.js';
import { pt } from './parity-i18n.js';
import { ensureParityCatalog } from './parity-data.js';
import { enhanceManager } from './manager-parity.js';
import { enhanceManagerResponsive } from './manager-responsive.js?v=20260823-45';
import { richPrint } from './welcome-print.js';

let syncFrame = 0;
let restoreInProgress = false;
const initialReturnMarker = sessionStorage.getItem(PARITY_RETURN_KEY);

function scheduleSync() {
  if (syncFrame) return;
  syncFrame = requestAnimationFrame(() => {
    syncFrame = 0;
    sync();
  });
}

function restoreManagerPosition() {
  if (restoreInProgress) return;
  const raw = sessionStorage.getItem(PARITY_RETURN_KEY);
  if (!raw || raw !== initialReturnMarker) return;
  let restore;
  try { restore = JSON.parse(raw); } catch {
    sessionStorage.removeItem(PARITY_RETURN_KEY);
    return;
  }

  // Apply the nested admin section before opening the Manager/Admin views so
  // the first enhanced render already uses the correct editor.
  setAdminSection(restore.adminSection || getAdminSection());

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

  sessionStorage.removeItem(PARITY_RETURN_KEY);
  scheduleSync();
}

function ensureReportInsightsHeading() {
  const report = document.querySelector('[data-feature-parity="reports"]');
  const insights = report?.querySelector('.report-insights');
  if (!report || !insights) return;

  let heading = report.querySelector('[data-report-insights-heading]');
  if (!heading) {
    heading = document.createElement('h3');
    heading.id = 'reportInsightsHeading';
    heading.dataset.reportInsightsHeading = 'true';
    insights.before(heading);
  }
  heading.textContent = pt('parity.report.insights');
  insights.setAttribute('aria-labelledby', heading.id);
}

function sync() {
  restoreManagerPosition();
  decorateEmployeeParity();
  enhanceEmployeeUx();
  captureEmployeeIdentityPresentation();
  enhanceEmployeeAccessibilityPolish();
  enhanceEmployeeFirstUsePersonalization();
  enhanceManager();
  ensureReportInsightsHeading();
  enhanceManagerResponsive();
  document.documentElement.dataset.featureParityBuild = '2026.08.23.46';
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
