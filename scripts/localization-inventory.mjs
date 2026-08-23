import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE_PATH = 'src/core/i18n.js';
const LEGACY_PATH = 'src/shared/parity-i18n.js';

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

function readCoreCatalog() {
  const source = readFileSync(CORE_PATH, 'utf8');
  return {
    de: parseMessageEntries(sectionBetween(source, '  de: {', '\n  },\n  en: {}', 'canonical German')),
    en: parseMessageEntries(sectionBetween(source, 'const EN = {', '\n};\nObject.assign(MESSAGES.en, EN)', 'canonical English')),
  };
}

function readLegacyCatalog() {
  if (!existsSync(LEGACY_PATH)) return { de: new Map(), en: new Map() };
  const source = readFileSync(LEGACY_PATH, 'utf8');
  return {
    de: parseMessageEntries(sectionBetween(source, '  de: Object.freeze({', '\n  }),\n  en: Object.freeze({', 'legacy German')),
    en: parseMessageEntries(sectionBetween(source, '  en: Object.freeze({', '\n  }),\n});', 'legacy English')),
  };
}

function placeholders(value) {
  return [...new Set([...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
}

function walkJavaScript(root, files = []) {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) walkJavaScript(full, files);
    else if (full.endsWith('.js')) files.push(full.replaceAll('\\', '/'));
  }
  return files;
}

function sourceReferences(keys) {
  const files = walkJavaScript('src').filter((file) => ![CORE_PATH, LEGACY_PATH, 'src/employee/parity-i18n.js', 'src/manager/parity-i18n.js'].includes(file));
  const consumers = Object.fromEntries(keys.map((key) => [key, []]));
  const uncertainFiles = new Set();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const key of keys) {
      if (source.includes(`'${key}'`) || source.includes(`"${key}"`) || source.includes(`\`${key}\``)) consumers[key].push(file);
    }
    if (/\bpt\s*\(\s*(?!['"`])/.test(source) || /\bptFor\s*\([^,]+,\s*(?!['"`])/.test(source) || /`[^`]*parity\.[^`]*\$\{/.test(source)) {
      uncertainFiles.add(file);
    }
  }
  return { consumers, uncertainFiles: [...uncertainFiles].sort() };
}

function compareCatalogs(canonical, legacy) {
  const canonicalKeys = new Set(canonical.de.keys());
  const legacyKeys = new Set(legacy.de.keys());
  const sameKeyExact = [];
  const sameKeyConflicts = [];
  const canonicalOnly = [];
  const legacyOnly = [];

  for (const key of canonicalKeys) {
    if (!legacyKeys.has(key)) canonicalOnly.push(key);
    else if (canonical.de.get(key) === legacy.de.get(key) && canonical.en.get(key) === legacy.en.get(key)) sameKeyExact.push(key);
    else sameKeyConflicts.push(key);
  }
  for (const key of legacyKeys) if (!canonicalKeys.has(key)) legacyOnly.push(key);

  const canonicalPairs = new Map();
  for (const key of canonicalKeys) {
    const pair = `${canonical.de.get(key)}\u0000${canonical.en.get(key)}`;
    const keys = canonicalPairs.get(pair) ?? [];
    keys.push(key);
    canonicalPairs.set(pair, keys);
  }
  const exactValueAliases = [];
  for (const key of legacyKeys) {
    const pair = `${legacy.de.get(key)}\u0000${legacy.en.get(key)}`;
    const matches = canonicalPairs.get(pair) ?? [];
    if (matches.length) exactValueAliases.push({ legacyKey: key, canonicalKeys: matches.sort() });
  }

  return {
    sameKeyExact: sameKeyExact.sort(),
    sameKeyConflicts: sameKeyConflicts.sort(),
    canonicalOnly: canonicalOnly.sort(),
    legacyOnly: legacyOnly.sort(),
    exactValueAliases: exactValueAliases.sort((a, b) => a.legacyKey.localeCompare(b.legacyKey)),
  };
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

export function buildLocalizationInventory() {
  const canonical = readCoreCatalog();
  const legacy = readLegacyCatalog();
  const comparison = compareCatalogs(canonical, legacy);
  const legacyKeys = [...legacy.de.keys()].sort();
  const references = sourceReferences(legacyKeys);
  const unusedCandidates = legacyKeys.filter((key) => references.consumers[key].length === 0);
  const activeLegacyKeys = legacyKeys.filter((key) => references.consumers[key].length > 0);

  return {
    canonical: { deKeys: canonical.de.size, enKeys: canonical.en.size, placeholderMismatches: placeholderMismatches(canonical) },
    legacy: { deKeys: legacy.de.size, enKeys: legacy.en.size, placeholderMismatches: placeholderMismatches(legacy) },
    comparison,
    usage: {
      activeLegacyKeys,
      unusedCandidates,
      dynamicallyReferencedOrUncertainFiles: references.uncertainFiles,
      consumers: references.consumers,
    },
  };
}

function printInventory(inventory) {
  const compact = {
    canonicalDe: inventory.canonical.deKeys,
    canonicalEn: inventory.canonical.enKeys,
    legacyDe: inventory.legacy.deKeys,
    legacyEn: inventory.legacy.enKeys,
    sameKeyExact: inventory.comparison.sameKeyExact.length,
    sameKeyConflicts: inventory.comparison.sameKeyConflicts.length,
    canonicalOnly: inventory.comparison.canonicalOnly.length,
    legacyOnly: inventory.comparison.legacyOnly.length,
    exactValueAliases: inventory.comparison.exactValueAliases.length,
    activeLegacyKeys: inventory.usage.activeLegacyKeys.length,
    unusedCandidates: inventory.usage.unusedCandidates.length,
    uncertainFiles: inventory.usage.dynamicallyReferencedOrUncertainFiles.length,
    canonicalPlaceholderMismatches: inventory.canonical.placeholderMismatches.length,
    legacyPlaceholderMismatches: inventory.legacy.placeholderMismatches.length,
  };
  console.log(`Localization inventory: ${JSON.stringify(compact)}`);
  if (inventory.comparison.exactValueAliases.length) console.log(`Exact value aliases: ${JSON.stringify(inventory.comparison.exactValueAliases)}`);
  if (inventory.usage.unusedCandidates.length) console.log(`Unused legacy candidates: ${JSON.stringify(inventory.usage.unusedCandidates)}`);
  if (inventory.usage.dynamicallyReferencedOrUncertainFiles.length) console.log(`Dynamic/uncertain legacy consumers: ${JSON.stringify(inventory.usage.dynamicallyReferencedOrUncertainFiles)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) printInventory(buildLocalizationInventory());
