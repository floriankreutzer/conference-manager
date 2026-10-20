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
