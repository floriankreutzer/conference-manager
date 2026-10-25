const ORIGIN='https://login.microsoftonline.com',CALLBACK='https://ops-int.example.com/api/v1/platform/auth/microsoft/operation/callback';
export function isolatedOwnerMicrosoftDocument(method,target) {
  if (method!=='GET' || typeof target!=='string' || target.length>16384) return null;
  let url;try { url=new URL(target,ORIGIN); } catch { return null; }
  if (url.origin!==ORIGIN || !/^\/[0-9a-f-]{36}\/oauth2\/v2\.0\/authorize$/.test(url.pathname)
    || url.searchParams.getAll('redirect_uri').length!==1 || url.searchParams.get('redirect_uri')!==CALLBACK
    || url.searchParams.getAll('state').length!==1 || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('state') ?? '')) return null;
  const redirect=new URL(CALLBACK);redirect.searchParams.set('state',url.searchParams.get('state'));
  redirect.searchParams.set('code','owner-browser-provider-code');
  return '<!doctype html><html lang="en"><title>Isolated provider</title><main><a href="'
    +redirect.href.replaceAll('&','&amp;')+'">Confirm isolated Microsoft fixture</a></main></html>';
}
