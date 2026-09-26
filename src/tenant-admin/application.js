import { createTenantAdminSectionRegistry } from './section-registry.js';
import { createTenantAdminSettingsShell } from './settings-shell.js';

export function createTenantAdminApplication({
  context,
  appRoot,
  setPageHeading,
  sectionAdapters = null,
  userAdministration = null,
  microsoft365Connection = null,
  onboardingRuntime = null,
  onAuthorityFailure,
} = {}) {
  if (!context || typeof context.isTenantAdmin !== 'function') throw new TypeError('TENANT_ADMIN_CONTEXT_REQUIRED');
  if (!(appRoot instanceof HTMLElement)) throw new TypeError('TENANT_ADMIN_ROOT_REQUIRED');
  if (typeof setPageHeading !== 'function') throw new TypeError('TENANT_ADMIN_HEADING_REQUIRED');
  if (typeof onAuthorityFailure !== 'function') {
    throw new TypeError('TENANT_ADMIN_AUTHORITY_HANDLER_REQUIRED');
  }

  const adapters = sectionAdapters || Object.freeze({
    users: userAdministration,
    microsoft365: microsoft365Connection || onboardingRuntime
      ? Object.freeze({
        connection: microsoft365Connection,
        onboardingRuntime,
      })
      : null,
  });
  const sections = createTenantAdminSectionRegistry({ context, adapters, onAuthorityFailure });
  return createTenantAdminSettingsShell({
    appRoot,
    setPageHeading,
    sections,
  });
}
