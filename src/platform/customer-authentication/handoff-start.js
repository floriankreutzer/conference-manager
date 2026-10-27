import { ApiSecurityError,readApiJsonResponse } from '../../core/api-client.js';
import { createAuthenticationFormNavigation } from '../../shared/authentication-form-navigation.js';

// Wake an idle Customer process with a safe read before the initial native POST.
// Provider start pages are not readiness evidence. Never retry the POST.
export function createCustomerHandoffStart({ origin=globalThis.location?.origin,fetchImpl=globalThis.fetch,
  timeoutMs=10000,navigation=null,documentRef=globalThis.document,windowRef=globalThis.window }={}) {
  let parsed;try { parsed=new URL(origin); } catch { throw new TypeError('CUSTOMER_HANDOFF_START_CONFIGURATION_INVALID'); }
  if (parsed.protocol!=='https:' || parsed.origin!==origin || typeof fetchImpl!=='function'
    || !Number.isSafeInteger(timeoutMs) || timeoutMs<1000 || timeoutMs>15000) {
    throw new TypeError('CUSTOMER_HANDOFF_START_CONFIGURATION_INVALID');
  }
  const forms=navigation || createAuthenticationFormNavigation({ origin,documentRef,windowRef });
  if (typeof forms.submit!=='function' || typeof forms.dispose!=='function') throw new TypeError('CUSTOMER_HANDOFF_NAVIGATION_INVALID');
  let busy=false,started=false,disposed=false,abort=null;
  return Object.freeze({
    async start() {
      if (busy || started || disposed) return;
      busy=true;abort=new AbortController();const signal=abort.signal;
      const timer=globalThis.setTimeout(()=>abort?.abort(),timeoutMs);
      try {
        const url=new URL('/api/v1/health/ready',origin);
        const response=await fetchImpl(url,{ method: 'GET',credentials: 'same-origin',redirect: 'error',cache: 'no-store',
          referrerPolicy: 'no-referrer',signal,headers: { Accept: 'application/json' } });
        if (disposed) return;
        if (signal.aborted || response.redirected || response.url && response.url!==url.href) {
          throw new ApiSecurityError('CUSTOMER_HANDOFF_READINESS_INVALID');
        }
        const value=await readApiJsonResponse(response);
        if (disposed) return;
        if (signal.aborted || response.status!==200 || !value || Array.isArray(value)
          || Object.keys(value).sort().join(',')!=='requestId,status' || value.status!=='ready'
          || typeof value.requestId!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.requestId)) {
          throw new ApiSecurityError('CUSTOMER_HANDOFF_READINESS_INVALID');
        }
        started=true;
        try { forms.submit('customer-start'); }
        catch { throw new ApiSecurityError('CUSTOMER_HANDOFF_START_UNCONFIRMED'); }
      } finally { globalThis.clearTimeout(timer);abort=null;busy=false; }
    },
    dispose() { disposed=true;abort?.abort();forms.dispose(); },
  });
}
