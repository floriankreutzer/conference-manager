import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RUNTIME_MODE,
  USER_ROLE,
  canAccessManager,
  normalizeDemoRole,
  normalizeLanguage,
  normalizeRuntimeMode,
  requiresTrustedBackend,
  resolveRole,
  runtimeModeFromDocument,
} from '../src/core/security-policy.js';

function documentWithRuntime(value) {
  return {
    querySelector(selector) {
      assert.equal(selector, 'meta[name="conference-runtime"]');
      if (value === undefined) return null;
      return { getAttribute: () => value };
    },
  };
}

test('runtime policy fails closed to production', () => {
  assert.equal(normalizeRuntimeMode('demo'), RUNTIME_MODE.DEMO);
  assert.equal(normalizeRuntimeMode('DEMO'), RUNTIME_MODE.DEMO);
  assert.equal(normalizeRuntimeMode('production'), RUNTIME_MODE.PRODUCTION);
  assert.equal(normalizeRuntimeMode('invalid'), RUNTIME_MODE.PRODUCTION);
  assert.equal(normalizeRuntimeMode(undefined), RUNTIME_MODE.PRODUCTION);
  assert.equal(runtimeModeFromDocument(documentWithRuntime(undefined)), RUNTIME_MODE.PRODUCTION);
});

test('explicit demo runtime is read from document metadata', () => {
  assert.equal(runtimeModeFromDocument(documentWithRuntime('demo')), RUNTIME_MODE.DEMO);
});

test('demo role and language values are allowlisted', () => {
  assert.equal(normalizeDemoRole(USER_ROLE.MANAGER), USER_ROLE.MANAGER);
  assert.equal(normalizeDemoRole('administrator'), USER_ROLE.EMPLOYEE);
  assert.equal(normalizeLanguage('en'), 'en');
  assert.equal(normalizeLanguage('fr'), 'de');
});

test('production role never trusts demo storage', () => {
  const context = { mode: RUNTIME_MODE.PRODUCTION, demoRole: USER_ROLE.MANAGER };
  assert.equal(resolveRole(context), null);
  assert.equal(canAccessManager(context), false);
  assert.equal(requiresTrustedBackend(context.mode), true);
});

test('production manager access requires a trusted authenticated role', () => {
  const context = {
    mode: RUNTIME_MODE.PRODUCTION,
    demoRole: USER_ROLE.EMPLOYEE,
    authenticatedRole: USER_ROLE.MANAGER,
  };
  assert.equal(resolveRole(context), USER_ROLE.MANAGER);
  assert.equal(canAccessManager(context), true);
});
