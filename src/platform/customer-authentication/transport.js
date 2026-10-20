import { ApiSecurityError,readApiJsonResponse } from '../../core/api-client.js';

const ENDPOINTS=Object.freeze({
  delegation: Object.freeze({ confirmation: ['GET',200,null],logout: ['POST',204,'flow'] }),
  email: Object.freeze({ challenges: ['POST',202,null],pending: ['GET',200,null],verify: ['POST',200,'flow'],
    choices: ['GET',200,null],selection: ['POST',204,'flow'] }),
  microsoft: Object.freeze({ choices: ['GET',200,null],selection: ['POST',204,'flow'],
    'link/status': ['GET',200,null],
    'link/start': ['POST',200,'session'],'link/confirmation': ['GET',200,null],'link/confirm': ['POST',204,'flow'] }),
});
// Bounded same-origin transport shared by the two explicit authentication
// ceremonies. No caller-selected URL, retry, token persistence or authority.
export function createCustomerAuthenticationTransport({ namespace,origin,fetchImpl,timeoutMs,invalid }={}) {
  let parsed;try { parsed=new URL(origin); } catch { throw new TypeError('CUSTOMER_AUTH_TRANSPORT_CONFIGURATION_INVALID'); }
  if (!Object.hasOwn(ENDPOINTS,namespace) || parsed.protocol!=='https:' || parsed.origin!==origin
    || typeof fetchImpl!=='function' || typeof invalid!=='function' || !Number.isSafeInteger(timeoutMs)
    || timeoutMs<1000 || timeoutMs>15000) throw new TypeError('CUSTOMER_AUTH_TRANSPORT_CONFIGURATION_INVALID');
  return async(suffix,{ body,status=200,csrfToken=null }={})=>{
    if (!Object.hasOwn(ENDPOINTS[namespace],suffix)) invalid();
    const [method,expected,proof]=ENDPOINTS[namespace][suffix];
    if (status!==expected || (method==='GET')!==(body===undefined)) invalid();
    if (proof && (typeof csrfToken!=='string' || !(proof==='flow' ? /^[a-f0-9]{64}$/ : /^[A-Za-z0-9_-]{43}$/).test(csrfToken))) {
      throw new ApiSecurityError('CSRF_TOKEN_REQUIRED');
    }
    const url=new URL(`/api/v1/auth/${namespace}/${suffix}`,origin),abort=new AbortController();
    const timer=globalThis.setTimeout(()=>abort.abort(),timeoutMs);
    try {
      const response=await fetchImpl(url,{ method,credentials: 'same-origin',redirect: 'error',cache: 'no-store',
        referrerPolicy: 'no-referrer',signal: abort.signal,
        headers: { Accept: 'application/json',...(body===undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(proof ? { 'X-CSRF-Token': csrfToken } : {}) },...(body===undefined ? {} : { body: JSON.stringify(body) }) });
      if (response.redirected || response.url && response.url!==url.href) invalid();
      const value=await readApiJsonResponse(response);if (response.status!==expected) invalid();return value;
    } finally { globalThis.clearTimeout(timer); }
  };
}
