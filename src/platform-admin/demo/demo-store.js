import { normalizePlatformFleet } from '../contracts.js';
import { createPlatformAdminDemoFixtures } from './fixtures.js';
import { PLATFORM_ADMIN_DEMO_ROLE_IDS } from './operator-fixtures.js';

export const PLATFORM_ADMIN_DEMO_STORAGE_KEY = 'platform_admin_demo_v1';

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function validDocument(value) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'auditEvents,mutationCounter,roleId,schemaVersion,tenants'
    || value.schemaVersion !== 1
    || !PLATFORM_ADMIN_DEMO_ROLE_IDS.includes(value.roleId)
    || !Number.isSafeInteger(value.mutationCounter)
    || value.mutationCounter < 0
    || value.mutationCounter > 100_000
  ) return false;
  try {
    normalizePlatformFleet({
      tenants: value.tenants,
      auditEvents: value.auditEvents,
      evaluatedAt: '2026-08-01T08:00:00.000Z',
      nextCursor: null,
    });
    return true;
  } catch {
    return false;
  }
}

export function createPlatformAdminDemoStore({ storage = globalThis.localStorage } = {}) {
  if (
    !storage
    || typeof storage.getItem !== 'function'
    || typeof storage.setItem !== 'function'
    || typeof storage.removeItem !== 'function'
  ) throw new TypeError('PLATFORM_ADMIN_DEMO_STORAGE_REQUIRED');

  function persist(document) {
    storage.setItem(PLATFORM_ADMIN_DEMO_STORAGE_KEY, JSON.stringify(document));
    return copy(document);
  }

  function reset() {
    storage.removeItem(PLATFORM_ADMIN_DEMO_STORAGE_KEY);
    return persist(createPlatformAdminDemoFixtures());
  }

  function read() {
    let parsed;
    try {
      const serialized = storage.getItem(PLATFORM_ADMIN_DEMO_STORAGE_KEY);
      if (!serialized) return reset();
      parsed = JSON.parse(serialized);
    } catch {
      return reset();
    }
    return validDocument(parsed) ? copy(parsed) : reset();
  }

  function write(document) {
    if (!validDocument(document)) throw new TypeError('PLATFORM_ADMIN_DEMO_DOCUMENT_INVALID');
    return persist(document);
  }

  return Object.freeze({ read, write, reset });
}
