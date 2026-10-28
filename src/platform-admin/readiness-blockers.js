const CHECK_LABEL_KEYS = Object.freeze({
  'tenant.identity.active': 'platformAdmin.readiness.check.identity',
  'microsoft.connection.connected': 'platformAdmin.readiness.check.microsoftConnection',
  'microsoft.permission.places': 'platformAdmin.readiness.check.placesPermission',
  'microsoft.permission.calendars': 'platformAdmin.readiness.check.calendarsPermission',
  'microsoft.room_mapping.active': 'platformAdmin.readiness.check.roomMapping',
  'microsoft.free_busy.healthy': 'platformAdmin.readiness.check.freeBusy',
  'entitlement.microsoft_directory': 'platformAdmin.readiness.check.directoryEntitlement',
  'entitlement.microsoft_calendar': 'platformAdmin.readiness.check.calendarEntitlement',
});

const FAILURE_MESSAGE_KEYS = Object.freeze({
  'tenant.identity.inactive': 'platformAdmin.readiness.reason.identityInactive',
  'microsoft.connection.not_connected': 'platformAdmin.readiness.reason.microsoftNotConnected',
  'microsoft.permission.places_missing': 'platformAdmin.readiness.reason.placesPermissionMissing',
  'microsoft.permission.calendars_missing': 'platformAdmin.readiness.reason.calendarsPermissionMissing',
  'microsoft.room_mapping.missing': 'platformAdmin.readiness.reason.roomMappingMissing',
  'microsoft.free_busy.unhealthy': 'platformAdmin.readiness.reason.freeBusyUnhealthy',
  'entitlement.microsoft_directory.missing': 'platformAdmin.readiness.reason.directoryEntitlementMissing',
  'entitlement.microsoft_calendar.missing': 'platformAdmin.readiness.reason.calendarEntitlementMissing',
});

const GENERIC_MESSAGE_KEY = 'platformAdmin.readiness.blocker.generic';

function presentation(messageKey, checkKey = null) {
  return Object.freeze({ messageKey, checkKey });
}

export function readinessBlockerPresentation(reasonCode) {
  if (typeof reasonCode !== 'string') return presentation(GENERIC_MESSAGE_KEY);

  if (Object.hasOwn(FAILURE_MESSAGE_KEYS, reasonCode)) {
    return presentation(FAILURE_MESSAGE_KEYS[reasonCode]);
  }

  for (const state of ['unknown', 'stale']) {
    const suffix = `.${state}`;
    if (!reasonCode.endsWith(suffix)) continue;

    const checkId = reasonCode.slice(0, -suffix.length);
    if (Object.hasOwn(CHECK_LABEL_KEYS, checkId)) {
      return presentation(`platformAdmin.readiness.blocker.${state}`, CHECK_LABEL_KEYS[checkId]);
    }
  }

  return presentation(GENERIC_MESSAGE_KEY);
}

export function readinessNextTaskPresentation(reasonCode) {
  if (typeof reasonCode !== 'string') return Object.freeze({ messageKey: 'platformAdmin.readiness.next.unknown', section: null });
  if (['entitlement.microsoft_directory.missing','entitlement.microsoft_calendar.missing'].includes(reasonCode)) {
    return Object.freeze({ messageKey: 'platformAdmin.readiness.next.entitlement', section: 'entitlements' });
  }
  if (['microsoft.connection.not_connected','microsoft.permission.places_missing','microsoft.permission.calendars_missing','microsoft.room_mapping.missing'].includes(reasonCode)) {
    return Object.freeze({ messageKey: 'platformAdmin.readiness.next.customerAdmin', section: null });
  }
  if (reasonCode.endsWith('.stale') || reasonCode.endsWith('.unknown')) {
    return Object.freeze({ messageKey: 'platformAdmin.readiness.next.evidence', section: null });
  }
  return Object.freeze({ messageKey: 'platformAdmin.readiness.next.unknown', section: null });
}
