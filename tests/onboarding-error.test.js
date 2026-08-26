import assert from 'node:assert/strict';
import test from 'node:test';
import {
  connectionRecoveryKey,
  onboardingErrorKey,
} from '../src/tenant-admin/onboarding-error.js';

function error(code, { serverCode = null, cause = null } = {}) {
  return { code, serverCode, cause };
}

test('production onboarding classifies safe server failures into recovery-oriented UX', () => {
  const cases = [
    [error('HTTP_401'), 'tenantAdmin.onboarding.error.session'],
    [error('HTTP_403', { serverCode: 'FORBIDDEN' }), 'tenantAdmin.onboarding.error.adminRights'],
    [error('HTTP_403', { serverCode: 'MICROSOFT365_GRAPH_PERMISSION_MISSING' }), 'tenantAdmin.onboarding.error.permissionMissing'],
    [error('HTTP_403', { serverCode: 'MICROSOFT365_CONSENT_DENIED' }), 'tenantAdmin.onboarding.error.consentDenied'],
    [error('HTTP_409', { serverCode: 'MICROSOFT365_CONNECTION_REVOKED' }), 'tenantAdmin.onboarding.error.revoked'],
    [error('HTTP_409', { serverCode: 'MICROSOFT365_PLACES_PERMISSION_MISSING' }), 'tenantAdmin.onboarding.error.permissionMissing'],
    [error('HTTP_503', { serverCode: 'MICROSOFT365_GRAPH_THROTTLED' }), 'tenantAdmin.onboarding.error.throttled'],
    [error('HTTP_503', { serverCode: 'MICROSOFT365_ROOM_DISCOVERY_UNAVAILABLE' }), 'tenantAdmin.onboarding.error.providerUnavailable'],
    [error('HTTP_503', { serverCode: 'MICROSOFT365_ROOM_MAPPING_UNAVAILABLE' }), 'tenantAdmin.onboarding.error.providerUnavailable'],
    [error('HTTP_409', { serverCode: 'MICROSOFT365_CONNECTION_STALE' }), 'tenantAdmin.onboarding.error.reconnect'],
    [error('HTTP_400', { serverCode: 'VALIDATION_FAILED' }), 'tenantAdmin.onboarding.error.validation'],
  ];
  for (const [failure, expected] of cases) {
    assert.equal(onboardingErrorKey(failure, 'discover'), expected);
  }
});

test('production onboarding follows wrapped API causes without exposing arbitrary details', () => {
  const wrapped = error('ONBOARDING_REQUEST_FAILED', {
    cause: error('HTTP_503', { serverCode: 'MICROSOFT365_CONNECTION_UNAVAILABLE' }),
  });
  assert.equal(
    onboardingErrorKey(wrapped, 'verify'),
    'tenantAdmin.onboarding.error.providerUnavailable',
  );
  assert.equal(onboardingErrorKey(new Error('sensitive provider body'), 'verify'), 'tenantAdmin.onboarding.verificationError');
});

test('server-derived connection reasons produce explicit consent, revoked and permission recovery guidance', () => {
  assert.equal(connectionRecoveryKey({ state: 'disconnected', reason: 'consent_denied' }), 'tenantAdmin.onboarding.error.consentDenied');
  assert.equal(connectionRecoveryKey({ state: 'revoked', reason: 'provider_authorization_failed' }), 'tenantAdmin.onboarding.error.revoked');
  assert.equal(connectionRecoveryKey({ state: 'degraded', reason: 'places_permission_missing' }), 'tenantAdmin.onboarding.error.permissionMissing');
  assert.equal(connectionRecoveryKey({ state: 'degraded', reason: 'provider_throttled' }), 'tenantAdmin.onboarding.error.throttled');
  assert.equal(connectionRecoveryKey({ state: 'connected', reason: null }), null);
});
