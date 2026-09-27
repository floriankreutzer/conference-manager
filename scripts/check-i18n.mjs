import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC_I18N_PATH = 'src/core/i18n.js';
const BASE_CATALOG_PATH = 'src/core/i18n-base.js';
const CAPABILITY_CATALOG_PATH = 'src/core/i18n-capability-messages.js';
const PLATFORM_ADMIN_CATALOG_PATH = 'src/core/i18n-platform-admin-messages.js';
const TENANT_ADMIN_OPERATIONS_CATALOG_PATH = 'src/core/i18n-tenant-admin-operations-messages.js';
const TENANT_SETTINGS_DOMAIN_CATALOG_PATH = 'src/core/i18n-tenant-settings-domain-messages.js';
const CANONICAL_CATALOG_PATHS = [
  BASE_CATALOG_PATH,
  CAPABILITY_CATALOG_PATH,
  PLATFORM_ADMIN_CATALOG_PATH,
  TENANT_ADMIN_OPERATIONS_CATALOG_PATH,
  TENANT_SETTINGS_DOMAIN_CATALOG_PATH,
];
let failures = 0;

function fail(message) {
  console.error(message);
  failures += 1;
}

function sectionBetween(source, startMarker, endMarker, file, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    fail(`${file}: unable to locate ${label} translation section.`);
    return '';
  }
  return source.slice(start + startMarker.length, end);
}

function decodeEscape(source, index) {
  const code = source[index];
  const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
  if (Object.hasOwn(simple, code)) return { value: simple[code], consumed: 1 };
  if (code === 'u') {
    const hex = source.slice(index + 1, index + 5);
    if (/^[0-9a-f]{4}$/i.test(hex)) return { value: String.fromCodePoint(Number.parseInt(hex, 16)), consumed: 5 };
  }
  if (code === 'x') {
    const hex = source.slice(index + 1, index + 3);
    if (/^[0-9a-f]{2}$/i.test(hex)) return { value: String.fromCodePoint(Number.parseInt(hex, 16)), consumed: 3 };
  }
  return { value: code, consumed: 1 };
}

function parseMessages(source, file, label) {
  const entries = new Map();
  const keyPattern = /(['"])([^'"\n]+)\1\s*:/g;
  let match;
  while ((match = keyPattern.exec(source))) {
    let cursor = keyPattern.lastIndex;
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    const quote = source[cursor];
    if (quote !== "'" && quote !== '"') continue;
    cursor += 1;
    let value = '';
    let closed = false;
    while (cursor < source.length) {
      const char = source[cursor];
      if (char === '\\') {
        const decoded = decodeEscape(source, cursor + 1);
        value += decoded.value;
        cursor += decoded.consumed + 1;
        continue;
      }
      if (char === quote) {
        closed = true;
        break;
      }
      value += char;
      cursor += 1;
    }
    if (!closed) {
      fail(`${file}: unterminated ${label} localization value for ${match[2]}.`);
      continue;
    }
    if (entries.has(match[2])) fail(`${file}: duplicate ${label} localization key ${match[2]}.`);
    entries.set(match[2], value);
  }
  return entries;
}

function readBaseCatalog() {
  const source = readFileSync(BASE_CATALOG_PATH, 'utf8');
  return {
    de: parseMessages(sectionBetween(source, '  de: {', '\n  },\n  en: {}', BASE_CATALOG_PATH, 'German'), BASE_CATALOG_PATH, 'German'),
    en: parseMessages(sectionBetween(source, 'const EN = {', '\n};\nObject.assign(MESSAGES.en, EN)', BASE_CATALOG_PATH, 'English'), BASE_CATALOG_PATH, 'English'),
  };
}

function readFrozenCatalog(path) {
  const source = readFileSync(path, 'utf8');
  return {
    de: parseMessages(sectionBetween(source, '  de: Object.freeze({', '\n  }),\n  en: Object.freeze({', path, 'German'), path, 'German'),
    en: parseMessages(sectionBetween(source, '  en: Object.freeze({', '\n  }),\n});', path, 'English'), path, 'English'),
  };
}

function readNamedFrozenCatalog(path, exportName) {
  const source = readFileSync(path, 'utf8');
  return {
    de: parseMessages(sectionBetween(source, 'const DE = Object.freeze({', '\n});\n\nconst EN = Object.freeze({', path, 'German'), path, 'German'),
    en: parseMessages(sectionBetween(source, 'const EN = Object.freeze({', `\n});\n\nexport const ${exportName}`, path, 'English'), path, 'English'),
  };
}

function placeholders(value) {
  return [...new Set([...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
}

function mergeCatalogs(...catalogs) {
  const result = { de: new Map(), en: new Map() };
  for (const catalog of catalogs) {
    for (const language of ['de', 'en']) {
      for (const [key, value] of catalog[language]) {
        if (result[language].has(key)) fail(`Canonical localization defines ${key} more than once for ${language}.`);
        result[language].set(key, value);
      }
    }
  }
  return result;
}

for (const file of [PUBLIC_I18N_PATH, ...CANONICAL_CATALOG_PATHS]) {
  if (!existsSync(file)) fail(`${file}: canonical localization architecture file is missing.`);
}

const publicI18n = readFileSync(PUBLIC_I18N_PATH, 'utf8');
for (const required of [
  "from './i18n-base.js'",
  "from './i18n-capability-messages.js'",
  "from './i18n-platform-admin-messages.js'",
  'export function t(key, values = {})',
  'export function tFor(targetLanguage, key, values = {})',
]) {
  if (!publicI18n.includes(required)) fail(`${PUBLIC_I18N_PATH}: canonical localization contract missing ${required}.`);
}

const baseCatalog = readBaseCatalog();
const capabilityCatalog = readFrozenCatalog(CAPABILITY_CATALOG_PATH);
const canonical = mergeCatalogs(
  baseCatalog,
  capabilityCatalog,
  readFrozenCatalog(PLATFORM_ADMIN_CATALOG_PATH),
  readNamedFrozenCatalog(TENANT_ADMIN_OPERATIONS_CATALOG_PATH, 'TENANT_ADMIN_OPERATIONS_MESSAGES'),
  readFrozenCatalog(TENANT_SETTINGS_DOMAIN_CATALOG_PATH),
);
const missingInEnglish = [...canonical.de.keys()].filter((key) => !canonical.en.has(key)).sort();
const missingInGerman = [...canonical.en.keys()].filter((key) => !canonical.de.has(key)).sort();
if (missingInEnglish.length) fail(`Canonical English translations missing keys: ${missingInEnglish.join(', ')}`);
if (missingInGerman.length) fail(`Canonical German translations missing keys: ${missingInGerman.join(', ')}`);

for (const key of canonical.de.keys()) {
  if (!canonical.en.has(key)) continue;
  const deTokens = placeholders(canonical.de.get(key));
  const enTokens = placeholders(canonical.en.get(key));
  if (deTokens.join('\u0000') !== enTokens.join('\u0000')) {
    fail(`Canonical localization placeholder mismatch for ${key}: DE [${deTokens.join(', ')}], EN [${enTokens.join(', ')}].`);
  }
}

for (const [language, messages] of Object.entries(canonical)) {
  for (const key of messages.keys()) {
    if (key.startsWith('parity.')) fail(`Canonical ${language} catalog still owns retired parity key ${key}.`);
  }
}

const retiredLocalizationPaths = [
  'src/shared/parity-i18n.js',
  'src/employee/parity-i18n.js',
  'src/manager/parity-i18n.js',
  'src/employee/employee-ux-i18n.js',
];
for (const file of retiredLocalizationPaths) {
  if (existsSync(file)) fail(`${file}: retired localization compatibility path must not be reintroduced.`);
}

const experienceModules = [
  'src/employee/production-application.js',
  'src/employee/server-request-calendar.js',
  'src/manager/production-application.js',
  'src/manager/server-analytics-view.js',
  'src/manager/business-settings-application.js',
];
const forbiddenModulePatterns = [
  { pattern: /\bconst\s+(?:COPY|MESSAGES|TRANSLATIONS)\b/, message: 'parallel translation table' },
  { pattern: /\bconst\s+custom\s*=/, message: 'local bilingual selector' },
  { pattern: /language\(\)\s*===\s*['"]en['"]\s*\?/, message: 'inline language-selection ternary' },
];
for (const file of experienceModules) {
  const moduleSource = readFileSync(file, 'utf8');
  for (const rule of forbiddenModulePatterns) {
    if (rule.pattern.test(moduleSource)) fail(`${file}: ${rule.message} is forbidden; use src/core/i18n.js and t().`);
  }
}

function javascriptFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
      const current = join(directory, entry);
      if (statSync(current).isDirectory()) walk(current);
      else if (current.endsWith('.js') && !current.startsWith('src/core/i18n')) files.push(current);
    }
  };
  walk(root);
  return files;
}
const runtimeSource = javascriptFiles('src').map((file) => readFileSync(file, 'utf8')).join('\n');
const catalogSource = readdirSync('src/core')
  .filter((file) => /^i18n.*\.js$/.test(file))
  .map((file) => readFileSync(join('src/core', file), 'utf8'))
  .join('\n');
const staticKeys = new Set(
  [...runtimeSource.matchAll(/\bt\(\s*(['"])([^'"\n]+)\1/g)].map((match) => match[2]),
);
for (const key of staticKeys) {
  if (!catalogSource.includes(`'${key}':`) && !catalogSource.includes(`"${key}":`)) {
    fail(`Canonical localization is missing runtime key ${key}.`);
  }
}
const dynamicPrefixes = new Set(
  [...runtimeSource.matchAll(/`([A-Za-z0-9_.-]*\.)\$\{/g)].map((match) => match[1]),
);
const boundedDynamicKeys = new Set([
  'guest.wifiPolicy.open',
  'guest.wifiPolicy.credentials_on_arrival',
  'guest.wifiPolicy.contact_organizer',
  'guest.wifiPolicy.not_available',
  'manager.report.day',
  'manager.report.month',
  'manager.report.quarter',
  'manager.report.year',
  'manager.restore.role.employee',
  'manager.restore.role.conference_manager',
]);
const boundedDynamicPrefixes = new Set([
  'guest.wifiPolicy.',
  'manager.report.',
  'manager.restore.role.',
]);
for (const [catalogName, catalog] of [['base', baseCatalog], ['capability', capabilityCatalog]]) {
  for (const key of catalog.de.keys()) {
    const dynamic = [...dynamicPrefixes].some((prefix) => (
      key.startsWith(prefix)
      && (!boundedDynamicPrefixes.has(prefix) || boundedDynamicKeys.has(key))
    ));
    if (!runtimeSource.includes(key) && !dynamic) {
      fail(`${catalogName} localization key ${key} has no active runtime consumer.`);
    }
  }
}

for (const cssFile of ['assets/employee-ux.css', 'assets/manager-layout.css']) {
  const css = readFileSync(cssFile, 'utf8');
  if (/\bcontent\s*:\s*['"][^'"]*[A-Za-zÀ-ÿ][^'"]*['"]/i.test(css)) {
    fail(`${cssFile}: textual CSS generated content is forbidden for localized UI copy.`);
  }
}

if (failures) process.exit(1);
console.log(`i18n architecture check passed with ${canonical.de.size} synchronized DE/EN canonical message keys and compatible placeholders.`);
