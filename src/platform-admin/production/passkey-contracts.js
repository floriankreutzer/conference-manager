export function requirePlatformPasskeyConfiguration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'environment,minimumPasskeys,mode,requestId'
    || !['passkey_setup','application_passkey'].includes(value.mode) || !['dev','int','prod'].includes(value.environment)
    || value.minimumPasskeys !== 2 || typeof value.requestId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)) {
    throw new TypeError('PLATFORM_PASSKEY_CONFIGURATION_RESPONSE_INVALID');
  }
  return Object.freeze({ mode: value.mode, environment: value.environment, minimumPasskeys: value.minimumPasskeys });
}


export function requirePlatformPasskeyChallenge(value) {
  const fields=['status','state','options','requestId'];
  if (!value || ![Object.prototype,null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length!==fields.length || Reflect.ownKeys(value).some(key=>{
      const own=Object.getOwnPropertyDescriptor(value,key);
      return !fields.includes(key) || !own.enumerable || !Object.hasOwn(own,'value');
    }) || value.status!=='passkey_required' || typeof value.state!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(value.state)
    || typeof value.requestId!=='string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)
    || !value.options || typeof value.options!=='object' || Array.isArray(value.options)) {
    throw new TypeError('PLATFORM_PASSKEY_CHALLENGE_INVALID');
  }
  return Object.freeze({ status: value.status,state: value.state,options: value.options,requestId: value.requestId });
}
