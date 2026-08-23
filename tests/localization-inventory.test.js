import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildLocalizationInventory, parseMessageEntries } from '../scripts/localization-inventory.mjs';

const ALIAS_TARGETS = Object.freeze({
  'parity.admin.accessibility': 'manager.accessibility',
  'parity.admin.active': 'manager.active',
  'parity.admin.address': 'manager.address',
  'parity.admin.addRoom': 'manager.addRoom',
  'parity.admin.addService': 'manager.addService',
  'parity.admin.capacity': 'manager.capacity',
  'parity.admin.contact': 'manager.contact',
  'parity.admin.description': 'manager.description',
  'parity.admin.equipment': 'manager.equipment',
  'parity.admin.floor': 'room.floor',
  'parity.admin.location': 'manager.location',
  'parity.admin.locations': 'manager.sites',
  'parity.admin.parking': 'manager.parking',
  'parity.admin.price': 'manager.price',
  'parity.admin.rooms': 'manager.rooms',
  'parity.admin.services': 'manager.services',
  'parity.admin.sites': 'manager.sites',
  'parity.admin.unit': 'manager.unit',
  'parity.admin.wifiPassword': 'guest.code',
  'parity.manager.all': 'common.all',
  'parity.manager.open': 'manager.final.open',
  'parity.manager.tentative': 'manager.ux.tentative',
  'parity.manager.today': 'common.today',
  'parity.pdf.ask': 'guest.askOrganizer',
  'parity.pdf.date': 'schedule.date',
  'parity.pdf.location': 'schedule.location',
  'parity.pdf.network': 'guest.network',
  'parity.pdf.parking': 'manager.parking',
  'parity.pdf.route': 'guest.route',
  'parity.pdf.title': 'nav.welcome',
  'parity.pdf.wifiCode': 'guest.code',
  'parity.report.cateringBookings': 'manager.cateringBookings',
  'parity.report.confirmed': 'manager.confirmedBookings',
  'parity.report.package': 'manager.catering',
  'parity.report.participants': 'manager.totalParticipants',
  'parity.report.referenceDate': 'manager.referenceDate',
  'parity.report.roomBookings': 'manager.bookings',
  'parity.roomPlan.allLocations': 'manager.allLocations',
  'parity.roomPlan.date': 'schedule.date',
  'parity.roomPlan.event': 'manager.experience.event',
  'parity.roomPlan.list': 'requests.list',
  'parity.roomPlan.location': 'manager.location',
  'parity.roomPlan.participants': 'manager.totalParticipants',
  'parity.roomPlan.room': 'manager.final.room',
  'parity.roomPlan.status': 'manager.status',
});

const UNUSED_KEYS = new Set(['parity.pdf.accessibility']);
const PREFIX_MIGRATIONS = Object.freeze([
  ['parity.admin.', 'manager.admin.'],
  ['parity.manager.', 'manager.operational.'],
  ['parity.report.', 'manager.report.'],
  ['parity.roomPlan.', 'manager.roomPlan.'],
  ['parity.pdf.', 'welcome.print.'],
  ['parity.floorplan.', 'room.floorplan.'],
  ['parity.catering.', 'catering.'],
]);

function canonicalKey(key) {
  for (const [legacyPrefix, canonicalPrefix] of PREFIX_MIGRATIONS) {
    if (key.startsWith(legacyPrefix)) return `${canonicalPrefix}${key.slice(legacyPrefix.length)}`;
  }
  throw new Error(`No semantic canonical key mapping for ${key}`);
}

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start + startMarker.length, end);
}

function legacyMessages(language) {
  const source = readFileSync('src/shared/parity-i18n.js', 'utf8');
  const section = language === 'de'
    ? sectionBetween(source, '  de: Object.freeze({', '\n  }),\n  en: Object.freeze({')
    : sectionBetween(source, '  en: Object.freeze({', '\n  }),\n});');
  return parseMessageEntries(section);
}

function activeLegacyHash(language, activeKeys) {
  const messages = legacyMessages(language);
  const stable = activeKeys.map((key) => [key, messages.get(key)]);
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function generatedCanonicalCatalogue() {
  const de = legacyMessages('de');
  const en = legacyMessages('en');
  const keys = [...de.keys()]
    .filter((key) => !Object.hasOwn(ALIAS_TARGETS, key) && !UNUSED_KEYS.has(key))
    .sort();
  const render = (messages) => keys
    .map((key) => `    ${JSON.stringify(canonicalKey(key))}: ${JSON.stringify(messages.get(key))},`)
    .join('\n');
  return `export const CAPABILITY_MESSAGES = Object.freeze({\n  de: Object.freeze({\n${render(de)}\n  }),\n  en: Object.freeze({\n${render(en)}\n  }),\n});\n`;
}

test('baseline localization catalogs are synchronized and inventory legacy usage', () => {
  const inventory = buildLocalizationInventory();

  assert.equal(inventory.canonical.deKeys, inventory.canonical.enKeys);
  assert.equal(inventory.legacy.deKeys, inventory.legacy.enKeys);
  assert.deepEqual(inventory.canonical.placeholderMismatches, []);
  assert.deepEqual(inventory.legacy.placeholderMismatches, []);
  assert.deepEqual(inventory.comparison.sameKeyConflicts, []);
  assert.equal(Object.keys(ALIAS_TARGETS).length, 45);
  assert.deepEqual(inventory.usage.unusedCandidates, ['parity.pdf.accessibility']);

  for (const [legacyKey, canonicalKeyName] of Object.entries(ALIAS_TARGETS)) {
    const match = inventory.comparison.exactValueAliases.find((entry) => entry.legacyKey === legacyKey);
    assert.ok(match?.canonicalKeys.includes(canonicalKeyName), `${legacyKey} must remain an exact DE/EN alias of ${canonicalKeyName}`);
  }

  assert.ok(inventory.canonical.deKeys > 0, 'canonical catalog must contain translations');
  assert.ok(inventory.legacy.deKeys > 0, 'baseline characterization expects the legacy parity catalog before consolidation');

  const generated = generatedCanonicalCatalogue();
  const migratedCount = (generated.match(/^    "(?:manager\.admin|manager\.operational|manager\.report|manager\.roomPlan|welcome\.print|room\.floorplan|catering\.)/gm) || []).length / 2;
  assert.equal(migratedCount, 103);
  assert.doesNotMatch(generated, /"parity\./);

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
    migratedUniqueKeys: migratedCount,
    aliasesReused: Object.keys(ALIAS_TARGETS).length,
  })}`);
  console.log(`GENERATED_CANONICAL_CATALOGUE_BASE64=${Buffer.from(generated, 'utf8').toString('base64')}`);
});
