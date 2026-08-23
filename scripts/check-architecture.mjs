import { existsSync, readFileSync } from 'node:fs';

let failures = 0;
function fail(message) {
  console.error(message);
  failures += 1;
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
  'src/features/identity-bootstrap.js',
  'src/features/demo-security.js',
  'src/features/requester-attribution.js',
  'src/app.js',
  'src/features/feature-parity.js',
];
if (JSON.stringify(scriptSources) !== JSON.stringify(expectedScripts)) {
  fail(`index.html: runtime orchestration drifted. Expected ${expectedScripts.join(', ')}; found ${scriptSources.join(', ')}.`);
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
  'src/features/manager-tabs.js',
  'src/features/manager-first-use.js',
  'src/features/manager-ux-polish.js',
  'src/features/manager-operational-ux.js',
  'src/features/manager-final-polish.js',
  'src/features/conference-manager-ready.js',
];
for (const file of managerEnhancementModules) {
  const source = readFileSync(file, 'utf8');
  if (/(?:document|window)\.addEventListener\s*\(/.test(source)) {
    fail(`${file}: global listeners are forbidden in Manager enhancement modules; use feature-parity.js orchestration.`);
  }
  if (/\bmobileMedia\.addEventListener\s*\(/.test(source)) {
    fail(`${file}: local media-query synchronization is forbidden; use the central resize/sync path.`);
  }
}

const orchestrator = readFileSync('src/features/feature-parity.js', 'utf8');
for (const required of [
  'ensureManagerTabIdentity',
  'enhanceManagerFirstUse',
  'enhanceManagerUxPolish',
  'enhanceManagerOperationalUx',
  'enhanceManagerFinalPolish',
  'enhanceConferenceManagerReady',
  'conference:manager-sync-request',
]) {
  if (!orchestrator.includes(required)) fail(`src/features/feature-parity.js: central orchestration missing ${required}.`);
}

const firstUseCalls = [...orchestrator.matchAll(/enhanceManagerFirstUse\(\);/g)].map((match) => match.index);
const managerCall = orchestrator.indexOf('enhanceManager();');
const identityCalls = [...orchestrator.matchAll(/ensureManagerTabIdentity\(\);/g)].map((match) => match.index);
const guardedLanding = "if (!document.querySelector('.manager-tabs')) enhanceManagerFirstUse();";
if (!orchestrator.includes(guardedLanding)) {
  fail('src/features/feature-parity.js: Manager first-use landing must only run before base enhancement when Manager tabs are absent.');
}
if (managerCall < 0 || firstUseCalls.length < 2 || firstUseCalls[0] > managerCall || firstUseCalls[firstUseCalls.length - 1] < managerCall) {
  fail('src/features/feature-parity.js: Manager lifecycle must support guarded landing before base enhancement and first-use decoration after base enhancement.');
}
if (!identityCalls.some((index) => index > firstUseCalls[0] && index < managerCall)) {
  fail('src/features/feature-parity.js: Manager tab identity must be applied after guarded landing and before base Manager enhancement.');
}

const managerTabs = readFileSync('src/features/manager-tabs.js', 'utf8');
for (const tab of ['BOOKINGS', 'ROOM_PLAN', 'REPORTS', 'ADMIN']) {
  if (!managerTabs.includes(`'${tab}'`)) fail(`src/features/manager-tabs.js: missing stable ${tab} tab identity.`);
}
if (!managerTabs.includes('control.dataset.managerTab = tab')) {
  fail('src/features/manager-tabs.js: Manager controls must receive stable data-manager-tab identities.');
}

for (const file of ['src/features/manager-parity.js', 'src/features/manager-first-use.js']) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes("from './manager-tabs.js'")) {
    fail(`${file}: Manager tab state must use the shared semantic manager-tabs helper.`);
  }
  if (/function\s+currentManagerTab\s*\(/.test(source)) {
    fail(`${file}: local text-based Manager tab detection is forbidden; use manager-tabs.js.`);
  }
}

const managerReady = readFileSync('src/features/conference-manager-ready.js', 'utf8');
if (!managerReady.includes("managerTabControl('BOOKINGS')")) {
  fail('src/features/conference-manager-ready.js: bookings label must target the semantic BOOKINGS tab identity.');
}

const requesterAttribution = readFileSync('src/features/requester-attribution.js', 'utf8');
if (/requestRepository\.save\s*=/.test(requesterAttribution)) {
  fail('src/features/requester-attribution.js: requestRepository.save monkey-patching is forbidden.');
}
if (!requesterAttribution.includes("addBeforeSaveHook('requester-attribution'")) {
  fail('src/features/requester-attribution.js: named repository save hook is required.');
}

const storage = readFileSync('src/core/storage.js', 'utf8');
if (!storage.includes('addBeforeSaveHook(name, hook)')) {
  fail('src/core/storage.js: explicit before-save hook API is required.');
}

const designSystem = readFileSync('docs/DESIGN-SYSTEM.md', 'utf8');
for (const required of ['assets/manager-layout.css', 'assets/employee-ux.css']) {
  if (!designSystem.includes(required)) fail(`docs/DESIGN-SYSTEM.md: missing consolidated CSS responsibility ${required}.`);
}

if (failures) process.exit(1);
console.log('Architecture consolidation check passed.');
