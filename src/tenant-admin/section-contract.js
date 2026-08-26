export const TENANT_ADMIN_SECTION_PERMISSION = Object.freeze({
  CONFIGURE: 'tenant:configure',
  USERS_MANAGE: 'tenant:users:manage',
  INTEGRATIONS_MANAGE: 'tenant:integrations:manage',
  AUDIT_READ: 'tenant:audit:read',
});

const SECTION_ID = /^[a-z][a-z0-9-]{0,63}$/;
const TRANSLATION_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const KNOWN_PERMISSIONS = new Set(Object.values(TENANT_ADMIN_SECTION_PERMISSION));

export function defineTenantAdminSection({
  id,
  titleKey,
  descriptionKey,
  permission,
  available,
  render,
} = {}) {
  if (typeof id !== 'string' || !SECTION_ID.test(id)) {
    throw new TypeError('TENANT_ADMIN_SECTION_ID_INVALID');
  }
  if (
    typeof titleKey !== 'string'
    || !TRANSLATION_KEY.test(titleKey)
    || typeof descriptionKey !== 'string'
    || !TRANSLATION_KEY.test(descriptionKey)
  ) {
    throw new TypeError('TENANT_ADMIN_SECTION_TRANSLATION_INVALID');
  }
  if (!KNOWN_PERMISSIONS.has(permission)) {
    throw new TypeError('TENANT_ADMIN_SECTION_PERMISSION_INVALID');
  }
  if (typeof available !== 'boolean' || typeof render !== 'function') {
    throw new TypeError('TENANT_ADMIN_SECTION_CONTRACT_INVALID');
  }

  return Object.freeze({
    id,
    titleKey,
    descriptionKey,
    permission,
    available,
    render,
  });
}
