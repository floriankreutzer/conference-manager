const NOW = '2026-08-27T12:00:00.000Z';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_AUDIT_ID = 9_223_372_036_854_775_807n;
const CATEGORIES = new Set(['user', 'configuration', 'request', 'integration', 'security']);
const OUTCOMES = new Set(['success', 'failure', 'denied']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function demoError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validCursor(value) {
  return typeof value === 'string'
    && /^[1-9]\d{0,18}$/.test(value)
    && BigInt(value) <= MAX_AUDIT_ID;
}

function validInstant(value) {
  return typeof value === 'string'
    && UTC_INSTANT_PATTERN.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function event({
  id,
  category,
  action,
  actorUserId,
  targetType,
  targetId,
  outcome,
  occurredAt,
  before = null,
  after = null,
}) {
  return Object.freeze({
    id,
    category,
    action,
    actor: Object.freeze({ userId: actorUserId }),
    target: Object.freeze({ type: targetType, id: targetId }),
    outcome,
    occurredAt,
    correlationId: `00000000-0000-4000-8000-${id.padStart(12, '0')}`,
    change: Object.freeze({
      before: before === null ? null : Object.freeze({ ...before }),
      after: after === null ? null : Object.freeze({ ...after }),
    }),
  });
}

function fixtures() {
  return Object.freeze([
    event({
      id: '104',
      category: 'user',
      action: 'tenant.user_permissions.changed',
      actorUserId: '00000000-0000-4000-8000-000000000001',
      targetType: 'user',
      targetId: 'demo-employee',
      outcome: 'success',
      occurredAt: '2026-08-27T09:45:00.000Z',
      before: { active: true, lifecycleVersion: 1 },
      after: { active: false, lifecycleVersion: 2 },
    }),
    event({
      id: '103',
      category: 'integration',
      action: 'integration.verified',
      actorUserId: '00000000-0000-4000-8000-000000000001',
      targetType: 'integration',
      targetId: null,
      outcome: 'success',
      occurredAt: '2026-08-27T08:15:00.000Z',
      before: { providerStatus: 'degraded' },
      after: { providerStatus: 'connected' },
    }),
    event({
      id: '102',
      category: 'security',
      action: 'authorization.denied',
      actorUserId: '00000000-0000-4000-8000-000000000003',
      targetType: 'endpoint',
      targetId: 'tenant-audit-query',
      outcome: 'denied',
      occurredAt: '2026-08-26T14:20:00.000Z',
    }),
    event({
      id: '101',
      category: 'configuration',
      action: 'tenant.configuration.changed',
      actorUserId: '00000000-0000-4000-8000-000000000001',
      targetType: 'tenant',
      targetId: null,
      outcome: 'success',
      occurredAt: '2026-08-25T11:00:00.000Z',
      before: { siteCount: 1 },
      after: { siteCount: 2 },
    }),
  ]);
}

function normalizedWindow(from, to) {
  const toValue = to || NOW;
  const fromValue = from || new Date(Date.parse(toValue) - THIRTY_DAYS_MS).toISOString();
  return Object.freeze({ from: fromValue, to: toValue });
}

export function createDemoTenantAudit() {
  let events = fixtures();
  return Object.freeze({
    isDemo: true,
    async listAuditEvents({
      limit = 25,
      beforeId = null,
      category = null,
      outcome = null,
      actorUserId = null,
      from = null,
      to = null,
    } = {}) {
      if (
        !Number.isSafeInteger(limit)
        || limit < 1
        || limit > 100
        || (beforeId !== null && !validCursor(beforeId))
        || (category !== null && !CATEGORIES.has(category))
        || (outcome !== null && !OUTCOMES.has(outcome))
        || (actorUserId !== null && !UUID_PATTERN.test(actorUserId))
        || ((from === null) !== (to === null))
        || (from !== null && (!validInstant(from) || !validInstant(to)))
      ) throw demoError('HTTP_400');
      const window = normalizedWindow(from, to);
      if (
        Date.parse(window.from) >= Date.parse(window.to)
        || Date.parse(window.to) - Date.parse(window.from) > 90 * 24 * 60 * 60 * 1_000
      ) throw demoError('HTTP_400');
      const visible = events.filter((entry) => (
        (beforeId === null || BigInt(entry.id) < BigInt(beforeId))
        && (category === null || entry.category === category)
        && (outcome === null || entry.outcome === outcome)
        && (actorUserId === null || entry.actor.userId === actorUserId)
        && Date.parse(entry.occurredAt) >= Date.parse(window.from)
        && Date.parse(entry.occurredAt) < Date.parse(window.to)
      ));
      const page = visible.slice(0, limit);
      return Object.freeze({
        events: Object.freeze(page),
        nextBeforeId: visible.length > page.length ? page.at(-1)?.id || null : null,
        window,
      });
    },
    reset() {
      events = fixtures();
    },
  });
}
