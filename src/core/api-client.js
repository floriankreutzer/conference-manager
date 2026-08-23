const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SAFE_METHODS = new Set(['GET']);
const JSON_CONTENT_TYPE = /^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i;
const ABSOLUTE_OR_PROTOCOL_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const MAX_RESPONSE_BYTES = 1_000_000;

export class ApiSecurityError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = 'ApiSecurityError';
    this.code = code;
  }
}

function normalizedOrigin(origin) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:') throw new ApiSecurityError('HTTPS_REQUIRED');
  return parsed.origin;
}

function normalizeBaseUrl(baseUrl, origin) {
  if (typeof baseUrl !== 'string' || ABSOLUTE_OR_PROTOCOL_RELATIVE.test(baseUrl.trim())) {
    throw new ApiSecurityError('INVALID_API_BASE');
  }
  const root = `${normalizedOrigin(origin)}/`;
  const base = new URL(baseUrl.replace(/^\/+/, ''), root);
  if (base.origin !== normalizedOrigin(origin)) throw new ApiSecurityError('CROSS_ORIGIN_API');
  const path = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  base.pathname = path;
  base.search = '';
  base.hash = '';
  return base;
}

function endpointUrl(base, path) {
  if (typeof path !== 'string' || !path.trim() || ABSOLUTE_OR_PROTOCOL_RELATIVE.test(path.trim()) || path.includes('\\')) {
    throw new ApiSecurityError('INVALID_API_PATH');
  }
  const normalized = path.replace(/^\/+/, '');
  const target = new URL(normalized, base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
    throw new ApiSecurityError('API_PATH_ESCAPE');
  }
  target.hash = '';
  return target;
}

function normalizedMethod(method) {
  const value = String(method || 'GET').trim().toUpperCase();
  if (!ALLOWED_METHODS.has(value)) throw new ApiSecurityError('METHOD_NOT_ALLOWED');
  return value;
}

function csrfHeader(method, csrfTokenProvider) {
  if (SAFE_METHODS.has(method)) return {};
  const token = csrfTokenProvider?.();
  if (typeof token !== 'string' || token.length < 16 || token.length > 4096) {
    throw new ApiSecurityError('CSRF_TOKEN_REQUIRED');
  }
  return { 'X-CSRF-Token': token };
}

function serializeBody(body) {
  if (body === undefined) return undefined;
  try {
    return JSON.stringify(body);
  } catch (error) {
    throw new ApiSecurityError('INVALID_JSON_BODY', { cause: error });
  }
}

function assertResponseLengthHeader(response) {
  const rawLength = response.headers.get('content-length');
  if (!rawLength || !/^\d+$/.test(rawLength.trim())) return;
  if (Number(rawLength) > MAX_RESPONSE_BYTES) throw new ApiSecurityError('RESPONSE_TOO_LARGE');
}

async function readBoundedText(response) {
  assertResponseLengthHeader(response);
  if (!response.body) return '';
  if (typeof response.body.getReader !== 'function') throw new ApiSecurityError('RESPONSE_STREAM_REQUIRED');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > MAX_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch {}
        throw new ApiSecurityError('RESPONSE_TOO_LARGE');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function parseJsonResponse(response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (!JSON_CONTENT_TYPE.test(contentType)) throw new ApiSecurityError('UNEXPECTED_CONTENT_TYPE');
  const text = await readBoundedText(response);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ApiSecurityError('INVALID_JSON_RESPONSE', { cause: error });
  }
}

export function createApiClient({
  baseUrl = '/api/',
  origin = globalThis.location?.origin,
  fetchImpl = globalThis.fetch,
  csrfTokenProvider,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new ApiSecurityError('FETCH_UNAVAILABLE');
  const base = normalizeBaseUrl(baseUrl, origin);

  return Object.freeze({
    async request(path, { method = 'GET', body } = {}) {
      const normalized = normalizedMethod(method);
      const url = endpointUrl(base, path);
      const serialized = serializeBody(body);
      const response = await fetchImpl(url, {
        method: normalized,
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: {
          Accept: 'application/json',
          ...(serialized === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...csrfHeader(normalized, csrfTokenProvider),
        },
        ...(serialized === undefined ? {} : { body: serialized }),
      });
      if (!response.ok) throw new ApiSecurityError(`HTTP_${response.status}`);
      return parseJsonResponse(response);
    },
  });
}
