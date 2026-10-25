const roles=Object.freeze(['employee','conference_manager','tenant_admin']);
const reason=error=>['HTTP_401','HTTP_403','PLATFORM_SYNTHETIC_SESSION_REFRESH_REQUIRED'].includes(error?.code) ? 'authority'
  : error?.code==='HTTP_409' ? 'conflict' : ['PLATFORM_SYNTHETIC_CANCELLED','PLATFORM_MICROSOFT_OPERATION_CANCELLED'].includes(error?.code)
    ? 'cancelled' : 'unknown';

export function createPlatformOwnerCustomerController({ api,reauthenticate }={}) {
  if (!api || ['pendingIntent','refresh','approve','cancelNavigation','stop'].some(name=>typeof api[name]!=='function')
    || typeof reauthenticate!=='function') throw new TypeError('PLATFORM_OWNER_CUSTOMER_CONTROLLER_INVALID');
  let state=Object.freeze({ phase: 'idle',directory: null,error: null }),busy=false,stopped=false,ongoing=null;
  const listeners=new Set();
  function publish(change) { if (stopped) return;state=Object.freeze({ ...state,...change });
    for (const listener of listeners) listener(state); }
  function perform(work) {
    if (stopped || busy) return Promise.resolve();busy=true;publish({ phase: 'loading',error: null });
    ongoing=(async()=>{ try { await work(); } catch (error) {
      const failure=reason(error);publish({ phase: failure==='authority' ? 'reauthentication_required' : 'check_required',error: failure });
    } finally { busy=false;ongoing=null; } })();return ongoing;
  }
  async function read(afterTenantId=null) {
    const directory=await api.pendingIntent({ afterTenantId });
    if (!directory || typeof directory.pending!=='boolean' || !Array.isArray(directory.tenants)) {
      throw new TypeError('PLATFORM_OWNER_CUSTOMER_STATE_INVALID');
    }
    publish({ phase: 'ready',directory,error: null });
  }
  return Object.freeze({
    snapshot: ()=>state,
    subscribe(listener) { if (typeof listener!=='function') throw new TypeError('PLATFORM_OWNER_CUSTOMER_LISTENER_INVALID');
      listeners.add(listener);return ()=>listeners.delete(listener); },
    load() { return state.phase==='idle' ? perform(()=>read()) : Promise.resolve(); },
    nextPage() { const next=state.directory?.nextTenantId;
      return state.phase==='ready' && next ? perform(()=>read(next)) : Promise.resolve(); },
    firstPage() { return state.phase==='ready' ? perform(()=>read()) : Promise.resolve(); },
    async check() {
      if (stopped || state.phase==='reauthentication_required') return;
      let refreshed=false;if (state.phase==='continuing') { api.cancelNavigation();await ongoing;refreshed=true; }
      return perform(async()=>{ if (!refreshed) await api.refresh();await read(); });
    },
    approve({ tenantId,role }={}) {
      if (state.phase!=='ready' || !state.directory?.pending || !roles.includes(role)
        || !state.directory.tenants.some(tenant=>tenant.tenantId===tenantId)) return Promise.resolve();
      return perform(()=>api.approve({ tenantId,role },{ onNavigation: ()=>publish({ phase: 'continuing' }) }));
    },
    reauthenticate() { if (!busy && !stopped && state.phase==='reauthentication_required') reauthenticate(); },
    stop() { if (stopped) return;stopped=true;listeners.clear();api.stop(); },
  });
}
