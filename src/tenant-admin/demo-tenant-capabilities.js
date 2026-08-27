const EVALUATED_AT = '2026-08-27T10:00:00.000Z';
const MICROSOFT_ACTION = Object.freeze({
  id: 'manage_microsoft_connection',
  href: '/settings/integrations/microsoft365',
});

function fixture() {
  return Object.freeze({
    readOnly: true,
    evaluatedAt: EVALUATED_AT,
    tenantStatus: 'active',
    capabilities: Object.freeze([
      Object.freeze({
        id: 'tenant.user_administration',
        availability: 'included',
        state: 'operational',
        reasonCodes: Object.freeze([]),
        action: null,
        lastCheckedAt: null,
      }),
      Object.freeze({
        id: 'tenant.audit_history',
        availability: 'included',
        state: 'operational',
        reasonCodes: Object.freeze([]),
        action: null,
        lastCheckedAt: null,
      }),
      Object.freeze({
        id: 'tenant.configuration',
        availability: 'included',
        state: 'operational',
        reasonCodes: Object.freeze([]),
        action: null,
        lastCheckedAt: null,
      }),
      Object.freeze({
        id: 'microsoft.directory',
        availability: 'included',
        state: 'operational',
        reasonCodes: Object.freeze([]),
        action: null,
        lastCheckedAt: '2026-08-27T09:45:00.000Z',
      }),
      Object.freeze({
        id: 'microsoft.calendar',
        availability: 'included',
        state: 'degraded',
        reasonCodes: Object.freeze(['readiness_stale']),
        action: MICROSOFT_ACTION,
        lastCheckedAt: '2026-08-25T08:00:00.000Z',
      }),
      Object.freeze({
        id: 'microsoft.calendar.write',
        availability: 'optional',
        state: 'not_entitled',
        reasonCodes: Object.freeze(['entitlement_missing']),
        action: null,
        lastCheckedAt: null,
      }),
    ]),
  });
}

export function createDemoTenantCapabilities() {
  let snapshot = fixture();
  return Object.freeze({
    isDemo: true,
    async loadCapabilities() {
      return snapshot;
    },
    reset() {
      snapshot = fixture();
    },
  });
}
