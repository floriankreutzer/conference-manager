import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = { documentElement: { lang: 'de' } };

const {
  catalogueDefaultCurrency,
  createCatalogueEntryDraft,
  createCatalogueVariantDraft,
  nextStableCatalogueId,
} = await import('../src/manager/business-settings-application.js');

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
