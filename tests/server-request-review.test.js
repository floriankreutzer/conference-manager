import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildServerRequestReview,
  roomAssetPreviewState,
} from '../src/employee/server-request-review.js';

function catalog() {
  return {
    rooms: [{
      id: 'room-a', siteId: 'site-a', name: 'Room A', capacity: 12, active: true,
      price: { amountMinor: 2_500, currency: 'EUR' },
      equipment: ['Display', 'Whiteboard'],
      floorplanAssetId: 'floorplan-room-a', mediaAssetIds: ['room-a-front'],
    }],
    services: [{
      id: 'service-a', name: 'Service host', active: true, order: 1,
      price: { amountMinor: 1_000, currency: 'EUR' }, siteIds: [], roomIds: [],
    }],
    equipment: [{
      id: 'equipment-a', name: 'Portable display', active: true, order: 1,
      price: { amountMinor: 1_250, currency: 'EUR' }, siteIds: [], roomIds: [],
    }],
    cateringPackages: [{
      id: 'package-a', name: 'Workshop package', active: true, order: 1,
      price: { amountMinor: 0, currency: 'EUR' }, siteIds: [], roomIds: [],
      itemIds: ['coffee'],
      variants: [{
        id: 'standard', name: 'Standard', active: true, order: 1,
        price: { amountMinor: 500, currency: 'EUR' },
      }],
    }],
    cateringItems: [
      {
        id: 'cake', name: 'Cake', active: true, order: 2,
        price: { amountMinor: 300, currency: 'EUR' }, siteIds: [], roomIds: [],
      },
      {
        id: 'coffee', name: 'Coffee', active: true, order: 1,
        price: { amountMinor: 200, currency: 'EUR' }, siteIds: [], roomIds: [],
      },
    ],
    costCenters: [{ id: 'cost-a', code: '471100', name: 'Operations', active: true }],
    bookingPolicy: { rules: { allowedServiceIds: [] } },
  };
}

test('EMP-03 Room asset preview state is opaque, bounded, and rejects URL-shaped references', () => {
  const state = roomAssetPreviewState({
    floorplanAssetId: 'floorplan-room-a',
    mediaAssetIds: ['room-a-front', 'room-a-entry'],
  });
  assert.deepEqual(state, { hasFloorplan: true, mediaCount: 2 });
  assert.doesNotMatch(JSON.stringify(state), /floorplan-room-a|room-a-front|room-a-entry/);
  assert.deepEqual(roomAssetPreviewState({
    floorplanAssetId: 'https://attacker.invalid/room.png',
    mediaAssetIds: ['safe', '../private'],
  }), { hasFloorplan: false, mediaCount: 0 });
});

test('EMP-07 review projection retains participants, selections, requirements, allocations, and exact price breakdown', () => {
  const review = buildServerRequestReview({
    catalog: catalog(),
    roomId: 'room-a',
    internalParticipants: '2',
    externalParticipants: '1',
    serviceIds: ['service-a'],
    equipmentIds: ['equipment-a'],
    cateringParticipantCount: '3',
    packageSelection: { packageId: 'package-a', variantId: 'standard' },
    itemQuantities: { coffee: '2', cake: '2' },
    allocations: [{ costCenterId: 'cost-a', percentage: '100' }],
    dietaryRequirements: '  Vegetarian  ',
    specialRequirements: '  Step-free access  ',
  });

  assert.deepEqual(review.participants, { internal: 2, external: 1, total: 3 });
  assert.equal(review.room.name, 'Room A');
  assert.deepEqual(review.roomAssets, { hasFloorplan: true, mediaCount: 1 });
  assert.deepEqual(review.services.map((entry) => entry.name), ['Service host']);
  assert.deepEqual(review.equipment.map((entry) => entry.name), ['Portable display']);
  assert.equal(review.catering.packageSelection.package.name, 'Workshop package');
  assert.equal(review.catering.packageSelection.variant.name, 'Standard');
  assert.deepEqual(review.catering.packageSelection.includedItems.map((entry) => entry.name), ['Coffee']);
  assert.deepEqual(review.catering.items.map((entry) => ({
    name: entry.item.name,
    quantity: entry.quantity,
    included: entry.includedByPackage,
  })), [
    { name: 'Coffee', quantity: 2, included: true },
    { name: 'Cake', quantity: 2, included: false },
  ]);
  assert.deepEqual(review.allocations.map((entry) => ({
    code: entry.costCenter.code, percentage: entry.percentage,
  })), [{ code: '471100', percentage: 100 }]);
  assert.equal(review.dietaryRequirements, 'Vegetarian');
  assert.equal(review.specialRequirements, 'Step-free access');
  assert.deepEqual(review.price, {
    currency: 'EUR',
    breakdown: {
      roomMinor: 2_500,
      servicesMinor: 1_000,
      equipmentMinor: 1_250,
      cateringPackageMinor: 1_500,
      cateringItemsMinor: 600,
    },
    totalMinor: 6_850,
  });
  assert.equal(Object.isFrozen(review), true);
  assert.equal(Object.isFrozen(review.price.breakdown), true);
});

test('EMP-07 review price preview fails closed for mixed currencies', () => {
  const mixed = catalog();
  mixed.equipment[0].price = { amountMinor: 1_250, currency: 'USD' };
  const review = buildServerRequestReview({
    catalog: mixed,
    roomId: 'room-a',
    internalParticipants: 1,
    externalParticipants: 0,
    serviceIds: [],
    equipmentIds: ['equipment-a'],
    cateringParticipantCount: 0,
    packageSelection: null,
    itemQuantities: {},
    allocations: [],
  });
  assert.equal(review.price, null);
});
