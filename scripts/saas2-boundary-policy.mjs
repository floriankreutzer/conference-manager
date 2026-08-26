import { buildModuleGraph, findModuleCycles, isInside } from './module-graph.mjs';

const TENANT_ADMIN_ROOT = 'src/tenant-admin';
const TENANT_ADMIN_SECTIONS_ROOT = `${TENANT_ADMIN_ROOT}/sections`;
const PLATFORM_ROOT = 'src/platform';
const EMPLOYEE_ROOT = 'src/employee';
const MANAGER_ROOT = 'src/manager';
const GENERIC_DUMPING_GROUNDS = new Set([
  'common.js',
  'helpers.js',
  'utils.js',
  'common',
  'helpers',
  'utils',
]);
const APPROVED_SECTION_IDS = new Set([
  'organization',
  'locations',
  'catalog',
  'booking-policies',
  'cost-allocation',
  'users',
  'microsoft365',
  'capabilities',
  'audit',
]);

function normalized(file) {
  return String(file).replaceAll('\\', '/');
}

function basename(file) {
  return normalized(file).split('/').at(-1);
}

function pathSegments(file) {
  return normalized(file).split('/');
}

function semanticModuleName(segment) {
  return String(segment).endsWith('.js') ? String(segment).slice(0, -3) : String(segment);
}

function sectionIdentity(file) {
  const match = normalized(file).match(/^src\/tenant-admin\/sections\/([^/]+)\//);
  return match?.[1] || null;
}

function isDemoModule(file) {
  return pathSegments(file)
    .map(semanticModuleName)
    .some((segment) => segment === 'demo' || segment.startsWith('demo-'));
}

function isProductionModule(file) {
  return pathSegments(file)
    .map(semanticModuleName)
    .some((segment) => segment === 'production' || segment.startsWith('production-'));
}

function violation(file, message) {
  return `${file}: ${message}`;
}

export function frontendSaas2BoundaryViolations(sourceEntries) {
  const sources = sourceEntries instanceof Map ? sourceEntries : new Map(Object.entries(sourceEntries || {}));
  const { graph, unresolved } = buildModuleGraph(sources);
  const violations = [];

  for (const { file, specifier } of unresolved) {
    violations.push(violation(file, `relative dependency ${specifier} cannot be resolved.`));
  }
  for (const cycle of findModuleCycles(graph)) {
    violations.push(`Source import cycle is forbidden: ${cycle.join(' -> ')}`);
  }

  for (const [rawFile, rawSource] of sources) {
    const file = normalized(rawFile);
    const source = String(rawSource);
    const genericSegment = pathSegments(file).find((segment) => GENERIC_DUMPING_GROUNDS.has(segment));
    if (genericSegment) {
      violations.push(violation(file, `generic dumping-ground module or directory ${genericSegment} is forbidden.`));
    }

    const section = sectionIdentity(file);
    if (section && !APPROVED_SECTION_IDS.has(section)) {
      violations.push(violation(file, `Tenant Admin section ${section} is not part of the approved settings information architecture.`));
    }
    if (section && basename(file) !== 'index.js') {
      const indexPath = `${TENANT_ADMIN_SECTIONS_ROOT}/${section}/index.js`;
      if (!sources.has(indexPath)) {
        violations.push(violation(file, `Tenant Admin section ${section} must expose an explicit index.js public contract.`));
      }
    }

    if (file.endsWith('/settings-shell.js') || file.endsWith('/section-registry.js')) {
      for (const forbidden of ['fetch(', 'localStorage', 'sessionStorage']) {
        if (source.includes(forbidden)) {
          violations.push(violation(file, `settings composition must not own transport or browser authority (${forbidden}).`));
        }
      }
    }
  }

  for (const [sourceFile, dependencies] of graph) {
    const sourceSection = sectionIdentity(sourceFile);
    for (const dependency of dependencies) {
      const targetSection = sectionIdentity(dependency);

      if (targetSection && sourceSection !== targetSection) {
        const targetIndex = `${TENANT_ADMIN_SECTIONS_ROOT}/${targetSection}/index.js`;
        if (dependency !== targetIndex) {
          violations.push(violation(sourceFile, `Tenant Admin section internals are private; import ${targetIndex} instead of ${dependency}.`));
        }
        if (sourceSection) {
          violations.push(violation(sourceFile, 'Tenant Admin sections must not depend on another section; collaborate through an injected public contract.'));
        }
      }

      if (sourceSection && isInside(dependency, PLATFORM_ROOT)) {
        violations.push(violation(sourceFile, 'Tenant Admin sections must receive Platform adapters by injection and may not import Platform directly.'));
      }
      if (sourceSection && (isInside(dependency, EMPLOYEE_ROOT) || isInside(dependency, MANAGER_ROOT))) {
        violations.push(violation(sourceFile, 'Tenant Admin sections must not depend on Employee or Conference Manager capabilities.'));
      }
      if ((sourceFile.endsWith('/settings-shell.js') || sourceFile.endsWith('/section-registry.js'))
        && (isInside(dependency, PLATFORM_ROOT) || isDemoModule(dependency) || isProductionModule(dependency))) {
        violations.push(violation(sourceFile, 'settings shell and registry may compose section contracts only; adapter selection belongs to the Composition Root.'));
      }
      if (isProductionModule(sourceFile) && isDemoModule(dependency)) {
        violations.push(violation(sourceFile, `Production code must not import Demo module ${dependency}.`));
      }
    }
  }

  return Object.freeze([...new Set(violations)].sort());
}

export const FRONTEND_SAAS2_SECTION_IDS = Object.freeze([...APPROVED_SECTION_IDS]);
