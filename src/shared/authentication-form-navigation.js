const ACTIONS=Object.freeze({
  'customer-start': ['/api/v1/auth/delegation/start',[]],
  'customer-complete': ['/api/v1/auth/delegation/complete',['csrfToken']],
  'platform-approve': ['/api/v1/platform/auth/delegation/approve',['csrfToken','payload']],
});

// Same-origin document navigation is required for the server's fixed cross-origin
// redirect and SameSite cookies. Fetch/manual redirect cannot implement it. These
// bytes are untrusted candidates; the server owns every proof and authorization.
export function createAuthenticationFormNavigation({ origin=globalThis.location?.origin,
  documentRef=globalThis.document,windowRef=globalThis.window }={}) {
  let url;try { url=new URL(origin); } catch { /* The closed check below owns this error. */ }
  if (!url || url.origin!==origin || url.protocol!=='https:' || typeof documentRef?.createElement!=='function'
    || !documentRef.body || typeof windowRef?.HTMLFormElement?.prototype?.submit!=='function'
    || typeof windowRef.addEventListener!=='function' || typeof windowRef.removeEventListener!=='function') {
    throw new TypeError('AUTHENTICATION_FORM_NAVIGATION_CONFIGURATION_INVALID');
  }
  let active=null,disposed=false;
  function clear() { active?.remove();active=null; }
  windowRef.addEventListener('pagehide',clear);
  return Object.freeze({
    submit(action,fields={}) {
      if (disposed || active || typeof action!=='string' || !Object.hasOwn(ACTIONS,action)) throw new TypeError('AUTHENTICATION_FORM_NAVIGATION_INVALID');
      const [path,keys]=ACTIONS[action];
      if (!fields || typeof fields!=='object' || Array.isArray(fields)
        || ![Object.prototype,null].includes(Object.getPrototypeOf(fields))
        || Reflect.ownKeys(fields).length!==keys.length || Reflect.ownKeys(fields).some(key=>{
          const own=Object.getOwnPropertyDescriptor(fields,key);
          return !keys.includes(key) || !own.enumerable || !Object.hasOwn(own,'value');
        })) throw new TypeError('AUTHENTICATION_FORM_NAVIGATION_INVALID');
      if (keys.includes('csrfToken') && (typeof fields.csrfToken!=='string'
        || !(action==='customer-complete' ? /^[a-f0-9]{64}$/ : /^[A-Za-z0-9_-]{43}$/).test(fields.csrfToken))
        || keys.includes('payload') && (typeof fields.payload!=='string' || fields.payload.length<2 || fields.payload.length>16384)) {
        throw new TypeError('AUTHENTICATION_FORM_NAVIGATION_INVALID');
      }
      if (new URLSearchParams(fields).toString().length>32768) throw new TypeError('AUTHENTICATION_FORM_NAVIGATION_INVALID');
      const form=documentRef.createElement('form');form.method='post';form.action=new URL(path,origin).href;
      form.enctype='application/x-www-form-urlencoded';form.acceptCharset='UTF-8';form.target='_self';form.hidden=true;
      for (const key of keys) {
        const input=documentRef.createElement('input');input.type='hidden';input.name=key;input.value=fields[key];form.append(input);
      }
      active=form;documentRef.body.append(form);
      try { windowRef.HTMLFormElement.prototype.submit.call(form); } catch (error) { clear();throw error; }
    },
    reset: clear,
    dispose() { disposed=true;clear();windowRef.removeEventListener('pagehide',clear); },
  });
}
