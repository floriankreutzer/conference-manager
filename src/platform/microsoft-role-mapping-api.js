import { ApiSecurityError } from '../core/api-client.js';

const GUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const REQUEST_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ROLES=['conference_manager','tenant_admin'];
const fail=(code='MICROSOFT_ROLE_MAPPING_RESPONSE_INVALID')=>{ throw new ApiSecurityError(code); };
const guid=value=>typeof value==='string' && GUID.test(value);
function exact(value,keys) {
  if (!value || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) return false;
  const descriptors=Object.getOwnPropertyDescriptors(value),own=Reflect.ownKeys(descriptors);
  return own.length===keys.length && own.every(key=>keys.includes(key) && descriptors[key].enumerable
    && Object.hasOwn(descriptors[key],'value'));
}
function vector(value,max,code) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype || value.length>max
    || Reflect.ownKeys(value).length!==value.length+1) fail(code);
  return Array.from({ length: value.length },(_,index)=>{
    const field=Object.getOwnPropertyDescriptor(value,String(index));
    if (!field?.enumerable || !Object.hasOwn(field,'value')) fail(code);return field.value;
  });
}
function mappings(value,code) {
  const seen=new Set();
  return Object.freeze(vector(value,100,code).map(row=>{
    if (!exact(row,['groupId','roles']) || !guid(row.groupId) || seen.has(row.groupId.toLowerCase())) fail(code);
    const roles=vector(row.roles,2,code);
    if (!roles.length || new Set(roles).size!==roles.length || roles.some(role=>!ROLES.includes(role))) fail(code);
    const groupId=row.groupId.toLowerCase();seen.add(groupId);
    return Object.freeze({ groupId,roles: Object.freeze(ROLES.filter(role=>roles.includes(role))) });
  }).sort((a,b)=>a.groupId.localeCompare(b.groupId)));
}
function settings(value) {
  if (!exact(value,['revision','directoryId','mappings']) || !Number.isSafeInteger(value.revision)
    || value.revision<0 || value.revision>=2147483647 || (value.revision===0
      ? value.directoryId!==null || value.mappings?.length!==0 : !guid(value.directoryId))) fail();
  return Object.freeze({ revision: value.revision,directoryId: value.directoryId?.toLowerCase() ?? null,
    mappings: mappings(value.mappings) });
}
function response(value) {
  if (!exact(value,['settings','requestId']) || typeof value.requestId!=='string' || !REQUEST_ID.test(value.requestId)) fail();
  return settings(value.settings);
}
export function createMicrosoftRoleMappingApi({ apiClient }={}) {
  if (typeof apiClient?.request!=='function') throw new TypeError('MICROSOFT_ROLE_MAPPING_CLIENT_REQUIRED');
  const path='v1/tenant/microsoft-role-mappings';
  async function call(options={}) {
    const controller=new AbortController(),timer=globalThis.setTimeout(()=>controller.abort(),10000);
    try { return response(await apiClient.request(path,{ ...options,signal: controller.signal })); }
    finally { globalThis.clearTimeout(timer); }
  }
  return Object.freeze({
    get: ()=>call(),
    async replace(value) {
      const code='MICROSOFT_ROLE_MAPPING_INPUT_INVALID';
      if (!exact(value,['directoryId','mappings','expectedRevision']) || !guid(value.directoryId)
        || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision<0 || value.expectedRevision>=2147483646) fail(code);
      const body={ directoryId: value.directoryId.toLowerCase(),mappings: mappings(value.mappings,code),
        expectedRevision: value.expectedRevision };
      return call({ method: 'PUT',body });
    },
  });
}
