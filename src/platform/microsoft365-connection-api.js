import {
  createMicrosoft365ConnectionLifecycle,
  Microsoft365ConnectionApiError,
} from './microsoft365-connection-lifecycle.js';

export { Microsoft365ConnectionApiError } from './microsoft365-connection-lifecycle.js';

const PROVIDER_TENANT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function consentUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Microsoft365ConnectionApiError('MICROSOFT365_REDIRECT_INVALID');
  }
  const providerTenant = url.pathname.split('/')[1] || '';
  if (
    url.origin !== 'https://login.microsoftonline.com'
    || url.username
    || url.password
    || url.hash
    || !PROVIDER_TENANT_PATTERN.test(providerTenant)
    || url.pathname !== `/${providerTenant}/v2.0/adminconsent`
  ) {
    throw new Microsoft365ConnectionApiError('MICROSOFT365_REDIRECT_INVALID');
  }
  return url.href;
}


export function createMicrosoft365ConnectionApi({ apiClient } = {}) {
  return createMicrosoft365ConnectionLifecycle({ apiClient, validateConsentUrl: consentUrl });
}
