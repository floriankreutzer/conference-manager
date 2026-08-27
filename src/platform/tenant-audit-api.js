const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const AUDIT_CURSOR_PATTERN = /^[1-9]\d{0,18}$/;
const MAX_AUDIT_ID = 9_223_372_036_854_775_807n;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1_000;
const CATEGORIES = new Set(['user', 'configuration', 'request', 'integration', 'security']);
const OUTCOMES = new Set(['success', 'failure', 'denied']);
const ACTIONS = new Set([
  'session.issued',
  'session.revoked',
  'session.rotated',
  'authentication.failed',
  'authorization.denied',
  'request.created',
  'request.transition',
  'request.transition_failed',
  'request.booking_change',
  'tenant.configuration.changed',
  'tenant.user_permissions.changed',
  'tenant.entitlement.changed',
  'tenant.lifecycle.changed',
  'tenant.onboarding.invited',
  'tenant.identity.claimed',
  'tenant.identity.unbound',
  'tenant.user.provisioned',
  'tenant.user.profile_updated',
  'integration.connected',
  'integration.disconnected',
  'integration.admin_consent.changed',
  'integration.verified',
  'calendar.operation',
  'audit.read',
]);
const SUMMARY_KEYS = new Set([
  'active',
  'conferenceManager',
  'enabled',
  'lifecycleVersion',
  'profileUpdated',
  'provider',
  'providerStatus',
  'siteCount',
  'status',
  'tenantAdmin',
]);
const BOOLEAN_SUMMARY_KEYS = new Set([
  'active',
  'conferenceManager',
  'enabled',
  'profileUpdated',
  'tenantAdmin',
]);
const INTEGER_SUMMARY_KEYS = new Set(['lifecycleVersion', 'siteCount']);
const STRING_SUMMARY_KEYS = new Set(['provider', 'providerStatus', 'status']);
const TARGET_TYPE_PATTERN = /^[a-z][a-z0-9_:-]{0,63}$/;
const TARGET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!plain(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isUtcInstant(value) {
  return typeof value === 'string'
    && UTC_INSTANT_PATTERN.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function normalizedCursor(value, code = 'TENANT_AUDIT_CURSOR_INVALID') {
  if (
    typeof value !== 'string'
    || !AUDIT_CURSOR_PATTERN.test(value)
    || BigInt(value) > MAX_AUDIT_ID
  ) throw new TenantAuditApiError(code);
  return value;
}

function normalizedSummary(value) {
  if (value === null) return null;
  if (!plain(value) || Object.keys(value).length > SUMMARY_KEYS.size) return undefined;
  const summary = {};
  for (const [key, entry] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    if (!SUMMARY_KEYS.has(key)) return undefined;
    if (BOOLEAN_SUMMARY_KEYS.has(key) && typeof entry !== 'boolean') return undefined;
    if (
      INTEGER_SUMMARY_KEYS.has(key)
      && (!Number.isSafeInteger(entry) || entry < 0)
    ) return undefined;
    if (
      STRING_SUMMARY_KEYS.has(key)
      && (
        typeof entry !== 'string'
        || entry.length < 1
        || entry.length > 64
        || entry.trim() !== entry
        || /[\u0000-\u001f\u007f]/.test(entry)
      )
    ) return undefined;
    summary[key] = entry;
  }
  return Object.freeze(summary);
}

function normalizedEvent(value) {
  if (!exactKeys(value, [
    'id',
    'category',
    'action',
    'actor',
    'target',
    'outcome',
    'occurredAt',
    'correlationId',
    'change',
  ])) return null;
  if (
    !AUDIT_CURSOR_PATTERN.test(value.id || '')
    || BigInt(value.id) > MAX_AUDIT_ID
    || !CATEGORIES.has(value.category)
    || !ACTIONS.has(value.action)
    || !OUTCOMES.has(value.outcome)
    || !isUtcInstant(value.occurredAt)
    || !isUuid(value.correlationId)
    || !exactKeys(value.actor, ['userId'])
    || (value.actor.userId !== null && !isUuid(value.actor.userId))
    || !exactKeys(value.target, ['type', 'id'])
    || !TARGET_TYPE_PATTERN.test(value.target.type || '')
    || !exactKeys(value.change, ['before', 'after'])
  ) return null;
  const concealedTarget = value.target.type === 'tenant' || value.target.type === 'integration';
  if (
    (concealedTarget && value.target.id !== null)
    || (!concealedTarget && value.target.id !== null && !TARGET_ID_PATTERN.test(value.target.id))
  ) return null;
  const before = normalizedSummary(value.change.before);
  const after = normalizedSummary(value.change.after);
  if (before === undefined || after === undefined) return null;
  return Object.freeze({
    id: value.id,
    category: value.category,
    action: value.action,
    actor: Object.freeze({
      userId: value.actor.userId === null ? null : value.actor.userId.toLowerCase(),
    }),
    target: Object.freeze({ type: value.target.type, id: value.target.id }),
    outcome: value.outcome,
    occurredAt: value.occurredAt,
    correlationId: value.correlationId.toLowerCase(),
    change: Object.freeze({ before, after }),
  });
}

function normalizedWindow(value) {
  if (!exactKeys(value, ['from', 'to']) || !isUtcInstant(value.from) || !isUtcInstant(value.to)) return null;
  const from = Date.parse(value.from);
  const to = Date.parse(value.to);
  if (from >= to || to - from > MAX_WINDOW_MS) return null;
  return Object.freeze({ from: value.from, to: value.to });
}

function normalizedPage(value) {
  if (
    !exactKeys(value, ['events', 'nextBeforeId', 'window', 'requestId'])
    || !isUuid(value.requestId)
    || !Array.isArray(value.events)
    || value.events.length > MAX_PAGE_SIZE
  ) return null;
  const events = value.events.map(normalizedEvent);
  if (events.some((event) => !event) || new Set(events.map((event) => event.id)).size !== events.length) return null;
  if (value.nextBeforeId !== null) {
    try {
      normalizedCursor(value.nextBeforeId);
    } catch {
      return null;
    }
    if (events.length === 0 || events.at(-1)?.id !== value.nextBeforeId) return null;
  }
  const window = normalizedWindow(value.window);
  if (!window) return null;
  return Object.freeze({
    events: Object.freeze(events),
    nextBeforeId: value.nextBeforeId,
    window,
  });
}

function normalizedQuery({
  limit = DEFAULT_PAGE_SIZE,
  beforeId = null,
  category = null,
  outcome = null,
  actorUserId = null,
  from = null,
  to = null,
} = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new TenantAuditApiError('TENANT_AUDIT_LIMIT_INVALID');
  }
  if (beforeId !== null) normalizedCursor(beforeId);
  if (category !== null && !CATEGORIES.has(category)) throw new TenantAuditApiError('TENANT_AUDIT_CATEGORY_INVALID');
  if (outcome !== null && !OUTCOMES.has(outcome)) throw new TenantAuditApiError('TENANT_AUDIT_OUTCOME_INVALID');
  if (actorUserId !== null && !isUuid(actorUserId)) throw new TenantAuditApiError('TENANT_AUDIT_ACTOR_INVALID');
  if ((from === null) !== (to === null)) throw new TenantAuditApiError('TENANT_AUDIT_WINDOW_INVALID');
  if (from !== null) {
    const window = normalizedWindow({ from, to });
    if (!window) throw new TenantAuditApiError('TENANT_AUDIT_WINDOW_INVALID');
  }
  return Object.freeze({ limit, beforeId, category, outcome, actorUserId, from, to });
}

function queryPath(query) {
  const parameters = new URLSearchParams({ limit: String(query.limit) });
  for (const key of ['beforeId', 'category', 'outcome', 'actorUserId', 'from', 'to']) {
    if (query[key] !== null) parameters.set(key, query[key]);
  }
  return `v1/audit?${parameters}`;
}

export class TenantAuditApiError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'TenantAuditApiError';
    this.code = code;
  }
}

export function createTenantAuditApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('TENANT_AUDIT_API_CLIENT_REQUIRED');
  return Object.freeze({
    async listAuditEvents(filters = {}) {
      let payload;
      try {
        payload = await apiClient.request(queryPath(normalizedQuery(filters)));
      } catch (error) {
        const code = error?.serverCode === 'AUDIT_INTEGRITY_UNAVAILABLE'
          ? error.serverCode
          : (error?.code || 'TENANT_AUDIT_UNAVAILABLE');
        throw new TenantAuditApiError(code, { cause: error });
      }
      const page = normalizedPage(payload);
      if (!page) throw new TenantAuditApiError('TENANT_AUDIT_RESPONSE_INVALID');
      return page;
    },
  });
}
