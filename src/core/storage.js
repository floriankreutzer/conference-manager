import {
  RUNTIME_MODE,
  USER_ROLE,
  normalizeDemoRole,
  runtimeModeFromDocument,
} from './security-policy.js';

const KEYS = Object.freeze({
  requests: 'conference_requests',
  catalog: 'conference_catalog_v2',
  siteInfo: 'conference_site_info_v1',
  language: 'conference_language_v1',
  role: 'conference_demo_role_v1',
  notifications: 'conference_notifications_v1',
  draft: 'conference_request_draft_v1',
  profile: 'conference_user_profile_v1',
});

const STORAGE_LIMITS = Object.freeze({
  [KEYS.requests]: 1_500_000,
  [KEYS.catalog]: 1_500_000,
  [KEYS.siteInfo]: 750_000,
  [KEYS.notifications]: 500_000,
  [KEYS.draft]: 350_000,
  [KEYS.profile]: 32_000,
  [KEYS.language]: 32,
  [KEYS.role]: 32,
});

const DEFAULT_JSON_LIMIT = 500_000;
const DEFAULT_STRING_LIMIT = 10_000;
const BLOCKED_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export { KEYS, STORAGE_LIMITS };

function cloneFallback(fallback) {
  return fallback === undefined ? undefined : structuredClone(fallback);
}

function storageLimit(key, fallback = DEFAULT_JSON_LIMIT) {
  return STORAGE_LIMITS[key] || fallback;
}

function isDemoRoleKey(key) {
  return key === KEYS.role;
}

function canUseDemoRoleStorage() {
  return runtimeModeFromDocument() === RUNTIME_MODE.DEMO;
}

function notifyStorageIssue(key, reason) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent('conference:storage-warning', { detail: { key, reason } }));
}

function sanitizeJsonValue(value, depth = 0) {
  if (depth > 20) throw new RangeError('Stored demo data is nested too deeply.');
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.slice(0, 2000).map((entry) => sanitizeJsonValue(entry, depth + 1));
  if (typeof value !== 'object') return null;

  const clean = {};
  let count = 0;
  for (const [key, entry] of Object.entries(value)) {
    if (BLOCKED_OBJECT_KEYS.has(key)) continue;
    if (++count > 500) break;
    clean[key] = sanitizeJsonValue(entry, depth + 1);
  }
  return clean;
}

function safeJsonStringify(value) {
  return JSON.stringify(value, (key, entry) => (BLOCKED_OBJECT_KEYS.has(key) ? undefined : entry));
}

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return cloneFallback(fallback);
    if (raw.length > storageLimit(key)) {
      notifyStorageIssue(key, 'oversize');
      return cloneFallback(fallback);
    }
    return sanitizeJsonValue(JSON.parse(raw));
  } catch {
    notifyStorageIssue(key, 'invalid-json');
    return cloneFallback(fallback);
  }
}

export function writeJson(key, value) {
  try {
    const serialized = safeJsonStringify(value);
    if (serialized.length > storageLimit(key)) {
      notifyStorageIssue(key, 'oversize');
      return false;
    }
    localStorage.setItem(key, serialized);
    return true;
  } catch {
    notifyStorageIssue(key, 'write-failed');
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readString(key, fallback = '') {
  if (isDemoRoleKey(key) && !canUseDemoRoleStorage()) return USER_ROLE.EMPLOYEE;

  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    if (value.length > storageLimit(key, DEFAULT_STRING_LIMIT)) {
      notifyStorageIssue(key, 'oversize');
      return fallback;
    }
    return value;
  } catch {
    return fallback;
  }
}

export function writeString(key, value) {
  if (isDemoRoleKey(key) && !canUseDemoRoleStorage()) {
    notifyStorageIssue(key, 'production-role-write-blocked');
    return false;
  }

  try {
    const normalized = isDemoRoleKey(key) ? normalizeDemoRole(value) : String(value);
    if (normalized.length > storageLimit(key, DEFAULT_STRING_LIMIT)) {
      notifyStorageIssue(key, 'oversize');
      return false;
    }
    localStorage.setItem(key, normalized);
    return true;
  } catch {
    notifyStorageIssue(key, 'write-failed');
    return false;
  }
}

export function createRepository({ key, fallback = [] }) {
  const beforeSaveHooks = new Map();

  return {
    all() {
      const value = readJson(key, fallback);
      return Array.isArray(fallback) && !Array.isArray(value) ? cloneFallback(fallback) : value;
    },
    addBeforeSaveHook(name, hook) {
      const normalizedName = String(name || '').trim();
      if (!normalizedName || typeof hook !== 'function') throw new TypeError('Repository save hooks require a name and function.');
      beforeSaveHooks.set(normalizedName, hook);
      return () => beforeSaveHooks.delete(normalizedName);
    },
    save(value) {
      const current = this.all();
      let prepared = value;
      for (const hook of beforeSaveHooks.values()) {
        const transformed = hook(prepared, current);
        if (transformed !== undefined) prepared = transformed;
      }
      writeJson(key, prepared);
      return prepared;
    },
    update(mutator) {
      const current = this.all();
      const next = mutator(structuredClone(current));
      return this.save(next);
    },
  };
}

export const requestRepository = createRepository({ key: KEYS.requests, fallback: [] });
export const notificationRepository = createRepository({ key: KEYS.notifications, fallback: [] });
