import { readFile } from 'node:fs/promises';

const production = await readFile('src/platform/production-persistence.js', 'utf8');
for (const forbidden of ['localStorage', 'sessionStorage', "../core/storage.js", 'conference_requests']) {
  if (production.includes(forbidden)) {
    throw new Error(`Production persistence adapter must not depend on browser persistence: ${forbidden}.`);
  }
}
for (const required of [
  "profile: 'v1/application/profile'",
  "catalog: 'v1/application/catalog'",
  "siteInfo: 'v1/application/site-info'",
  "requests: 'v1/application/requests'",
  "notifications: 'v1/application/notifications'",
  "configuration: 'v1/application/configuration'",
  'PRODUCTION_SCHEMA_VERSION_UNSUPPORTED',
  'PRODUCTION_PERSISTENCE_UNAVAILABLE',
  'createRequest',
  'transitionRequest',
]) {
  if (!production.includes(required)) {
    throw new Error(`Production persistence contract is missing ${required}.`);
  }
}
if (/https?:\/\//i.test(production)) {
  throw new Error('Production persistence adapters must use only relative same-origin API paths.');
}

const storage = await readFile('src/core/storage.js', 'utf8');
for (const required of [
  'PRODUCTION_AUTHORITATIVE_KEYS',
  'PRODUCTION_BROWSER_PERSISTENCE_BLOCKED',
  'runtimeModeFromDocument() === RUNTIME_MODE.PRODUCTION',
  'KEYS.requests',
  'KEYS.catalog',
  'KEYS.siteInfo',
  'KEYS.role',
  'KEYS.notifications',
  'KEYS.profile',
]) {
  if (!storage.includes(required)) {
    throw new Error(`Browser persistence fail-closed boundary is missing ${required}.`);
  }
}

const apiClient = await readFile('src/core/api-client.js', 'utf8');
for (const required of [
  "credentials: 'same-origin'",
  "redirect: 'error'",
  "cache: 'no-store'",
  'X-CSRF-Token',
]) {
  if (!apiClient.includes(required)) {
    throw new Error(`Production API transport is missing ${required}.`);
  }
}

const productionSession = await readFile('src/platform/production-session.js', 'utf8');
for (const forbidden of ['localStorage', 'sessionStorage']) {
  if (productionSession.includes(forbidden)) {
    throw new Error(`Production session boundary must not depend on browser persistence: ${forbidden}.`);
  }
}
for (const required of [
  "const SESSION_PATH = 'v1/session';",
  "const LOGIN_PATH = '/api/v1/auth/microsoft/login';",
  "const APPLICATION_ROOT = '/';",
  'PRODUCTION_TENANT_ROLE.CONFERENCE_MANAGER',
  'PRODUCTION_TENANT_ROLE.TENANT_ADMIN',
  'PRODUCTION_PERMISSION.REQUEST_MANAGE',
  'PRODUCTION_PERMISSION.TENANT_USERS_MANAGE',
  'roles[0] !== PRODUCTION_TENANT_ROLE.EMPLOYEE',
  'csrfTokenProvider: () => currentSession?.csrfToken || null',
  "apiClient.request(SESSION_PATH, { method: 'DELETE' })",
  'bootstrapProductionAuthentication',
  'status: PRODUCTION_AUTH_STATUS.UNAVAILABLE',
]) {
  if (!productionSession.includes(required)) {
    throw new Error(`Production session trust boundary is missing ${required}.`);
  }
}

const applicationContext = await readFile('src/platform/application-context.js', 'utf8');
for (const required of [
  'createApplicationContextFromState',
  'bootstrapProductionAuthentication',
  'const isDemo = runtimeMode === RUNTIME_MODE.DEMO;',
  'authenticationStatus === PRODUCTION_AUTH_STATUS.AUTHENTICATED',
  'PRODUCTION_TENANT_ROLE.CONFERENCE_MANAGER',
  'PRODUCTION_PERMISSION.REQUEST_MANAGE',
  'PRODUCTION_TENANT_ROLE.TENANT_ADMIN',
  'PRODUCTION_PERMISSION.TENANT_USERS_MANAGE',
  'authenticationRuntime()',
  'return isDemo ? requestRepository.all() : EMPTY_REQUESTS;',
  'return isDemo ? writeString(KEYS.role, value) : false;',
  'return isDemo && [KEYS.requests, KEYS.catalog, KEYS.siteInfo, KEYS.role].includes(key);',
  'if (runtimeMode === RUNTIME_MODE.DEMO) return createApplicationContextFromState();',
]) {
  if (!applicationContext.includes(required)) {
    throw new Error(`Application context production boundary is missing ${required}.`);
  }
}

const identityBootstrap = await readFile('src/platform/identity-bootstrap.js', 'utf8');
if (!identityBootstrap.includes('if (mode !== RUNTIME_MODE.DEMO) return;')) {
  throw new Error('Identity bootstrap must not read authoritative browser identity in production.');
}

const demoSecurity = await readFile('src/platform/demo-security.js', 'utf8');
if (!demoSecurity.includes('if (runtimeMode !== RUNTIME_MODE.DEMO) return;')) {
  throw new Error('Demo security normalization must not access demo role storage in production.');
}

const featureParity = await readFile('src/platform/feature-parity.js', 'utf8');
for (const required of [
  'if (runtimeMode !== RUNTIME_MODE.DEMO || syncFrame) return;',
  'if (runtimeMode === RUNTIME_MODE.DEMO) {',
]) {
  if (!featureParity.includes(required)) {
    throw new Error(`Demo enhancement scheduler production guard is missing ${required}.`);
  }
}

const app = await readFile('src/app.js', 'utf8');
for (const required of [
  "from './platform/application-context.js'",
  'const context = await createApplicationContext();',
  'authentication: context.authenticationRuntime()',
]) {
  if (!app.includes(required)) {
    throw new Error(`Production application bootstrap is missing ${required}.`);
  }
}
for (const forbidden of [
  "from './core/security-policy.js'",
  "from './platform/production-session.js'",
  'bootstrapProductionAuthentication()',
]) {
  if (app.includes(forbidden)) {
    throw new Error(`Composition Root must keep production authentication behind Platform contracts: ${forbidden}.`);
  }
}

const appShell = await readFile('src/platform/app-shell.js', 'utf8');
for (const required of [
  'context.notifications(4)',
  'context.canSwitchRole()',
  "context.isDemoRuntime() ? t('app.mvp') : ''",
  "if (isProductionRuntime()) nextView = 'welcome';",
  'if (context.isAuthenticated()) list.append(profileNavigationItem());',
  'renderProductionAuthentication();',
  'if (context.authenticationStatus() === PRODUCTION_AUTH_STATUS.UNAVAILABLE)',
  'await authentication.signOut();',
]) {
  if (!appShell.includes(required)) {
    throw new Error(`Production shell presentation boundary is missing ${required}.`);
  }
}
const productionRenderGuard = appShell.indexOf('if (isProductionRuntime()) {\n      renderProductionAuthentication();\n      return;\n    }');
const employeeRender = appShell.indexOf("else if (view === 'employee') employee.renderRequest();");
if (productionRenderGuard < 0 || employeeRender < 0 || productionRenderGuard > employeeRender) {
  throw new Error('Production shell must return before demo Employee/Manager business views can render.');
}

console.log('Production persistence boundary check passed.');
