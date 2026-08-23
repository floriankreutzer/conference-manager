import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalizationInventory } from '../scripts/localization-inventory.mjs';

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
  })}`);
});
