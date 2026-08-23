import {
  captureEmployeeIdentityPresentation,
  decorateEmployeeParity,
  enhanceEmployeeAccessibilityPolish,
  enhanceEmployeeFirstUsePersonalization,
  enhanceEmployeeUx,
  openRichFloorplan,
  richPrint,
} from '../employee/index.js';
import {
  PARITY_RETURN_KEY,
  enhanceConferenceManagerReady,
  enhanceManager,
  enhanceManagerFinalPolish,
  enhanceManagerFirstUse,
  enhanceManagerOperationalUx,
  enhanceManagerResponsive,
  enhanceManagerUxPolish,
  ensureManagerTabIdentity,
  getAdminSection,
  handleManagerOperationalClick,
  handleManagerUxClick,
  managerTabControl,
  setAdminSection,
} from '../manager/index.js';
import { ensureParityCatalog } from '../shared/parity-data.js';
import { pt } from '../shared/parity-i18n.js';

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

  setAdminSection(restore.adminSection || getAdminSection());

  const managerNav = document.querySelector('#primaryNavigation button[data-view="manager"]');
  if (!document.querySelector('.manager-tabs')) {
    if (managerNav instanceof HTMLButtonElement) {
      restoreInProgress = true;
      managerNav.click();
      requestAnimationFrame(() => { restoreInProgress = false; scheduleSync(); });
    }
    return;
  }

  ensureManagerTabIdentity();
  const adminTab = managerTabControl('ADMIN');
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

  if (!document.querySelector('.manager-tabs')) enhanceManagerFirstUse();
  ensureManagerTabIdentity();
  enhanceManager();
  ensureReportInsightsHeading();
  enhanceManagerResponsive();
  enhanceManagerFirstUse();
  enhanceManagerUxPolish();
  enhanceManagerOperationalUx();
  enhanceManagerFinalPolish();
  enhanceConferenceManagerReady();

  document.documentElement.dataset.featureParityBuild = '2026.08.23.72';
}

function handleFeatureClick(event) {
  if (!(event.target instanceof Element)) return;

  handleManagerUxClick(event);
  handleManagerOperationalClick(event);

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
    return;
  }

  scheduleSync();
}

document.addEventListener('click', handleFeatureClick, true);
['change', 'input'].forEach((eventName) => document.addEventListener(eventName, scheduleSync));
window.addEventListener('conference-language-changed', scheduleSync);
window.addEventListener('conference:manager-sync-request', scheduleSync);
window.addEventListener('resize', scheduleSync, { passive: true });
window.addEventListener('load', scheduleSync, { once: true });

ensureParityCatalog();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
else scheduleSync();
