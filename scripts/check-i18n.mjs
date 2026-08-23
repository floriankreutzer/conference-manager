import { readFileSync } from 'node:fs';

const i18nPath = 'src/core/i18n.js';
const source = readFileSync(i18nPath, 'utf8');
let failures = 0;

function fail(message) {
  console.error(message);
  failures += 1;
}

function sectionBetween(text, startMarker, endMarker, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    fail(`${i18nPath}: unable to locate ${label} translation section.`);
    return '';
  }
  return text.slice(start + startMarker.length, end);
}

function messageKeys(text) {
  return new Set([...text.matchAll(/['"]([^'"\n]+)['"]\s*:/g)].map((match) => match[1]));
}

const deSource = sectionBetween(source, '  de: {', '\n  },\n  en: {}', 'German');
const enSource = sectionBetween(source, 'const EN = {', '\n};\nObject.assign(MESSAGES.en, EN)', 'English');
const deKeys = messageKeys(deSource);
const enKeys = messageKeys(enSource);

const missingInEnglish = [...deKeys].filter((key) => !enKeys.has(key)).sort();
const missingInGerman = [...enKeys].filter((key) => !deKeys.has(key)).sort();
if (missingInEnglish.length) fail(`${i18nPath}: English translations missing keys: ${missingInEnglish.join(', ')}`);
if (missingInGerman.length) fail(`${i18nPath}: German translations missing keys: ${missingInGerman.join(', ')}`);

const experienceModules = [
  'src/features/employee-ux-i18n.js',
  'src/features/employee-accessibility-polish.js',
  'src/features/employee-first-use-personalization.js',
  'src/features/manager-first-use.js',
  'src/features/manager-ux-polish.js',
  'src/features/manager-operational-ux.js',
  'src/features/manager-final-polish.js',
  'src/features/conference-manager-ready.js',
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

const compatibilityAdapter = readFileSync('src/features/employee-ux-i18n.js', 'utf8');
if (!/return\s+t\(key,\s*values\)/.test(compatibilityAdapter)) {
  fail('src/features/employee-ux-i18n.js: compatibility adapter must delegate to core t().');
}

for (const cssFile of ['assets/employee-ux.css', 'assets/manager-layout.css']) {
  const css = readFileSync(cssFile, 'utf8');
  if (/\bcontent\s*:\s*['"][^'"]*[A-Za-zÀ-ÿ][^'"]*['"]/i.test(css)) {
    fail(`${cssFile}: textual CSS generated content is forbidden for localized UI copy.`);
  }
}

if (failures) process.exit(1);
console.log(`i18n architecture check passed with ${deKeys.size} synchronized DE/EN message keys.`);
