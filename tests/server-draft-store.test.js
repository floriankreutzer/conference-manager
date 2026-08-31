import assert from 'node:assert/strict';
import test from 'node:test';
import { createServerDraftStore, SERVER_DRAFT_KEY } from '../src/employee/server-draft-store.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function draft(overrides = {}) {
  return {
    roomId: 'room-1',
    startDate: '2026-09-01',
    endDate: '2026-09-02',
    startTime: '23:30',
    endTime: '01:00',
    title: 'Overnight review',
    internalParticipants: '4',
    externalParticipants: '1',
    serviceIds: ['service-1'],
    cateringParticipants: '5',
    packageSelection: { packageId: 'package-1', variantId: 'variant-1' },
    itemQuantities: { 'item-1': '5' },
    allocations: [{ costCenterId: 'cost-1', percentage: '100' }],
    dietaryRequirements: 'Vegetarian',
    specialRequirements: 'Night access',
    ...overrides,
  };
}

test('server draft store restores only a bounded draft for the exact server session scope', () => {
  const storage = new MemoryStorage();
  const store = createServerDraftStore({ tenantId: 'tenant-1', userId: 'user-1', storage });
  assert.equal(store.save(draft()), true);
  assert.deepEqual(store.load(), draft());
  assert.equal(store.has(), true);

  const differentUser = createServerDraftStore({ tenantId: 'tenant-1', userId: 'user-2', storage });
  assert.equal(differentUser.load(), null);
  assert.equal(storage.getItem(SERVER_DRAFT_KEY), null);
});

test('server draft store fails closed for malformed, expanded and oversized values', () => {
  const storage = new MemoryStorage();
  const store = createServerDraftStore({ tenantId: 'tenant-1', userId: 'user-1', storage });
  assert.equal(store.save(draft({ roomId: '../other' })), false);
  assert.equal(store.save({ ...draft(), authority: 'manager' }), false);
  assert.equal(store.save(draft({ specialRequirements: 'x'.repeat(2_001) })), false);

  storage.setItem(SERVER_DRAFT_KEY, '{not-json');
  assert.equal(store.load(), null);
  assert.equal(storage.getItem(SERVER_DRAFT_KEY), null);
});

test('server draft store is unavailable without a validated tenant and user scope', () => {
  const storage = new MemoryStorage();
  assert.equal(createServerDraftStore({ tenantId: '', userId: 'user-1', storage }), null);
  assert.equal(createServerDraftStore({ tenantId: 'tenant-1', userId: '', storage }), null);
});
