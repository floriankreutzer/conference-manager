import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

  assert.equal(inventory.canonical.deKeys, 630);
  assert.equal(inventory.canonical.enKeys, 630);
  assert.deepEqual(inventory.canonical.missingInEnglish, []);
  assert.deepEqual(inventory.canonical.missingInGerman, []);
  assert.deepEqual(inventory.canonical.placeholderMismatches, []);
  assert.deepEqual(inventory.canonical.parityOwnedKeys, []);
  assert.deepEqual(inventory.legacy.catalogDefinitions, []);

  const de = capabilityMessages('de');
  const en = capabilityMessages('en');
  assert.equal(de.size, 163);
  assert.equal(en.size, 163);
  assert.deepEqual([...de.keys()], [...en.keys()]);
  assert.ok([...de.keys()].every((key) => !key.startsWith('parity.')));
});

test('remaining Manager parity compatibility bridge owns no translations and delegates to Core', () => {
  const inventory = buildLocalizationInventory();
  assert.deepEqual(inventory.legacy.bridgeFiles, ['src/manager/parity-i18n.js']);
  assert.ok(inventory.legacy.compatibilityReferences.length > 0, 'Manager compatibility consumers must remain inventoried until their call sites migrate');

  const source = readFileSync('src/manager/parity-i18n.js', 'utf8');
  assert.match(source, /core\/i18n\.js/);
  assert.doesNotMatch(source, /\b(?:MESSAGES|TRANSLATIONS|COPY)\b\s*=/);
  assert.doesNotMatch(source, /Object\.freeze\s*\(\s*\{\s*(?:de|en)\s*:/);
});

test('canonical migration preserves representative German and English baseline copy exactly', () => {
  const de = capabilityMessages('de');
  const en = capabilityMessages('en');

  assert.equal(de.get('auth.production.signInAction'), 'Mit Microsoft anmelden');
  assert.equal(en.get('auth.production.signInAction'), 'Sign in with Microsoft');
  assert.equal(de.get('profile.role.tenantAdmin'), 'Tenant-Administration');
  assert.equal(en.get('profile.role.tenantAdmin'), 'Tenant administration');
  assert.equal(de.get('manager.admin.activeRooms'), 'Aktive Räume');
  assert.equal(en.get('manager.admin.activeRooms'), 'Active rooms');
  assert.equal(de.get('manager.operational.displayed'), '{shown} von {total} Buchungen angezeigt');
  assert.equal(en.get('manager.operational.displayed'), '{shown} of {total} bookings displayed');
  assert.equal(de.get('manager.report.range'), '{start} bis {end}');
  assert.equal(en.get('manager.report.range'), '{start} to {end}');
  assert.equal(de.get('manager.roomPlan.bookingLabel'), '{title}, {start} bis {end}, {participants} Teilnehmende, {status}');
  assert.equal(en.get('manager.roomPlan.bookingLabel'), '{title}, {start} to {end}, {participants} participants, {status}');
  assert.equal(de.get('welcome.print.heroText'), 'Wir freuen uns auf Ihren Besuch bei „{title}“. Hier finden Sie alles für eine entspannte Anreise und einen guten Start vor Ort.');
  assert.equal(en.get('welcome.print.heroText'), 'We look forward to welcoming you to “{title}”. Here you will find everything for a smooth arrival and a good start on site.');
  assert.equal(de.get('room.floorplan.defaultDescription'), 'Raum für bis zu {capacity} Personen mit passender Meeting- und Präsentationsfläche.');
  assert.equal(en.get('room.floorplan.defaultDescription'), 'Room for up to {capacity} people with suitable meeting and presentation space.');
  assert.equal(de.get('tenantAdmin.microsoft365.connect'), 'Microsoft 365 verbinden');
  assert.equal(en.get('tenantAdmin.microsoft365.connect'), 'Connect Microsoft 365');
  assert.equal(de.get('tenantAdmin.microsoft365.permission.calendars'), 'Kalender: {state}');
  assert.equal(en.get('tenantAdmin.microsoft365.permission.calendars'), 'Calendars: {state}');
});
