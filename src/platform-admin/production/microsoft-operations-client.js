import { createApiClient } from '../../core/api-client.js';
import { createPlatformOperationClient } from './operation-client.js';
import { requirePlatformMicrosoftConfiguration,requirePlatformMicrosoftOperationChallenge,requirePlatformMicrosoftOperationStatus }
  from './microsoft-operation-contracts.js';

import { PlatformMicrosoftOperationError } from '../operation-errors.js';
export { PlatformMicrosoftOperationError } from '../operation-errors.js';
export async function loadPlatformMicrosoftConfiguration(apiClient) {
  try { return requirePlatformMicrosoftConfiguration(await apiClient.request('auth/microsoft/operation/configuration')); }
  catch (error) { if (error?.code==='HTTP_404') return null;throw new PlatformMicrosoftOperationError(); }
}
export function createPlatformMicrosoftOperationsClient({ origin=globalThis.location?.origin,fetchImpl=globalThis.fetch,
  csrfTokenProvider,confirmation,...options }={}) {
  if (typeof confirmation!=='function') throw new TypeError('PLATFORM_MICROSOFT_CONFIRMATION_PORT_REQUIRED');
  const statusClient=createApiClient({ origin,fetchImpl,csrfTokenProvider,baseUrl: '/api/v1/platform/' });
  const client=createPlatformOperationClient({ ...options,origin,fetchImpl,csrfTokenProvider,
    ErrorType: PlatformMicrosoftOperationError,errorPrefix: 'PLATFORM_MICROSOFT',
    readPending: value=>requirePlatformMicrosoftOperationChallenge(value,origin),
    async confirm(pending,{ signal }) {
      await confirmPending(pending,signal);
      return { 'X-Platform-Microsoft-Proof': pending.state };
    },
  });
  async function confirmOperation(value,{ signal }={}) {
    if (!signal || typeof signal.addEventListener!=='function' || signal.aborted) {
      throw new PlatformMicrosoftOperationError('PLATFORM_MICROSOFT_OPERATION_CANCELLED');
    }
    const pending=requirePlatformMicrosoftOperationChallenge(value,origin);
    await confirmPending(pending,signal);return pending.state;
  }
  async function confirmPending(pending,signal) {
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
    if (signal.aborted) throw new PlatformMicrosoftOperationError('PLATFORM_MICROSOFT_OPERATION_CANCELLED');
  }
  // Caller must hold this client's existing runExclusive lease through its
  // fixed synthetic options, confirmation and final native form or JSON write.
  return Object.freeze({ ...client,confirmOperation });
}
