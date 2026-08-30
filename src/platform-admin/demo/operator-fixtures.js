import { normalizePlatformOperator } from '../contracts.js';

const READER_PERMISSIONS = Object.freeze([
  'platform:tenant:read',
  'platform:readiness:read',
  'platform:integration-health:read',
  'platform:diagnostics:read',
  'platform:entitlement:read',
  'platform:metering:read',
  'platform:runtime:read',
]);

const MFA_ASSURANCE = Object.freeze({
  level: 'mfa',
  authenticatedAt: '2099-01-01T00:00:00.000Z',
  stepUpExpiresAt: null,
});

const STEP_UP_ASSURANCE = Object.freeze({
  level: 'step_up',
  authenticatedAt: '2099-01-01T00:00:00.000Z',
  stepUpExpiresAt: '2099-01-01T00:05:00.000Z',
});

const OPERATOR_FIXTURES = Object.freeze({
  support_reader: Object.freeze({
    id: '00000000-0000-4000-8000-000000000101',
    roles: ['platform_support_reader'],
    permissions: READER_PERMISSIONS,
    assurance: MFA_ASSURANCE,
  }),
  tenant_operator: Object.freeze({
    id: '00000000-0000-4000-8000-000000000102',
    roles: ['platform_tenant_operator'],
    permissions: [
      ...READER_PERMISSIONS,
      'platform:invitation:manage',
      'platform:lifecycle:manage',
      'platform:entitlement:manage',
      'platform:quota:manage',
    ],
    assurance: STEP_UP_ASSURANCE,
  }),
  security_auditor: Object.freeze({
    id: '00000000-0000-4000-8000-000000000103',
    roles: ['platform_security_auditor'],
    permissions: [
      'platform:tenant:read',
      'platform:diagnostics:read',
      'platform:diagnostics:sensitive',
      'platform:audit:read',
      'platform:audit:export',
      'platform:runtime:read',
    ],
    assurance: STEP_UP_ASSURANCE,
  }),
  security_admin: Object.freeze({
    id: '00000000-0000-4000-8000-000000000104',
    roles: ['platform_security_admin'],
    permissions: [
      'platform:tenant:read',
      'platform:diagnostics:read',
      'platform:diagnostics:sensitive',
      'platform:recovery:execute',
      'platform:audit:read',
      'platform:session:revoke',
      'platform:operator:manage',
      'platform:break-glass:manage',
    ],
    assurance: STEP_UP_ASSURANCE,
  }),
});

export const PLATFORM_ADMIN_DEMO_ROLE_IDS = Object.freeze(Object.keys(OPERATOR_FIXTURES));

export function platformAdminDemoOperator(roleId) {
  const fixture = OPERATOR_FIXTURES[roleId] || OPERATOR_FIXTURES.support_reader;
  return normalizePlatformOperator(fixture);
}
