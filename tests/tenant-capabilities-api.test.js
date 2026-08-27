import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TenantCapabilitiesApiError,
  createTenantCapabilitiesApi,
} from '../src/platform/tenant-capabilities-api.js';
import { createDemoTenantCapabilities } from '../src/tenant-admin/demo-tenant-capabilities.js';

const IDS = [
  'tenant.user_administration',
  'tenant.audit_history',
  'tenant.configuration',
  'microsoft.directory',
  'microsoft.calendar',
  'microsoft.calendar.write',
];

function capability(id, overrides = {}) {
  return {
    id,
    availability: id === 'microsoft.calendar.write' ? 'optional' : 'included',
    state: 'operational',
    reasonCodes: [],
    action: null,
    lastCheckedAt: null,
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    readOnly: true,
    evaluatedAt: '2026-08-27T10:00:00.000Z',
    tenantStatus: 'active',
    capabilities: IDS.map((id) => capability(id)),
    requestId: '11111111-1111-4111-8111-111111111111',
    ...overrides,
  };
}

test('capability adapter is GET-only and returns the ordered server-derived view', async () => {
  const calls = [];
  const api = createTenantCapabilitiesApi({
    apiClient: {
      async request(path, options) {
        calls.push({ path, options });
        return snapshot();
      },
    },
  });
  const result = await api.loadCapabilities();
  assert.deepEqual(calls, [{ path: 'v1/tenant/capabilities', options: undefined }]);
  assert.equal(result.readOnly, true);
  assert.deepEqual(result.capabilities.map(({ id }) => id), IDS);
  assert.equal(Object.hasOwn(api, 'setEntitlement'), false);
  assert.equal(Object.hasOwn(api, 'updateCapability'), false);
});

test('capability response rejects client-writable, unknown, and fail-open states', async () => {
  const invalidSnapshots = [
    snapshot({ readOnly: false }),
    snapshot({ tenantStatus: 'onboarding' }),
    snapshot({ capabilities: IDS.map((id) => capability(id, id === 'microsoft.calendar' ? {
      state: 'blocked', reasonCodes: [],
    } : {})) }),
    snapshot({ capabilities: IDS.map((id) => capability(id, id === 'microsoft.calendar' ? {
      state: 'optional_enabled',
    } : {})) }),
    snapshot({ capabilities: IDS.map((id) => capability(id, id === 'microsoft.calendar.write' ? {
      availability: 'included',
    } : {})) }),
    snapshot({ capabilities: IDS.map((id) => capability(id, id === 'microsoft.directory' ? {
      state: 'degraded', reasonCodes: ['provider_degraded'], providerTenantId: 'sensitive',
    } : {})) }),
  ];
  for (const invalid of invalidSnapshots) {
    const api = createTenantCapabilitiesApi({
      apiClient: { async request() { return invalid; } },
    });
    await assert.rejects(
      api.loadCapabilities(),
      (error) => error instanceof TenantCapabilitiesApiError
        && error.code === 'TENANT_CAPABILITIES_RESPONSE_INVALID',
    );
  }
});

test('capability remediation is fixed and reason codes are allowlisted', async () => {
  const safeAction = { id: 'manage_microsoft_connection', href: '/settings/integrations/microsoft365' };
  const valid = snapshot({
    capabilities: IDS.map((id) => capability(id, id === 'microsoft.calendar' ? {
      state: 'degraded',
      reasonCodes: ['readiness_stale'],
      action: safeAction,
      lastCheckedAt: '2026-08-25T08:00:00.000Z',
    } : {})),
  });
  const api = createTenantCapabilitiesApi({ apiClient: { async request() { return valid; } } });
  assert.deepEqual((await api.loadCapabilities()).capabilities[4].action, safeAction);

  for (const overrides of [
    { action: { id: 'manage_entitlements', href: '/admin/billing' } },
    { action: { id: 'manage_microsoft_connection', href: 'https://attacker.invalid/' } },
    { reasonCodes: ['internal_provider_exception'] },
  ]) {
    const invalid = snapshot({
      capabilities: IDS.map((id) => capability(id, id === 'microsoft.calendar' ? {
        state: 'degraded', reasonCodes: ['readiness_stale'], ...overrides,
      } : {})),
    });
    const invalidApi = createTenantCapabilitiesApi({ apiClient: { async request() { return invalid; } } });
    await assert.rejects(invalidApi.loadCapabilities(), TenantCapabilitiesApiError);
  }
});

test('capability demo is deterministic, resettable, read-only, and has no write port', async () => {
  const demo = createDemoTenantCapabilities();
  const initial = await demo.loadCapabilities();
  assert.equal(initial.readOnly, true);
  assert.equal(initial.capabilities.length, 6);
  assert.equal(Object.keys(demo).some((key) => /^(set|update|enable|entitle)/i.test(key)), false);
  demo.reset();
  assert.deepEqual(await demo.loadCapabilities(), initial);
});
