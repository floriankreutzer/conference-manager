import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { customerDemoBoundaryViolations } from './customer-demo-boundary-policy.mjs';

const RETIRED_CUSTOMER_DEMO_E2E = Object.freeze([
  'app-responsive.spec.js',
  'conference-manager-ready.spec.js',
  'conference-manager.spec.js',
  'demo-network-isolation.spec.js',
  'design-system.spec.js',
  'employee-accessibility-polish.spec.js',
  'employee-ux.spec.js',
  'end-user-ready.spec.js',
  'extended.spec.js',
  'feature-parity.spec.js',
  'manager-final-polish.spec.js',
  'manager-first-use.spec.js',
  'manager-operational-ux.spec.js',
  'manager-responsive.spec.js',
  'print-security.spec.js',
  'repository-hardening.spec.js',
  'security.spec.js',
  'standards.spec.js',
  'tenant-admin-operations.spec.js',
  'tenant-admin-settings-shell.spec.js',
  'tenant-location-settings.spec.js',
  'tenant-onboarding.spec.js',
  'tenant-settings-conflict-recovery.spec.js',
  'tenant-settings-domains.spec.js',
  'tenant-user-filter-focus.spec.js',
]);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(current));
    else if (entry.name.endsWith('.js')) files.push(current.replaceAll('\\', '/'));
  }
  return files;
}

let failures = 0;
function fail(message) {
  console.error(message);
  failures += 1;
}

for (const file of [
  'src/platform/demo-bootstrap.js',
  'src/platform/production-bootstrap.js',
  'src/platform/demo-session.js',
  'src/platform/demo-security.js',
  'src/employee/index.js',
  'src/manager/index.js',
  'src/tenant-admin/server.js',
  'src/platform/server-tenant-settings-api.js',
]) {
  if (!existsSync(file)) fail(`${file}: required Customer server-backed runtime file is missing.`);
}

const sources = new Map();
for (const file of await sourceFiles('src')) sources.set(file, await readFile(file, 'utf8'));
for (const item of customerDemoBoundaryViolations(sources)) fail(item);

const html = await readFile('index.html', 'utf8');
if (!html.includes('conference-runtime" content="demo"')) {
  fail('index.html: Customer Demo runtime declaration is required.');
}
if (!html.includes('conference-demo-data" content="synthetic-server-backed"')) {
  fail('index.html: synthetic server-backed Customer Demo disclosure metadata is required.');
}
if (!html.includes("connect-src 'self'")) {
  fail("index.html: Customer Demo CSP must allow only its same-origin API connection.");
}
if (
  !html.includes('./src/platform/demo-bootstrap.js')
  || /src\/app\.js|src\/platform\/(?:identity-bootstrap|requester-attribution|feature-parity)\.js/.test(html)
) {
  fail('index.html: Customer Demo must load only its explicit composition root.');
}

const app = await readFile('src/app.js', 'utf8');
for (const required of [
  "from './employee/index.js'",
  "from './manager/index.js'",
  "from './tenant-admin/server.js'",
  'createServerEmployeeApplication',
  'createServerManagerApplication',
  'context.serverPersistence()',
]) {
  if (!app.includes(required)) fail(`src/app.js: shared server composition is missing ${required}.`);
}
if (/\bcreateDemo|\.\/employee\/server|\.\/manager\/server|\.\/tenant-admin\/index/.test(app)) {
  fail('src/app.js: shared server composition must not import browser-owned Demo capabilities.');
}

const demoSession = await readFile('src/platform/demo-session.js', 'utf8');
for (const required of [
  "const SESSION_PATH = 'v1/demo/session'",
  "const TENANTS_PATH = 'v1/demo/tenants'",
  "const CONTEXT_PATH = 'v1/demo/session/context'",
  "method: 'PUT'",
  'body: { tenantId: canonicalTenantId, persona: canonicalPersona }',
  'validateProductionSession',
  'csrfTokenProvider: () => currentSession?.csrfToken || null',
]) {
  if (!demoSession.includes(required)) fail(`src/platform/demo-session.js: trust boundary is missing ${required}.`);
}
if (!demoSession.includes('input.tenants.length < 1') || demoSession.includes('input.tenants.length < 2')) {
  fail('src/platform/demo-session.js: one remaining available Demo Tenant must remain a valid inventory.');
}

const demoSecurity = await readFile('src/platform/demo-security.js', 'utf8');
if (!demoSecurity.includes('context.demoTenants().length >= 1')) {
  fail('src/platform/demo-security.js: persona switching must remain available with one Demo Tenant.');
}
if (/demo\/reset|resetDemo|demo-security-reset/.test(`${demoSession}\n${demoSecurity}`)) {
  fail('Customer Demo runtime must not expose Platform reset behavior or reset presentation.');
}

for (const file of RETIRED_CUSTOMER_DEMO_E2E) {
  if (existsSync(`tests/e2e/${file}`)) {
    fail(`tests/e2e/${file}: retired browser-authority Customer Demo journey must not return.`);
  }
}

const customerRuntimeE2e = await readFile('tests/e2e/demo-role-switch.spec.js', 'utf8');
for (const required of [
  '/api/v1/demo/session',
  '/api/v1/demo/tenants',
  '/api/v1/demo/session/context',
  'never falls back to browser business state',
  'Production composition loads no Customer Demo controls or endpoints',
]) {
  if (!customerRuntimeE2e.includes(required)) {
    fail(`tests/e2e/demo-role-switch.spec.js: bounded Customer runtime evidence is missing ${required}.`);
  }
}

for (const file of [
  'production-application.spec.js',
  'tenant-presentation.spec.js',
  'tenant-role-administration.spec.js',
  'tenant-settings-production-composition.spec.js',
]) {
  const source = await readFile(`tests/e2e/${file}`, 'utf8');
  if (!source.includes('./src/platform/production-bootstrap.js?v=20260830-77')) {
    fail(`tests/e2e/${file}: Production route fixture must load the explicit Production composition root.`);
  }
}

if (failures) process.exit(1);
console.log(`Customer Production/Demo boundary check passed for ${sources.size} frontend source modules.`);
