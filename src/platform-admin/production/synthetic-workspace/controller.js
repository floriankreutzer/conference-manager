const unavailable=error=>error?.code==='PLATFORM_SYNTHETIC_SESSION_REFRESH_REQUIRED'
  || ['HTTP_401','HTTP_403'].includes(error?.code) ? 'authority'
  : error?.code==='HTTP_409' ? 'conflict'
  : ['PLATFORM_SYNTHETIC_CANCELLED','PLATFORM_PASSKEY_BROWSER_CANCELLED','PLATFORM_PASSKEY_OPERATION_CANCELLED'].includes(error?.code)
    ? 'cancelled' : 'unknown';

export function createPlatformSyntheticWorkspaceController({ api,reauthenticate }={}) {
  if (!api || ['currentGeneration','pendingIntent','refresh','replace','approve','cancelNavigation','stop']
    .some(name=>typeof api[name]!=='function') || typeof reauthenticate!=='function') {
    throw new TypeError('PLATFORM_SYNTHETIC_CONTROLLER_INVALID');
  }
  let state=Object.freeze({ phase: 'idle',directory: null,pendingIntent: false,error: null });
  const listeners=new Set();let busy=false,stopped=false,ongoing=null;
  function publish(changes) { if (stopped) return;state=Object.freeze({ ...state,...changes });
    for (const listener of listeners) listener(state); }
  function perform(work) {
    if (busy || stopped) return Promise.resolve();busy=true;publish({ phase: 'loading',error: null });
    ongoing=(async()=>{
      try { await work(); }
      catch (error) { const reason=unavailable(error);
        publish({ phase: reason==='authority' ? 'reauthentication_required' : 'check_required',error: reason }); }
      finally { busy=false;ongoing=null; }
    })();return ongoing;
  }
  async function read() {
    const [directory,pendingIntent]=await Promise.all([api.currentGeneration(),api.pendingIntent()]);
    if (!directory || typeof directory.canReplace!=='boolean' || typeof pendingIntent!=='boolean') {
      throw new TypeError('PLATFORM_SYNTHETIC_STATE_INVALID');
    }
    publish({ phase: 'ready',directory,pendingIntent,error: null });
  }
  return Object.freeze({
    snapshot: ()=>state,
    subscribe(listener) { if (typeof listener!=='function') throw new TypeError('PLATFORM_SYNTHETIC_LISTENER_INVALID');
      listeners.add(listener);return ()=>listeners.delete(listener); },
    load() { if (state.phase!=='idle') return Promise.resolve();return perform(read); },
    async check() {
      if (stopped) return;
      let refreshed=false;
      if (state.phase==='continuing') { api.cancelNavigation();await ongoing;refreshed=true; }
      if (state.phase==='reauthentication_required') return;
      return perform(async()=>{ if (!refreshed) await api.refresh();await read(); });
    },
    prepareReplacement() {
      if (!busy && !stopped && state.phase==='ready' && state.directory?.canReplace) publish({ phase: 'replacement_confirmation' });
    },
    cancelReplacement() { if (!busy && state.phase==='replacement_confirmation') publish({ phase: 'ready' }); },
    replace() {
      if (state.phase!=='replacement_confirmation' || !state.directory?.canReplace) return Promise.resolve();
      const current=state.directory.generation;
      return perform(async()=>{
        await api.replace({ expectedGenerationId: current?.generationId ?? null,expectedRevision: current?.revision ?? 0 });
        if (!stopped) await read();
      });
    },
    approve({ slot,role }={}) {
      if (state.phase!=='ready' || !state.pendingIntent || !state.directory?.generation?.available
        || !['northwind','contoso','fabrikam'].includes(slot) || !['employee','conference_manager','tenant_admin'].includes(role)) {
        return Promise.resolve();
      }
      const generationId=state.directory.generation.generationId;
      return perform(()=>api.approve({ generationId,slot,role },{ onNavigation: ()=>publish({ phase: 'continuing' }) }));
    },
    reauthenticate() { if (!busy && state.phase==='reauthentication_required' && !stopped) reauthenticate(); },
    stop() { if (stopped) return;stopped=true;listeners.clear();api.stop(); },
  });
}
