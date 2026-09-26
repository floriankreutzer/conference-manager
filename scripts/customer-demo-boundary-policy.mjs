import { buildModuleGraph, isInside } from './module-graph.mjs';

const PRODUCTION_ENTRY = 'src/platform/production-bootstrap.js';
const DEMO_ENTRY = 'src/platform/demo-bootstrap.js';
const PREFERENCE_MODULE = 'src/core/preferences.js';
const SERVER_DRAFT_MODULE = 'src/employee/server-draft-store.js';
const DEMO_ONLY = Object.freeze([
  'src/platform/demo-bootstrap.js',
  'src/platform/demo-session.js',
  'src/platform/demo-security.js',
  'src/platform/demo-tenant-presentation-api.js',
]);
const BROWSER_STORAGE = /\b(?:localStorage|sessionStorage)\b/;
const RETIRED_BROWSER_AUTHORITY = /\b(?:requestRepository|notificationRepository|createDemoTenant|createDemoOrganization|createDemoLocation|createDemoCatalogue|createDemoBooking|createDemoCost|createDemoOnboarding)\b/;
const RETIRED_PATHS = Object.freeze([
  'src/core/catalog.js',
  'src/core/storage.js',
  'src/platform/identity-bootstrap.js',
  'src/platform/requester-attribution.js',
  'src/platform/feature-parity.js',
  'src/shared/notifications.js',
  'src/shared/parity-data.js',
  'src/shared/request-card.js',
  'src/employee/application.js',
  'src/employee/employee-accessibility-polish.js',
  'src/employee/employee-first-use-personalization.js',
  'src/employee/employee-ux-i18n.js',
  'src/employee/employee-ux.js',
  'src/employee/employee-visuals.js',
  'src/employee/parity-data.js',
  'src/employee/request-lifecycle.js',
  'src/employee/request-session.js',
  'src/employee/welcome-print.js',
  'src/manager/application.js',
  'src/manager/admin-parity.js',
  'src/manager/booking-lifecycle.js',
  'src/manager/conference-manager-ready.js',
  'src/manager/employee-visuals.js',
  'src/manager/manager-final-polish.js',
  'src/manager/manager-first-use.js',
  'src/manager/manager-operational-ux.js',
  'src/manager/manager-parity.js',
  'src/manager/manager-responsive.js',
  'src/manager/manager-tabs.js',
  'src/manager/manager-ux-polish.js',
  'src/manager/parity-data.js',
  'src/manager/parity-i18n.js',
  'src/manager/reporting.js',
  'src/manager/timeline-position.js',
]);

function reachable(graph, entry) {
  const visited = new Set();
  const visit = (file) => {
    if (visited.has(file)) return;
    visited.add(file);
    for (const dependency of graph.get(file) || []) visit(dependency);
  };
  if (graph.has(entry)) visit(entry);
  return visited;
}

function violation(file, message) {
  return `${file}: ${message}`;
}

export function customerDemoBoundaryViolations(sourceEntries) {
  const sources = sourceEntries instanceof Map ? sourceEntries : new Map(Object.entries(sourceEntries || {}));
  const { graph } = buildModuleGraph(sources);
  const violations = [];
  const productionReachable = reachable(graph, PRODUCTION_ENTRY);
  const demoReachable = reachable(graph, DEMO_ENTRY);

  for (const file of RETIRED_PATHS) {
    if (sources.has(file)) {
      violations.push(violation(file, 'Retired browser-authority or parallel-renderer source must not be reintroduced.'));
    }
  }

  for (const file of productionReachable) {
    if (DEMO_ONLY.includes(file) || /(?:^|\/)demo-(?:adapter|fixtures|onboarding|tenant|user)/.test(file)) {
      violations.push(violation(PRODUCTION_ENTRY, `Production reachability includes Demo module ${file}.`));
    }
  }

  for (const file of demoReachable) {
    const source = String(sources.get(file) || '');
    if (![PREFERENCE_MODULE, SERVER_DRAFT_MODULE].includes(file) && BROWSER_STORAGE.test(source)) {
      violations.push(violation(file, 'Customer Demo runtime must not use browser storage as business, Tenant, persona, permission or session authority.'));
    }
    if (RETIRED_PATHS.includes(file) || RETIRED_BROWSER_AUTHORITY.test(source)) {
      violations.push(violation(DEMO_ENTRY, `Customer Demo reachability includes retired browser authority ${file}.`));
    }
    if (file === PRODUCTION_ENTRY) {
      violations.push(violation(DEMO_ENTRY, 'Demo composition must not import the Production composition root.'));
    }
  }

  for (const [file, dependencies] of graph) {
    for (const dependency of dependencies) {
      if (file === PRODUCTION_ENTRY && DEMO_ONLY.includes(dependency)) {
        violations.push(violation(file, `Production code must not import Demo module ${dependency}.`));
      }
      if (file === DEMO_ENTRY && dependency === PRODUCTION_ENTRY) {
        violations.push(violation(file, 'Demo code must not import the Production composition root.'));
      }
      if (isInside(file, 'src/platform-admin') && isInside(dependency, 'src/platform/demo')) {
        violations.push(violation(file, 'Platform Admin must not import Customer Demo session authority.'));
      }
    }
  }

  return Object.freeze([...new Set(violations)].sort());
}
