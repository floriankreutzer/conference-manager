import test from 'node:test';
import assert from 'node:assert/strict';

import { readinessBlockerPresentation, readinessNextTaskPresentation } from '../src/platform-admin/readiness-blockers.js';

const directReasons = [
  ['tenant.identity.inactive', 'platformAdmin.readiness.reason.identityInactive'],
  ['microsoft.connection.not_connected', 'platformAdmin.readiness.reason.microsoftNotConnected'],
  ['microsoft.permission.places_missing', 'platformAdmin.readiness.reason.placesPermissionMissing'],
  ['microsoft.permission.calendars_missing', 'platformAdmin.readiness.reason.calendarsPermissionMissing'],
  ['microsoft.room_mapping.missing', 'platformAdmin.readiness.reason.roomMappingMissing'],
  ['microsoft.free_busy.unhealthy', 'platformAdmin.readiness.reason.freeBusyUnhealthy'],
  ['entitlement.microsoft_directory.missing', 'platformAdmin.readiness.reason.directoryEntitlementMissing'],
  ['entitlement.microsoft_calendar.missing', 'platformAdmin.readiness.reason.calendarEntitlementMissing'],
];

const checks = [
  ['tenant.identity.active', 'platformAdmin.readiness.check.identity'],
  ['microsoft.connection.connected', 'platformAdmin.readiness.check.microsoftConnection'],
  ['microsoft.permission.places', 'platformAdmin.readiness.check.placesPermission'],
  ['microsoft.permission.calendars', 'platformAdmin.readiness.check.calendarsPermission'],
  ['microsoft.room_mapping.active', 'platformAdmin.readiness.check.roomMapping'],
  ['microsoft.free_busy.healthy', 'platformAdmin.readiness.check.freeBusy'],
  ['entitlement.microsoft_directory', 'platformAdmin.readiness.check.directoryEntitlement'],
  ['entitlement.microsoft_calendar', 'platformAdmin.readiness.check.calendarEntitlement'],
];

test('readiness failure reasons receive localized presentation keys', () => {
  for (const [reasonCode, messageKey] of directReasons) {
    assert.deepEqual(readinessBlockerPresentation(reasonCode), { messageKey, checkKey: null });
  }
});

test('unknown and stale readiness checks retain their check identity', () => {
  for (const [checkId, checkKey] of checks) {
    assert.deepEqual(readinessBlockerPresentation(`${checkId}.unknown`), {
      messageKey: 'platformAdmin.readiness.blocker.unknown',
      checkKey,
    });
    assert.deepEqual(readinessBlockerPresentation(`${checkId}.stale`), {
      messageKey: 'platformAdmin.readiness.blocker.stale',
      checkKey,
    });
  }
});

test('unmapped and malformed readiness reasons use a safe generic presentation', () => {
  for (const reasonCode of ['provider.internal.detail', '__proto__', null, {}]) {
    assert.deepEqual(readinessBlockerPresentation(reasonCode), {
      messageKey: 'platformAdmin.readiness.blocker.generic',
      checkKey: null,
    });
  }
});

test('readiness follow-up distinguishes Operator configuration, customer setup and unproved evidence without granting authority', () => {
  assert.equal(readinessNextTaskPresentation('entitlement.microsoft_calendar.missing').section, 'entitlements');
  assert.equal(readinessNextTaskPresentation('microsoft.connection.not_connected').messageKey, 'platformAdmin.readiness.next.customerAdmin');
  assert.equal(readinessNextTaskPresentation('microsoft.free_busy.healthy.stale').messageKey, 'platformAdmin.readiness.next.evidence');
  for (const value of [null, {}, '__proto__', 'new.provider.failure']) {
    assert.deepEqual(readinessNextTaskPresentation(value), { messageKey: 'platformAdmin.readiness.next.unknown', section: null });
  }
});
