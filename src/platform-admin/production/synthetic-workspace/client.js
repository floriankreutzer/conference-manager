import { ApiSecurityError } from '../../../core/api-client.js';
import { createAuthenticationFormNavigation } from '../../../shared/authentication-form-navigation.js';
import { createPlatformPasskeyBrowser } from '../passkey-browser.js';
import { requirePlatformPasskeyChallenge } from '../passkey-contracts.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLOTS=Object.freeze(['northwind','contoso','fabrikam']),ROLES=Object.freeze(['employee','conference_manager','tenant_admin']);
const STATUSES=Object.freeze(['pending','onboarding','ready','active','suspended','archived']);
const invalid=()=>{ throw new ApiSecurityError('PLATFORM_SYNTHETIC_RESPONSE_INVALID'); };
function exact(value,keys) {
  if (!value || ![Object.prototype,null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length!==keys.length || Reflect.ownKeys(value).some(key=>{
      const own=Object.getOwnPropertyDescriptor(value,key);
      return !keys.includes(key) || !own.enumerable || !Object.hasOwn(own,'value');
    })) invalid();
}
function id(value) { if (typeof value!=='string' || !UUID.test(value)) invalid();return value.toLowerCase(); }
function vector(value,known) {
  if (!Array.isArray(value) || value.length!==known.length || Reflect.ownKeys(value).length!==value.length+1
    || value.some((entry,index)=>entry!==known[index])) invalid();return Object.freeze([...value]);
}
function snapshot(value) {
  exact(value,['generationId','revision','available','tenants']);
  if (!Number.isSafeInteger(value.revision) || value.revision<1 || typeof value.available!=='boolean'
    || !Array.isArray(value.tenants) || value.tenants.length!==3 || Reflect.ownKeys(value.tenants).length!==4) invalid();
  const tenants=value.tenants.map((tenant,index)=>{
    exact(tenant,['slot','tenantId','status']);if (tenant.slot!==SLOTS[index] || !STATUSES.includes(tenant.status)) invalid();
    return Object.freeze({ slot: tenant.slot,tenantId: id(tenant.tenantId),status: tenant.status });
  });
  if (new Set(tenants.map(tenant=>tenant.tenantId)).size!==3) invalid();
  return Object.freeze({ generationId: id(value.generationId),revision: value.revision,available: value.available,
    tenants: Object.freeze(tenants) });
}
function directory(value) {
  exact(value,['generation','retainedGenerations','canReplace','replaceAfter','requestId']);id(value.requestId);
  if (!Number.isSafeInteger(value.retainedGenerations) || value.retainedGenerations<0 || value.retainedGenerations>32
    || typeof value.canReplace!=='boolean' || value.replaceAfter!==null && (typeof value.replaceAfter!=='string'
      || !Number.isFinite(Date.parse(value.replaceAfter)) || new Date(value.replaceAfter).toISOString()!==value.replaceAfter)
    || value.canReplace && (value.retainedGenerations===32 || value.replaceAfter!==null)
    || value.generation!==null && value.retainedGenerations===0) invalid();
  return Object.freeze({ generation: value.generation===null ? null : snapshot(value.generation),
    retainedGenerations: value.retainedGenerations,canReplace: value.canReplace,replaceAfter: value.replaceAfter });
}
function replacement(value) {
  exact(value,['expectedGenerationId','expectedRevision']);
  if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision<0
    || (value.expectedGenerationId===null)!==(value.expectedRevision===0)) invalid();
  return Object.freeze({ expectedGenerationId: value.expectedGenerationId===null ? null : id(value.expectedGenerationId),
    expectedRevision: value.expectedRevision });
}
function selection(value) {
  exact(value,['generationId','slot','role']);if (!SLOTS.includes(value.slot) || !ROLES.includes(value.role)) invalid();
  return Object.freeze({ generationId: id(value.generationId),slot: value.slot,role: value.role });
}

// Ordinary transport owns same-origin/no-store/CSRF/bounded-response semantics.
// The shared actual operation queue prevents other proof cookies from replacing
// this ceremony's binding; no generic428 replay or privileged cookie is used.
export function createPlatformSyntheticWorkspaceClient({ apiClient,runExclusive,refreshSession,csrfTokenProvider,
  browser=null,navigation=null,origin=globalThis.location?.origin,windowRef=globalThis.window,documentRef=globalThis.document,
  timeoutMs=15000 }={}) {
  if (typeof apiClient?.request!=='function' || [runExclusive,refreshSession,csrfTokenProvider].some(value=>typeof value!=='function')
    || !Number.isSafeInteger(timeoutMs) || timeoutMs<1000 || timeoutMs>15000) throw new TypeError('PLATFORM_SYNTHETIC_CLIENT_INVALID');
  const forms=navigation || createAuthenticationFormNavigation({ origin,windowRef,documentRef });
  if (['submit','reset','dispose'].some(name=>typeof forms[name]!=='function')) throw new TypeError('PLATFORM_SYNTHETIC_CLIENT_INVALID');
  const stopped=new AbortController();let pendingNavigation=null;
  function current(signal) {
    if (stopped.signal.aborted || signal?.aborted) throw new ApiSecurityError('PLATFORM_SYNTHETIC_CANCELLED');
  }
  async function call(path,options={},signal=null) {
    current(signal);const abort=new AbortController(),sources=[stopped.signal,signal].filter(Boolean);
    const cancel=()=>abort.abort();for (const source of sources) source.addEventListener('abort',cancel,{ once: true });
    const timer=setTimeout(cancel,timeoutMs);
    try { return await apiClient.request(path,{ ...options,signal: abort.signal }); }
    finally { clearTimeout(timer);for (const source of sources) source.removeEventListener('abort',cancel); }
  }
  async function assertion(path,intent,signal) {
    const pending=requirePlatformPasskeyChallenge(await call(path,{ method: 'POST',body: intent },signal));
    current(signal);browser ??=createPlatformPasskeyBrowser({ origin });
    const response=await browser.authenticate(pending.options,{ signal });current(signal);
    return { ...intent,state: pending.state,response };
  }
  function operation(work) {
    return runExclusive(async signal=>{
      current(signal);const controller=new AbortController(),sources=[stopped.signal,signal].filter(Boolean);
      const abort=()=>controller.abort();for (const source of sources) source.addEventListener('abort',abort,{ once: true });
      try { return await work(controller.signal); }
      finally { for (const source of sources) source.removeEventListener('abort',abort); }
    });
  }
  async function refresh() {
    current();if (await refreshSession()!==true) throw new ApiSecurityError('PLATFORM_SYNTHETIC_SESSION_REFRESH_REQUIRED');
  }
  return Object.freeze({
    async currentGeneration() { return directory(await call('synthetic/generation')); },
    async pendingIntent() {
      const value=await call('auth/delegation/intent');
      if (value?.status==='none') { exact(value,['status','requestId']);id(value.requestId);return false; }
      exact(value,['status','slots','roles','requestId']);id(value.requestId);
      if (value.status!=='confirmation_required') invalid();vector(value.slots,SLOTS);vector(value.roles,ROLES);return true;
    },
    refresh,
    replace(value) {
      const intent=replacement(value);
      return operation(async signal=>{
        current(signal);const body=await assertion('synthetic/generation/options',intent,signal);
        const result=await call('synthetic/generation/replace',{ method: 'POST',body },signal);
        exact(result,['status','generation','csrfToken','requestId']);id(result.requestId);
        if (result.status!=='generation_replaced' || typeof result.csrfToken!=='string'
          || !/^[A-Za-z0-9_-]{43}$/.test(result.csrfToken)) invalid();const view=snapshot(result.generation);
        // The new normal session is independently resolved before another operation.
        await refresh();current(signal);return view;
      });
    },
    approve(value,{ onNavigation }={}) {
      const intent=selection(value);if (typeof onNavigation!=='function') throw new TypeError('PLATFORM_SYNTHETIC_NAVIGATION_REQUIRED');
      return operation(async signal=>{
        current(signal);const body=await assertion('auth/delegation/options',intent,signal);
        const csrf=csrfTokenProvider();if (typeof csrf!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) invalid();
        let release;const waiting=new Promise(resolve=>{ release=resolve; });
        pendingNavigation=release;const abort=()=>release();stopped.signal.addEventListener('abort',abort,{ once: true });
        signal?.addEventListener('abort',abort,{ once: true });
        try {
          forms.submit('platform-approve',{ csrfToken: csrf,payload: JSON.stringify(body) });onNavigation();
          // Keep proof-cookie serialization until pagehide or an explicit check.
          await waiting;current(signal);forms.reset();await refresh();
        } finally {
          pendingNavigation=null;stopped.signal.removeEventListener('abort',abort);signal?.removeEventListener('abort',abort);
        }
      });
    },
    cancelNavigation() { forms.reset();pendingNavigation?.(); },
    stop() { stopped.abort();forms.dispose(); },
  });
}
