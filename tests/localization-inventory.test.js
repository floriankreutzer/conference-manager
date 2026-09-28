import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildLocalizationInventory, parseMessageEntries } from '../scripts/localization-inventory.mjs';

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start + startMarker.length, end);
}

function capabilityMessages(language) {
  const source = readFileSync('src/core/i18n-capability-messages.js', 'utf8');
  const section = language === 'de'
    ? sectionBetween(source, '  de: Object.freeze({', '\n  }),\n  en: Object.freeze({')
    : sectionBetween(source, '  en: Object.freeze({', '\n  }),\n});');
  return parseMessageEntries(section);
}

test('canonical localization catalogs remain synchronized after parity consolidation', () => {
  const inventory = buildLocalizationInventory();

  assert.equal(inventory.canonical.deKeys, 340);
  assert.equal(inventory.canonical.enKeys, 340);
  assert.deepEqual(inventory.canonical.missingInEnglish, []);
  assert.deepEqual(inventory.canonical.missingInGerman, []);
  assert.deepEqual(inventory.canonical.placeholderMismatches, []);
  assert.deepEqual(inventory.canonical.parityOwnedKeys, []);
  assert.deepEqual(inventory.legacy.catalogDefinitions, []);

  const de = capabilityMessages('de');
  const en = capabilityMessages('en');
  assert.equal(de.size, 111);
  assert.equal(en.size, 111);
  assert.deepEqual([...de.keys()], [...en.keys()]);
  assert.ok([...de.keys()].every((key) => !key.startsWith('parity.')));
});

test('retired localization bridges and parity aliases cannot return', () => {
  const inventory = buildLocalizationInventory();
  assert.deepEqual(inventory.legacy.bridgeFiles, []);
  assert.deepEqual(inventory.legacy.compatibilityReferences, []);
  for (const file of [
    'src/shared/parity-i18n.js',
    'src/employee/parity-i18n.js',
    'src/manager/parity-i18n.js',
    'src/employee/employee-ux-i18n.js',
  ]) assert.equal(existsSync(file), false, file);

  const source = readFileSync('src/core/i18n.js', 'utf8');
  assert.doesNotMatch(source, /LEGACY_KEY_ALIASES|LEGACY_PREFIXES|canonicalKey|parity\./);
});

test('canonical migration preserves representative German and English baseline copy exactly', () => {
  const de = capabilityMessages('de');
  const en = capabilityMessages('en');

  assert.equal(de.get('auth.production.signInAction'), 'Mit Microsoft anmelden');
  assert.equal(en.get('auth.production.signInAction'), 'Sign in with Microsoft');
  assert.equal(de.get('profile.role.tenantAdmin'), 'Tenant-Administration');
  assert.equal(en.get('profile.role.tenantAdmin'), 'Tenant administration');
  assert.equal(de.get('manager.restore.requester'), 'Angefragt von: {name}');
  assert.equal(en.get('manager.restore.requester'), 'Requested by: {name}');
  assert.equal(de.get('manager.operational.displayed'), '{shown} von {total} Buchungen angezeigt');
  assert.equal(en.get('manager.operational.displayed'), '{shown} of {total} bookings displayed');
  assert.equal(de.get('manager.report.range'), '{start} bis {end}');
  assert.equal(en.get('manager.report.range'), '{start} to {end}');
  assert.equal(de.get('manager.roomPlan.bookingLabel'), '{title}, {start} bis {end}, {participants} Teilnehmende, {status}');
  assert.equal(en.get('manager.roomPlan.bookingLabel'), '{title}, {start} to {end}, {participants} participants, {status}');
  assert.equal(de.get('manager.report.noRoomData'), 'Keine bestätigten Raumbuchungen im Zeitraum.');
  assert.equal(en.get('manager.report.noRoomData'), 'No confirmed room bookings in this period.');
  assert.equal(de.get('tenantAdmin.microsoft365.connect'), 'Microsoft 365 verbinden');
  assert.equal(en.get('tenantAdmin.microsoft365.connect'), 'Connect Microsoft 365');
  assert.equal(de.get('tenantAdmin.microsoft365.permission.calendars'), 'Kalender: {state}');
  assert.equal(en.get('tenantAdmin.microsoft365.permission.calendars'), 'Calendars: {state}');
});
