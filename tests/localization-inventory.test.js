import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildLocalizationInventory, parseMessageEntries } from '../scripts/localization-inventory.mjs';

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start + startMarker.length, end);
}

function activeLegacyHash(language, activeKeys) {
  const source = readFileSync('src/shared/parity-i18n.js', 'utf8');
  const section = language === 'de'
    ? sectionBetween(source, '  de: Object.freeze({', '\n  }),\n  en: Object.freeze({')
    : sectionBetween(source, '  en: Object.freeze({', '\n  }),\n});');
  const messages = parseMessageEntries(section);
  const stable = activeKeys.map((key) => [key, messages.get(key)]);
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

test('baseline localization catalogs are synchronized and inventory legacy usage', () => {
  const inventory = buildLocalizationInventory();

  assert.equal(inventory.canonical.deKeys, inventory.canonical.enKeys);
  assert.equal(inventory.legacy.deKeys, inventory.legacy.enKeys);
  assert.deepEqual(inventory.canonical.placeholderMismatches, []);
  assert.deepEqual(inventory.legacy.placeholderMismatches, []);
  assert.deepEqual(inventory.comparison.sameKeyConflicts, []);

  assert.ok(inventory.canonical.deKeys > 0, 'canonical catalog must contain translations');
  assert.ok(inventory.legacy.deKeys > 0, 'baseline characterization expects the legacy parity catalog before consolidation');

  console.log(`Baseline localization inventory: ${JSON.stringify({
    canonicalKeys: inventory.canonical.deKeys,
    legacyKeys: inventory.legacy.deKeys,
    exactSameKeyDuplicates: inventory.comparison.sameKeyExact.length,
    conflictingSameKeys: inventory.comparison.sameKeyConflicts.length,
    canonicalOnly: inventory.comparison.canonicalOnly.length,
    legacyOnly: inventory.comparison.legacyOnly.length,
    exactValueAliases: inventory.comparison.exactValueAliases.length,
    activeLegacyKeys: inventory.usage.activeLegacyKeys.length,
    unusedLegacyCandidates: inventory.usage.unusedCandidates.length,
    uncertainConsumerFiles: inventory.usage.dynamicallyReferencedOrUncertainFiles.length,
    activeLegacyDeHash: activeLegacyHash('de', inventory.usage.activeLegacyKeys),
    activeLegacyEnHash: activeLegacyHash('en', inventory.usage.activeLegacyKeys),
  })}`);
  console.log(`Legacy exact-value aliases: ${JSON.stringify(inventory.comparison.exactValueAliases)}`);
  console.log(`Legacy unused candidates: ${JSON.stringify(inventory.usage.unusedCandidates)}`);
  console.log(`Legacy dynamic/uncertain consumer files: ${JSON.stringify(inventory.usage.dynamicallyReferencedOrUncertainFiles)}`);
  console.log(`Legacy static consumers: ${JSON.stringify(Object.fromEntries(Object.entries(inventory.usage.consumers).filter(([, files]) => files.length)))}`);
});
