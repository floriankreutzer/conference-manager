import { createPlatformOperationClient } from './operation-client.js';
import { createPlatformPasskeyBrowser } from './passkey-browser.js';
import { requirePlatformPasskeyConfiguration,requirePlatformPasskeyChallenge } from './passkey-contracts.js';

import { PlatformPasskeyOperationError } from '../operation-errors.js';
export { PlatformPasskeyOperationError } from '../operation-errors.js';
function reject() { throw new PlatformPasskeyOperationError(); }
function encodedProof(state, response) {
  const bytes = new TextEncoder().encode(JSON.stringify({ state, response })); let text = '';
  if (bytes.length > 9000) reject();
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export async function loadPlatformPasskeyConfiguration(apiClient) {
  try { return requirePlatformPasskeyConfiguration(await apiClient.request('auth/passkey/configuration')); }
  catch (failure) { if (failure?.code === 'HTTP_404') return null; throw new PlatformPasskeyOperationError(); }
}

export function createPlatformPasskeyOperationsClient({ browser,...options }={}) {
  return createPlatformOperationClient({ ...options,ErrorType: PlatformPasskeyOperationError,errorPrefix: 'PLATFORM_PASSKEY',
    readPending: requirePlatformPasskeyChallenge,async confirm(pending,{ signal }) {
      browser ??= createPlatformPasskeyBrowser();
      const response=await browser.authenticate(pending.options,{ signal });
      return { 'X-Platform-Passkey-Proof': encodedProof(pending.state,response) };
    },
  });
}
