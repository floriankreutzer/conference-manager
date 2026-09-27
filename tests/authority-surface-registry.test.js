import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthoritySurfaceRegistry } from '../src/shared/authority-surface-registry.js';

function authoritySurface({ open = true } = {}) {
  const listeners = new Map();
  return {
    open,
    closeCount: 0,
    clearCount: 0,
    removeCount: 0,
    addEventListener(type, listener) { listeners.set(type, listener); },
    close() {
      this.closeCount += 1;
      this.open = false;
      listeners.get('close')?.();
    },
    replaceChildren() { this.clearCount += 1; },
    remove() { this.removeCount += 1; },
  };
}

test('authority surface registry closes, clears, and removes every tracked surface once', () => {
  const registry = createAuthoritySurfaceRegistry();
  const first = authoritySurface();
  const second = authoritySurface({ open: false });

  assert.equal(registry.track(first), first);
  assert.equal(registry.track(second), second);
  assert.equal(registry.closeAll(), 2);
  assert.deepEqual(
    [first.closeCount, first.clearCount, first.removeCount],
    [1, 1, 1],
  );
  assert.deepEqual(
    [second.closeCount, second.clearCount, second.removeCount],
    [0, 1, 1],
  );
  assert.equal(registry.closeAll(), 0);
});

test('normally closed surfaces unregister before an authority invalidation', () => {
  const registry = createAuthoritySurfaceRegistry();
  const surface = authoritySurface();
  registry.track(surface);

  surface.close();

  assert.equal(registry.closeAll(), 0);
  assert.equal(surface.clearCount, 0);
  assert.throws(() => registry.track(null), /AUTHORITY_SURFACE_REQUIRED/);
});
