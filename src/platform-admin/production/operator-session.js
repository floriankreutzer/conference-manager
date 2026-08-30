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
