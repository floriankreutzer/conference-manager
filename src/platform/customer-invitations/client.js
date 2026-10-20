import { ApiSecurityError } from '../../core/api-client.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES=['conference_manager','tenant_admin'];
const invalid=(response=false) => { throw new ApiSecurityError(response ? 'CUSTOMER_INVITATION_RESPONSE_INVALID'
  : 'CUSTOMER_INVITATION_INPUT_INVALID'); };
function exact(value,keys,response=false) {
  if (!value || typeof value!=='object' || Array.isArray(value)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) invalid(response);
  const own=Reflect.ownKeys(value);
  if (own.length!==keys.length || own.some(key => {
    const field=Object.getOwnPropertyDescriptor(value,key);
    return !keys.includes(key) || !field.enumerable || !Object.hasOwn(field,'value');
  })) invalid(response);
}
function uuid(value,response=false) { if (!UUID.test(typeof value==='string' ? value : '')) invalid(response);return value.toLowerCase(); }
const revision=value => Number.isSafeInteger(value) && value>=1 && value<Number.MAX_SAFE_INTEGER;
function vector(value,minimum,maximum,response=false) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype || value.length<minimum || value.length>maximum
    || Reflect.ownKeys(value).length!==value.length+1) invalid(response);
  const result=[];
  for (let index=0;index<value.length;index++) {
    const field=Object.getOwnPropertyDescriptor(value,String(index));
    if (!field?.enumerable || !Object.hasOwn(field,'value')) invalid(response);result.push(field.value);
  }
  return result;
}
function intent(value,response=false) {
  exact(value,['recipient','roles','locale'],response);
  const roles=vector(value.roles,0,2,response);
  if (typeof value.recipient!=='string' || value.recipient.length<3 || value.recipient.length>254
    || value.recipient.trim()!==value.recipient || /[^\x21-\x7e]/.test(value.recipient)
    || !/^[^@]+@[^@]+\.[^@]+$/.test(value.recipient) || !['de','en'].includes(value.locale)
    || new Set(roles).size!==roles.length || roles.some(role => !ROLES.includes(role))) invalid(response);
  const [local,domain]=value.recipient.split('@');
  return Object.freeze({ recipient: `${local}@${domain.toLowerCase()}`,
    roles: Object.freeze(ROLES.filter(role => roles.includes(role))),locale: value.locale });
}
function receipt(value) {
  exact(value,['id','revision','recipient','roles','locale','state','expiresAt','delivery'],true);
  const normalized=intent({ recipient: value.recipient,roles: value.roles,locale: value.locale },true);
  if (!revision(value.revision) || !['pending','accepted','revoked','expired'].includes(value.state)
    || !['queued','processing','accepted','failed','cancelled'].includes(value.delivery)
    || value.state==='revoked' && value.delivery==='queued'
    || normalized.recipient!==value.recipient || JSON.stringify(normalized.roles)!==JSON.stringify(value.roles)
    || typeof value.expiresAt!=='string' || !Number.isFinite(Date.parse(value.expiresAt))
    || new Date(value.expiresAt).toISOString()!==value.expiresAt) invalid(true);
  return Object.freeze({ id: uuid(value.id,true),revision: value.revision,...normalized,
    state: value.state,expiresAt: value.expiresAt,delivery: value.delivery });
}
function collection(value,maximum) {
  const rows=vector(value,0,maximum,true).map(receipt);
  if (new Set(rows.map(row => row.id)).size!==rows.length) invalid(true);return Object.freeze(rows);
}

// Uses the existing authenticated API/CSRF transport. No identity, Tenant,
// provider destination, browser persistence or automatic write retry is added.
export function createCustomerInvitationClient({ apiClient,timeoutMs=10000 } = {}) {
  if (typeof apiClient?.request!=='function' || !Number.isSafeInteger(timeoutMs) || timeoutMs<1000 || timeoutMs>15000) {
    throw new TypeError('CUSTOMER_INVITATION_API_REQUIRED');
  }
  async function call(path,options={}) {
    const abort=new AbortController(),timer=globalThis.setTimeout(() => abort.abort(),timeoutMs);
    try { return await apiClient.request(path,{ ...options,signal: abort.signal }); }
    finally { globalThis.clearTimeout(timer); }
  }
  return Object.freeze({
    async list({ afterId=null } = {}) {
      const path=`v1/tenant/invitations?limit=100${afterId===null ? '' : `&afterId=${uuid(afterId)}`}`;
      const result=await call(path);exact(result,['invitations','requestId'],true);uuid(result.requestId,true);
      const rows=collection(result.invitations,100);
      if (rows.some((row,index) => row.id<=(index ? rows[index-1].id : afterId?.toLowerCase() || ''))) invalid(true);
      return rows;
    },
    async issueBatch(value) {
      exact(value,['commandId','invitations']);const commandId=uuid(value.commandId);
      const invitations=vector(value.invitations,1,20).map(row => intent(row));
      if (new Set(invitations.map(row => row.recipient)).size!==invitations.length) invalid();
      const result=await call('v1/tenant/invitations',{ method: 'POST',body: { commandId,invitations } });
      exact(result,['invitations','requestId'],true);uuid(result.requestId,true);const rows=collection(result.invitations,20);
      if (rows.length!==invitations.length || rows.some((row,index) => row.revision!==1 || row.state!=='pending'
        || row.delivery!=='queued' || JSON.stringify({ recipient: row.recipient,roles: row.roles,locale: row.locale })
          !==JSON.stringify(invitations[index]))) invalid(true);
      return rows;
    },
    async mutate(operation,value) {
      if (!['reissue','revoke'].includes(operation)) invalid();
      exact(value,['invitationId','expectedRevision']);const invitationId=uuid(value.invitationId);
      if (!revision(value.expectedRevision) || value.expectedRevision>=Number.MAX_SAFE_INTEGER-1) invalid();
      const result=await call(`v1/tenant/invitations/${invitationId}/${operation}`,
        { method: 'POST',body: { expectedRevision: value.expectedRevision } });
      exact(result,['invitation','requestId'],true);uuid(result.requestId,true);const row=receipt(result.invitation);
      if (row.id!==invitationId || row.revision!==value.expectedRevision+1
        || row.state!==(operation==='revoke' ? 'revoked' : 'pending') || operation==='reissue' && row.delivery!=='queued') invalid(true);
      return row;
    },
  });
}
