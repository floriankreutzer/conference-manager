const errorCode=error => ['HTTP_400','CUSTOMER_INVITATION_INPUT_INVALID'].includes(error?.code) ? 'input'
  : error?.code==='HTTP_409' ? 'conflict' : error?.code==='HTTP_429' ? 'limited'
  : ['HTTP_401','HTTP_403','HTTP_404'].includes(error?.code) ? 'authority' : 'unknown';

export function createInvitationAdministrationController({ client,idFactory=() => globalThis.crypto.randomUUID() } = {}) {
  if (!client || ['list','issueBatch','mutate'].some(key => typeof client[key]!=='function') || typeof idFactory!=='function') {
    throw new TypeError('CUSTOMER_INVITATION_CONTROLLER_CONFIGURATION_INVALID');
  }
  let state=Object.freeze({ status: 'idle',items: Object.freeze([]),error: null,afterId: null,hasNext: false }),pendingBatch=null;
  let busy=false,disposed=false;const listeners=new Set();
  const update=changes => {
    if (disposed) return;state=Object.freeze({ ...state,...changes });for (const listener of listeners) listener(state);
  };
  async function perform(work) {
    if (busy || disposed) return;busy=true;
    try { update({ status: 'loading',error: null });await work(); } finally { busy=false; }
  }
  async function read(afterId=state.afterId) {
    const items=await client.list({ afterId });
    update({ status: pendingBatch ? 'retry_batch' : 'ready',items,afterId,hasNext: items.length===100,error: null });
  }
  async function submitBatch() {
    try { await client.issueBatch(pendingBatch);pendingBatch=null; }
    catch (error) {
      const code=errorCode(error);
      if (code!=='unknown') pendingBatch=null;
      update({ status: pendingBatch ? 'retry_batch' : 'error',error: code });return;
    }
    if (!disposed) try { await read(null); } catch { update({ status: 'refresh_required',error: 'unknown' }); }
  }
  return Object.freeze({
    snapshot: () => state,
    subscribe(listener) {
      if (typeof listener!=='function') throw new TypeError('CUSTOMER_INVITATION_LISTENER_REQUIRED');
      listeners.add(listener);return () => listeners.delete(listener);
    },
    load({ afterId=state.afterId } = {}) {
      return perform(async () => {
        try { await read(afterId); }
        catch (error) { update({ status: pendingBatch ? 'retry_batch' : 'error',error: errorCode(error) }); }
      });
    },
    issue(invitations) {
      if (disposed || pendingBatch || state.error==='authority' || !['ready','error'].includes(state.status)) return;
      // Retain only this exact in-memory command for an explicitly requested
      // recovery retry. A reload does not restore recipient/role commands.
      const commandId=idFactory();
      pendingBatch=Object.freeze({ commandId,invitations: Object.freeze(invitations.map(row => Object.freeze({
        recipient: row.recipient,roles: Object.freeze([...row.roles]),locale: row.locale }))) });
      return perform(submitBatch);
    },
    retryBatch() { if (pendingBatch && state.status==='retry_batch') return perform(submitBatch); },
    mutate(operation,invitationId) {
      if (state.status!=='ready' || pendingBatch || !['reissue','revoke'].includes(operation)) return;
      const row=state.items.find(item => item.id===invitationId);
      if (!row || !['pending','expired'].includes(row.state)) return;
      return perform(async () => {
        try { await client.mutate(operation,{ invitationId: row.id,expectedRevision: row.revision }); }
        catch (error) { update({ status: 'refresh_required',error: errorCode(error) });return; }
        if (!disposed) try { await read(); } catch { update({ status: 'refresh_required',error: 'unknown' }); }
      });
    },
    clear() { disposed=true;pendingBatch=null;listeners.clear();state=Object.freeze({ status: 'idle',items: Object.freeze([]),error: null,
      afterId: null,hasNext: false }); },
  });
}
