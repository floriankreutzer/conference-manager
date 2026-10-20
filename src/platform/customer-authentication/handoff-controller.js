import { ApiSecurityError } from '../../core/api-client.js';

export function createCustomerHandoffController({ client,cancel }={}) {
  if (!client || ['confirmation','logout','complete','start','clear','dispose'].some(name=>typeof client[name]!=='function')
    || typeof cancel!=='function') throw new TypeError('CUSTOMER_HANDOFF_CONTROLLER_CONFIGURATION_INVALID');
  let state=Object.freeze({ phase: 'loading',error: null,slot: null,role: null }),busy=false,loaded=false,disposed=false;
  const listeners=new Set();
  function publish(changes) { if (disposed) return;state=Object.freeze({ ...state,...changes });
    for (const listener of listeners) listener(state); }
  async function run(work) {
    if (busy || disposed) return;busy=true;publish({ phase: 'loading',error: null });
    try { await work(); }
    catch (error) {
      client.clear();const expired=error instanceof ApiSecurityError && ['HTTP_401','HTTP_403'].includes(error.code);
      publish({ phase: expired ? 'expired' : 'check_required',error: expired ? 'expired' : 'unavailable' });
    } finally { busy=false; }
  }
  async function read() {
    const value=await client.confirmation();
    if (!value || !['northwind','contoso','fabrikam'].includes(value.slot)
      || !['employee','conference_manager','tenant_admin'].includes(value.role) || typeof value.accountSwitchRequired!=='boolean') {
      throw new ApiSecurityError('CUSTOMER_HANDOFF_RESPONSE_INVALID');
    }
    publish({ phase: value.accountSwitchRequired ? 'switch_required' : 'confirmation',slot: value.slot,role: value.role,error: null });
  }
  return Object.freeze({
    snapshot: ()=>state,
    subscribe(listener) { if (typeof listener!=='function') throw new TypeError('CUSTOMER_HANDOFF_LISTENER_INVALID');
      listeners.add(listener);return ()=>listeners.delete(listener); },
    load() { if (loaded) return Promise.resolve();loaded=true;return run(read); },
    check() { return run(read); },
    confirm() {
      if (state.phase!=='confirmation') return Promise.resolve();
      return run(async()=>{ if (disposed) return;client.complete();publish({ phase: 'continuing' }); });
    },
    switchAccount() {
      if (state.phase!=='switch_required') return Promise.resolve();
      // Only the explicitly named action can revoke the current Customer session.
      // Even its successful204 is followed by an independent current-flow read.
      return run(async()=>{ await client.logout();if (!disposed) await read(); });
    },
    restart() {
      if (!['expired','check_required','continuing'].includes(state.phase)) return Promise.resolve();
      return run(async()=>{ client.clear();client.start();publish({ phase: 'continuing',error: null }); });
    },
    cancel() { if (busy || disposed) return;client.clear();cancel(); },
    dispose() { disposed=true;listeners.clear();client.dispose(); },
  });
}
