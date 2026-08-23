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

function setRuntime(value) {
  globalThis.document = {
    querySelector(selector) {
      assert.equal(selector, 'meta[name="conference-runtime"]');
      return { getAttribute: () => value };
    },
  };
}

globalThis.localStorage = new MemoryStorage();
setRuntime('production');
const storage = await import('../src/core/storage.js?security-regression');

test('stored JSON drops prototype-pollution keys', () => {
  localStorage.clear();
  localStorage.setItem(storage.KEYS.profile, '{"firstName":"Demo","__proto__":{"polluted":true},"constructor":{"bad":true}}');
  const value = storage.readJson(storage.KEYS.profile, {});
  assert.equal(value.firstName, 'Demo');
  assert.equal(Object.hasOwn(value, '__proto__'), false);
  assert.equal(Object.hasOwn(value, 'constructor'), false);
  assert.equal({}.polluted, undefined);
});

test('oversized demo storage is ignored instead of parsed', () => {
  localStorage.clear();
  localStorage.setItem(storage.KEYS.profile, `{"value":"${'x'.repeat(40_000)}"}`);
  assert.deepEqual(storage.readJson(storage.KEYS.profile, { safe: true }), { safe: true });
});

test('oversized writes fail closed without replacing valid state', () => {
  localStorage.clear();
  assert.equal(storage.writeJson(storage.KEYS.profile, { firstName: 'Safe' }), true);
  const before = localStorage.getItem(storage.KEYS.profile);
  assert.equal(storage.writeJson(storage.KEYS.profile, { payload: 'x'.repeat(40_000) }), false);
  assert.equal(localStorage.getItem(storage.KEYS.profile), before);
});

test('role and language string limits reject corrupted values', () => {
  setRuntime('demo');
  localStorage.clear();
  localStorage.setItem(storage.KEYS.role, 'manager'.repeat(20));
  localStorage.setItem(storage.KEYS.language, 'de'.repeat(30));
  assert.equal(storage.readString(storage.KEYS.role, 'employee'), 'employee');
  assert.equal(storage.readString(storage.KEYS.language, 'de'), 'de');
});

test('production ignores a manipulated local manager role and blocks role writes', () => {
  setRuntime('production');
  localStorage.clear();
  localStorage.setItem(storage.KEYS.role, 'manager');

  assert.equal(storage.readString(storage.KEYS.role, 'employee'), 'employee');
  assert.equal(storage.writeString(storage.KEYS.role, 'manager'), false);
  assert.equal(localStorage.getItem(storage.KEYS.role), 'manager');
  assert.equal(storage.readString(storage.KEYS.role, 'employee'), 'employee');
});

test('demo role storage remains available but allowlisted', () => {
  setRuntime('demo');
  localStorage.clear();

  assert.equal(storage.writeString(storage.KEYS.role, 'manager'), true);
  assert.equal(storage.readString(storage.KEYS.role, 'employee'), 'manager');
  assert.equal(storage.writeString(storage.KEYS.role, 'administrator'), true);
  assert.equal(storage.readString(storage.KEYS.role, 'employee'), 'employee');
});
