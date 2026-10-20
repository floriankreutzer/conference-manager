import { ApiSecurityError } from '../../core/api-client.js';
import { createCustomerAuthenticationTransport } from './transport.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CSRF=/^[a-f0-9]{64}$/;
const invalid=()=>{ throw new ApiSecurityError('CUSTOMER_MICROSOFT_RESPONSE_INVALID'); };
function exact(value,keys) {
  if (!value || typeof value!=='object' || Array.isArray(value)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) invalid();
  const own=Reflect.ownKeys(value);
  if (own.length!==keys.length || own.some(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return !keys.includes(key) || !descriptor.enumerable || !Object.hasOwn(descriptor,'value');
  })) invalid();
}
function header(value) {
  if (!UUID.test(value.requestId || '') || !CSRF.test(value.csrfToken || '')) invalid();return value.csrfToken;
}
function redirect(value) {
  if (typeof value!=='string' || value.length>8192) invalid();
  let url;try { url=new URL(value); } catch { invalid(); }
  if (url.origin!=='https://login.microsoftonline.com' || url.pathname!=='/organizations/oauth2/v2.0/authorize'
    || url.username || url.password || url.hash) invalid();return url.href;
}
export function createCustomerMicrosoftClient({ origin=globalThis.location?.origin,fetchImpl=globalThis.fetch,timeoutMs=10000 }={}) {
  const call=createCustomerAuthenticationTransport({ namespace: 'microsoft',origin,fetchImpl,timeoutMs,invalid });
  let choiceCsrf=null,linkCsrf=null,generation=0;
  return Object.freeze({
    async accountState() {
      const value=await call('link/status');exact(value,['status','microsoftLinked','emailReauthenticationRequired','requestId']);
      if (value.status!=='account' || !UUID.test(value.requestId || '') || typeof value.microsoftLinked!=='boolean'
        || typeof value.emailReauthenticationRequired!=='boolean') invalid();
      return Object.freeze({ microsoftLinked: value.microsoftLinked,emailReauthenticationRequired: value.emailReauthenticationRequired });
    },
    async choices() {
      const epoch=generation;
      choiceCsrf=null;
      const value=await call('choices');exact(value,['status','items','csrfToken','requestId']);
      const csrf=header(value);
      if (value.status!=='membership_required' || !Array.isArray(value.items) || value.items.length>100) invalid();
      const seen=new Set(),items=value.items.map(item=>{
        exact(item,['membershipId','displayName']);
        if (!UUID.test(item.membershipId || '') || seen.has(item.membershipId) || typeof item.displayName!=='string'
          || item.displayName.length<1 || item.displayName.length>160 || /[\u0000-\u001f\u007f]/.test(item.displayName)) invalid();
        seen.add(item.membershipId);return Object.freeze({ membershipId: item.membershipId,displayName: item.displayName });
      });if (epoch!==generation) invalid();choiceCsrf=csrf;return Object.freeze(items);
    },
    async select(membershipId) {
      if (!UUID.test(membershipId || '')) throw new ApiSecurityError('CUSTOMER_MICROSOFT_INPUT_INVALID');
      const value=await call('selection',{ body: { membershipId },status: 204,csrfToken: choiceCsrf });
      if (value!==null) invalid();choiceCsrf=null;
    },
    async startLink(sessionCsrf) {
      choiceCsrf=null;linkCsrf=null;const epoch=++generation;
      const value=await call('link/start',{ body: {},csrfToken: sessionCsrf });
      exact(value,['authorizationUrl','requestId']);if (!UUID.test(value.requestId || '')) invalid();
      if (epoch!==generation) invalid();linkCsrf=null;return redirect(value.authorizationUrl);
    },
    async linkConfirmation() {
      const epoch=generation;
      linkCsrf=null;
      const value=await call('link/confirmation');exact(value,['status','csrfToken','requestId']);
      if (value.status!=='link_confirmation_required' || epoch!==generation) invalid();linkCsrf=header(value);return true;
    },
    async confirmLink() {
      const value=await call('link/confirm',{ body: { confirm: true },status: 204,csrfToken: linkCsrf });
      if (value!==null) invalid();linkCsrf=null;
    },
    clear() { generation+=1;choiceCsrf=null;linkCsrf=null; },
  });
}
