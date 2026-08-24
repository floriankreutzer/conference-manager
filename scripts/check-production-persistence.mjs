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

console.log('Production persistence boundary check passed.');
