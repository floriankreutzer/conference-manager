import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TenantAuditApiError,
  createTenantAuditApi,
} from '../src/platform/tenant-audit-api.js';
import { createDemoTenantAudit } from '../src/tenant-admin/demo-tenant-audit.js';
import { normalizedAuditFilters } from '../src/tenant-admin/sections/audit/model.js';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const CORRELATION_ID = '22222222-2222-4222-8222-222222222222';

function event(overrides = {}) {
  return {
    id: '42',
    category: 'user',
    action: 'tenant.user_permissions.changed',
    actor: { userId: ACTOR_ID },
    target: { type: 'user', id: 'safe-local-user-id' },
    outcome: 'success',
    occurredAt: '2026-08-27T10:00:00.000Z',
    correlationId: CORRELATION_ID,
    change: {
      before: { active: true, lifecycleVersion: 1 },
      after: { active: false, lifecycleVersion: 2, status: 'Submitted' },
    },
    ...overrides,
  };
}

function page(overrides = {}) {
  return {
    events: [event()],
    nextBeforeId: null,
    window: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-28T00:00:00.000Z' },
    requestId: '33333333-3333-4333-8333-333333333333',
    ...overrides,
  };
}

test('audit adapter emits the bounded filter contract and one cursor page', async () => {
  const calls = [];
  const api = createTenantAuditApi({
    apiClient: {
      async request(path, options) {
        calls.push({ path, options });
        return page();
      },
    },
  });
  const result = await api.listAuditEvents({
    limit: 20,
    beforeId: '55',
    category: 'user',
    outcome: 'success',
    actorUserId: ACTOR_ID,
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-28T00:00:00.000Z',
  });
  const url = new URL(calls[0].path, 'https://tenant.invalid/');
  assert.equal(url.pathname, '/v1/audit');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    limit: '20',
    beforeId: '55',
    category: 'user',
    outcome: 'success',
    actorUserId: ACTOR_ID,
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-28T00:00:00.000Z',
  });
  assert.equal(calls[0].options, undefined);
  assert.equal(result.events[0].target.id, 'safe-local-user-id');
  assert.equal(result.events[0].change.after.status, 'Submitted');
  assert.equal(Object.hasOwn(result, 'requestId'), false);
});

test('audit filters reject invalid cursors, windows, categories, and actor authority before transport', async () => {
  let calls = 0;
  const api = createTenantAuditApi({ apiClient: { async request() { calls += 1; } } });
  const invalid = [
    { limit: 101 },
    { beforeId: '0' },
    { beforeId: '9223372036854775808' },
    { category: 'all_tenants' },
    { outcome: 'unknown' },
    { actorUserId: 'provider-object-id' },
    { from: '2026-08-01T00:00:00.000Z' },
    { from: '2026-01-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
  ];
  for (const filters of invalid) await assert.rejects(api.listAuditEvents(filters), TenantAuditApiError);
  assert.equal(calls, 0);
});

test('inclusive UTC date filters clamp today to now and reject browser-future authority', () => {
  const now = Date.parse('2026-08-27T12:00:00.000Z');
  assert.deepEqual(normalizedAuditFilters({
    category: '',
    outcome: '',
    actorUserId: '',
    fromDate: '2026-08-26',
    toDate: '2026-08-27',
  }, { clock: () => now }), {
    category: null,
    outcome: null,
    actorUserId: null,
    from: '2026-08-26T00:00:00.000Z',
    to: '2026-08-27T12:00:00.000Z',
    fromDate: '2026-08-26',
    toDate: '2026-08-27',
  });
  assert.throws(() => normalizedAuditFilters({
    category: '',
    outcome: '',
    actorUserId: '',
    fromDate: '2026-08-27',
    toDate: '2026-08-28',
  }, { clock: () => now }), /AUDIT_FILTER_WINDOW_INVALID/);
});

test('audit response rejects raw metadata, unknown change fields, and exposed tenant/provider identifiers', async () => {
  const invalidEvents = [
    { ...event(), metadata: { accessToken: 'secret' } },
    event({ change: { before: { email: 'ada@example.invalid' }, after: null } }),
    event({ target: { type: 'tenant', id: 'tenant-internal-id' } }),
    event({ target: { type: 'integration', id: 'provider-integration-id' } }),
    event({ action: 'future.unlocalized.action' }),
  ];
  for (const invalidEvent of invalidEvents) {
    const api = createTenantAuditApi({
      apiClient: { async request() { return page({ events: [invalidEvent] }); } },
    });
    await assert.rejects(
      api.listAuditEvents(),
      (error) => error.code === 'TENANT_AUDIT_RESPONSE_INVALID',
    );
  }
});

test('audit integrity failure remains distinct while internal server codes are concealed', async () => {
  for (const [serverCode, transportCode, expected] of [
    ['AUDIT_INTEGRITY_UNAVAILABLE', 'HTTP_503', 'AUDIT_INTEGRITY_UNAVAILABLE'],
    ['AUDIT_HMAC_KEY_ROTATION_DETAIL', 'HTTP_503', 'HTTP_503'],
  ]) {
    const api = createTenantAuditApi({
      apiClient: {
        async request() {
          const error = new Error('transport details');
          error.serverCode = serverCode;
          error.code = transportCode;
          throw error;
        },
      },
    });
    await assert.rejects(api.listAuditEvents(), (error) => error.code === expected);
  }
});

test('audit demo is deterministic, resettable, cursor bounded, and validates filters locally', async () => {
  const demo = createDemoTenantAudit();
  const first = await demo.listAuditEvents({ limit: 2 });
  const second = await demo.listAuditEvents({ limit: 2, beforeId: first.nextBeforeId });
  assert.deepEqual(first.events.map(({ id }) => id), ['104', '103']);
  assert.deepEqual(second.events.map(({ id }) => id), ['102', '101']);
  assert.equal(first.events.every((entry) => Object.hasOwn(entry, 'metadata') === false), true);
  const initial = await demo.listAuditEvents();
  demo.reset();
  assert.deepEqual(await demo.listAuditEvents(), initial);
  await assert.rejects(demo.listAuditEvents({ category: 'cross_tenant' }), (error) => error.code === 'HTTP_400');
});
