import { ApiSecurityError } from '../../core/api-client.js';

export function createCustomerAccountController({ client,currentSession,navigate,completeSession,reauthenticate,cancel,
  initialConfirmation=false }={}) {
  if (!client || ['accountState','startLink','linkConfirmation','confirmLink','clear'].some(name=>typeof client[name]!=='function')
    || [currentSession,navigate,completeSession,reauthenticate,cancel].some(value=>typeof value!=='function')
    || typeof initialConfirmation!=='boolean') throw new TypeError('CUSTOMER_ACCOUNT_CONTROLLER_CONFIGURATION_INVALID');
  let state=Object.freeze({ phase: 'loading',error: null }),busy=false,disposed=false,loaded=false;
  const listeners=new Set();
  function publish(changes) {
    if (disposed) return;state=Object.freeze({ ...state,...changes });for (const listener of listeners) listener(state);
  }
  const errorKey=error=>error instanceof ApiSecurityError && ['HTTP_401','HTTP_403'].includes(error.code) ? 'reauthentication' : 'unavailable';
  async function run(work,failurePhase='check_required') {
    if (busy || disposed) return;busy=true;publish({ phase: 'loading',error: null });
    try { await work(); }
    catch (error) { const key=errorKey(error);publish({ phase: key==='reauthentication' ? 'reauthentication_required' : failurePhase,error: key }); }
    finally { busy=false; }
  }
  async function readState() {
    const result=await client.accountState();
    if (typeof result?.microsoftLinked!=='boolean' || typeof result?.emailReauthenticationRequired!=='boolean') {
      throw new ApiSecurityError('CUSTOMER_ACCOUNT_STATE_INVALID');
    }
    publish({ phase: result.microsoftLinked ? 'linked' : result.emailReauthenticationRequired ? 'reauthentication_required' : 'ready',
      error: null });
  }
  return Object.freeze({
    snapshot: ()=>state,
    subscribe(listener) {
      if (typeof listener!=='function') throw new TypeError('CUSTOMER_ACCOUNT_LISTENER_INVALID');
      listeners.add(listener);return ()=>listeners.delete(listener);
    },
    load() {
      if (loaded) return Promise.resolve();loaded=true;
      return run(async()=>{
        if (initialConfirmation) {
          if (await client.linkConfirmation()!==true) throw new ApiSecurityError('CUSTOMER_ACCOUNT_PROOF_INVALID');
          publish({ phase: 'confirmation' });
        }
        else await readState();
      });
    },
    start() {
      if (state.phase!=='ready') return Promise.resolve();
      return run(async()=>{
        const url=await client.startLink(currentSession()?.csrfToken);
        if (disposed) return;publish({ phase: 'redirecting' });navigate(url);
      },'ready');
    },
    confirm() {
      if (state.phase!=='confirmation') return Promise.resolve();
      return run(async()=>{
        // A lost response or failed session refresh never permits blind replay.
        // The only continuation reads current account state or reauthenticates.
        try { await client.confirmLink();if (disposed) return;await completeSession();publish({ phase: 'linked' }); }
        catch { publish({ phase: 'refresh_required',error: 'refresh' }); }
      });
    },
    check() { return run(readState); },
    reauthenticate() {
      if (state.phase!=='reauthentication_required') return Promise.resolve();return run(reauthenticate,'reauthentication_required');
    },
    cancel() { if (busy || disposed) return;client.clear();cancel(); },
    dispose() { disposed=true;listeners.clear();client.clear(); },
  });
}
