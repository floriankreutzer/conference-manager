import { ApiSecurityError } from '../../core/api-client.js';
import { createCustomerAuthenticationTransport } from './transport.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CSRF=/^[a-f0-9]{64}$/;
const invalid=() => { throw new ApiSecurityError('CUSTOMER_EMAIL_RESPONSE_INVALID'); };
function exact(value,keys) {
  if (!value || typeof value!=='object' || Array.isArray(value)
    || Object.keys(value).sort().join(',')!==[...keys].sort().join(',')) invalid();
}

export function createCustomerEmailClient({ origin=globalThis.location?.origin,fetchImpl=globalThis.fetch,
  clock=Date.now,timeoutMs=10000 } = {}) {
  let parsed;
  try { parsed=new URL(origin); } catch { throw new TypeError('CUSTOMER_EMAIL_CLIENT_CONFIGURATION_INVALID'); }
  if (parsed.protocol!=='https:' || parsed.origin!==origin || typeof fetchImpl!=='function' || typeof clock!=='function'
    || !Number.isSafeInteger(timeoutMs) || timeoutMs<1000 || timeoutMs>15000) {
    throw new TypeError('CUSTOMER_EMAIL_CLIENT_CONFIGURATION_INVALID');
  }
  let csrfToken=null;
  const transport=createCustomerAuthenticationTransport({ namespace: 'email',origin,fetchImpl,timeoutMs,invalid });
  function pending(value,expected = null) {
    exact(value,['status','expiresAt','csrfToken','requestId']);
    if (!['code_required','membership_required'].includes(value.status) || (expected && value.status!==expected)
      || !CSRF.test(value.csrfToken || '')
      || !UUID.test(value.requestId || '') || typeof value.expiresAt!=='string'
      || !Number.isFinite(Date.parse(value.expiresAt)) || new Date(value.expiresAt).toISOString()!==value.expiresAt
      || Date.parse(value.expiresAt)<=clock()
      || Date.parse(value.expiresAt)>clock()+(value.status==='membership_required' ? 360000 : 660000)) invalid();
    csrfToken=value.csrfToken;
    return Object.freeze({ status: value.status,expiresAt: value.expiresAt });
  }
  async function call(suffix,{ body,status=200,proof=false } = {}) {
    if (proof && !CSRF.test(csrfToken || '')) throw new ApiSecurityError('CSRF_TOKEN_REQUIRED');
    return transport(suffix,{ body,status,csrfToken: proof ? csrfToken : null });
  }
  return Object.freeze({
    async request({ recipient,locale } = {}) {
      if (typeof recipient!=='string' || recipient.length<3 || recipient.length>254 || recipient.trim()!==recipient
        || !['de','en'].includes(locale)) throw new ApiSecurityError('CUSTOMER_EMAIL_INPUT_INVALID');
      return pending(await call('challenges',{ body: { recipient,locale },status: 202 }),'code_required');
    },
    async pending() { return pending(await call('pending')); },
    async verify(code) {
      if (typeof code!=='string' || !/^\d{8}$/.test(code)) throw new ApiSecurityError('CUSTOMER_EMAIL_INPUT_INVALID');
      return pending(await call('verify',{ body: { code },proof: true }),'membership_required');
    },
    async choices() {
      const value=await call('choices'); exact(value,['status','items','requestId']);
      if (value.status!=='membership_required' || !UUID.test(value.requestId || '')
        || !Array.isArray(value.items) || value.items.length>100) invalid();
      const seen=new Set(),items=value.items.map(item => {
        exact(item,['membershipId','displayName']);
        if (!UUID.test(item.membershipId || '') || seen.has(item.membershipId) || typeof item.displayName!=='string'
          || item.displayName.length<1 || item.displayName.length>160 || /[\u0000-\u001f\u007f]/.test(item.displayName)) invalid();
        seen.add(item.membershipId); return Object.freeze({ membershipId: item.membershipId,displayName: item.displayName });
      });
      return Object.freeze(items);
    },
    async select(membershipId) {
      if (!UUID.test(membershipId || '')) throw new ApiSecurityError('CUSTOMER_EMAIL_INPUT_INVALID');
      const result=await call('selection',{ body: { membershipId },proof: true,status: 204 });
      if (result!==null) invalid(); csrfToken=null;
    },
    clear() { csrfToken=null; },
  });
}
