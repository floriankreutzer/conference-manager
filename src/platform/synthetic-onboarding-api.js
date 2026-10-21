import { ApiSecurityError } from '../core/api-client.js';
import { authorityFailureCode } from '../shared/authority-failure.js';

const ROOT='v1/integrations/synthetic-calendar';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid=()=>{ throw new ApiSecurityError('SYNTHETIC_ONBOARDING_RESPONSE_INVALID'); };
function exact(value,keys) {
  if (!value || ![Object.prototype,null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length!==keys.length
    || Reflect.ownKeys(value).some(key=>{
      const field=Object.getOwnPropertyDescriptor(value,key);return !keys.includes(key) || !field.enumerable || !Object.hasOwn(field,'value');
    })) invalid();
}
const revision=value=>Number.isSafeInteger(value) && value>=1 && value<Number.MAX_SAFE_INTEGER;
function inputObject(value,keys) {
  try { exact(value,keys); } catch { throw new ApiSecurityError('SYNTHETIC_ONBOARDING_INPUT_INVALID'); }
}
function text(value,maximum=160) {
  if (typeof value!=='string' || !value.trim() || value.trim()!==value || value.length>maximum
    || /[\u0000-\u001f\u007f]/.test(value)) invalid();return value;
}
function candidates(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype || value.length>2
    || Reflect.ownKeys(value).length!==value.length+1) invalid();
  const result=Array.from({ length: value.length },(_,index)=>{
    const own=Object.getOwnPropertyDescriptor(value,String(index));if (!own || !Object.hasOwn(own,'value')) invalid();
    const row=own.value;exact(row,['key','name','capacity','building','timeZone','imported']);
    if (!['workshop','focus'].includes(row.key) || !Number.isSafeInteger(row.capacity) || row.capacity<1 || row.capacity>100000
      || row.timeZone!=='Europe/Berlin' || typeof row.imported!=='boolean') invalid();
    return Object.freeze({ key: row.key,name: text(row.name),capacity: row.capacity,building: text(row.building),
      timeZone: row.timeZone,imported: row.imported });
  });
  if (new Set(result.map(row=>row.key)).size!==result.length) invalid();return Object.freeze(result);
}
export function normalizeSyntheticOnboardingView(value,{ imported=false }={}) {
  exact(value,['mode','provider','microsoftConnection','tenantStatus','locationsRevision','roomCount','boundRoomCount',
    'readiness','calendarWriteEntitled','candidates','requestId',...(imported ? ['importedCount'] : [])]);
  if (value.mode!=='synthetic' || value.provider!=='synthetic_calendar' || value.microsoftConnection!=='not_applicable'
    || !['onboarding','ready','active'].includes(value.tenantStatus) || !revision(value.locationsRevision)
    || !Number.isSafeInteger(value.roomCount) || value.roomCount<0 || value.roomCount>2000
    || !Number.isSafeInteger(value.boundRoomCount) || value.boundRoomCount<0 || value.boundRoomCount>value.roomCount
    || typeof value.calendarWriteEntitled!=='boolean' || typeof value.requestId!=='string' || !UUID.test(value.requestId)) invalid();
  exact(value.readiness,['ready','checks']);const checks=value.readiness.checks;
  exact(checks,['roomsImported','calendarResourcesBound','directoryEntitled','calendarEntitled']);
  if (Object.values(checks).some(entry=>typeof entry!=='boolean') || typeof value.readiness.ready!=='boolean'
    || checks.roomsImported!==(value.roomCount>0)
    || checks.calendarResourcesBound!==(value.roomCount>0 && value.roomCount===value.boundRoomCount)
    || value.readiness.ready!==Object.values(checks).every(Boolean)) invalid();
  const rows=candidates(value.candidates);
  if (value.roomCount===0 && rows.some(row=>row.imported)
    || imported && (!Number.isSafeInteger(value.importedCount) || value.importedCount<0
      || value.importedCount>2 || value.importedCount>value.roomCount)) invalid();
  return Object.freeze({ mode: 'synthetic',provider: 'synthetic_calendar',microsoftConnection: 'not_applicable',
    tenantStatus: value.tenantStatus,locationsRevision: value.locationsRevision,roomCount: value.roomCount,boundRoomCount: value.boundRoomCount,
    calendarWriteEntitled: value.calendarWriteEntitled,readiness: Object.freeze({ ready: value.readiness.ready,
      checks: Object.freeze({ ...checks }) }),candidates: rows,...(imported ? { importedCount: value.importedCount } : {}) });
}

// Protected-document composition enables presentation only. Only a positively
// validated current REAL response selects the existing Microsoft section.
// Unknown/unavailable classification gets an error surface, never REAL fallback.
export async function discoverProtectedSyntheticOnboarding({ apiClient,timeoutMs=10000 }={}) {
  if (typeof apiClient?.request!=='function' || !Number.isSafeInteger(timeoutMs) || timeoutMs<1000 || timeoutMs>15000) {
    throw new TypeError('SYNTHETIC_ONBOARDING_API_REQUIRED');
  }
  const request=apiClient.request.bind(apiClient);
  async function call(path,options={}) {
    const abort=new AbortController(),timer=globalThis.setTimeout(()=>abort.abort(),timeoutMs);
    try { return await request(path,{ ...options,signal: abort.signal }); }
    finally { globalThis.clearTimeout(timer); }
  }
  async function mode() {
    const value=await call('v1/tenant/runtime');exact(value,['mode','provider','requestId']);
    if (typeof value.requestId!=='string' || !UUID.test(value.requestId) || !['real','synthetic'].includes(value.mode)
      || value.provider!==(value.mode==='real' ? 'microsoft365' : 'synthetic_calendar')) invalid();return value.mode;
  }
  try { if (await mode()==='real') return null; }
  catch (error) { if (authorityFailureCode(error)) throw error; }
  return Object.freeze({
    async getView() {
      if (await mode()!=='synthetic') throw new ApiSecurityError('SYNTHETIC_ONBOARDING_RELOAD_REQUIRED');
      return normalizeSyntheticOnboardingView(await call(ROOT));
    },
    async importRooms(value) {
      inputObject(value,['expectedRevision','selectedKeys']);const { expectedRevision,selectedKeys }=value;
      if (!revision(expectedRevision) || !Array.isArray(selectedKeys) || Object.getPrototypeOf(selectedKeys)!==Array.prototype
        || selectedKeys.length<1 || selectedKeys.length>2 || Reflect.ownKeys(selectedKeys).length!==selectedKeys.length+1
        || Array.from({ length: selectedKeys.length },(_,index)=>Object.getOwnPropertyDescriptor(selectedKeys,String(index)))
          .some(field=>!field || !Object.hasOwn(field,'value'))
        || selectedKeys.some(key=>!['workshop','focus'].includes(key)) || new Set(selectedKeys).size!==selectedKeys.length) {
        throw new ApiSecurityError('SYNTHETIC_ONBOARDING_INPUT_INVALID');
      }
      const body={ expectedRevision,selectedKeys: [...selectedKeys].sort() };
      return normalizeSyntheticOnboardingView(await call(ROOT+'/rooms/import',{ method: 'POST',body }),{ imported: true });
    },
    async transition(value) {
      inputObject(value,['expectedRevision','expectedStatus','targetStatus']);const { expectedRevision,expectedStatus,targetStatus }=value;
      if (!revision(expectedRevision) || !(expectedStatus==='onboarding' && targetStatus==='ready'
        || expectedStatus==='ready' && targetStatus==='active')) throw new ApiSecurityError('SYNTHETIC_ONBOARDING_INPUT_INVALID');
      return normalizeSyntheticOnboardingView(await call(ROOT+'/lifecycle/transitions',{ method: 'POST',
        body: { expectedRevision,expectedStatus,targetStatus } }));
    },
  });
}
