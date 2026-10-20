import { ApiSecurityError } from '../../core/api-client.js';

export function createCustomerEmailController({ client,completeSession,microsoftClient=null,initialMicrosoftChoice=false } = {}) {
  if (!client || ['request','pending','verify','choices','select','clear'].some(name => typeof client[name]!=='function')
    || typeof completeSession!=='function' || typeof initialMicrosoftChoice!=='boolean'
    || microsoftClient!==null && ['choices','select','clear'].some(name=>typeof microsoftClient[name]!=='function')
    || initialMicrosoftChoice && microsoftClient===null) throw new TypeError('CUSTOMER_EMAIL_CONTROLLER_CONFIGURATION_INVALID');
  let state=Object.freeze({ phase: 'loading',error: null,expiresAt: null,items: Object.freeze([]) });
  let busy=false,disposed=false,loaded=false; const listeners=new Set();
  let microsoft=initialMicrosoftChoice;
  const currentClient=()=>microsoft ? microsoftClient : client;
  function publish(changes) {
    if (disposed) return;
    state=Object.freeze({ ...state,...changes }); for (const listener of listeners) listener(state);
  }
  const errorKey=error => error instanceof ApiSecurityError && error.code==='HTTP_429' ? 'limited'
    : error instanceof ApiSecurityError && error.code==='HTTP_401' ? 'rejected' : 'unavailable';
  async function choices(result) {
    const items=await currentClient().choices();
    publish({ phase: 'choices',expiresAt: result?.expiresAt ?? null,items,error: items.length ? null : 'noChoices' });
  }
  async function run(work,failurePhase) {
    if (busy || disposed) return;
    busy=true; publish({ phase: 'loading',error: null });
    try { await work(); } catch (error) { publish({ phase: failurePhase,error: errorKey(error) }); }
    finally { busy=false; }
  }
  async function recover(initial) {
    if (microsoft) {
      try { await choices(); }
      catch (error) {
        if (!(error instanceof ApiSecurityError) || error.code!=='HTTP_401') throw error;
        microsoftClient.clear();publish({ phase: 'choices',expiresAt: null,items: Object.freeze([]),error: 'microsoftUnlinked' });
      }
      return;
    }
    try {
      const result=await client.pending();
      if (result.status==='membership_required') await choices(result);
      else publish({ phase: 'code',expiresAt: result.expiresAt });
    } catch (error) {
      if (error instanceof ApiSecurityError && error.code==='HTTP_401') {
        client.clear(); publish({ phase: 'email',error: initial ? null : 'rejected' });
      } else throw error;
    }
  }
  return Object.freeze({
    snapshot: () => state,
    subscribe(listener) {
      if (typeof listener!=='function') throw new TypeError('CUSTOMER_EMAIL_LISTENER_INVALID');
      listeners.add(listener); return () => listeners.delete(listener);
    },
    async load() {
      if (loaded) return; loaded=true;
      await run(() => recover(true),'email');
    },
    request(recipient,locale) {
      return run(async () => { microsoft=false;microsoftClient?.clear();const result=await client.request({ recipient,locale });
        publish({ phase: 'code',expiresAt: result.expiresAt,items: Object.freeze([]) }); },'email');
    },
    verify(code) {
      return run(async () => {
        let result;
        try { result=await client.verify(code); }
        catch (error) {
          if (error instanceof ApiSecurityError && ['HTTP_401','HTTP_429'].includes(error.code)) throw error;
          publish({ phase: 'resume_required',error: 'unavailable' }); return;
        }
        try { await choices(result); } catch { publish({ phase: 'resume_required',error: 'unavailable' }); }
      },'code');
    },
    resume() { return run(() => recover(false),'resume_required'); },
    select(membershipId) {
      if (state.phase!=='choices' || !state.items.some(item => item.membershipId===membershipId)) return Promise.resolve();
      return run(async () => {
        // A lost selection response is ambiguous. The only continuation rechecks
        // the ordinary session; neither selection nor acceptance is retried.
        try { await currentClient().select(membershipId); }
        catch { publish({ phase: 'refresh_required',error: 'refresh' }); return; }
        try { await completeSession(); publish({ phase: 'authenticated',items: Object.freeze([]),expiresAt: null }); }
        catch { publish({ phase: 'refresh_required',error: 'refresh' }); }
      },'refresh_required');
    },
    checkSession() {
      return run(async () => { await completeSession();
        publish({ phase: 'authenticated',error: null,items: Object.freeze([]),expiresAt: null }); },'refresh_required');
    },
    restart() {
      if (busy || disposed) return; client.clear();microsoftClient?.clear();microsoft=false;
      publish({ phase: 'email',error: null,items: Object.freeze([]),expiresAt: null });
    },
    dispose() { disposed=true; listeners.clear(); client.clear();microsoftClient?.clear(); },
  });
}
