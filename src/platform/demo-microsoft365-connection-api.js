import {
  createMicrosoft365ConnectionLifecycle,
  Microsoft365ConnectionApiError,
} from './microsoft365-connection-lifecycle.js';

const CALLBACK_PATH = '/api/v1/integrations/microsoft365/callback';
const PROVIDER_TENANT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CALLBACK_KEYS = Object.freeze(['admin_consent', 'state', 'tenant']);

function requireOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('DEMO_MICROSOFT365_ORIGIN_INVALID');
  }
  if (url.protocol !== 'https:' || url.origin !== value) {
    throw new TypeError('DEMO_MICROSOFT365_ORIGIN_INVALID');
  }
  return url.origin;
}

function consentUrl(value, origin) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Microsoft365ConnectionApiError('MICROSOFT365_REDIRECT_INVALID');
  }
  const keys = [...url.searchParams.keys()].sort();
  if (
    url.origin !== origin
    || url.username
    || url.password
    || url.hash
    || url.href !== value
    || url.pathname !== CALLBACK_PATH
    || keys.length !== CALLBACK_KEYS.length
    || keys.some((key, index) => key !== CALLBACK_KEYS[index])
    || !STATE_PATTERN.test(url.searchParams.get('state') || '')
    || !PROVIDER_TENANT_PATTERN.test(url.searchParams.get('tenant') || '')
    || url.searchParams.get('admin_consent') !== 'true'
  ) {
    throw new Microsoft365ConnectionApiError('MICROSOFT365_REDIRECT_INVALID');
  }
  return url.href;
}

// Only the explicit Customer Demo composition imports this factory. Session,
// CSRF, state and provider-Tenant authority remain enforced by the same-origin API.
export function createDemoMicrosoft365ConnectionApi({
  apiClient,
  origin = globalThis.location?.origin,
} = {}) {
  const expectedOrigin = requireOrigin(origin);
  return createMicrosoft365ConnectionLifecycle({
    apiClient,
    validateConsentUrl: (value) => consentUrl(value, expectedOrigin),
  });
}
