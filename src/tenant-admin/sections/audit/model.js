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
const TARGET_TYPES = new Set([
  'audit',
  'booking',
  'endpoint',
  'entitlement',
  'integration',
  'proposal',
  'request',
  'room',
  'tenant',
  'user',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_WINDOW_DAYS = 90;

export const AUDIT_FILTER_DEFAULTS = Object.freeze({
  category: null,
  outcome: null,
  actorUserId: null,
  from: null,
  to: null,
  fromDate: '',
  toDate: '',
});

export function auditActionKey(action) {
  return ACTIONS.has(action)
    ? `tenantAdmin.operations.audit.action.${action}`
    : 'tenantAdmin.operations.audit.action.unknown';
}

export function auditTargetTypeKey(type) {
  return TARGET_TYPES.has(type)
    ? `tenantAdmin.operations.audit.target.${type}`
    : 'tenantAdmin.operations.audit.target.generic';
}

export function auditErrorKey(code) {
  if (code === 'AUDIT_INTEGRITY_UNAVAILABLE') return 'tenantAdmin.operations.audit.error.integrity';
  if (code === 'HTTP_401') return 'tenantAdmin.operations.common.error.session';
  if (code === 'HTTP_403') return 'tenantAdmin.operations.common.error.forbidden';
  return 'tenantAdmin.operations.audit.error.load';
}

export function auditFilterErrorKey(code) {
  if (code === 'AUDIT_FILTER_ACTOR_INVALID') return 'tenantAdmin.operations.audit.filterError.actor';
  if (code === 'AUDIT_FILTER_WINDOW_INCOMPLETE') return 'tenantAdmin.operations.audit.filterError.incomplete';
  return 'tenantAdmin.operations.audit.filterError.window';
}

function dateInstant(value, endExclusive) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('AUDIT_FILTER_DATE_INVALID');
  }
  const instant = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== value) {
    throw new TypeError('AUDIT_FILTER_DATE_INVALID');
  }
  if (endExclusive) instant.setUTCDate(instant.getUTCDate() + 1);
  return instant.toISOString();
}

export function normalizedAuditFilters(
  { category, outcome, actorUserId, fromDate, toDate },
  { clock = () => Date.now() } = {},
) {
  const actor = String(actorUserId || '').trim();
  if (actor && !UUID_PATTERN.test(actor)) throw new TypeError('AUDIT_FILTER_ACTOR_INVALID');
  if (Boolean(fromDate) !== Boolean(toDate)) throw new TypeError('AUDIT_FILTER_WINDOW_INCOMPLETE');
  const now = clock();
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('AUDIT_FILTER_DATE_INVALID');
  const today = new Date(now).toISOString().slice(0, 10);
  if ((fromDate && fromDate > today) || (toDate && toDate > today)) {
    throw new TypeError('AUDIT_FILTER_WINDOW_INVALID');
  }
  const from = fromDate ? dateInstant(fromDate, false) : null;
  const exclusiveTo = toDate ? dateInstant(toDate, true) : null;
  const to = exclusiveTo === null
    ? null
    : new Date(Math.min(Date.parse(exclusiveTo), now)).toISOString();
  if (from !== null) {
    const duration = Date.parse(to) - Date.parse(from);
    if (duration <= 0 || duration > MAX_WINDOW_DAYS * 24 * 60 * 60 * 1_000) {
      throw new TypeError('AUDIT_FILTER_WINDOW_INVALID');
    }
  }
  return Object.freeze({
    category: category || null,
    outcome: outcome || null,
    actorUserId: actor || null,
    from,
    to,
    fromDate: fromDate || '',
    toDate: toDate || '',
  });
}
