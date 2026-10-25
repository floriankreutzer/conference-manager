import { ApiSecurityError } from '../../core/api-client.js';
import { createAuthenticationFormNavigation } from '../../shared/authentication-form-navigation.js';
import { createCustomerAuthenticationTransport } from './transport.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const invalid=()=>{ throw new ApiSecurityError('CUSTOMER_HANDOFF_RESPONSE_INVALID'); };
function confirmation(value,owner) {
  const keys=owner ? ['tenantId','tenantName','role','csrfToken','accountSwitchRequired','requestId'] : ['slot','role','csrfToken','accountSwitchRequired','requestId'];
  if (!value || typeof value!=='object' || Array.isArray(value)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length!==keys.length
    || Reflect.ownKeys(value).some(key=>{
      const own=Object.getOwnPropertyDescriptor(value,key);
      return !keys.includes(key) || !own.enumerable || !Object.hasOwn(own,'value');
    }) || (owner ? typeof value.tenantId!=='string' || !UUID.test(value.tenantId)
      || typeof value.tenantName!=='string' || value.tenantName.trim().length<1 || value.tenantName.length>200
      || /[\u0000-\u001f\u007f]/.test(value.tenantName) : !['northwind','contoso','fabrikam'].includes(value.slot))
    || !['employee','conference_manager','tenant_admin'].includes(value.role)
    || typeof value.accountSwitchRequired!=='boolean' || typeof value.csrfToken!=='string'
    || !/^[a-f0-9]{64}$/.test(value.csrfToken)
    || typeof value.requestId!=='string' || !UUID.test(value.requestId)) invalid();
  return Object.freeze({ ...(owner ? { tenantId: value.tenantId,tenantName: value.tenantName } : { slot: value.slot }),role: value.role,accountSwitchRequired: value.accountSwitchRequired });
}
function createHandoffClient({ owner,origin=globalThis.location?.origin,fetchImpl=globalThis.fetch,timeoutMs=10000,
  navigation=null,documentRef=globalThis.document,windowRef=globalThis.window }={}) {
  const call=createCustomerAuthenticationTransport({ namespace: owner ? 'owner' : 'delegation',origin,fetchImpl,timeoutMs,invalid });
  const forms=navigation || createAuthenticationFormNavigation({ origin,documentRef,windowRef });
  if (typeof forms.submit!=='function' || typeof forms.dispose!=='function') throw new TypeError('CUSTOMER_HANDOFF_NAVIGATION_INVALID');
  let csrf=null,current=null,epoch=0;
  const clear=()=>{ csrf=null;current=null;epoch++; };
  return Object.freeze({
    async confirmation() {
      const generation=++epoch;csrf=null;current=null;
      const value=await call('confirmation'),view=confirmation(value,owner);
      if (generation!==epoch) invalid();forms.reset?.();csrf=value.csrfToken;current=view;return view;
    },
    async logout() {
      if (!current?.accountSwitchRequired || !csrf) throw new ApiSecurityError('CUSTOMER_HANDOFF_CONFIRMATION_REQUIRED');
      const proof=csrf;clear();
      const value=await call('logout',{ body: {},status: 204,csrfToken: proof });if (value!==null) invalid();
    },
    complete() {
      if (!current || current.accountSwitchRequired || !csrf) throw new ApiSecurityError('CUSTOMER_HANDOFF_CONFIRMATION_REQUIRED');
      const proof=csrf;clear();forms.submit(owner ? 'customer-owner-complete' : 'customer-complete',{ csrfToken: proof });
    },
    start() { clear();forms.reset?.();forms.submit(owner ? 'customer-owner-start' : 'customer-start'); },
    clear,
    dispose() { clear();forms.dispose(); },
  });
}


export function createCustomerHandoffClient(options={}) { return createHandoffClient({ ...options,owner: false }); }
export function createOwnerCustomerHandoffClient(options={}) { return createHandoffClient({ ...options,owner: true }); }
