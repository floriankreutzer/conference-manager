import { createApiClient } from '../../core/api-client.js';
import { createPlatformPasskeyBrowser } from './passkey-browser.js';
import { requirePlatformPasskeyConfiguration } from './passkey-contracts.js';

export class PlatformPasskeyOperationError extends Error {
  constructor(code = 'PLATFORM_PASSKEY_OPERATION_FAILED') { super(code); this.name = 'PlatformPasskeyOperationError'; this.code = code; }
}
function reject() { throw new PlatformPasskeyOperationError(); }
async function challenge(response) {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '') || !response.body) {
    await response.body?.cancel(); reject();
  }
  const reader = response.body.getReader(); let text = ''; let bytes = 0; const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > 16384) { await reader.cancel(); reject(); }
      text += decoder.decode(item.value, { stream: true });
    }
    text += decoder.decode();
  } catch { await reader.cancel(); reject(); }
  finally { reader.releaseLock(); }
  let value; try { value = JSON.parse(text); } catch { reject(); }
  if (!value || Object.keys(value).sort().join(',') !== 'options,requestId,state,status'
    || value.status !== 'passkey_required' || typeof value.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.state)
    || typeof value.requestId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)
    || !value.options || typeof value.options !== 'object' || Array.isArray(value.options)) reject();
  return value;
}
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

// Decorates the existing transport: it retries only an explicit428 challenge,
// once, with exactly the original URL/method/body/idempotency key. Network,
// timeout, conflict and provider failures never trigger a mutation retry.
export function createPlatformPasskeyOperationsClient({ origin = globalThis.location?.origin, fetchImpl = globalThis.fetch,
  csrfTokenProvider, browser, refreshSession, onPrompt = () => {},
  onSessionRefreshRequired = () => globalThis.location?.reload() } = {}) {
  if (typeof fetchImpl !== 'function' || typeof csrfTokenProvider !== 'function' || typeof refreshSession !== 'function'
    || typeof onPrompt !== 'function' || typeof onSessionRefreshRequired !== 'function') throw new TypeError('PLATFORM_PASSKEY_OPERATIONS_PORTS_REQUIRED');
  const stopped = new AbortController(); let tail = Promise.resolve(); let queued = 0;
  function csrf() {
    const token = csrfTokenProvider(); if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) reject(); return token;
  }
  async function send(url, init) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const sources = [stopped.signal, init.signal].filter(Boolean);
    for (const signal of sources) { if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true }); }
    try {
      if (controller.signal.aborted) throw new PlatformPasskeyOperationError('PLATFORM_PASSKEY_OPERATION_CANCELLED');
      const headers = { ...init.headers, 'X-CSRF-Token': csrf() }; const request = { ...init, headers, signal: controller.signal };
      const first = await fetchImpl(url, request); if (first.status !== 428) return first;
      const pending = await challenge(first); onPrompt();
      browser ??= createPlatformPasskeyBrowser();
      const response = await browser.authenticate(pending.options, { signal: controller.signal });
      if (controller.signal.aborted) throw new PlatformPasskeyOperationError('PLATFORM_PASSKEY_OPERATION_CANCELLED');
      const proof = encodedProof(pending.state, response);
      const completed = await fetchImpl(url, { ...request, headers: { ...headers, 'X-Platform-Passkey-Proof': proof } });
      if (completed.status === 428) { await completed.body?.cancel(); reject(); }
      if (completed.ok) {
        let refreshed = false;
        try { refreshed = await refreshSession() === true; } catch {}
        if (!refreshed) {
          await completed.body?.cancel();
          onSessionRefreshRequired();
          throw new PlatformPasskeyOperationError('PLATFORM_PASSKEY_SESSION_REFRESH_REQUIRED');
        }
      }
      return completed;
    } catch (failure) {
      if (failure instanceof PlatformPasskeyOperationError) throw failure;
      if (failure?.code === 'PLATFORM_PASSKEY_BROWSER_CANCELLED' || controller.signal.aborted) {
        throw new PlatformPasskeyOperationError('PLATFORM_PASSKEY_OPERATION_CANCELLED');
      }
      throw new PlatformPasskeyOperationError();
    } finally { for (const signal of sources) signal.removeEventListener('abort', abort); }
  }
  const client = createApiClient({ baseUrl: '/api/v1/platform/', origin, csrfTokenProvider,
    fetchImpl(url, init) {
      const path = new URL(url).pathname;
      const needsProofQueue = init.method !== 'GET' || path.startsWith('/api/v1/platform/audit/exports')
        || path.includes('/diagnostics/correlations/')
        || /^\/api\/v1\/platform\/tenants\/[0-9a-f-]{36}\/invitations$/i.test(path)
        || /^\/api\/v1\/platform\/tenants\/[0-9a-f-]{36}\/recovery\/[a-z][a-z0-9-]{0,63}\/targets$/i.test(path);
      if (!needsProofQueue) return send(url, init);
      // Serialize proof-capable requests before their initial response can set
      // a cookie, so concurrent operations cannot replace each other's binding.
      if (queued >= 5) return Promise.reject(new PlatformPasskeyOperationError('PLATFORM_PASSKEY_OPERATION_BUSY'));
      queued++;
      const result = tail.then(() => send(url, init)); tail = result.catch(() => {});
      return result.finally(() => { queued--; });
    },
  });
  return Object.freeze({ request: client.request, stop() { stopped.abort(); } });
}
