import assert from 'node:assert/strict';
import test from 'node:test';
import { createServerDraftStore, SERVER_DRAFT_KEY } from '../src/employee/server-draft-store.js';

const SESSION_EXPIRES_AT = '2099-09-24T12:00:00.000Z';

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
    equipmentIds: [],
    activeStep: 1,
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
  const store = createServerDraftStore({
    tenantId: 'tenant-1', userId: 'user-1', sessionExpiresAt: SESSION_EXPIRES_AT, storage,
  });
  assert.equal(store.save(draft()), true);
  assert.deepEqual(store.load(), draft());
  assert.equal(store.has(), true);

  const differentUser = createServerDraftStore({
    tenantId: 'tenant-1', userId: 'user-2', sessionExpiresAt: SESSION_EXPIRES_AT, storage,
  });
  assert.equal(differentUser.load(), null);
  assert.equal(storage.getItem(SERVER_DRAFT_KEY), null);
});

test('server draft store preserves exact Equipment selection in its session-bound envelope', () => {
  const storage = new MemoryStorage();
  const store = createServerDraftStore({
    tenantId: 'tenant-1', userId: 'user-1', sessionExpiresAt: SESSION_EXPIRES_AT, storage,
  });
  const equipmentDraft = draft({ equipmentIds: ['display-1', 'projector-1'] });
  assert.equal(store.save(equipmentDraft), true);
  assert.deepEqual(store.load(), equipmentDraft);
  assert.equal(JSON.parse(storage.getItem(SERVER_DRAFT_KEY)).schemaVersion, 4);

  assert.equal(store.save(draft({ equipmentIds: ['display-1', 'display-1'] })), false);
  assert.equal(store.save(draft({ equipmentIds: Array.from({ length: 201 }, (_, index) => `item-${index}`) })), false);
});

test('EMP-09 server draft store persists the exact active wizard step in its scoped v4 envelope', () => {
  const storage = new MemoryStorage();
  const store = createServerDraftStore({
    tenantId: 'tenant-1', userId: 'user-1', sessionExpiresAt: SESSION_EXPIRES_AT, storage,
  });
  const wizardDraft = draft({
    equipmentIds: ['display-1'],
    activeStep: 4,
  });
  assert.equal(store.save(wizardDraft), true);
  assert.deepEqual(store.load(), wizardDraft);
  const envelope = JSON.parse(storage.getItem(SERVER_DRAFT_KEY));
  assert.equal(envelope.schemaVersion, 4);
  assert.equal(envelope.expiresAt, SESSION_EXPIRES_AT);
  assert.equal(Number.isFinite(Date.parse(envelope.createdAt)), true);
  assert.equal(envelope.draft.activeStep, 4);

  assert.equal(store.save(draft({ equipmentIds: [], activeStep: 0 })), false);
  assert.equal(store.save(draft({ equipmentIds: [], activeStep: 7 })), false);
  assert.equal(store.save(draft({ equipmentIds: [], activeStep: '4' })), false);
});

test('server draft store fails closed for malformed, expanded and oversized values', () => {
  const storage = new MemoryStorage();
  const store = createServerDraftStore({
    tenantId: 'tenant-1', userId: 'user-1', sessionExpiresAt: SESSION_EXPIRES_AT, storage,
  });
  assert.equal(store.save(draft({ roomId: '../other' })), false);
  assert.equal(store.save({ ...draft(), authority: 'manager' }), false);
  assert.equal(store.save(draft({ specialRequirements: 'x'.repeat(2_001) })), false);

  storage.setItem(SERVER_DRAFT_KEY, '{not-json');
  assert.equal(store.load(), null);
  assert.equal(storage.getItem(SERVER_DRAFT_KEY), null);
});

test('EMP-09 server draft expires with and is bound to the exact validated session lifetime', () => {
  const storage = new MemoryStorage();
  let now = Date.parse('2026-09-19T12:00:00.000Z');
  const sessionExpiresAt = '2026-09-19T13:00:00.000Z';
  const store = createServerDraftStore({
    tenantId: 'tenant-1', userId: 'user-1', sessionExpiresAt, storage, clock: () => now,
  });
  storage.setItem(SERVER_DRAFT_KEY, JSON.stringify({
    schemaVersion: 3,
    tenantId: 'tenant-1',
    userId: 'user-1',
    draft: draft(),
  }));
  assert.equal(store.load(), null);
  assert.equal(storage.getItem(SERVER_DRAFT_KEY), null);

  assert.equal(store.save(draft()), true);
  assert.deepEqual(JSON.parse(storage.getItem(SERVER_DRAFT_KEY)), {
    schemaVersion: 4,
    tenantId: 'tenant-1',
    userId: 'user-1',
    createdAt: '2026-09-19T12:00:00.000Z',
    expiresAt: sessionExpiresAt,
    draft: draft(),
  });

  now = Date.parse('2026-09-19T12:30:00.000Z');
  assert.equal(store.save(draft({ title: 'Updated draft' })), true);
  assert.equal(
    JSON.parse(storage.getItem(SERVER_DRAFT_KEY)).createdAt,
    '2026-09-19T12:00:00.000Z',
  );

  const replacementSession = createServerDraftStore({
    tenantId: 'tenant-1',
    userId: 'user-1',
    sessionExpiresAt: '2026-09-19T14:00:00.000Z',
    storage,
    clock: () => now,
  });
  assert.equal(replacementSession.load(), null);
  assert.equal(storage.getItem(SERVER_DRAFT_KEY), null);

  assert.equal(store.save(draft()), true);
  now = Date.parse(sessionExpiresAt);
  assert.equal(store.load(), null);
  assert.equal(store.save(draft()), false);
  assert.equal(storage.getItem(SERVER_DRAFT_KEY), null);
});

test('server draft store is unavailable without a validated tenant and user scope', () => {
  const storage = new MemoryStorage();
  assert.equal(createServerDraftStore({
    tenantId: '', userId: 'user-1', sessionExpiresAt: SESSION_EXPIRES_AT, storage,
  }), null);
  assert.equal(createServerDraftStore({
    tenantId: 'tenant-1', userId: '', sessionExpiresAt: SESSION_EXPIRES_AT, storage,
  }), null);
  assert.equal(createServerDraftStore({
    tenantId: 'tenant-1', userId: 'user-1', sessionExpiresAt: '', storage,
  }), null);
});
