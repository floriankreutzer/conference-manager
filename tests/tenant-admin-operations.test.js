import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { TENANT_ADMIN_OPERATIONS_MESSAGES } from '../src/core/i18n-tenant-admin-operations-messages.js';
import { auditActionKey, auditTargetTypeKey } from '../src/tenant-admin/sections/audit/model.js';
import {
  capabilityNameKey,
  capabilityReasonKey,
} from '../src/tenant-admin/sections/capabilities/model.js';
import {
  microsoftConnectionReasonKey,
  microsoftHealthReasonKey,
} from '../src/tenant-admin/sections/microsoft365/model.js';

const ACTIONS = [
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
];
const TARGETS = ['audit', 'booking', 'endpoint', 'entitlement', 'integration', 'proposal', 'request', 'room', 'tenant', 'user'];
const CAPABILITIES = [
  'tenant.user_administration',
  'tenant.audit_history',
  'tenant.configuration',
  'microsoft.directory',
  'microsoft.calendar',
  'microsoft.calendar.write',
];
const CAPABILITY_REASONS = [
  'tenant_not_active',
  'tenant_state_unknown',
  'authority_missing',
  'rollout_state_unknown',
  'rollout_disabled',
  'entitlement_missing',
  'readiness_unknown',
  'tenant_identity_required',
  'microsoft_connection_required',
  'provider_permission_required',
  'verification_required',
  'provider_health_unknown',
  'provider_degraded',
  'provider_unavailable',
  'microsoft_reconnect_required',
  'readiness_stale',
];
const CONNECTION_REASONS = [
  'calendars_permission_missing',
  'calendars_permission_unverified',
  'consent_denied',
  'consent_unavailable',
  'places_permission_missing',
  'provider_authorization_failed',
  'provider_binding_changed',
  'provider_response_invalid',
  'provider_tenant_mismatch',
  'provider_unauthorized',
  'provider_unavailable',
];
const HEALTH_REASONS = [
  'calendar_write_permission_missing',
  'free_busy_permission_missing',
  'places_permission_missing',
  'provider_authorization_failed',
  'provider_operation_failed',
  'provider_permission_missing',
  'provider_throttled',
  'provider_unauthorized',
  'provider_unavailable',
  'resource_mapping_invalid',
];

function placeholders(value) {
  return [...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

test('operations catalogue has synchronized DE/EN keys and placeholder contracts', () => {
  const de = Object.keys(TENANT_ADMIN_OPERATIONS_MESSAGES.de).sort();
  const en = Object.keys(TENANT_ADMIN_OPERATIONS_MESSAGES.en).sort();
  assert.deepEqual(en, de);
  for (const key of de) {
    assert.notEqual(TENANT_ADMIN_OPERATIONS_MESSAGES.de[key].trim(), '');
    assert.notEqual(TENANT_ADMIN_OPERATIONS_MESSAGES.en[key].trim(), '');
    assert.deepEqual(
      placeholders(TENANT_ADMIN_OPERATIONS_MESSAGES.en[key]),
      placeholders(TENANT_ADMIN_OPERATIONS_MESSAGES.de[key]),
      key,
    );
  }
});

test('every canonical audit, capability, and Microsoft reason maps to localized DE/EN copy', () => {
  const keys = [
    ...ACTIONS.map(auditActionKey),
    ...TARGETS.map(auditTargetTypeKey),
    ...CAPABILITIES.map(capabilityNameKey),
    ...CAPABILITY_REASONS.map(capabilityReasonKey),
    ...CONNECTION_REASONS.map(microsoftConnectionReasonKey),
    ...HEALTH_REASONS.map(microsoftHealthReasonKey),
  ];
  for (const key of keys) {
    assert.equal(typeof TENANT_ADMIN_OPERATIONS_MESSAGES.de[key], 'string', `missing DE ${key}`);
    assert.equal(typeof TENANT_ADMIN_OPERATIONS_MESSAGES.en[key], 'string', `missing EN ${key}`);
  }
});

test('unknown server taxonomies map to generic localized copy instead of raw identifiers', () => {
  assert.equal(auditActionKey('provider.secret.action'), 'tenantAdmin.operations.audit.action.unknown');
  assert.equal(auditTargetTypeKey('provider_tenant'), 'tenantAdmin.operations.audit.target.generic');
  assert.equal(capabilityNameKey('future.capability'), 'tenantAdmin.operations.capabilities.name.unknown');
  assert.equal(capabilityReasonKey('database_exception'), 'tenantAdmin.operations.capabilities.reason.unknown');
  assert.equal(microsoftConnectionReasonKey('provider_stack_trace'), 'tenantAdmin.operations.microsoft365.reason.unknown');
  assert.equal(microsoftHealthReasonKey('provider_stack_trace'), 'tenantAdmin.operations.microsoft365.reason.unknown');
});

test('section-private renderers do not import Platform or expose provider credentials and raw audit metadata', () => {
  const sections = [
    'src/tenant-admin/sections/users/index.js',
    'src/tenant-admin/sections/microsoft365/index.js',
    'src/tenant-admin/sections/audit/index.js',
    'src/tenant-admin/sections/capabilities/index.js',
  ].map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(sections, /from ['"]\.\.\/\.\.\/\.\.\/platform\//i);
  assert.doesNotMatch(sections, /accessToken|refreshToken|clientSecret|resourceAddress|externalRoomId|providerTenantId/);
  assert.doesNotMatch(sections, /\.metadata\b|retentionClass|integrityHmac|previousHash/);
  assert.doesNotMatch(sections, /setEntitlement|updateEntitlement|enableCapability/);
});

test('mutating controls expose status, focus recovery, and explicit consequence text', () => {
  const users = readFileSync('src/tenant-admin/sections/users/index.js', 'utf8');
  const microsoft365 = readFileSync('src/tenant-admin/sections/microsoft365/index.js', 'utf8');
  assert.match(users, /'aria-live': 'polite', 'aria-atomic': 'true'/);
  assert.match(users, /lifecycle\.focus\(\)/);
  assert.match(users, /pendingFocus = updated\.id/);
  assert.doesNotMatch(users, /requestAnimationFrame\(\(\) => \{\s*if \(focusTarget/);
  assert.match(users, /let mutationPending = false/);
  assert.match(users, /if \(mutationPending\) return/);
  assert.match(users, /lifecycle\.disabled = pending/);
  assert.match(users, /tenantAdmin\.operations\.users\.disableEffect/);
  assert.match(microsoft365, /disconnect\.setAttribute\('aria-describedby', 'tenant-microsoft365-disconnect-warning'\)/);
  assert.match(microsoft365, /resync\.focus\(\)/);
  assert.match(microsoft365, /tenantAdmin\.operations\.microsoft365\.resyncWarning/);
});

test('operations stylesheet uses canonical tokens and includes bounded responsive layouts', () => {
  const css = readFileSync('assets/tenant-admin-operations.css', 'utf8');
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /var\(--color-/);
  assert.match(
    css,
    /\.tenant-admin-capability-list\s*>\s*\.tenant-capability-card\s*\{[^}]*display:\s*grid[^}]*align-items:\s*stretch[^}]*justify-content:\s*stretch/s,
  );
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/i);
});

test('capability recovery delegates internal navigation to the settings shell', () => {
  const shell = readFileSync('src/tenant-admin/settings-shell.js', 'utf8');
  const capabilities = readFileSync('src/tenant-admin/sections/capabilities/index.js', 'utf8');
  assert.match(shell, /const isCurrent = \(\) => generation === currentGeneration[\s\S]*shell\.parentNode === appRoot[\s\S]*sessionLocked/);
  assert.match(shell, /activeSection\.render\(\{[\s\S]*navigate: guardedNavigate,[\s\S]*rerender,/);
  assert.match(capabilities, /event\.preventDefault\(\);\s*navigate\('microsoft365'\);/);
});

test('section navigation focus is consumed before asynchronous section completion', () => {
  const shell = readFileSync('src/tenant-admin/settings-shell.js', 'utf8');
  const render = shell.indexOf('const sectionRender = activeSection.render');
  const focus = shell.indexOf('focusActiveHeading(activeSection.id, currentGeneration, shell)', render);
  const completion = shell.indexOf('Promise.resolve(sectionRender)', render);
  assert.ok(render >= 0 && focus > render && completion > focus);
});

test('production adapters never import Demo and Demo adapters have no external transport', () => {
  const platform = [
    'src/platform/tenant-user-operations-api.js',
    'src/platform/microsoft365-operations-api.js',
    'src/platform/tenant-audit-api.js',
    'src/platform/tenant-capabilities-api.js',
  ].map((path) => readFileSync(path, 'utf8')).join('\n');
  const demo = [
    'src/tenant-admin/demo-user-operations.js',
    'src/tenant-admin/demo-microsoft365-operations.js',
    'src/tenant-admin/demo-tenant-audit.js',
    'src/tenant-admin/demo-tenant-capabilities.js',
  ].map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(platform, /demo/i);
  assert.doesNotMatch(demo, /\bfetch\b|XMLHttpRequest|apiClient|localStorage|sessionStorage/);
});
