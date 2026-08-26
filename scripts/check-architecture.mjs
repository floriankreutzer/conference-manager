import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

let failures = 0;
function fail(message) {
  console.error(message);
  failures += 1;
}

function javascriptFiles(root) {
  if (!existsSync(root)) return [];
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

function relativeModuleDependencies(file) {
  const source = readFileSync(file, 'utf8');
  const dependencies = [];
  const statements = source.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]\s*;/g);
  for (const match of statements) {
    const specifier = match[1].split('?')[0];
    if (!specifier.startsWith('.')) continue;
    dependencies.push(normalize(join(dirname(file), specifier)));
  }
  return dependencies;
}

const index = readFileSync('index.html', 'utf8');
const cssLinks = [...index.matchAll(/href=["']\.\/([^"']+\.css)(?:\?[^"']*)?["']/g)].map((match) => match[1]);
const expectedCss = [
  'assets/tokens.css',
  'assets/styles.css',
  'assets/feature-parity.css',
  'assets/app-layout.css',
  'assets/manager-layout.css',
  'assets/employee-ux.css',
  'assets/demo-security.css',
];
if (JSON.stringify(cssLinks) !== JSON.stringify(expectedCss)) {
  fail(`index.html: stylesheet responsibilities drifted. Expected ${expectedCss.join(', ')}; found ${cssLinks.join(', ')}.`);
}

const scriptSources = [...index.matchAll(/<script[^>]+src=["']\.\/([^"']+\.js)(?:\?[^"']*)?["']/g)].map((match) => match[1]);
const expectedScripts = [
  'src/platform/identity-bootstrap.js',
  'src/platform/demo-security.js',
  'src/platform/requester-attribution.js',
  'src/app.js',
  'src/platform/feature-parity.js',
];
if (JSON.stringify(scriptSources) !== JSON.stringify(expectedScripts)) {
  fail(`index.html: runtime orchestration drifted. Expected ${expectedScripts.join(', ')}; found ${scriptSources.join(', ')}.`);
}

if (existsSync('src/features')) {
  fail('src/features: flat feature directory is forbidden after modularization; use employee, manager, platform or shared boundaries.');
}

for (const required of [
  'src/employee/index.js',
  'src/manager/index.js',
  'src/manager/timeline-position.js',
  'src/platform/feature-flags.js',
  'src/platform/feature-parity.js',
  'src/shared/parity-data.js',
  'src/shared/booking-change-loader.js',
  'src/core/i18n.js',
  'src/core/i18n-base.js',
  'src/core/i18n-capability-messages.js',
]) {
  if (!existsSync(required)) fail(`${required}: required modular architecture file is missing.`);
}
for (const removed of ['src/shared/parity-i18n.js', 'src/employee/parity-i18n.js']) {
  if (existsSync(removed)) fail(`${removed}: retired localization compatibility bridge must not be reintroduced.`);
}

const removedStyleLayers = [
  'assets/manager-first-use.css',
  'assets/manager-ux-polish.css',
  'assets/manager-operational-ux.css',
  'assets/manager-final-polish.css',
  'assets/conference-manager-ready.css',
  'assets/employee-accessibility-polish.css',
];
for (const path of removedStyleLayers) {
  if (existsSync(path)) fail(`${path}: parallel polish stylesheet must remain consolidated.`);
}

const managerEnhancementModules = [
  'src/manager/manager-tabs.js',
  'src/manager/manager-first-use.js',
  'src/manager/manager-ux-polish.js',
  'src/manager/manager-operational-ux.js',
  'src/manager/manager-final-polish.js',
  'src/manager/conference-manager-ready.js',
];
for (const file of managerEnhancementModules) {
  const source = readFileSync(file, 'utf8');
  if (/(?:document|window)\.addEventListener\s*\(/.test(source)) {
    fail(`${file}: global listeners are forbidden in Manager enhancement modules; use platform/feature-parity.js orchestration.`);
  }
  if (/\bmobileMedia\.addEventListener\s*\(/.test(source)) {
    fail(`${file}: local media-query synchronization is forbidden; use the central resize/sync path.`);
  }
}

const orchestratorPath = 'src/platform/feature-parity.js';
const orchestrator = readFileSync(orchestratorPath, 'utf8');
for (const required of [
  "from '../employee/index.js'",
  "from '../manager/index.js'",
  'ensureManagerTabIdentity',
  'managerTabControl',
  'enhanceManagerFirstUse',
  'enhanceManagerUxPolish',
  'enhanceManagerOperationalUx',
  'enhanceManagerFinalPolish',
  'enhanceConferenceManagerReady',
  'conference:manager-sync-request',
  '#primaryNavigation button[data-view="manager"]',
  "managerTabControl('ADMIN')",
]) {
  if (!orchestrator.includes(required)) fail(`${orchestratorPath}: central orchestration missing ${required}.`);
}
if (/from\s+['"]\.\.\/(?:employee|manager)\/(?!index\.js)/.test(orchestrator)) {
  fail(`${orchestratorPath}: platform orchestration must consume Employee and Manager behavior only through module public APIs.`);
}
if (/t\(['"](?:nav\.manager|manager\.admin)['"]\)/.test(orchestrator)) {
  fail(`${orchestratorPath}: Manager restore must not derive navigation state from localized visible labels.`);
}

const firstUseCalls = [...orchestrator.matchAll(/enhanceManagerFirstUse\(\);/g)].map((match) => match.index);
const managerCall = orchestrator.indexOf('enhanceManager();');
const identityCalls = [...orchestrator.matchAll(/ensureManagerTabIdentity\(\);/g)].map((match) => match.index);
const guardedLanding = "if (!document.querySelector('.manager-tabs')) enhanceManagerFirstUse();";
if (!orchestrator.includes(guardedLanding)) {
  fail(`${orchestratorPath}: Manager first-use landing must only run before base enhancement when Manager tabs are absent.`);
}
if (managerCall < 0 || firstUseCalls.length < 2 || firstUseCalls[0] > managerCall || firstUseCalls[firstUseCalls.length - 1] < managerCall) {
  fail(`${orchestratorPath}: Manager lifecycle must support guarded landing before base enhancement and first-use decoration after base enhancement.`);
}
if (!identityCalls.some((position) => position > firstUseCalls[0] && position < managerCall)) {
  fail(`${orchestratorPath}: Manager tab identity must be applied after guarded landing and before base Manager enhancement.`);
}

const employeeFacade = readFileSync('src/employee/index.js', 'utf8');
for (const required of [
  'decorateEmployeeParity',
  'enhanceEmployeeUx',
  'enhanceEmployeeAccessibilityPolish',
  'enhanceEmployeeFirstUsePersonalization',
  'captureEmployeeIdentityPresentation',
  'openRichFloorplan',
  'requestIdFromCard',
  'richPrint',
]) {
  if (!employeeFacade.includes(required)) fail(`src/employee/index.js: public Employee contract missing ${required}.`);
}

const managerFacade = readFileSync('src/manager/index.js', 'utf8');
for (const required of [
  'PARITY_RETURN_KEY',
  'enhanceManager',
  'enhanceManagerResponsive',
  'enhanceManagerFirstUse',
  'enhanceManagerUxPolish',
  'enhanceManagerOperationalUx',
  'enhanceManagerFinalPolish',
  'enhanceConferenceManagerReady',
  'ensureManagerTabIdentity',
  'managerTabControl',
]) {
  if (!managerFacade.includes(required)) fail(`src/manager/index.js: public Manager contract missing ${required}.`);
}

const managerEmployeeBridge = readFileSync('src/manager/employee-visuals.js', 'utf8');
if (!managerEmployeeBridge.includes("from '../employee/index.js'")) {
  fail('src/manager/employee-visuals.js: cross-module request-card compatibility must use the Employee public contract.');
}
for (const file of javascriptFiles('src/manager')) {
  if (file === normalize('src/manager/employee-visuals.js')) continue;
  const source = readFileSync(file, 'utf8');
  if (/from\s+['"]\.\.\/employee\//.test(source)) {
    fail(`${file}: direct Manager dependency on Employee internals is forbidden; use an explicit public contract.`);
  }
}
for (const file of javascriptFiles('src/employee')) {
  const source = readFileSync(file, 'utf8');
  if (/from\s+['"]\.\.\/manager\//.test(source)) {
    fail(`${file}: direct Employee dependency on Manager internals is forbidden.`);
  }
}
for (const file of javascriptFiles('src/shared')) {
  const source = readFileSync(file, 'utf8');
  if (/from\s+['"]\.\.\/(?:employee|manager)\//.test(source)) {
    fail(`${file}: shared modules must not depend on Employee or Manager modules.`);
  }
}
for (const file of ['src/employee/production-application.js', 'src/manager/production-application.js']) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes("from '../shared/booking-change-loader.js'")) {
    fail(`${file}: confirmed-booking lookup orchestration must use the deliberate Shared contract.`);
  }
}
if (existsSync('src/core/booking-change-loader.js')) {
  fail('src/core/booking-change-loader.js: feature-specific booking-change orchestration is forbidden in Core.');
}

const managerTabs = readFileSync('src/manager/manager-tabs.js', 'utf8');
for (const tab of ['BOOKINGS', 'ROOM_PLAN', 'REPORTS', 'ADMIN']) {
  if (!managerTabs.includes(`'${tab}'`)) fail(`src/manager/manager-tabs.js: missing stable ${tab} tab identity.`);
}
if (!managerTabs.includes('control.dataset.managerTab = tab')) {
  fail('src/manager/manager-tabs.js: Manager controls must receive stable data-manager-tab identities.');
}

for (const file of ['src/manager/manager-parity.js', 'src/manager/manager-first-use.js']) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes("from './manager-tabs.js'")) {
    fail(`${file}: Manager tab state must use the shared semantic manager-tabs helper.`);
  }
  if (/function\s+currentManagerTab\s*\(/.test(source)) {
    fail(`${file}: local text-based Manager tab detection is forbidden; use manager-tabs.js.`);
  }
}

const requestCard = readFileSync('src/shared/request-card.js', 'utf8');
for (const required of [
  'dataset: { requestId: request.id }',
  "dataset: { managerAction: 'confirm' }",
  "dataset: { managerAction: 'change' }",
  "dataset: { managerAction: 'reject' }",
  "dataset: { requestAction: 'print' }",
]) {
  if (!requestCard.includes(required)) fail(`src/shared/request-card.js: semantic DOM contract missing ${required}.`);
}

const employeeApplication = readFileSync('src/employee/application.js', 'utf8');
for (const required of [
  'dataset: { roomId: room.id }',
  "dataset: { roomAction: 'select' }",
  "dataset: { roomAction: 'floorplan' }",
  'dataset: { packageId: pack.id, packageTier: variant.tier }',
  "dataset: { packageAction: 'select' }",
]) {
  if (!employeeApplication.includes(required)) fail(`src/employee/application.js: semantic selection contract missing ${required}.`);
}

const employeeVisuals = readFileSync('src/employee/employee-visuals.js', 'utf8');
for (const required of [
  'card.dataset.requestId',
  'card?.dataset.roomId',
  'card?.dataset.packageId',
  'card?.dataset.packageTier',
  'button[data-room-action="floorplan"]',
  'button[data-request-action="print"]',
]) {
  if (!employeeVisuals.includes(required)) fail(`src/employee/employee-visuals.js: semantic enhancement lookup missing ${required}.`);
}
if (/requestIdFromCard[\s\S]*?textContent/.test(employeeVisuals)
  || /roomForCard[\s\S]*?textContent/.test(employeeVisuals)
  || /packageForCard[\s\S]*?textContent/.test(employeeVisuals)
  || /control\.textContent\.trim\(\)\s*===\s*t\(/.test(employeeVisuals)) {
  fail('src/employee/employee-visuals.js: enhancement identity must not be derived from visible/localized text.');
}

const managerFirstUse = readFileSync('src/manager/manager-first-use.js', 'utf8');
if (!managerFirstUse.includes('button[data-manager-action="${action}"]')) {
  fail('src/manager/manager-first-use.js: Manager decisions must consume stable data-manager-action identities.');
}
if (/ensureNativeActionIdentity/.test(managerFirstUse) || /dataset\.managerAction\s*=/.test(managerFirstUse)) {
  fail('src/manager/manager-first-use.js: Manager enhancement must not infer or assign action identity by control order.');
}
if (/nativeAction[\s\S]*?textContent\.trim\(\)/.test(managerFirstUse)) {
  fail('src/manager/manager-first-use.js: Manager decisions must not be discovered from localized visible labels.');
}

const managerParity = readFileSync('src/manager/manager-parity.js', 'utf8');
if (!managerParity.includes("from './timeline-position.js'") || !managerParity.includes('timelinePosition(request.start, request.end)')) {
  fail('src/manager/manager-parity.js: room timeline must use the deterministic timeline-position contract.');
}
if (/\.style\.(?:left|right|width|insetInlineStart|inlineSize)\s*=/.test(managerParity)) {
  fail('src/manager/manager-parity.js: room timeline must not use inline positioning styles under the CSP.');
}
if (!managerParity.includes('.request-card[data-request-id]') || /requestIdFromCard/.test(managerParity)) {
  fail('src/manager/manager-parity.js: Manager filtering must use semantic data-request-id contracts directly.');
}

const timelineCss = readFileSync('assets/feature-parity.css', 'utf8');
for (const required of [
  'inset-inline-start:',
  'inline-size:',
  'border-inline-start:',
  'margin-inline-start:',
  'text-align: start',
  'text-align: end',
]) {
  if (!timelineCss.includes(required)) fail(`assets/feature-parity.css: logical timeline styling missing ${required}.`);
}

const managerReady = readFileSync('src/manager/conference-manager-ready.js', 'utf8');
if (!managerReady.includes("managerTabControl('BOOKINGS')")) {
  fail('src/manager/conference-manager-ready.js: bookings label must target the semantic BOOKINGS tab identity.');
}

const requesterAttribution = readFileSync('src/platform/requester-attribution.js', 'utf8');
if (/requestRepository\.save\s*=/.test(requesterAttribution)) {
  fail('src/platform/requester-attribution.js: requestRepository.save monkey-patching is forbidden.');
}
if (!requesterAttribution.includes("addBeforeSaveHook('requester-attribution'")) {
  fail('src/platform/requester-attribution.js: named repository save hook is required.');
}

const featureFlags = readFileSync('src/platform/feature-flags.js', 'utf8');
for (const required of ['FEATURE_FLAG_DEFAULTS', 'createFeatureFlagDefinitions', 'createFeatureFlagResolver', 'isEnabled(featureId)']) {
  if (!featureFlags.includes(required)) fail(`src/platform/feature-flags.js: feature-flag foundation missing ${required}.`);
}
const defaultsMatch = featureFlags.match(/FEATURE_FLAG_DEFAULTS\s*=\s*createFeatureFlagDefinitions\(\{([\s\S]*?)\}\)/);
if (!defaultsMatch) {
  fail('src/platform/feature-flags.js: centralized default registry could not be identified.');
} else if (/:\s*true\b/.test(defaultsMatch[1])) {
  fail('src/platform/feature-flags.js: newly registered feature flags must not default to true.');
}

const storage = readFileSync('src/core/storage.js', 'utf8');
if (!storage.includes('addBeforeSaveHook(name, hook)')) {
  fail('src/core/storage.js: explicit before-save hook API is required.');
}
if (!storage.includes('class RepositoryWriteError') || !storage.includes('if (!persisted && failOnWrite)')) {
  fail('src/core/storage.js: authoritative repositories must fail closed when browser persistence fails.');
}
if (!storage.includes('failOnWrite: false')) {
  fail('src/core/storage.js: non-authoritative notification persistence must remain explicitly best-effort.');
}

const parityData = readFileSync('src/shared/parity-data.js', 'utf8');
if (!parityData.includes('RepositoryWriteError') || !parityData.includes('writeAuthoritativeJson')) {
  fail('src/shared/parity-data.js: Manager catalog/site persistence must fail closed on write failure.');
}
for (const required of ['return writeAuthoritativeJson(KEYS.catalog, catalog)', 'return writeAuthoritativeJson(KEYS.siteInfo, sites)']) {
  if (!parityData.includes(required)) fail(`src/shared/parity-data.js: authoritative Manager persistence missing ${required}.`);
}

const apiClient = readFileSync('src/core/api-client.js', 'utf8');
if (!apiClient.includes('response.body.getReader') || !apiClient.includes('byteCount > MAX_RESPONSE_BYTES')) {
  fail('src/core/api-client.js: production API responses must be byte-bounded while streaming.');
}
if (/await\s+response\.text\s*\(/.test(apiClient)) {
  fail('src/core/api-client.js: unbounded response.text() reads are forbidden for production API responses.');
}

const sourceFiles = javascriptFiles('src');
const sourceSet = new Set(sourceFiles);
const graph = new Map(sourceFiles.map((file) => [file, relativeModuleDependencies(file).filter((dependency) => sourceSet.has(dependency))]));
const visiting = new Set();
const visited = new Set();
const stack = [];
function visit(file) {
  if (visited.has(file)) return;
  if (visiting.has(file)) {
    const cycleStart = stack.indexOf(file);
    const cycle = [...stack.slice(cycleStart), file];
    fail(`Circular ES-module dependency detected: ${cycle.join(' -> ')}`);
    return;
  }
  visiting.add(file);
  stack.push(file);
  for (const dependency of graph.get(file) || []) visit(dependency);
  stack.pop();
  visiting.delete(file);
  visited.add(file);
}
for (const file of sourceFiles) visit(file);

const dast = readFileSync('.github/workflows/dast.yml', 'utf8');
if (!/fail_action:\s*true\b/.test(dast)) {
  fail('.github/workflows/dast.yml: ZAP findings must fail the DAST workflow; informational-only scans are forbidden.');
}

const designSystem = readFileSync('docs/DESIGN-SYSTEM.md', 'utf8');
for (const required of ['assets/manager-layout.css', 'assets/employee-ux.css']) {
  if (!designSystem.includes(required)) fail(`docs/DESIGN-SYSTEM.md: missing consolidated CSS responsibility ${required}.`);
}

if (failures) process.exit(1);
console.log(`Architecture boundary check passed for ${sourceFiles.length} source modules.`);
