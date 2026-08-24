import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import {
  directBrowserStorageKinds,
  isApprovedFeatureFlagImport,
  moduleDeclarations,
  onlyUsesApprovedManagerReturnStorage,
} from './architecture-rules.mjs';

let failures = 0;
function fail(message) {
  console.error(message);
  failures += 1;
}

function javascriptFiles(root) {
  const files = [];
  const walk = (path) => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.js')) files.push(normalize(full));
    }
  };
  walk(root);
  return files;
}

function resolvedDependency(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  return normalize(join(dirname(file), specifier));
}

function isInside(file, root) {
  const normalizedRoot = normalize(root);
  return file === normalizedRoot || file.startsWith(`${normalizedRoot}/`);
}

const sourceFiles = javascriptFiles('src');
const employeeRoot = normalize('src/employee');
const managerRoot = normalize('src/manager');
const tenantAdminRoot = normalize('src/tenant-admin');
const platformRoot = normalize('src/platform');
const sharedRoot = normalize('src/shared');
const coreRoot = normalize('src/core');
const employeeIndex = normalize('src/employee/index.js');
const managerIndex = normalize('src/manager/index.js');
const tenantAdminIndex = normalize('src/tenant-admin/index.js');
const managerAdminParity = normalize('src/manager/admin-parity.js');
const featureFlagPath = normalize('src/platform/feature-flags.js');
const appPath = normalize('src/app.js');

const app = readFileSync(appPath, 'utf8');
const allowedAppImports = new Set([
  './employee/index.js',
  './manager/index.js',
  './tenant-admin/index.js',
  './platform/application-context.js',
  './platform/app-shell.js',
  './platform/production-session.js',
  './platform/tenant-user-administration-api.js',
]);

for (const required of [
  "from './employee/index.js'",
  "from './manager/index.js'",
  "from './tenant-admin/index.js'",
  "from './platform/application-context.js'",
  "from './platform/app-shell.js'",
  "from './platform/production-session.js'",
  "from './platform/tenant-user-administration-api.js'",
  'createEmployeeApplication',
  'createManagerApplication',
  'createTenantAdminApplication',
  'createApplicationContext',
  'createAppShell',
  'createProductionSessionRuntime',
  'createTenantUserAdministrationApi',
]) {
  if (!app.includes(required)) fail(`src/app.js: Composition Root missing ${required}.`);
}

for (const { specifier } of moduleDeclarations(app)) {
  if (specifier.startsWith('.') && !allowedAppImports.has(specifier)) {
    fail(`src/app.js: Composition Root dependency ${specifier} is not an approved top-level composition contract.`);
  }
}

for (const forbidden of [
  'requestRepository',
  'notificationRepository',
  'validateRequest(',
  'calculateCosts(',
  'loadCatalog(',
  'loadSiteInfo(',
  'renderRequestCard',
  'renderManagerBookings',
  'document.createElement',
  'openDialog(',
  'localStorage',
  'sessionStorage',
]) {
  if (app.includes(forbidden)) fail(`src/app.js: non-composition responsibility leaked into the Composition Root (${forbidden}).`);
}

const employeeFacade = readFileSync(employeeIndex, 'utf8');
if (!employeeFacade.includes('createEmployeeApplication')) {
  fail('src/employee/index.js: Employee public API must expose createEmployeeApplication.');
}
const managerFacade = readFileSync(managerIndex, 'utf8');
if (!managerFacade.includes('createManagerApplication')) {
  fail('src/manager/index.js: Manager public API must expose createManagerApplication.');
}
const tenantAdminFacade = readFileSync(tenantAdminIndex, 'utf8');
if (!tenantAdminFacade.includes('createTenantAdminApplication')) {
  fail('src/tenant-admin/index.js: Tenant Admin public API must expose createTenantAdminApplication.');
}

for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  for (const declaration of moduleDeclarations(source)) {
    const dependency = resolvedDependency(file, declaration.specifier);
    if (!dependency) continue;

    if (!isInside(file, employeeRoot) && isInside(dependency, employeeRoot) && dependency !== employeeIndex) {
      fail(`${file}: Employee internals are private; external consumers must use src/employee/index.js.`);
    }
    if (!isInside(file, managerRoot) && isInside(dependency, managerRoot) && dependency !== managerIndex) {
      fail(`${file}: Manager internals are private; external consumers must use src/manager/index.js.`);
    }
    if (!isInside(file, tenantAdminRoot) && isInside(dependency, tenantAdminRoot) && dependency !== tenantAdminIndex) {
      fail(`${file}: Tenant Admin internals are private; external consumers must use src/tenant-admin/index.js.`);
    }

    if (isInside(file, employeeRoot)
      && (isInside(dependency, managerRoot) || isInside(dependency, tenantAdminRoot))) {
      fail(`${file}: Employee must not depend on Manager or Tenant Admin capabilities; use composition/shared contracts instead.`);
    }
    if (isInside(file, managerRoot) && isInside(dependency, employeeRoot) && dependency !== employeeIndex) {
      fail(`${file}: Manager-to-Employee collaboration must use the Employee public API.`);
    }
    if (isInside(file, managerRoot) && isInside(dependency, tenantAdminRoot)) {
      fail(`${file}: Conference Manager must not depend on Tenant Admin capability.`);
    }
    if (isInside(file, tenantAdminRoot)
      && (isInside(dependency, employeeRoot) || isInside(dependency, managerRoot))) {
      fail(`${file}: Tenant Admin must not depend on Employee or Manager capabilities.`);
    }

    if (isInside(file, sharedRoot)
      && (isInside(dependency, employeeRoot)
        || isInside(dependency, managerRoot)
        || isInside(dependency, tenantAdminRoot)
        || isInside(dependency, platformRoot)
        || dependency === appPath)) {
      fail(`${file}: Shared must remain capability-independent and must not depend on Employee, Manager, Tenant Admin, Platform or the Composition Root.`);
    }

    if (isInside(file, coreRoot) && dependency.startsWith(normalize('src/')) && !isInside(dependency, coreRoot)) {
      fail(`${file}: Core must remain capability-independent and may not depend on ${dependency}.`);
    }

    if (file !== featureFlagPath && dependency === featureFlagPath && !isApprovedFeatureFlagImport(declaration.statement)) {
      fail(`${file}: feature-flag construction/registration is centralized; runtime consumers may import only featureFlags.`);
    }
  }

  if (file !== featureFlagPath && /import\s*\(\s*['"][^'"]*feature-flags\.js(?:\?[^'"]*)?['"]\s*\)/.test(source)) {
    fail(`${file}: dynamic access to feature-flags.js is forbidden; consume the centralized featureFlags contract statically.`);
  }
}

const domainModules = [
  'src/employee/request-session.js',
  'src/employee/request-lifecycle.js',
  'src/manager/booking-lifecycle.js',
  'src/manager/reporting.js',
  'src/tenant-admin/user-role-model.js',
];
for (const file of domainModules) {
  const source = readFileSync(file, 'utf8');
  if (/from\s+['"][^'"]*(?:ui|application|presentation)[^'"]*['"]/.test(source)) {
    fail(`${file}: domain/lifecycle module must not depend on rendering or application runtime modules.`);
  }
  if (/\b(?:document|window|localStorage|sessionStorage)\b/.test(source)) {
    fail(`${file}: domain/lifecycle module must remain browser-UI and direct-storage independent.`);
  }
}

for (const file of sourceFiles.filter((path) => (
  isInside(path, employeeRoot) || isInside(path, managerRoot) || isInside(path, tenantAdminRoot)
))) {
  const source = readFileSync(file, 'utf8');
  const storageKinds = directBrowserStorageKinds(source);
  if (!storageKinds.length) continue;

  const approvedLegacyReturnMarker = file === managerAdminParity
    && storageKinds.length === 1
    && storageKinds[0] === 'sessionStorage'
    && onlyUsesApprovedManagerReturnStorage(source);

  if (!approvedLegacyReturnMarker) {
    fail(`${file}: capability modules must use approved persistence contracts; direct browser storage is forbidden.`);
  }
}

for (const file of ['src/platform/app-shell.js', 'src/platform/application-context.js']) {
  const source = readFileSync(file, 'utf8');
  for (const { specifier } of moduleDeclarations(source)) {
    const dependency = resolvedDependency(file, specifier);
    if (!dependency) continue;
    if ((isInside(dependency, employeeRoot) && dependency !== employeeIndex)
      || (isInside(dependency, managerRoot) && dependency !== managerIndex)
      || (isInside(dependency, tenantAdminRoot) && dependency !== tenantAdminIndex)) {
      fail(`${file}: Platform composition may consume capabilities only through their public APIs.`);
    }
  }
}

for (const file of sourceFiles) {
  if (file === featureFlagPath) continue;
  const source = readFileSync(file, 'utf8');
  if (/\bFEATURE_FLAG_DEFAULTS\b/.test(source)
    || /\bcreateFeatureFlagDefinitions\s*\(/.test(source)
    || /\bcreateFeatureFlagResolver\s*\(/.test(source)) {
    fail(`${file}: feature-flag definitions and resolver construction are centralized in src/platform/feature-flags.js.`);
  }
}

if (failures) process.exit(1);
console.log(`Permanent modular runtime boundary check passed for ${sourceFiles.length} source modules.`);
