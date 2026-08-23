import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_PATH = 'src/core/i18n-base.js';
const CAPABILITY_PATH = 'src/core/i18n-capability-messages.js';
const LEGACY_PATHS = ['src/shared/parity-i18n.js', 'src/employee/parity-i18n.js', 'src/manager/parity-i18n.js'];

function sectionBetween(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Unable to locate ${label} translation section.`);
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

export function parseMessageEntries(source) {
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
    if (!closed) throw new Error(`Unterminated localization value for ${match[2]}.`);
    if (entries.has(match[2])) throw new Error(`Duplicate localization key definition: ${match[2]}`);
    entries.set(match[2], value);
  }
  return entries;
}

function readCatalog(file, deMarkers, enMarkers) {
  const source = readFileSync(file, 'utf8');
  return {
    de: parseMessageEntries(sectionBetween(source, ...deMarkers, `${file} German`)),
    en: parseMessageEntries(sectionBetween(source, ...enMarkers, `${file} English`)),
  };
}

function mergeCatalogs(...catalogs) {
  const merged = { de: new Map(), en: new Map() };
  for (const catalog of catalogs) {
    for (const language of ['de', 'en']) {
      for (const [key, value] of catalog[language]) {
        if (merged[language].has(key)) throw new Error(`Duplicate canonical key ${key} for ${language}.`);
        merged[language].set(key, value);
      }
    }
  }
  return merged;
}

function canonicalCatalog() {
  const base = readCatalog(
    BASE_PATH,
    ['  de: {', '\n  },\n  en: {}'],
    ['const EN = {', '\n};\nObject.assign(MESSAGES.en, EN)'],
  );
  const capability = readCatalog(
    CAPABILITY_PATH,
    ['  de: Object.freeze({', '\n  }),\n  en: Object.freeze({'],
    ['  en: Object.freeze({', '\n  }),\n});'],
  );
  return mergeCatalogs(base, capability);
}

function placeholders(value) {
  return [...new Set([...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
}

function placeholderMismatches(catalog) {
  const mismatches = [];
  for (const key of catalog.de.keys()) {
    if (!catalog.en.has(key)) continue;
    const de = placeholders(catalog.de.get(key));
    const en = placeholders(catalog.en.get(key));
    if (de.join('\u0000') !== en.join('\u0000')) mismatches.push({ key, de, en });
  }
  return mismatches;
}

function walkJavaScript(root, files = []) {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) walkJavaScript(full, files);
    else if (full.endsWith('.js')) files.push(full.replaceAll('\\', '/'));
  }
  return files;
}

function legacyDefinitions() {
  const definitions = [];
  for (const file of LEGACY_PATHS.filter(existsSync)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/['"](parity\.[^'"\n]+)['"]\s*:/g)) definitions.push({ file, key: match[1] });
  }
  return definitions;
}

function legacyReferences() {
  const references = [];
  for (const file of walkJavaScript('src')) {
    if (file === 'src/core/i18n.js') continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/['"](parity\.[^'"\n]+)['"]/g)) references.push({ file, key: match[1] });
  }
  return references;
}

export function buildLocalizationInventory() {
  const canonical = canonicalCatalog();
  const missingInEnglish = [...canonical.de.keys()].filter((key) => !canonical.en.has(key)).sort();
  const missingInGerman = [...canonical.en.keys()].filter((key) => !canonical.de.has(key)).sort();
  return {
    canonical: {
      deKeys: canonical.de.size,
      enKeys: canonical.en.size,
      missingInEnglish,
      missingInGerman,
      placeholderMismatches: placeholderMismatches(canonical),
      parityOwnedKeys: [...canonical.de.keys()].filter((key) => key.startsWith('parity.')).sort(),
    },
    legacy: {
      catalogDefinitions: legacyDefinitions(),
      compatibilityReferences: legacyReferences(),
      bridgeFiles: LEGACY_PATHS.filter(existsSync),
    },
  };
}

function printInventory(inventory) {
  console.log(`Localization inventory: ${JSON.stringify({
    canonicalDe: inventory.canonical.deKeys,
    canonicalEn: inventory.canonical.enKeys,
    missingInEnglish: inventory.canonical.missingInEnglish.length,
    missingInGerman: inventory.canonical.missingInGerman.length,
    placeholderMismatches: inventory.canonical.placeholderMismatches.length,
    canonicalParityOwnedKeys: inventory.canonical.parityOwnedKeys.length,
    legacyCatalogDefinitions: inventory.legacy.catalogDefinitions.length,
    legacyCompatibilityReferences: inventory.legacy.compatibilityReferences.length,
    retainedBridgeFiles: inventory.legacy.bridgeFiles,
  })}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) printInventory(buildLocalizationInventory());
