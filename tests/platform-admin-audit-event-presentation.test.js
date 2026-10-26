import test from 'node:test';
import assert from 'node:assert/strict';

import { auditEventPresentation } from '../src/platform-admin/audit-event-presentation.js';

const currentPlatformActions = [
  'platform.authentication.succeeded',
  'platform.authentication.failed',
  'platform.authorization.denied',
  'platform.session.issued',
  'platform.session.rotated',
  'platform.session.revoked',
  'platform.session.epoch_rejected',
  'platform.break_glass.granted',
  'platform.break_glass.revoked',
  'platform.break_glass.used',
  'platform.break_glass.denied',
  'platform.tenant.directory.read',
  'platform.tenant.registration.changed',
  'platform.tenant.invitation.changed',
  'platform.tenant.lifecycle.changed',
  'platform.tenant.entitlement.changed',
  'platform.tenant.quota.changed',
  'platform.tenant.configuration.changed',
  'platform.tenant.integration.changed',
  'platform.tenant.readiness.read',
  'platform.diagnostics.read',
  'platform.metering.read',
  'platform.runtime.read',
  'platform.recovery.previewed',
  'platform.recovery.executed',
  'platform.audit.read',
  'platform.audit.exported',
  'platform.operator.changed',
  'platform.synthetic_access.approved',
];

test('known Platform audit actions receive specific localized presentation keys', () => {
  for (const action of currentPlatformActions) {
    const presentation = auditEventPresentation(action);
    assert.match(presentation.messageKey, /^platformAdmin\.audit\.event\.(?!unknown$)[A-Za-z]+$/);
  }
  assert.equal(
    auditEventPresentation('platform.authentication.failed').messageKey,
    'platformAdmin.audit.event.authenticationFailed',
  );
});

test('unmapped audit actions use a localized fallback', () => {
  assert.deepEqual(auditEventPresentation('platform.future.action'), {
    messageKey: 'platformAdmin.audit.event.unknown',
  });
  assert.deepEqual(auditEventPresentation(null), {
    messageKey: 'platformAdmin.audit.event.unknown',
  });
});
