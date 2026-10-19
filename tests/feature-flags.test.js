import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURE_FLAG_DEFAULTS,
  createFeatureFlagDefinitions,
  createFeatureFlagResolver,
  featureFlags,
} from '../src/platform/feature-flags.js';

test('regression: baseline remains independent of optional provider reporting', () => {
  assert.deepEqual(FEATURE_FLAG_DEFAULTS, { 'platform.provider-usage': false, 'platform.product-delivery': false, 'catering.configuration': false, 'catering.catalogue': false, 'catering.orders': false, 'catering.delivery': false });
  assert.equal(createFeatureFlagResolver().isEnabled('platform.provider-usage'), false);
  assert.equal(featureFlags.isEnabled('platform.provider-usage'), true);
  assert.equal(createFeatureFlagResolver().isEnabled('platform.product-delivery'), false);
  assert.equal(featureFlags.isEnabled('platform.product-delivery'), true);
  assert.equal(featureFlags.isEnabled('baseline.employee-request'), false);
  assert.equal(featureFlags.isEnabled('baseline.manager-cockpit'), false);
});

test('progression: a registered new feature defaults to off', () => {
  const defaults = createFeatureFlagDefinitions({ 'future.smart-room-suggestions': false });
  const flags = createFeatureFlagResolver(defaults);
  assert.equal(flags.isEnabled('future.smart-room-suggestions'), false);
});

test('progression: a registered new feature can be enabled explicitly', () => {
  const defaults = createFeatureFlagDefinitions({ 'future.smart-room-suggestions': false });
  const flags = createFeatureFlagResolver(defaults, { 'future.smart-room-suggestions': true });
  assert.equal(flags.isEnabled('future.smart-room-suggestions'), true);
});

test('security: unknown malformed and non-boolean flags fail closed', () => {
  const defaults = createFeatureFlagDefinitions({
    'future.smart-room-suggestions': false,
    '__proto__.polluted': true,
    'future.invalid-value': 'true',
  });
  const flags = createFeatureFlagResolver(defaults, {
    'future.unknown': true,
    'future.smart-room-suggestions': 'true',
  });

  assert.equal(flags.isEnabled('future.unknown'), false);
  assert.equal(flags.isEnabled('__proto__.polluted'), false);
  assert.equal(flags.isEnabled('future.invalid-value'), false);
  assert.equal(flags.isEnabled('future.smart-room-suggestions'), false);
  assert.equal({}.polluted, undefined);
});
