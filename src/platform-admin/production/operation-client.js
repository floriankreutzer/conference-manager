import { createApiClient } from '../../core/api-client.js';

async function challenge(response,readPending,ErrorType) {
  const reject=()=>{ throw new ErrorType(); };
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
  try { return readPending(value); } catch { reject(); }
}

// Decorates the existing transport: it retries only an explicit428 challenge,
// once, with exactly the original URL/method/body/idempotency key. Network,
// timeout, conflict and provider failures never trigger a mutation retry.
export function createPlatformOperationClient({ origin = globalThis.location?.origin, fetchImpl = globalThis.fetch,
  csrfTokenProvider,refreshSession,onPrompt=()=>{},readPending,confirm,ErrorType,errorPrefix,
  onSessionRefreshRequired = () => globalThis.location?.reload() } = {}) {
  if (typeof fetchImpl !== 'function' || typeof csrfTokenProvider !== 'function' || typeof refreshSession !== 'function'
    || typeof onPrompt!=='function' || typeof onSessionRefreshRequired!=='function' || typeof readPending!=='function'
    || typeof confirm!=='function' || typeof ErrorType!=='function' || !['PLATFORM_PASSKEY','PLATFORM_MICROSOFT'].includes(errorPrefix)) throw new TypeError('PLATFORM_OPERATION_PORTS_REQUIRED');
  const reject=()=>{ throw new ErrorType(); };
  const operationError=suffix=>new ErrorType(`${errorPrefix}_${suffix}`);
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
      if (controller.signal.aborted) throw operationError('OPERATION_CANCELLED');
      const headers = { ...init.headers, 'X-CSRF-Token': csrf() }; const request = { ...init, headers, signal: controller.signal };
      const first = await fetchImpl(url, request); if (first.status !== 428) return first;
      const pending=await challenge(first,readPending,ErrorType);onPrompt();
      const proofHeaders=await confirm(pending,{ signal: controller.signal });
      if (controller.signal.aborted) throw operationError('OPERATION_CANCELLED');
      const completed=await fetchImpl(url,{ ...request,headers: { ...headers,...proofHeaders } });
      if (completed.status === 428) { await completed.body?.cancel(); reject(); }
      if (completed.ok) {
        let refreshed = false;
        try { refreshed = await refreshSession() === true; } catch {}
        if (!refreshed) {
          await completed.body?.cancel();
          onSessionRefreshRequired();
          throw operationError('SESSION_REFRESH_REQUIRED');
        }
      }
      return completed;
    } catch (failure) {
      if (failure instanceof ErrorType) throw failure;
      if (failure?.code === 'PLATFORM_PASSKEY_BROWSER_CANCELLED' || controller.signal.aborted) {
        throw operationError('OPERATION_CANCELLED');
      }
      throw new ErrorType();
    } finally { for (const signal of sources) signal.removeEventListener('abort', abort); }
  }
  function runExclusive(work) {
    if (typeof work!=='function') return Promise.reject(new TypeError('PLATFORM_PASSKEY_WORK_REQUIRED'));
    if (queued>=5) return Promise.reject(operationError('OPERATION_BUSY'));
    queued++;
    const result=tail.then(()=>{
      if (stopped.signal.aborted) throw operationError('OPERATION_CANCELLED');
      return work(stopped.signal);
    });tail=result.catch(()=>{});
    return result.finally(()=>{ queued--; });
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
      return runExclusive(()=>send(url,init));
    },
  });
  return Object.freeze({ request: client.request,runExclusive, stop() { stopped.abort(); } });
}
