import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

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

function imports(source) {
  return [...source.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]\s*;/g)]
    .map((match) => match[1].split('?')[0]);
}

const app = readFileSync('src/app.js', 'utf8');
for (const required of [
  "from './employee/index.js'",
  "from './manager/index.js'",
  "from './platform/application-context.js'",
  "from './platform/app-shell.js'",
  'createEmployeeApplication',
  'createManagerApplication',
  'createApplicationContext',
  'createAppShell',
]) {
  if (!app.includes(required)) fail(`src/app.js: composition root missing ${required}.`);
}
if (/from\s+['"]\.\/(?:core|shared)\//.test(app)) {
  fail('src/app.js: composition root must not import domain, persistence, shared presentation, or UI implementation directly.');
}
if (/from\s+['"]\.\/(?:employee|manager)\/(?!index\.js)/.test(app)) {
  fail('src/app.js: capability internals are private; consume Employee and Manager only through their public APIs.');
}
for (const forbidden of [
  'requestRepository',
  'validateRequest(',
  'calculateCosts(',
  'renderRequestCard',
  'renderManagerBookings',
  'localStorage',
  'sessionStorage',
]) {
  if (app.includes(forbidden)) fail(`src/app.js: feature-specific responsibility leaked back into composition root (${forbidden}).`);
}

const employeeFacade = readFileSync('src/employee/index.js', 'utf8');
if (!employeeFacade.includes('createEmployeeApplication')) {
  fail('src/employee/index.js: Employee public API must expose createEmployeeApplication.');
}
const managerFacade = readFileSync('src/manager/index.js', 'utf8');
if (!managerFacade.includes('createManagerApplication')) {
  fail('src/manager/index.js: Manager public API must expose createManagerApplication.');
}

for (const file of javascriptFiles('src')) {
  const source = readFileSync(file, 'utf8');
  for (const specifier of imports(source)) {
    if (file.startsWith(normalize('src/employee/'))) break;
    if (/^\.\.\/employee\//.test(specifier) && specifier !== '../employee/index.js') {
      fail(`${file}: Employee internals are private; import ../employee/index.js instead.`);
    }
    if (file === normalize('src/app.js') && /^\.\/employee\//.test(specifier) && specifier !== './employee/index.js') {
      fail(`${file}: Employee internals are private; import ./employee/index.js instead.`);
    }
  }
}

for (const file of javascriptFiles('src')) {
  const source = readFileSync(file, 'utf8');
  for (const specifier of imports(source)) {
    if (file.startsWith(normalize('src/manager/'))) break;
    if (/^\.\.\/manager\//.test(specifier) && specifier !== '../manager/index.js') {
      fail(`${file}: Manager internals are private; import ../manager/index.js instead.`);
    }
    if (file === normalize('src/app.js') && /^\.\/manager\//.test(specifier) && specifier !== './manager/index.js') {
      fail(`${file}: Manager internals are private; import ./manager/index.js instead.`);
    }
  }
}

const domainModules = [
  'src/employee/request-session.js',
  'src/employee/request-lifecycle.js',
  'src/manager/booking-lifecycle.js',
  'src/manager/reporting.js',
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

const employeeApplication = readFileSync('src/employee/application.js', 'utf8');
if (/from\s+['"]\.\.\/manager\//.test(employeeApplication)) {
  fail('src/employee/application.js: Employee runtime must not depend on Manager implementation.');
}
const managerApplication = readFileSync('src/manager/application.js', 'utf8');
if (/from\s+['"]\.\.\/employee\//.test(managerApplication)) {
  fail('src/manager/application.js: Manager runtime must not depend on Employee implementation.');
}

const appShell = readFileSync('src/platform/app-shell.js', 'utf8');
if (/from\s+['"]\.\.\/(?:employee|manager)\//.test(appShell)) {
  fail('src/platform/app-shell.js: shell receives capability contracts through composition and must not import capability internals.');
}
const applicationContext = readFileSync('src/platform/application-context.js', 'utf8');
if (/from\s+['"]\.\.\/(?:employee|manager)\//.test(applicationContext)) {
  fail('src/platform/application-context.js: shared application context must not depend on capability modules.');
}

for (const file of ['src/employee/application.js', 'src/manager/application.js']) {
  const source = readFileSync(file, 'utf8');
  if (/\b(?:localStorage|sessionStorage)\b/.test(source)) {
    fail(`${file}: capability runtime must use the approved core persistence interfaces rather than direct browser storage access.`);
  }
}

if (failures) process.exit(1);
console.log('Phase 2 modular runtime boundary check passed.');
