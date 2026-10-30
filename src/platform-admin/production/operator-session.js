import { normalizePlatformOperatorSession, PlatformAdminContractError } from '../contracts.js';

export const PLATFORM_ADMIN_SIGN_IN_PATH = '/api/v1/platform/auth/microsoft/login';
export const PLATFORM_ADMIN_STEP_UP_PATH = '/api/v1/platform/auth/microsoft/step-up';

export class PlatformOperatorSessionError extends Error {
  constructor(code, options = {}) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PlatformOperatorSessionError';
    this.code = code;
  }
}

function isPasskeyPendingRead(url, options) {
  if ((typeof url !== 'string' && !(url instanceof URL)) || (options.method ?? 'GET').toUpperCase() !== 'GET') return false;
  const origin = globalThis.location?.origin ?? 'https://platform-session.invalid';
  const target = new URL(url, origin);
  return target.origin === origin && !target.search && [
    '/api/v1/platform/auth/passkey/pending',
    '/api/v1/platform/auth/passkey/enrollment/pending',
  ].includes(target.pathname);
}

// One document owns one authenticated session. A rejected session cannot be
// revived by a late successful response, nor can it replay an interrupted write.
export function createPlatformSessionBoundary({ fetchImpl = globalThis.fetch, onExpired } = {}) {
  if (typeof fetchImpl !== 'function' || typeof onExpired !== 'function') {
    throw new TypeError('PLATFORM_SESSION_BOUNDARY_PORTS_REQUIRED');
  }
  let active = false, expired = false;
  const lifetime = new AbortController();
  function expire() {
    if (!active || expired) return;
    expired = true;
    lifetime.abort();
    onExpired();
  }
  return Object.freeze({
    activate() { if (!expired) active = true; },
    expire,
    get expired() { return expired; },
    stop() { lifetime.abort(); },
    async fetch(url, options = {}) {
      if (expired) throw new PlatformOperatorSessionError('HTTP_401');
      // Native composition retains cancellation through response-body reads,
      // without document-lifetime listener closures for completed requests.
      const signal = options.signal ? AbortSignal.any([lifetime.signal, options.signal]) : lifetime.signal;
      const response = await fetchImpl(url, { ...options, signal });
      // These two authentication-ceremony reads use 401 for "no pending
      // ceremony". They do not authenticate the operator session. Own-key
      // management follows with an independently protected keys read.
      if (active && response.status === 401 && !isPasskeyPendingRead(url, options)) expire();
      if (expired) {
        try { await response.body?.cancel(); } catch {}
        throw new PlatformOperatorSessionError('HTTP_401');
      }
      return response;
    },
  });
}

export function createPlatformOperatorSessionApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') {
    throw new TypeError('PLATFORM_OPERATOR_SESSION_API_CLIENT_REQUIRED');
  }

  return Object.freeze({
    async loadSession() {
      let payload;
      try {
        payload = await apiClient.request('session');
      } catch (error) {
        if (error?.code === 'HTTP_401') return null;
        throw new PlatformOperatorSessionError('PLATFORM_OPERATOR_SESSION_UNAVAILABLE', { cause: error });
      }
      try {
        return normalizePlatformOperatorSession(payload);
      } catch (error) {
        const code = error instanceof PlatformAdminContractError
          ? 'PLATFORM_OPERATOR_SESSION_RESPONSE_INVALID'
          : 'PLATFORM_OPERATOR_SESSION_UNAVAILABLE';
        throw new PlatformOperatorSessionError(code, { cause: error });
      }
    },

    async signOut() {
      try {
        await apiClient.request('session', { method: 'DELETE' });
      } catch (error) {
        throw new PlatformOperatorSessionError('PLATFORM_OPERATOR_SIGN_OUT_FAILED', { cause: error });
      }
    },
  });
}
