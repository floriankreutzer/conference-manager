import assert from 'node:assert/strict';
import test from 'node:test';
import {
  directBrowserStorageKinds,
  isApprovedFeatureFlagImport,
  moduleDeclarations,
  onlyUsesApprovedManagerReturnStorage,
} from '../scripts/architecture-rules.mjs';

test('module declaration parsing covers semicolonless imports and exports', () => {
  const declarations = moduleDeclarations(`
import { createThing } from '../employee/request-session.js'
import * as flags from '../platform/feature-flags.js';
export { createManagerApplication } from '../manager/index.js'
import '../core/i18n.js'
`);

  assert.deepEqual(
    declarations.map(({ specifier }) => specifier),
    [
      '../employee/request-session.js',
      '../platform/feature-flags.js',
      '../manager/index.js',
      '../core/i18n.js',
    ],
  );
});

test('feature flag consumers may import only the centralized runtime contract', () => {
  assert.equal(
    isApprovedFeatureFlagImport("import { featureFlags } from '../platform/feature-flags.js'"),
    true,
  );
  assert.equal(
    isApprovedFeatureFlagImport("import { featureFlags as flags } from '../platform/feature-flags.js'"),
    true,
  );
  assert.equal(
    isApprovedFeatureFlagImport("import { createFeatureFlagResolver as makeFlags } from '../platform/feature-flags.js'"),
    false,
  );
  assert.equal(
    isApprovedFeatureFlagImport("import * as flags from '../platform/feature-flags.js'"),
    false,
  );
  assert.equal(
    isApprovedFeatureFlagImport("export { featureFlags } from '../platform/feature-flags.js'"),
    false,
  );
});

test('direct browser storage detection covers both browser storage mechanisms', () => {
  assert.deepEqual(directBrowserStorageKinds('localStorage.getItem(key);'), ['localStorage']);
  assert.deepEqual(directBrowserStorageKinds('sessionStorage.setItem(key, value);'), ['sessionStorage']);
  assert.deepEqual(
    directBrowserStorageKinds('localStorage.clear(); sessionStorage.clear();'),
    ['localStorage', 'sessionStorage'],
  );
  assert.deepEqual(directBrowserStorageKinds('repository.save(value);'), []);
});

test('only the documented Manager return-marker storage call is approved', () => {
  assert.equal(
    onlyUsesApprovedManagerReturnStorage('sessionStorage.setItem(PARITY_RETURN_KEY, JSON.stringify(value));'),
    true,
  );
  assert.equal(
    onlyUsesApprovedManagerReturnStorage('sessionStorage.setItem("another-key", "value");'),
    false,
  );
  assert.equal(
    onlyUsesApprovedManagerReturnStorage('sessionStorage.setItem(PARITY_RETURN_KEY, value); sessionStorage.getItem(PARITY_RETURN_KEY);'),
    false,
  );
  assert.equal(
    onlyUsesApprovedManagerReturnStorage('localStorage.setItem(PARITY_RETURN_KEY, value);'),
    false,
  );
});
