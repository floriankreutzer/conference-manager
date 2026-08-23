export const RUNTIME_MODE = Object.freeze({
  DEMO: 'demo',
  PRODUCTION: 'production',
});

export const USER_ROLE = Object.freeze({
  EMPLOYEE: 'employee',
  MANAGER: 'manager',
});

export const SUPPORTED_LANGUAGE = Object.freeze({
  DE: 'de',
  EN: 'en',
});

const ROLE_ALLOWLIST = new Set(Object.values(USER_ROLE));
const LANGUAGE_ALLOWLIST = new Set(Object.values(SUPPORTED_LANGUAGE));
const RUNTIME_META_SELECTOR = 'meta[name="conference-runtime"]';

export function normalizeRuntimeMode(value) {
  return String(value || '').trim().toLowerCase() === RUNTIME_MODE.DEMO
    ? RUNTIME_MODE.DEMO
    : RUNTIME_MODE.PRODUCTION;
}

export function runtimeModeFromDocument(documentLike = globalThis.document) {
  const value = documentLike
    ?.querySelector?.(RUNTIME_META_SELECTOR)
    ?.getAttribute?.('content');
  return normalizeRuntimeMode(value);
}

export function normalizeDemoRole(value) {
  return ROLE_ALLOWLIST.has(value) ? value : USER_ROLE.EMPLOYEE;
}

export function normalizeLanguage(value) {
  return LANGUAGE_ALLOWLIST.has(value) ? value : SUPPORTED_LANGUAGE.DE;
}

export function resolveRole({ mode, demoRole, authenticatedRole = null }) {
  if (normalizeRuntimeMode(mode) === RUNTIME_MODE.DEMO) {
    return normalizeDemoRole(demoRole);
  }
  return ROLE_ALLOWLIST.has(authenticatedRole) ? authenticatedRole : null;
}

export function canAccessManager(context) {
  return resolveRole(context) === USER_ROLE.MANAGER;
}

export function requiresTrustedBackend(mode) {
  return normalizeRuntimeMode(mode) === RUNTIME_MODE.PRODUCTION;
}
