import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = { documentElement: { lang: 'de' } };
const { configureTenantLocalization } = await import('../src/core/i18n.js');

const {
  catalogueDefaultCurrency,
  catalogueRoomPriceValue,
  catalogueSummaryValues,
  createCatalogueEntryDraft,
  createCatalogueVariantDraft,
  nextStableCatalogueId,
} = await import('../src/manager/business-settings-application.js');

test('Room price projection preserves absence and distinguishes an explicit zero', () => {
  assert.equal(catalogueRoomPriceValue('room-a', '', 'EUR'), null);
  assert.equal(catalogueRoomPriceValue('room-a', '   ', 'EUR'), null);
  assert.deepEqual(catalogueRoomPriceValue('room-a', '0', 'EUR'), {
    roomId: 'room-a',
    price: { amountMinor: 0, currency: 'EUR' },
  });
  assert.deepEqual(catalogueRoomPriceValue('room-a', '25.00', 'CHF'), {
    roomId: 'room-a',
    price: { amountMinor: 2500, currency: 'CHF' },
  });
  assert.throws(
    () => catalogueRoomPriceValue('room-a', '-1', 'EUR'),
    /MANAGER_ROOM_PRICE_INVALID/,
  );
});

test('Catalogue summaries distinguish missing or invalid draft prices from an explicit zero', () => {
  const summary = (amount, currency = 'EUR') => catalogueSummaryValues({
    active: true, amount, currency, sites: ['Berlin'],
  });
  for (const amount of ['', '   ', '-1', '12.345', 'not a price', '10000001']) {
    assert.equal(summary(amount)[1], 'Preis nicht verfügbar');
  }
  assert.equal(summary('0', 'XYZ')[1], 'Preis nicht verfügbar');
  for (const [amount, currency] of [['0', 'EUR'], ['12.50', 'CHF'], ['27.75', 'GBP']]) {
    const price = new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(Number(amount));
    assert.equal(summary(amount, currency)[1], `Preis: ${price}`);
  }
});

test('Catalogue summaries preserve authoritative scope distinctions without inventing activity or availability', () => {
  const sites = Object.freeze(['Berlin', 'New York', 'Nicht verfügbar (3)']);
  const rooms = Object.freeze(['Room A', 'Nicht verfügbar (2)']);
  assert.deepEqual(catalogueSummaryValues({
    active: false, amount: '5', currency: 'EUR', sites, rooms,
  }), [
    'Inaktiv', 'Preis: 5,00 €', 'Standorte: Berlin und 2 weitere', 'Räume: Room A und 1 weiterer',
  ]);
  const unrestricted = catalogueSummaryValues({
    active: true, amount: '', currency: 'EUR', sites: [], rooms: [],
  });
  assert.deepEqual(unrestricted, [
    'Aktiv', 'Preis nicht verfügbar', 'Keine Standort-Einschränkung', 'Keine Raum-Einschränkung',
  ]);
  const unknown = catalogueSummaryValues({
    active: undefined, amount: '', currency: 'EUR', sites: null,
  });
  assert.deepEqual(unknown, ['Status nicht verfügbar', 'Preis nicht verfügbar', 'Standort nicht verfügbar']);
  assert.deepEqual(catalogueSummaryValues({
    active: true, amount: '0', currency: 'EUR', sites: ['Nicht verfügbar (1)'], rooms: ['Room A'],
  }).slice(2), ['Standorte: Nicht verfügbar (1)', 'Räume: Room A']);
});

test('Catalogue scope summaries distinguish one additional Site or room from several in both locales', () => {
  try {
    for (const [defaultLocale, single, multiple] of [
      ['de-DE', ['Standorte: Berlin und 1 weiterer', 'Räume: Room A und 1 weiterer'],
        ['Standorte: Berlin und 2 weitere', 'Räume: Room A und 2 weitere']],
      ['en-GB', ['Sites: Berlin and 1 more', 'Rooms: Room A and 1 more'],
        ['Sites: Berlin and 2 more', 'Rooms: Room A and 2 more']],
    ]) {
      configureTenantLocalization({ defaultLocale, defaultCurrency: 'EUR' });
      const summary = (sites, rooms) => catalogueSummaryValues({ active: true, amount: '0', currency: 'EUR', sites, rooms }).slice(2);
      assert.deepEqual(summary(['Berlin', 'Paris'], ['Room A', 'Room B']), single);
      assert.deepEqual(summary(['Berlin', 'Paris', 'New York'], ['Room A', 'Room B', 'Room C']), multiple);
    }
  } finally {
    configureTenantLocalization({ defaultLocale: 'de-DE', defaultCurrency: 'EUR' });
  }
});

test('Conference Manager catalogue drafts use safe collision-free stable identifiers', () => {
  assert.equal(
    nextStableCatalogueId('services', ['services-3', 'services-4']),
    'services-5',
  );
  assert.equal(
    nextStableCatalogueId('services', ['services-1', 'services-99']),
    'services-100',
  );
  const draft = createCatalogueEntryDraft({
    collection: 'services',
    existingEntries: [{ id: 'services-1' }, { id: 'services-2' }],
    currency: 'EUR',
  });
  assert.deepEqual(draft, {
    id: 'services-3',
    name: 'Neuer Eintrag',
    description: null,
    price: { amountMinor: 0, currency: 'EUR' },
    active: true,
    order: 3,
    siteIds: [],
    roomIds: [],
  });
});

test('Conference Manager can create every owned catalogue collection without changing the wire shape', () => {
  for (const collection of ['services', 'equipment', 'cateringItems']) {
    const draft = createCatalogueEntryDraft({ collection, existingEntries: [], currency: 'CHF' });
    assert.equal(draft.id, `${collection}-1`);
    assert.deepEqual(Object.keys(draft).sort(), [
      'active', 'description', 'id', 'name', 'order', 'price', 'roomIds', 'siteIds',
    ]);
  }
  const packageDraft = createCatalogueEntryDraft({
    collection: 'cateringPackages', existingEntries: [], currency: 'GBP',
  });
  assert.deepEqual(packageDraft.itemIds, []);
  assert.deepEqual(packageDraft.variants, []);
});

test('package variants inherit current package currency and remain bounded', () => {
  const packageEntry = {
    id: 'cateringPackages-1',
    price: { amountMinor: 500, currency: 'USD' },
  };
  const variant = createCatalogueVariantDraft({ packageEntry, existingVariants: [] });
  assert.deepEqual(variant, {
    id: 'cateringPackages-1-variant-1',
    name: 'Neue Variante',
    description: null,
    price: { amountMinor: 0, currency: 'USD' },
    active: true,
    order: 1,
  });
  assert.throws(
    () => createCatalogueVariantDraft({
      packageEntry,
      existingVariants: Array.from({ length: 20 }, (_, index) => ({ id: `variant-${index + 1}` })),
    }),
    /MANAGER_CATALOGUE_VARIANT_LIMIT_REACHED/,
  );
});

test('package variant identifiers remain wire-safe for maximum-length package IDs', () => {
  const variant = createCatalogueVariantDraft({
    packageEntry: {
      id: `package-${'x'.repeat(120)}`,
      price: { amountMinor: 0, currency: 'EUR' },
    },
    existingVariants: [],
  });
  assert.equal(variant.id, 'variant-1');
});

test('new catalogue entries use authoritative catalogue currency before Tenant fallback', () => {
  assert.equal(catalogueDefaultCurrency({
    roomPrices: [],
    services: [{ price: { amountMinor: 0, currency: 'CHF' } }],
    equipment: [],
    cateringItems: [],
    cateringPackages: [],
  }), 'CHF');
});
