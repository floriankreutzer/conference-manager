import { readFile } from 'node:fs/promises';

const productionSession = await readFile('src/platform/production-session.js', 'utf8');
for (const required of [
  "apiClient.request('v1/session')",
  "'conference_manager'",
  "'tenant_admin'",
  'csrfTokenProvider: () => csrfToken',
  'PRODUCTION_SESSION_UNAVAILABLE',
  'PRODUCTION_SESSION_INVALID',
]) {
  if (!productionSession.includes(required)) {
    throw new Error(`Production session boundary is missing ${required}.`);
  }
}
for (const forbidden of ['localStorage', 'sessionStorage', 'platform_admin']) {
  if (productionSession.includes(forbidden)) {
    throw new Error(`Production session must not establish authority from ${forbidden}.`);
  }
}

const api = await readFile('src/platform/tenant-user-administration-api.js', 'utf8');
for (const required of [
  "apiClient.request('v1/tenant/users?limit=100')",
  "method: 'PUT'",
  '`v1/tenant/users/${userId}/roles`',
  "'conference_manager'",
  "'tenant_admin'",
  'body: { roles: normalized }',
]) {
  if (!api.includes(required)) throw new Error(`Tenant role API adapter is missing ${required}.`);
}
for (const forbidden of ['tenantId', 'platform_admin', 'localStorage', 'sessionStorage', 'fetch(']) {
  if (api.includes(forbidden)) throw new Error(`Tenant role API adapter contains forbidden authority/transport ${forbidden}.`);
}

const context = await readFile('src/platform/application-context.js', 'utf8');
for (const required of [
  "PRODUCTION_CONFERENCE_MANAGER_ROLE = 'conference_manager'",
  "PRODUCTION_TENANT_ADMIN_ROLE = 'tenant_admin'",
  'productionRoles.has(PRODUCTION_CONFERENCE_MANAGER_ROLE)',
  'productionRoles.has(PRODUCTION_TENANT_ADMIN_ROLE)',
]) {
  if (!context.includes(required)) throw new Error(`Application context is missing role separation ${required}.`);
}
if (/isTenantAdmin\(\)[\s\S]{0,150}isManager\(\)/.test(context)) {
  throw new Error('Tenant Admin must not implicitly become Conference Manager.');
}

const shell = await readFile('src/platform/app-shell.js', 'utf8');
for (const required of [
  "nextView === 'manager' && !context.isManager()",
  "nextView === 'tenantAdmin' && (!context.isTenantAdmin() || !tenantAdmin)",
  "navButton('nav.tenantAdmin', 'tenantAdmin')",
  "view === 'tenantAdmin'",
  "t('profile.role.tenantAdmin')",
]) {
  if (!shell.includes(required)) throw new Error(`Application shell is missing Tenant Admin separation ${required}.`);
}

const application = await readFile('src/tenant-admin/application.js', 'utf8');
for (const required of [
  'context.userId()',
  'elevatedRolesFromUser',
  'canSelectRole',
  'userAdministration.setRoles(user.id, currentSelection(controls))',
  "dataset: { tenantRoleAction: 'save' }",
  "attrs: { 'aria-labelledby': headingId }",
  "attrs: { 'aria-live': 'polite' }",
]) {
  if (!application.includes(required)) throw new Error(`Tenant Admin UI is missing ${required}.`);
}
for (const forbidden of ['innerHTML', 'tenantId', 'platform_admin', 'localStorage', 'sessionStorage']) {
  if (application.includes(forbidden)) throw new Error(`Tenant Admin UI contains forbidden ${forbidden}.`);
}

const app = await readFile('src/app.js', 'utf8');
for (const required of [
  "from './tenant-admin/index.js'",
  "from './platform/production-session.js'",
  "from './platform/tenant-user-administration-api.js'",
  'context.isTenantAdmin() && productionRuntime',
  'createTenantUserAdministrationApi({ apiClient: productionRuntime.apiClient })',
]) {
  if (!app.includes(required)) throw new Error(`Composition Root is missing Tenant Admin wiring ${required}.`);
}

const messages = await readFile('src/core/i18n-capability-messages.js', 'utf8');
for (const key of [
  'nav.tenantAdmin',
  'profile.role.tenantAdmin',
  'tenantAdmin.users.roleConferenceManager',
  'tenantAdmin.users.roleTenantAdmin',
  'tenantAdmin.users.errorConflict',
]) {
  const occurrences = messages.split(`"${key}"`).length - 1;
  if (occurrences !== 2) throw new Error(`Tenant Admin localization key ${key} must exist exactly once in DE and EN.`);
}

const css = await readFile('assets/app-layout.css', 'utf8');
for (const required of [
  '.tenant-user-grid',
  '.tenant-user-card',
  '.tenant-role-fieldset',
  '.tenant-role-option',
  '@media (max-width: 760px)',
]) {
  if (!css.includes(required)) throw new Error(`Tenant Admin responsive layout is missing ${required}.`);
}

console.log('Tenant role administration frontend boundary check passed.');
