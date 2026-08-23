import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  #values = new Map();
  get length() { return this.#values.size; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
  removeItem(key) { this.#values.delete(String(key)); }
  clear() { this.#values.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.document = {
  documentElement: { dataset: {} },
  querySelector(selector) {
    if (selector === 'meta[name="conference-runtime"]') return { getAttribute: () => 'demo' };
    return null;
  },
};

const storage = await import('../src/core/storage.js');
localStorage.setItem(storage.KEYS.profile, JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace' }));
await import('../src/features/requester-attribution.js');

test('progression: newly saved requests receive the current requester name', () => {
  localStorage.setItem(storage.KEYS.requests, '[]');
  const saved = storage.requestRepository.save([{ id: 'CR-2026-0001', title: 'Workshop' }]);
  assert.equal(saved[0].requesterName, 'Ada Lovelace');
  assert.equal(storage.requestRepository.all()[0].requesterName, 'Ada Lovelace');
});

test('regression: existing requests keep their stored requester attribution', () => {
  localStorage.setItem(storage.KEYS.requests, JSON.stringify([
    { id: 'CR-2026-0001', title: 'Existing', requesterName: 'Grace Hopper' },
  ]));
  const saved = storage.requestRepository.save([
    { id: 'CR-2026-0001', title: 'Existing updated', requesterName: 'Grace Hopper' },
    { id: 'CR-2026-0002', title: 'New request' },
  ]);
  assert.equal(saved[0].requesterName, 'Grace Hopper');
  assert.equal(saved[1].requesterName, 'Ada Lovelace');
});

test('regression: repository hooks are explicit and do not replace save', () => {
  assert.equal(typeof storage.requestRepository.addBeforeSaveHook, 'function');
  assert.equal(Object.hasOwn(storage.requestRepository, 'save'), true);
});
