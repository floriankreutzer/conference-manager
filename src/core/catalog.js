import { KEYS, readJson, writeJson } from './storage.js';

const localized = (de, en) => ({ de, en });

export const DEFAULT_CATALOG = Object.freeze({
  rooms: [
    { id: 'BER-321', location: 'Berlin', name: localized('Berlin · Raum 3.21', 'Berlin · Room 3.21'), capacity: 12, equipment: localized('Teams Room · Display · Whiteboard', 'Teams Room · display · whiteboard'), floor: localized('3. OG', '3rd floor'), rate: 80, active: true },
    { id: 'BER-412', location: 'Berlin', name: localized('Berlin · Konferenzraum 4.12', 'Berlin · Conference Room 4.12'), capacity: 20, equipment: localized('Teams Room · Dual Display · Whiteboard', 'Teams Room · dual display · whiteboard'), floor: localized('4. OG', '4th floor'), rate: 120, active: true },
    { id: 'BER-AUD', location: 'Berlin', name: localized('Berlin · Auditorium', 'Berlin · Auditorium'), capacity: 80, equipment: localized('Bühne · PA · Hybrid Setup', 'Stage · PA · hybrid setup'), floor: localized('EG', 'Ground floor'), rate: 320, active: true },
    { id: 'STR-201', location: 'Stuttgart', name: localized('Stuttgart · Raum 2.01', 'Stuttgart · Room 2.01'), capacity: 10, equipment: localized('Teams Room · Display', 'Teams Room · display'), floor: localized('2. OG', '2nd floor'), rate: 70, active: true },
    { id: 'STR-ATR', location: 'Stuttgart', name: localized('Stuttgart · Atrium', 'Stuttgart · Atrium'), capacity: 50, equipment: localized('PA · Mobiles Display · Bühne', 'PA · mobile display · stage'), floor: localized('EG', 'Ground floor'), rate: 250, active: true },
    { id: 'FRA-105', location: 'Frankfurt', name: localized('Frankfurt · Raum 1.05', 'Frankfurt · Room 1.05'), capacity: 18, equipment: localized('Teams Room · Display · Whiteboard', 'Teams Room · display · whiteboard'), floor: localized('1. OG', '1st floor'), rate: 100, active: true }
  ],
  services: [
    { id: 'host', name: localized('Empfang / Host', 'Reception / host'), description: localized('Gästebegrüßung und Veranstaltungsbetreuung', 'Guest welcome and event support'), price: 90, active: true },
    { id: 'av', name: localized('Veranstaltungstechnik', 'Event technology'), description: localized('Technische Betreuung für hybride Meetings', 'Technical support for hybrid meetings'), price: 160, active: true },
    { id: 'it', name: localized('IT-Support', 'IT support'), description: localized('On-site Support für Meeting- und Präsentationstechnik', 'On-site support for meeting and presentation technology'), price: 140, active: true },
    { id: 'service', name: localized('Servicepersonal', 'Service staff'), description: localized('Betreuung von Catering und Raum während der Veranstaltung', 'Support for catering and room service during the event'), price: 120, active: true }
  ],
  cateringPackages: [
    { id: 'meeting', name: localized('Meeting', 'Meeting'), description: localized('Getränke und kleine Begleitung für Meetings.', 'Drinks and light refreshments for meetings.'), variants: [
      { tier: 'Basic', description: localized('Kaffee · Tee · Wasser', 'Coffee · tea · water'), pricePerPerson: 8.5 },
      { tier: 'Standard', description: localized('Kaffee · Tee · Wasser · Softdrinks · Gebäck', 'Coffee · tea · water · soft drinks · pastries'), pricePerPerson: 12.5 },
      { tier: 'Deluxe', description: localized('Barista-Kaffee · Premiumgetränke · Gebäck · Obst', 'Barista coffee · premium drinks · pastries · fruit'), pricePerPerson: 18.5 }
    ] },
    { id: 'breakfast', name: localized('Frühstück', 'Breakfast'), description: localized('Frühstücksangebot für interne und externe Gäste.', 'Breakfast offering for internal and external guests.'), variants: [
      { tier: 'Basic', description: localized('Kaffee · Tee · Wasser · Croissant', 'Coffee · tea · water · croissant'), pricePerPerson: 14.5 },
      { tier: 'Standard', description: localized('Getränke · Backwaren · Obst · Joghurt', 'Drinks · pastries · fruit · yoghurt'), pricePerPerson: 19.5 },
      { tier: 'Deluxe', description: localized('Premium-Frühstück · warme Komponenten · Obst · Smoothies', 'Premium breakfast · hot items · fruit · smoothies'), pricePerPerson: 27.5 }
    ] },
    { id: 'lunch', name: localized('Lunch', 'Lunch'), description: localized('Mittagsverpflegung für Workshops und Veranstaltungen.', 'Lunch catering for workshops and events.'), variants: [
      { tier: 'Basic', description: localized('Sandwiches · Salat · Wasser', 'Sandwiches · salad · water'), pricePerPerson: 24 },
      { tier: 'Standard', description: localized('Warme Hauptspeise · Salat · Dessert · Getränke', 'Hot main course · salad · dessert · drinks'), pricePerPerson: 31 },
      { tier: 'Deluxe', description: localized('Premium-Menü · Dessertauswahl · Premiumgetränke', 'Premium menu · dessert selection · premium drinks'), pricePerPerson: 42 }
    ] },
    { id: 'full', name: localized('Ganzer Tag', 'Full day'), description: localized('Ganztägige Bewirtung mit mehreren Verpflegungsphasen.', 'Full-day catering with several service phases.'), variants: [
      { tier: 'Basic', description: localized('Meeting Basic · Lunch Basic · Nachmittagssnack', 'Meeting Basic · Lunch Basic · afternoon snack'), pricePerPerson: 39 },
      { tier: 'Standard', description: localized('Frühstück Standard · Lunch Standard · Snack · Getränke', 'Breakfast Standard · Lunch Standard · snack · drinks'), pricePerPerson: 52 },
      { tier: 'Deluxe', description: localized('Premium-Verpflegung über den gesamten Veranstaltungstag', 'Premium catering throughout the event day'), pricePerPerson: 69 }
    ] }
  ],
  cateringItems: [
    { id: 'water', name: localized('Mineralwasser', 'Mineral water'), unit: localized('Flasche', 'Bottle'), price: 2.5, active: true },
    { id: 'coffee', name: localized('Kaffee', 'Coffee'), unit: localized('Person', 'Person'), price: 3, active: true },
    { id: 'fruit', name: localized('Obstplatte', 'Fruit platter'), unit: localized('für 10 Personen', 'for 10 people'), price: 18, active: true },
    { id: 'pretzel', name: localized('Brezel', 'Pretzel'), unit: localized('Stück', 'Piece'), price: 2.2, active: true },
    { id: 'sandwich', name: localized('Sandwich', 'Sandwich'), unit: localized('Stück', 'Piece'), price: 6.5, active: true },
    { id: 'cake', name: localized('Kuchen', 'Cake'), unit: localized('Stück', 'Piece'), price: 4, active: true }
  ]
});

export const DEFAULT_SITE_INFO = Object.freeze({
  Berlin: { address: 'Musterstraße 1, 10115 Berlin', publicTransport: localized('S-/U-Bahn Hauptbahnhof, anschließend ca. 8 Minuten Fußweg.', 'Main station by S-Bahn/U-Bahn, then about an 8-minute walk.'), carArrival: localized('Zufahrt über Musterstraße.', 'Access via Musterstraße.'), parking: localized('Besucherparkplätze nach Verfügbarkeit.', 'Visitor parking subject to availability.'), reception: localized('Bitte am Empfang anmelden.', 'Please register at reception.'), building: localized('Der Empfang weist den Weg zum Konferenzbereich.', 'Reception will direct you to the conference area.'), visitorNotes: localized('Bitte einen Lichtbildausweis mitbringen.', 'Please bring photo identification.'), accessibility: localized('Stufenloser Zugang und Aufzug vorhanden.', 'Step-free access and lift available.'), contact: 'Conference Management', contactDetails: 'conference-management@example.invalid', wifiName: 'Guest-WiFi', wifiPassword: 'DEMO-ONLY', wifiInstructions: localized('Zugangsdaten sind Demo-Daten.', 'Credentials are demo data.'), mapsUrl: 'https://www.openstreetmap.org/', mockData: true },
  Stuttgart: { address: 'Musterallee 10, 70565 Stuttgart', publicTransport: localized('S-Bahn bis Vaihingen, anschließend Bus.', 'S-Bahn to Vaihingen, then bus.'), carArrival: localized('Zufahrt über Musterallee.', 'Access via Musterallee.'), parking: localized('Besucherparkhaus am Standort.', 'Visitor car park on site.'), reception: localized('Bitte am Empfang anmelden.', 'Please register at reception.'), building: localized('Konferenzräume sind ausgeschildert.', 'Conference rooms are signposted.'), visitorNotes: localized('Bitte einen Lichtbildausweis mitbringen.', 'Please bring photo identification.'), accessibility: localized('Barrierefreier Zugang vorhanden.', 'Accessible entrance available.'), contact: 'Conference Management', contactDetails: 'conference-management@example.invalid', wifiName: 'Guest-WiFi', wifiPassword: 'DEMO-ONLY', wifiInstructions: localized('Zugangsdaten sind Demo-Daten.', 'Credentials are demo data.'), mapsUrl: 'https://www.openstreetmap.org/', mockData: true },
  Frankfurt: { address: 'Musterplatz 5, 60311 Frankfurt am Main', publicTransport: localized('U-/S-Bahn bis Hauptwache.', 'U-Bahn/S-Bahn to Hauptwache.'), carArrival: localized('Zufahrt über Musterplatz.', 'Access via Musterplatz.'), parking: localized('Öffentliches Parkhaus in direkter Nähe.', 'Public car park nearby.'), reception: localized('Bitte am Empfang anmelden.', 'Please register at reception.'), building: localized('Konferenzbereich im 1. Obergeschoss.', 'Conference area on the 1st floor.'), visitorNotes: localized('Bitte einen Lichtbildausweis mitbringen.', 'Please bring photo identification.'), accessibility: localized('Aufzug vorhanden.', 'Lift available.'), contact: 'Conference Management', contactDetails: 'conference-management@example.invalid', wifiName: 'Guest-WiFi', wifiPassword: 'DEMO-ONLY', wifiInstructions: localized('Zugangsdaten sind Demo-Daten.', 'Credentials are demo data.'), mapsUrl: 'https://www.openstreetmap.org/', mockData: true }
});

function migrateLocalized(value) {
  if (value && typeof value === 'object' && 'de' in value && 'en' in value) return value;
  const text = String(value ?? '');
  return { de: text, en: text };
}

function migrateCatalog(catalog) {
  const next = structuredClone(catalog || DEFAULT_CATALOG);
  next.rooms = (next.rooms || []).map((room) => ({ ...room, name: migrateLocalized(room.name), equipment: migrateLocalized(room.equipment), floor: migrateLocalized(room.floor || '') }));
  next.services = (next.services || []).map((service) => ({ ...service, name: migrateLocalized(service.name), description: migrateLocalized(service.description ?? service.desc ?? '') }));
  next.cateringPackages = (next.cateringPackages || []).map((pack) => ({ ...pack, name: migrateLocalized(pack.name), description: migrateLocalized(pack.description || ''), variants: (pack.variants || []).map((variant) => ({ ...variant, description: migrateLocalized(variant.description ?? variant.desc ?? '') })) }));
  next.cateringItems = (next.cateringItems || []).map((item) => ({ ...item, name: migrateLocalized(item.name), unit: migrateLocalized(item.unit) }));
  return next;
}

export function loadCatalog() {
  const current = readJson(KEYS.catalog, null);
  const migrated = migrateCatalog(current || DEFAULT_CATALOG);
  writeJson(KEYS.catalog, migrated);
  return migrated;
}

export function loadSiteInfo() {
  const current = readJson(KEYS.siteInfo, null);
  const sites = current || structuredClone(DEFAULT_SITE_INFO);
  writeJson(KEYS.siteInfo, sites);
  return sites;
}

export function localizedValue(value, language) {
  if (value && typeof value === 'object') return value[language] ?? value.de ?? value.en ?? '';
  return String(value ?? '');
}
