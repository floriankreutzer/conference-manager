import { buildModuleGraph, isInside } from './module-graph.mjs';

const PLATFORM_ADMIN_ROOT = 'src/platform-admin';
const PRODUCTION_ROOT = `${PLATFORM_ADMIN_ROOT}/production`;
const DEMO_ROOT = `${PLATFORM_ADMIN_ROOT}/demo`;
const CUSTOMER_CAPABILITY_ROOTS = Object.freeze([
  'src/employee',
  'src/manager',
  'src/tenant-admin',
  'src/platform',
  'src/shared',
]);
const DIRECT_NETWORK_AUTHORITY = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/;
const API_CLIENT_FACTORY = /\bcreateApiClient\b/;
const BROWSER_STORAGE = /\b(?:localStorage|sessionStorage)\b/;
const RETIRED_DEMO_AUTHORITY = /\b(?:platform_admin_demo_v1|createPlatformAdminDemoStore|createPlatformAdminDemoAdapter)\b/;

function violation(file, message) {
  return `${file}: ${message}`;
}

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

export function platformAdminBoundaryViolations(sourceEntries) {
  const sources = sourceEntries instanceof Map ? sourceEntries : new Map(Object.entries(sourceEntries || {}));
  const { graph } = buildModuleGraph(sources);
  const violations = [];

  for (const [file, sourceValue] of sources) {
    const source = String(sourceValue);
    if (isInside(file, DEMO_ROOT) && DIRECT_NETWORK_AUTHORITY.test(source)) {
      violations.push(violation(file, 'Demo modules must use the approved same-origin API client, never direct network authority.'));
    }
    if (
      isInside(file, DEMO_ROOT)
      && file !== `${DEMO_ROOT}/bootstrap.js`
      && API_CLIENT_FACTORY.test(source)
    ) {
      violations.push(violation(file, 'Only the Demo Composition Root may construct the approved API client.'));
    }
    if (isInside(file, PRODUCTION_ROOT) && BROWSER_STORAGE.test(source)) {
      violations.push(violation(file, 'Production Platform Admin modules must not use browser storage as authority.'));
    }
    if (isInside(file, PLATFORM_ADMIN_ROOT) && BROWSER_STORAGE.test(source)) {
      violations.push(violation(file, 'Platform Admin modules must not use browser storage as business or session authority.'));
    }
    if (isInside(file, PLATFORM_ADMIN_ROOT) && RETIRED_DEMO_AUTHORITY.test(source)) {
      violations.push(violation(file, 'Retired browser-owned Platform Demo authority is forbidden.'));
    }
  }

  for (const [file, dependencies] of graph) {
    for (const dependency of dependencies) {
      if (!isInside(file, PLATFORM_ADMIN_ROOT) && isInside(dependency, PLATFORM_ADMIN_ROOT)) {
        violations.push(violation(file, 'Customer and Tenant Admin graphs must not import Platform Admin authority.'));
      }
      if (isInside(file, PLATFORM_ADMIN_ROOT)
        && CUSTOMER_CAPABILITY_ROOTS.some((root) => isInside(dependency, root))) {
        violations.push(violation(file, `Platform Admin must not depend on customer capability ${dependency}.`));
      }
      if (isInside(file, PRODUCTION_ROOT) && isInside(dependency, DEMO_ROOT)) {
        violations.push(violation(file, `Production code must not import Demo module ${dependency}.`));
      }
      if (isInside(file, DEMO_ROOT) && isInside(dependency, PRODUCTION_ROOT)) {
        violations.push(violation(file, `Demo code must not import Production module ${dependency}.`));
      }
      if (isInside(file, PLATFORM_ADMIN_ROOT)
        && !isInside(file, PRODUCTION_ROOT)
        && !isInside(file, DEMO_ROOT)
        && (isInside(dependency, PRODUCTION_ROOT) || isInside(dependency, DEMO_ROOT))) {
        violations.push(violation(file, 'Shared Platform Admin capability code must not select a runtime adapter.'));
      }
    }
  }

  const productionEntry = `${PRODUCTION_ROOT}/bootstrap.js`;
  const demoEntry = `${DEMO_ROOT}/bootstrap.js`;
  for (const file of reachable(graph, productionEntry)) {
    if (isInside(file, DEMO_ROOT)) {
      violations.push(violation(productionEntry, `Production reachability includes Demo module ${file}.`));
    }
  }
  for (const file of reachable(graph, demoEntry)) {
    if (isInside(file, PRODUCTION_ROOT)) {
      violations.push(violation(demoEntry, `Demo reachability includes Production module ${file}.`));
    }
  }

  return Object.freeze([...new Set(violations)].sort());
}
