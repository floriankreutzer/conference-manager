const errorCode=error=>error?.code==='PLATFORM_CUSTOMER_INVITATION_INPUT_INVALID' ? 'input'
  : ['HTTP_400','HTTP_409','HTTP_429','HTTP_401','HTTP_403','HTTP_404'].includes(error?.code)
  ? ({ HTTP_400: 'input',HTTP_409: 'conflict',HTTP_429: 'limited',HTTP_401: 'authority',HTTP_403: 'authority',HTTP_404: 'authority' })[error.code]
  : ['PLATFORM_PASSKEY_OPERATION_CANCELLED','PLATFORM_MICROSOFT_OPERATION_CANCELLED'].includes(error?.code) ? 'cancelled'
  : ['PLATFORM_PASSKEY_OPERATION_NOT_EXECUTED','PLATFORM_MICROSOFT_OPERATION_NOT_EXECUTED'].includes(error?.code)
    ? 'notExecuted' : 'unknown';
const readError=error=>['unknown','notExecuted'].includes(errorCode(error)) ? 'read' : errorCode(error);

export function createPlatformInvitationController({ api,tenantId=null,onCreated=async()=>{},idFactory=()=>globalThis.crypto.randomUUID() }={}) {
  if (!api || ['create','list','issue','mutate'].some(key=>typeof api[key]!=='function')
    || typeof idFactory!=='function' || typeof onCreated!=='function') throw new TypeError('PLATFORM_INVITATION_CONTROLLER_INVALID');
  let state=Object.freeze({ status: tenantId===null ? 'ready' : 'idle',items: Object.freeze([]),error: null,afterId: null,hasNext: false });
  let pending=null,busy=false,disposed=false;const listeners=new Set();
  const update=changes=>{ if (!disposed) { state=Object.freeze({ ...state,...changes });for (const listener of listeners) listener(state); } };
  async function perform(work) {
    if (disposed || busy) return;busy=true;update({ status: 'loading',error: null });
    try { await work(); } finally { busy=false; }
  }
  async function read(afterId) {
    const items=await api.list({ tenantId,afterId });
    update({ status: pending ? 'retry' : 'ready',items,afterId,hasNext: items.length===100,error: null });
  }
  async function submit() {
    let result;
    try { result=tenantId===null ? await api.create(pending) : await api.issue(pending); }
    catch (error) {
      const code=errorCode(error);if (code!=='unknown') pending=null;
      update({ status: pending ? 'retry' : 'error',error: code });return;
    }
    pending=null;if (disposed) return;
    if (tenantId===null) {
      update({ status: 'complete',items: result.invitations,error: null });
      try { await onCreated(result); } catch { update({ status: 'complete',error: 'refresh' }); }
      return;
    }
    try { await read(null); } catch (error) { update({ status: 'refresh_required',error: readError(error) }); }
  }
  return Object.freeze({
    snapshot: ()=>state,
    subscribe(listener) { listeners.add(listener);return ()=>listeners.delete(listener); },
    load({ afterId=state.afterId }={}) {
      if (tenantId===null) return;
      return perform(async()=>{ try { await read(afterId); }
        catch (error) { update({ status: pending ? 'retry' : 'refresh_required',error: readError(error) }); } });
    },
    issue(value) {
      if (disposed || busy || pending || state.error==='authority' || !['ready','error'].includes(state.status)) return;
      pending=Object.freeze({ commandId: idFactory(),reason: value.reason,
        ...(tenantId===null ? { displayName: value.displayName } : { tenantId }),
        invitations: Object.freeze(value.invitations.map(row=>Object.freeze({ recipient: row.recipient,
          roles: Object.freeze([...row.roles]),locale: row.locale }))) });
      return perform(submit);
    },
    retry() { if (pending && state.status==='retry') return perform(submit); },
    mutate(operation,invitationId,reason) {
      if (tenantId===null || state.status!=='ready' || pending) return;
      const row=state.items.find(item=>item.id===invitationId);
      if (!row || !['pending','expired'].includes(row.state) || !['reissue','revoke'].includes(operation)) return;
      return perform(async()=>{
        try { await api.mutate(operation,{ tenantId,invitationId: row.id,expectedRevision: row.revision,reason,commandId: idFactory() }); }
        catch (error) { update({ status: 'refresh_required',error: errorCode(error) });return; }
        if (!disposed) try { await read(state.afterId); }
        catch (error) { update({ status: 'refresh_required',error: readError(error) }); }
      });
    },
    stop() { disposed=true;pending=null;listeners.clear();state=Object.freeze({ status: 'idle',items: Object.freeze([]),error: null,
      afterId: null,hasNext: false }); },
  });
}
