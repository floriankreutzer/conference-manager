import { createApiClient } from '../../core/api-client.js';
import { createPlatformOperationClient } from './operation-client.js';
import { requirePlatformMicrosoftConfiguration,requirePlatformMicrosoftOperationChallenge,requirePlatformMicrosoftOperationStatus }
  from './microsoft-operation-contracts.js';

export class PlatformMicrosoftOperationError extends Error {
  constructor(code='PLATFORM_MICROSOFT_OPERATION_FAILED') { super(code);this.name='PlatformMicrosoftOperationError';this.code=code; }
}
export async function loadPlatformMicrosoftConfiguration(apiClient) {
  try { return requirePlatformMicrosoftConfiguration(await apiClient.request('auth/microsoft/operation/configuration')); }
  catch (error) { if (error?.code==='HTTP_404') return null;throw new PlatformMicrosoftOperationError(); }
}
export function createPlatformMicrosoftOperationsClient({ origin=globalThis.location?.origin,fetchImpl=globalThis.fetch,
  csrfTokenProvider,confirmation,...options }={}) {
  if (typeof confirmation!=='function') throw new TypeError('PLATFORM_MICROSOFT_CONFIRMATION_PORT_REQUIRED');
  const statusClient=createApiClient({ origin,fetchImpl,csrfTokenProvider,baseUrl: '/api/v1/platform/' });
  return createPlatformOperationClient({ ...options,origin,fetchImpl,csrfTokenProvider,
    ErrorType: PlatformMicrosoftOperationError,errorPrefix: 'PLATFORM_MICROSOFT',
    readPending: value=>requirePlatformMicrosoftOperationChallenge(value,origin),
    async confirm(pending,{ signal }) {
      await confirmation(pending,{ signal,async readStatus({ signal: statusSignal }) {
        const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,10000);
        signal.addEventListener('abort',abort,{ once: true });statusSignal.addEventListener('abort',abort,{ once: true });
        if (signal.aborted || statusSignal.aborted) abort();
        try {
          return requirePlatformMicrosoftOperationStatus(await statusClient.request('auth/microsoft/operation/status',{
            method: 'POST',body: { state: pending.state },signal: controller.signal,
          }));
        } finally { clearTimeout(timer);signal.removeEventListener('abort',abort);statusSignal.removeEventListener('abort',abort); }
      } });
      return { 'X-Platform-Microsoft-Proof': pending.state };
    },
  });
}
