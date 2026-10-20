import { ApiSecurityError } from '../core/api-client.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES=['conference_manager','tenant_admin'];
const fail=()=>{ throw new ApiSecurityError('PLATFORM_CUSTOMER_INVITATION_CONTRACT_INVALID'); };
function command(work) {
  try { return work(); } catch (error) {
    if (error?.code==='PLATFORM_CUSTOMER_INVITATION_CONTRACT_INVALID') {
      throw new ApiSecurityError('PLATFORM_CUSTOMER_INVITATION_INPUT_INVALID');
    }
    throw error;
  }
}
function exact(value,keys) {
  if (!value || typeof value!=='object' || Array.isArray(value)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail();
  const fields=Reflect.ownKeys(value);
  if (fields.length!==keys.length || fields.some(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return !keys.includes(key) || !descriptor.enumerable || !Object.hasOwn(descriptor,'value');
  })) fail();
}
function id(value) { if (typeof value!=='string' || !UUID.test(value)) fail();return value.toLowerCase(); }
function text(value,max) {
  if (typeof value!=='string' || value.trim()!==value || !value.length || value.length>max || /[\u0000-\u001f\u007f]/.test(value)) fail();
  return value;
}
function vector(value,min,max) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype || value.length<min || value.length>max
    || Reflect.ownKeys(value).length!==value.length+1) fail();
  return Array.from({ length: value.length },(_,index)=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor,'value')) fail();return descriptor.value;
  });
}
function intent(value) {
  exact(value,['recipient','roles','locale']);const roles=vector(value.roles,0,2),recipient=text(value.recipient,254);
  if (/[^!-~]/.test(recipient) || !/^[^@]+@[^@]+\.[^@]+$/.test(recipient)
    || !['de','en'].includes(value.locale) || new Set(roles).size!==roles.length || roles.some(role=>!ROLES.includes(role))) fail();
  const [local,domain]=recipient.split('@');
  return Object.freeze({ recipient: `${local}@${domain.toLowerCase()}`,roles: Object.freeze(ROLES.filter(role=>roles.includes(role))),
    locale: value.locale });
}
function intents(value,min,max) {
  const rows=vector(value,min,max).map(intent);
  if (new Set(rows.map(row=>row.recipient)).size!==rows.length) fail();return Object.freeze(rows);
}
function receipt(value) {
  exact(value,['id','revision','recipient','roles','locale','state','expiresAt','delivery']);
  const person=intent({ recipient: value.recipient,roles: value.roles,locale: value.locale });
  if (!Number.isSafeInteger(value.revision) || value.revision<1 || value.revision>=Number.MAX_SAFE_INTEGER
    || JSON.stringify(person)!==JSON.stringify({ recipient: value.recipient,roles: value.roles,locale: value.locale })
    || !['pending','accepted','revoked','expired'].includes(value.state)
    || !['queued','processing','accepted','failed','cancelled'].includes(value.delivery)
    || value.state==='revoked' && value.delivery==='queued' || typeof value.expiresAt!=='string'
    || !Number.isFinite(Date.parse(value.expiresAt)) || new Date(value.expiresAt).toISOString()!==value.expiresAt) fail();
  return Object.freeze({ id: id(value.id),revision: value.revision,...person,state: value.state,
    expiresAt: value.expiresAt,delivery: value.delivery });
}
function receipts(value,min,max) {
  const rows=vector(value,min,max).map(receipt);
  if (new Set(rows.map(row=>row.id)).size!==rows.length || new Set(rows.map(row=>row.recipient)).size!==rows.length) fail();
  return Object.freeze(rows);
}
function updated(value,keys) {
  exact(value,['schemaVersion','outcome',...keys]);
  if (value.schemaVersion!==1 || !['updated','idempotent'].includes(value.outcome)) fail();
}
function issued(rows) { if (rows.some(row=>row.revision!==1 || row.state!=='pending' || row.delivery!=='queued')) fail(); }

// Platform-owned wire adapter. It never imports Customer authority or calls a
// Customer endpoint; the injected existing transport owns session/CSRF/proofs.
export function createPlatformCustomerInvitationApi({ apiClient,timeoutMs=150000 }={}) {
  // Includes the existing120-second native ceremony, queue and transport time.
  if (typeof apiClient?.request!=='function' || !Number.isSafeInteger(timeoutMs) || timeoutMs<1000 || timeoutMs>180000) {
    throw new TypeError('PLATFORM_CUSTOMER_INVITATION_API_REQUIRED');
  }
  async function call(path,options={}) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try { return await apiClient.request(path,{ ...options,signal: controller.signal }); }
    finally { clearTimeout(timer); }
  }
  return Object.freeze({
    async create(value) {
      const { displayName,reason,invitations,commandId }=command(()=>{
        exact(value,['displayName','reason','invitations','commandId']);
        return { displayName: text(value.displayName,160),reason: text(value.reason,500),
          invitations: intents(value.invitations,0,19),commandId: id(value.commandId) };
      });
      const result=await call('tenants',{ method: 'POST',idempotencyKey: commandId,body: { displayName,reason,invitations,
        confirmation: { action: 'tenant.invitation.create',displayName } } });
      updated(result,['tenant','invitations']);exact(result.tenant,['id','displayName','status']);id(result.tenant.id);
      if (result.tenant.displayName!==displayName || result.tenant.status!=='onboarding') fail();
      const rows=receipts(result.invitations,1,20);issued(rows);
      // The server adds its protected owner contact, or augments that one input
      // with Tenant Admin and its configured locale. No other input may change.
      let ownerChanges=0;
      for (const proposed of invitations) {
        const actual=rows.find(row=>row.recipient===proposed.recipient);if (!actual) fail();
        if (actual.locale!==proposed.locale || JSON.stringify(actual.roles)!==JSON.stringify(proposed.roles)) {
          ownerChanges++;
          const ownerRoles=ROLES.filter(role=>proposed.roles.includes(role) || role==='tenant_admin');
          if (JSON.stringify(actual.roles)!==JSON.stringify(ownerRoles)) fail();
        }
      }
      const added=rows.filter(row=>!invitations.some(proposed=>proposed.recipient===row.recipient));
      if (added.length>1 || ownerChanges+added.length>1 || !rows.some(row=>row.roles.includes('tenant_admin'))
        || added.some(row=>JSON.stringify(row.roles)!==JSON.stringify(['tenant_admin']))) fail();
      return Object.freeze({ tenant: Object.freeze({ ...result.tenant }),invitations: rows });
    },
    async list({ tenantId,afterId=null }={}) {
      const { tenant,after }=command(()=>({ tenant: id(tenantId),after: afterId===null ? null : id(afterId) }));
      const result=await call(`tenants/${tenant}/invitations?limit=100${after===null ? '' : `&afterId=${after}`}`);
      exact(result,['schemaVersion','items']);if (result.schemaVersion!==1) fail();const rows=receipts(result.items,0,100);
      if (rows.some((row,index)=>row.id<=(index ? rows[index-1].id : after ?? ''))) fail();return rows;
    },
    async issue(value) {
      const { tenantId,reason,invitations,commandId }=command(()=>{
        exact(value,['tenantId','reason','invitations','commandId']);
        return { tenantId: id(value.tenantId),reason: text(value.reason,500),invitations: intents(value.invitations,1,20),
          commandId: id(value.commandId) };
      });
      const result=await call(`tenants/${tenantId}/invitations`,{ method: 'POST',idempotencyKey: commandId,body: {
        reason,invitations,confirmation: { action: 'tenant.invitation.create',tenantId } } });
      updated(result,['invitations']);const rows=receipts(result.invitations,1,20);issued(rows);
      if (rows.length!==invitations.length || rows.some((row,index)=>JSON.stringify({ recipient: row.recipient,
        roles: row.roles,locale: row.locale })!==JSON.stringify(invitations[index]))) fail();return rows;
    },
    async mutate(operation,value) {
      const { tenantId,invitationId,reason,revision,commandId }=command(()=>{
        if (!['reissue','revoke'].includes(operation)) fail();
        exact(value,['tenantId','invitationId','expectedRevision','reason','commandId']);
        const revision=value.expectedRevision;
        if (!Number.isSafeInteger(revision) || revision<1 || revision>=Number.MAX_SAFE_INTEGER-1) fail();
        return { tenantId: id(value.tenantId),invitationId: id(value.invitationId),reason: text(value.reason,500),revision,
          commandId: id(value.commandId) };
      });
      const result=await call(`tenants/${tenantId}/invitations/${invitationId}${operation==='reissue' ? '/reissue' : ''}`,{
        method: operation==='revoke' ? 'DELETE' : 'POST',idempotencyKey: commandId,body: {
          expectedRevision: revision,reason,confirmation: { action: `tenant.invitation.${operation}`,tenantId } } });
      updated(result,['invitation']);const row=receipt(result.invitation);
      if (row.id!==invitationId || row.revision!==revision+1 || row.state!==(operation==='revoke' ? 'revoked' : 'pending')
        || operation==='reissue' && row.delivery!=='queued') fail();return row;
    },
  });
}
