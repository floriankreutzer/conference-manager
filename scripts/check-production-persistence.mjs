import { readFile } from 'node:fs/promises';

const production = await readFile('src/core/production-persistence.js', 'utf8');
for (const forbidden of ['localStorage', 'sessionStorage', "from './storage.js'", '../core/storage.js']) {
  if (production.includes(forbidden)) {
    throw new Error(`Production API repositories must not depend on browser storage: ${forbidden}`);
  }
}
for (const required of [
  "requests: 'v1/requests'",
  "catalog: 'v1/catalog'",
  "profile: 'v1/profile'",
  "notifications: 'v1/notifications'",
  "configuration: 'v1/configuration'",
  'PRODUCTION_REQUEST_AUTHORITY_FIELD_REJECTED',
  'PRODUCTION_SCHEMA_VERSION_UNSUPPORTED',
]) {
  if (!production.includes(required)) throw new Error(`Production persistence contract is missing ${required}.`);
}

const storage = await readFile('src/core/storage.js', 'utf8');
for (const required of [
  'AUTHORITATIVE_PRODUCTION_KEYS',
  'ProductionStorageAccessError',
  'PRODUCTION_BROWSER_STORAGE_FORBIDDEN',
  'assertBrowserStorageAllowed(key);',
]) {
  if (!storage.includes(required)) throw new Error(`Browser-storage production guard is missing ${required}.`);
}

const runtime = await readFile('src/platform/persistence-runtime.js', 'utf8');
for (const required of [
  'normalizeRuntimeMode(mode)',
  'createDemoRepositories()',
  'createProductionRepositories({ apiClient: client })',
]) {
  if (!runtime.includes(required)) throw new Error(`Persistence runtime is missing ${required}.`);
}
if (/catch\s*\([^)]*\)\s*\{[^}]*createDemoRepositories/s.test(runtime)) {
  throw new Error('Production persistence must never fall back to the demo repository after an API failure.');
}

const identity = await readFile('src/platform/identity-bootstrap.js', 'utf8');
if (!identity.includes('runtimeModeFromDocument(document) !== RUNTIME_MODE.DEMO) return;')) {
  throw new Error('Identity bootstrap must not read or seed browser profile state in production.');
}

console.log('Production persistence boundary check passed.');
