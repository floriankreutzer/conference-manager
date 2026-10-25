const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE=/^[A-Za-z0-9_-]{43}$/;
const QUERY=new Set(['client_id','scope','redirect_uri','client-request-id','response_mode','client_info','nonce','state',
  'claims','max_age','prompt','x-client-SKU','x-client-VER','x-client-OS','x-client-CPU','response_type','code_challenge',
  'code_challenge_method','return-client-request-id']);
const failed=()=>{ throw new TypeError('PLATFORM_MICROSOFT_OPERATION_RESPONSE_INVALID'); };
function exact(value,fields) {
  if (!value || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) failed();
  const own=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(own);
  if (keys.length!==fields.length || keys.some(key=>!fields.includes(key) || !Object.hasOwn(own[key],'value'))) failed();
}
export function requirePlatformMicrosoftConfiguration(value) {
  exact(value,['mode','environment']);
  if (value.mode!=='microsoft_mfa' || !['dev','int','prod'].includes(value.environment)) failed();
  return Object.freeze({ mode: value.mode,environment: value.environment });
}
export function requirePlatformMicrosoftOperationChallenge(value,origin) {
  exact(value,['status','state','authorizationUrl','requestId']);
  if (value.status!=='microsoft_required' || typeof value.state!=='string' || !OPAQUE.test(value.state)
    || typeof value.requestId!=='string' || !UUID.test(value.requestId)
    || typeof value.authorizationUrl!=='string' || value.authorizationUrl.length>8192) failed();
  let url;try { url=new URL(value.authorizationUrl); } catch { failed(); }
  const parts=url.pathname.split('/');
  if (url.origin!=='https://login.microsoftonline.com' || url.username || url.password || url.hash || parts.length!==5
    || !UUID.test(parts[1]) || parts.slice(2).join('/')!=='oauth2/v2.0/authorize') failed();
  const query=url.searchParams,keys=[...query.keys()];
  if (keys.some(key=>!QUERY.has(key) || query.getAll(key).length!==1)
    || query.has('prompt') && query.get('prompt')!=='login'
    || !UUID.test(query.get('client_id') || '') || query.get('state')!==value.state
    || query.get('redirect_uri')!==origin+'/api/v1/platform/auth/microsoft/operation/callback'
    || query.get('response_type')!=='code' || query.get('response_mode')!=='query' || !['0','300'].includes(query.get('max_age'))
    || query.get('max_age')==='300' && query.get('prompt')!=='login'
    || query.get('code_challenge_method')!=='S256' || !OPAQUE.test(query.get('nonce') || '')
    || !OPAQUE.test(query.get('code_challenge') || '')
    || query.get('scope')?.split(' ').sort().join(',')!=='openid,profile') failed();
  let claims;try { claims=JSON.parse(query.get('claims')); } catch { failed(); }
  exact(claims,['id_token']);exact(claims.id_token,['auth_time','amr']);
  exact(claims.id_token.auth_time,['essential']);
  exact(claims.id_token.amr,['essential','values']);
  if (claims.id_token.auth_time.essential!==true || claims.id_token.amr.essential!==true
    || !Array.isArray(claims.id_token.amr.values) || claims.id_token.amr.values.length!==1
    || claims.id_token.amr.values[0]!=='mfa') failed();
  return Object.freeze({ state: value.state,authorizationUrl: url.href });
}
export function requirePlatformMicrosoftOperationStatus(value) {
  exact(value,['status','requestId']);
  if (!['pending','verified'].includes(value.status) || typeof value.requestId!=='string' || !UUID.test(value.requestId)) failed();
  return value.status;
}
