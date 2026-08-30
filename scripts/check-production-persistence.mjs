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
  "roomAvailability: 'v1/application/room-availability'",
  "notifications: 'v1/application/notifications'",
  "configuration: 'v1/application/configuration'",
  'normalizeProductionCatalogPage',
  'normalizeProductionCatalog',
  'normalizeProductionRequestListPage',
  'normalizeProductionRequestMutationEnvelope',
  'normalizeProductionRequestHistoryPage',
  'normalizeProductionRequestReportPage',
  'normalizeProductionBookingChangeEnvelope',
  'assertExactObject(value, keys, code)',
  'PRODUCTION_SCHEMA_VERSION_UNSUPPORTED',
  'PRODUCTION_PERSISTENCE_UNAVAILABLE',
  'createRequest',
  'checkRoomAvailability',
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
  'authenticationBootstrap',
  'createProductionPersistence',
  'authenticationRuntime?.apiClient?.request',
  'createProductionPersistence({ apiClient: authenticationRuntime.apiClient })',
  'productionPersistence()',
  'serverPersistence()',
  'const isDemo = runtimeMode === RUNTIME_MODE.DEMO;',
  'authenticationStatus === PRODUCTION_AUTH_STATUS.AUTHENTICATED',
  'PRODUCTION_TENANT_ROLE.CONFERENCE_MANAGER',
  'PRODUCTION_PERMISSION.REQUEST_MANAGE',
  'PRODUCTION_TENANT_ROLE.TENANT_ADMIN',
  'PRODUCTION_PERMISSION.TENANT_USERS_MANAGE',
  'authenticationRuntime()',
  'return notifications.slice(',
  'return false;',
  'authentication?.runtime?.apiClient',
]) {
  if (!applicationContext.includes(required)) {
    throw new Error(`Application context production boundary is missing ${required}.`);
  }
}
for (const forbidden of ["../core/storage.js", 'requestRepository', 'notificationRepository', 'readString(', 'writeString(']) {
  if (applicationContext.includes(forbidden)) {
    throw new Error(`Application context must not retain browser-owned business authority: ${forbidden}.`);
  }
}

const demoSecurity = await readFile('src/platform/demo-security.js', 'utf8');
for (const forbidden of ['localStorage', 'sessionStorage', 'requestRepository', 'writeString(', 'readString(']) {
  if (demoSecurity.includes(forbidden)) {
    throw new Error(`Demo session controls must not use browser authority: ${forbidden}.`);
  }
}

const app = await readFile('src/app.js', 'utf8');
for (const required of [
  "from './platform/application-context.js'",
  'async function bootstrapCustomerApplication(',
  'const context = await createApplicationContext({',
  'const authentication = context.authenticationRuntime()',
  'const serverPersistence = context.serverPersistence()',
  'createServerEmployeeApplication',
  'createServerManagerApplication',
  'authentication,',
]) {
  if (!app.includes(required)) {
    throw new Error(`Production application bootstrap is missing ${required}.`);
  }
}
for (const forbidden of [
  "from './core/security-policy.js'",
  "from './platform/production-session.js'",
  "from './platform/production-persistence.js'",
  'createDemo',
  'bootstrapProductionAuthentication()',
]) {
  if (app.includes(forbidden)) {
    throw new Error(`Composition Root production bootstrap boundary is invalid: ${forbidden}.`);
  }
}
const bootstrapFunctionStart = app.indexOf('async function bootstrapCustomerApplication(');
const bootstrapLoading = app.indexOf('renderAppBootstrapLoading();');
const awaitedContext = app.indexOf('const context = await createApplicationContext({');
if (
  bootstrapFunctionStart < 0
  || bootstrapLoading < bootstrapFunctionStart
  || awaitedContext < bootstrapLoading
) {
  throw new Error('Application Context await must remain inside the async bootstrap function.');
}

for (const file of [
  'src/employee/production-application.js',
  'src/manager/production-application.js',
]) {
  const source = await readFile(file, 'utf8');
  for (const forbidden of ['localStorage', 'sessionStorage', "../core/storage.js", 'tenantId', 'requesterUserId']) {
    if (source.includes(forbidden)) {
      throw new Error(`${file} must not contain browser or Tenant/User authority: ${forbidden}.`);
    }
  }
  if (!source.includes('persistence.')) {
    throw new Error(`${file} must consume the server-authoritative persistence port.`);
  }
}

const employeeProduction = await readFile('src/employee/production-application.js', 'utf8');
for (const required of [
  'persistence.loadCatalog()',
  'persistence.checkRoomAvailability(window, isResubmission ? sourceRequest.id : null)',
  'site?.timeZone',
  'productionUtcInstant(date.value, start.value, timeZone)',
  'persistence.createRequest(compositionDraft(',
  "persistence.transitionRequest(requestId, { transition: 'cancel' })",
  "const CANCELLABLE_STATUSES = new Set(['Submitted', 'In Review', 'Change Requested', 'Confirmed'])",
]) {
  if (!employeeProduction.includes(required)) {
    throw new Error(`Production Employee boundary is missing ${required}.`);
  }
}

const managerProduction = await readFile('src/manager/production-application.js', 'utf8');
for (const required of [
  "Submitted: Object.freeze(['start_review', 'reject', 'request_change'])",
  "'In Review': Object.freeze(['confirm', 'reject', 'request_change'])",
  'persistence.listRequests()',
  'persistence.transitionRequest(request.id, { transition })',
  'persistence.loadRequestHistory(request.id)',
  'persistence.loadRequestReport(',
]) {
  if (!managerProduction.includes(required)) {
    throw new Error(`Production Conference Manager boundary is missing ${required}.`);
  }
}

const appShell = await readFile('src/platform/app-shell.js', 'utf8');
for (const required of [
  'context.notifications(4)',
  "context.isDemoRuntime() ? t('app.demoShared') : ''",
  "nextView === 'employee' || nextView === 'requests'",
  "nextView === 'manager' && context.isManager() && manager",
  "nextView === 'tenantAdmin' && context.canManageTenantUsers() && tenantAdmin",
  "context.isManager() && manager) list.append(navButton('nav.manager', 'manager'))",
  'if (context.canManageTenantUsers() && tenantAdmin)',
  'list.append(profileNavigationItem());',
  'if (!context.isAuthenticated()) {',
  "if (view === 'employee' && employee)",
  "if (view === 'requests' && employee)",
  "if (view === 'manager' && context.isManager() && manager)",
  "if (view === 'tenantAdmin' && context.canManageTenantUsers() && tenantAdmin)",
  'renderProductionAuthentication();',
  'if (context.authenticationStatus() === PRODUCTION_AUTH_STATUS.UNAVAILABLE)',
  'await authentication.signOut();',
]) {
  if (!appShell.includes(required)) {
    throw new Error(`Production shell presentation boundary is missing ${required}.`);
  }
}

const productionSessionContract = await readFile('docs/PRODUCTION-SESSION.md', 'utf8');
for (const required of [
  'Issue #114 and its server-authoritative application API contract are complete',
  'src/employee/production-application.js',
  'src/manager/production-application.js',
  'have no browser-storage fallback',
  'Existing demo Employee/Manager implementations remain reachable only',
]) {
  if (!productionSessionContract.includes(required)) {
    throw new Error(`Production session documentation is stale or incomplete: ${required}.`);
  }
}

const productionSecurityContract = await readFile('docs/PRODUCTION-SECURITY.md', 'utf8');
for (const required of [
  'The server-authoritative application API contract from issue #114 is complete.',
  'dedicated Employee and Conference Manager implementations',
  'demo implementations and LocalStorage path remain isolated',
  'authoritative IANA time zone',
  'changed room/window',
]) {
  if (!productionSecurityContract.includes(required)) {
    throw new Error(`Production security documentation is stale or incomplete: ${required}.`);
  }
}

const productionPersistenceContract = await readFile('docs/PRODUCTION-PERSISTENCE-MIGRATION.md', 'utf8');
for (const required of [
  'POST /api/v1/application/room-availability',
  'catalog.sites[]',
  'never uses the browser time zone',
  'exact current `{ roomId, startsAt, endsAt }` tuple',
]) {
  if (!productionPersistenceContract.includes(required)) {
    throw new Error(`Production persistence migration documentation is incomplete: ${required}.`);
  }
}

console.log('Production persistence boundary check passed.');
