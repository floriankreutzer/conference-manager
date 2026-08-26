import { readFile } from 'node:fs/promises';

const securityPolicy = await readFile('src/core/security-policy.js', 'utf8');
for (const required of [
  "TENANT_ADMIN: 'tenant_admin'",
  'normalizeDemoRole',
]) {
  if (!securityPolicy.includes(required)) throw new Error(`Demo role policy is missing ${required}.`);
}

const productionSession = await readFile('src/platform/production-session.js', 'utf8');
for (const required of [
  'apiClient.request(SESSION_PATH',
  "CONFERENCE_MANAGER: 'conference_manager'",
  "TENANT_ADMIN: 'tenant_admin'",
  'csrfTokenProvider: () => currentSession?.csrfToken || null',
  "ProductionSessionError('SESSION_BOOTSTRAP_TIMEOUT'",
  'validFutureTimestamp(session.expiresAt, clock())',
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
  'apiClient.request(`v1/tenant/users?limit=${PAGE_SIZE}${cursor}`)',
  'nextAfterId',
  'seenCursors',
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

const demoAdministration = await readFile('src/tenant-admin/demo-user-administration.js', 'utf8');
for (const required of [
  'createDemoTenantUserAdministration',
  "TENANT_ELEVATED_ROLE.TENANT_ADMIN",
  "TENANT_ELEVATED_ROLE.CONFERENCE_MANAGER",
  "throw demoError('HTTP_403')",
  "throw demoError('HTTP_409')",
]) {
  if (!demoAdministration.includes(required)) throw new Error(`Tenant Admin demo adapter is missing ${required}.`);
}
for (const forbidden of ['platform_admin', 'localStorage', 'sessionStorage', 'fetch(', 'apiClient']) {
  if (demoAdministration.includes(forbidden)) {
    throw new Error(`Tenant Admin demo adapter must remain isolated from production authority/transport: ${forbidden}.`);
  }
}

const context = await readFile('src/platform/application-context.js', 'utf8');
for (const required of [
  "DEMO_CURRENT_USER_ID = 'demo-current-user'",
  'readString(KEYS.role, USER_ROLE.EMPLOYEE) === USER_ROLE.TENANT_ADMIN',
  'PRODUCTION_TENANT_ROLE.CONFERENCE_MANAGER',
  'PRODUCTION_PERMISSION.REQUEST_MANAGE',
  'PRODUCTION_TENANT_ROLE.TENANT_ADMIN',
  'PRODUCTION_PERMISSION.TENANT_USERS_MANAGE',
  'trustedProductionSession?.user?.id',
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
  "value: 'tenant_admin'",
  "view === 'tenantAdmin'",
  "!context.isTenantAdmin() && view === 'tenantAdmin'",
  "t('profile.role.tenantAdmin')",
]) {
  if (!shell.includes(required)) throw new Error(`Application shell is missing Tenant Admin separation ${required}.`);
}

const userSection = await readFile('src/tenant-admin/sections/users/index.js', 'utf8');
for (const required of [
  'context.userId()',
  'context.isDemoRuntime()',
  'elevatedRolesFromUser',
  'canSelectRole',
  'adapter.setRoles(user.id, currentSelection(controls))',
  "dataset: { tenantRoleAction: 'save' }",
  "'aria-labelledby': headingId",
  "tabindex: '-1'",
  "attrs: { 'aria-live': 'polite' }",
]) {
  if (!userSection.includes(required)) throw new Error(`Tenant Admin User section is missing ${required}.`);
}
for (const forbidden of ['innerHTML', 'tenantId', 'platform_admin', 'localStorage', 'sessionStorage']) {
  if (userSection.includes(forbidden)) throw new Error(`Tenant Admin User section contains forbidden ${forbidden}.`);
}

const application = await readFile('src/tenant-admin/application.js', 'utf8');
for (const required of [
  'createTenantAdminSectionRegistry',
  'createTenantAdminSettingsShell',
  'sectionAdapters',
]) {
  if (!application.includes(required)) throw new Error(`Tenant Admin composition is missing ${required}.`);
}
for (const forbidden of ['innerHTML', 'tenantId', 'platform_admin', 'localStorage', 'sessionStorage']) {
  if (application.includes(forbidden)) throw new Error(`Tenant Admin composition contains forbidden ${forbidden}.`);
}

const app = await readFile('src/app.js', 'utf8');
for (const required of [
  "from './tenant-admin/index.js'",
  "from './platform/tenant-user-administration-api.js'",
  'context.isDemoRuntime()',
  'createDemoTenantUserAdministration({',
  'const authentication = context.authenticationRuntime()',
  'context.isTenantAdmin() && authentication',
  'createTenantUserAdministrationApi({ apiClient: authentication.apiClient })',
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

const css = await readFile('assets/app-layout-foundation.css', 'utf8');
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
