import { decorateEmployeeParity, openRichFloorplan } from './employee-visuals.js';
import { enhanceEmployeeUx } from './employee-ux.js?v=20260823-02';
import { enhanceEmployeeAccessibilityPolish } from './employee-accessibility-polish.js?v=20260823-05';
import { captureEmployeeIdentityPresentation, enhanceEmployeeFirstUsePersonalization } from './employee-first-use-personalization.js?v=20260823-03';
import { PARITY_RETURN_KEY, getAdminSection, setAdminSection } from './admin-parity.js';
import { pt } from './parity-i18n.js';
import { ensureParityCatalog } from './parity-data.js';
import { enhanceManager } from './manager-parity.js';
import { enhanceManagerResponsive } from './manager-responsive.js?v=20260823-45';
import { enhanceManagerFirstUse } from './manager-first-use.js';
import { enhanceManagerUxPolish, handleManagerUxClick } from './manager-ux-polish.js';
import { enhanceManagerOperationalUx, handleManagerOperationalClick } from './manager-operational-ux.js';
import { enhanceManagerFinalPolish } from './manager-final-polish.js';
import { enhanceConferenceManagerReady } from './conference-manager-ready.js';
import { ensureManagerTabIdentity, managerTabControl } from './manager-tabs.js';
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

  document.documentElement.dataset.featureParityBuild = '2026.08.23.47';
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
